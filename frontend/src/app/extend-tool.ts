/**
 * « Prolonger élément » : on sélectionne (ou on clique, l'outil ouvert) la face d'un caisson, d'une pièce d'une
 * Répartition ou de toute autre pièce (une plinthe, un fileur, un plan de travail), du côté à prolonger, puis la face
 * d'un autre élément : l'élément s'allonge jusqu'à elle, ou se raccourcit (document/extend-reach.ts) ; ou l'on tape
 * de combien (« De », négatif : raccourcir) ou la cote voulue (« Cote finale », mesurée dans le sens de la face). Une
 * Répartition entière se prolonge par n'importe quelle face : en largeur, en hauteur et en profondeur. Inclinée (un mur
 * en biais, un rampant), un caisson ou une Répartition va jusqu'à la toucher, une autre pièce en prend la pente. Le
 * résultat se voit avant d'être gardé : OK (ou Entrée) le garde en une annulation, l'outil restant pour un autre élément ; Terminer (ou Échap) ferme sans rien changer de plus.
 * « Suivre l'autre élément » : quand l'autre élément change ensuite, l'élément prolongé le suit (app/extend-follow.ts).
 * Maj + clic sur la face d'un autre élément l'ajoute à ceux à prolonger (trois caissons jusqu'au plafond) : ils vont
 * tous jusqu'à la même face d'arrivée, ou de la même mesure, OK les gardant en une annulation ; Maj + clic sur un
 * élément choisi le retire. « Direction » : une pièce seule avance perpendiculairement à sa face, ou selon X, Y ou Z, ou
 * comme une autre face (la perpendiculaire d'une face cliquée pour cela), ou
 * droit vers la face d'arrivée — son bout en prend toujours la pente.
 */
import { bodyLabel, findFeature } from "../document/operations";
import { extendable } from "../document/extend-element";
import { extendBy, extendTo, linkBodies, onEnvelope, withoutLinks, type Extended, type FacePlane } from "../document/extend-reach";
import { frameOf } from "../sketcher/frame";
import type { CadDocument, FaceRef, Feature, Vec3 } from "../document/types";
import { removing } from "./curic-common";
import { el } from "../ui/dom";
import { formatLength } from "../measurements/units";
import type { FacePick } from "../viewport/viewport";
import { planeOf } from "./extend-follow";
import { wholeBodies, wholeOwner } from "./move-whole";
import { PanelTool, type ToolContext } from "./panel-tool";

interface Side {
  bodyId: string;
  /** Where it was clicked: marked in the view while the tool is open. */
  pick: FacePick;
  plane: FacePlane;
  /** The face as the kernel describes it: found again at each regeneration. */
  ref?: FaceRef;
}

const FIRST = "1. Cliquez la face à prolonger : d'un caisson, d'une Répartition ou d'une pièce (plinthe, fileur, plan de travail…).";
const SECOND = "2. Cliquez la face d'arrivée, sur un autre élément (parallèle ou inclinée), ou tapez la mesure.";
const BUTTON = "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** Kept for the session: whether the extended element follows the other one. */
let lastFollow = true;

/** The way a piece goes: perpendicular to its face, along an axis, or straight to the face to reach. */
type Way = "normal" | "x" | "y" | "z" | "target" | "face";
let lastWay: Way = "normal";
const AXES: Record<"x" | "y" | "z", Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export class ExtendTool extends PanelTool {
  private moving: Side | null = null;
  /** The other elements to extend (Maj + clic), each with whether only its piece goes. */
  private more: (Side & { piece: boolean })[] = [];
  /** The steps the result changed or made, one per element (their state says whether OK may keep it). */
  private madeIds: string[] = [];
  private target: Side | null = null;
  private follow = lastFollow;
  /** The result shown, or why it cannot be. */
  private made: Extended | string | null = null;
  /** Only the piece clicked (a shelf, a cloison), not its cabinet or Répartition: by default for a face inside it. */
  private piece = false;
  /** How far the face goes, typed (mm, negative: in), instead of a face to reach. */
  private typed: number | null = null;
  private way: Way = lastWay;
  /** « Comme une autre face »: the perpendicular of the face clicked for it, and whether that click is awaited. */
  private wayFace: Vec3 | null = null;
  private aiming = lastWay === "face";

  constructor(ctx: ToolContext, faces: readonly FacePick[]) {
    super(ctx, "Prolonger élément", null);
    this.ownButtons = true;
    if (faces[0]) void this.pick(faces[0]);
  }

  /** The element a body is part of (its cabinet or Répartition), or the body itself. */
  private elementOf(bodyId: string): string {
    return extendable(this.ctx.doc(), bodyId)?.id ?? bodyId;
  }

  /** The face to extend first; then the face to reach, and the result is shown. */
  private async pick(pick: FacePick, add = false): Promise<void> {
    try {
      const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
      if (outline.surface !== "PLANE") return this.ctx.notify("Choisissez une face plane.", "info");
      const ref = (await this.ctx.geometry.describe(pick.bodyId, [], pick.faceIndex)).face ?? undefined;
      const side: Side = { bodyId: pick.bodyId, pick, plane: planeOf(outline), ...(ref ? { ref } : {}) };
      // « Comme une autre face », waiting for it: the face clicked gives the way, nothing else.
      if (this.way === "face" && this.aiming) {
        [this.wayFace, this.aiming] = [side.plane.normal, false];
        return this.refresh();
      }
      // The element itself clicked again (the piece itself, when it alone is extended): another face of it to extend.
      const again = this.moving && (this.piece ? pick.bodyId === this.moving.bodyId : this.elementOf(pick.bodyId) === this.elementOf(this.moving.bodyId));
      if (add && this.moving) {
        // Maj + clic: an element chosen taken off (the next one becomes the first), another one added.
        const at = this.more.findIndex((m) => (m.piece ? pick.bodyId === m.bodyId : this.elementOf(pick.bodyId) === this.elementOf(m.bodyId)));
        if (again) {
          const [next, ...rest] = this.more;
          this.moving = next ?? null;
          this.piece = next?.piece ?? false;
          this.more = rest;
        } else if (at >= 0) this.more.splice(at, 1);
        else this.more.push({ ...side, piece: this.inside(side) });
      } else if (!this.moving || again) {
        this.moving = side;
        this.target = null;
        this.typed = null;
        this.piece = this.inside(side);
      } else {
        this.target = side;
        this.typed = null;
      }
      this.refresh();
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  /** A face of a cabinet's or a Répartition's piece inside it (a shelf, a cloison): that piece alone, by default. */
  private inside(side: Side): boolean {
    const doc = this.ctx.doc();
    const owner = extendable(doc, side.bodyId) && wholeOwner(doc, side.bodyId);
    if (!owner) return false;
    // A face toward the front or the back of a Répartition: the whole of it, by default, made deeper or shallower.
    const sketch = owner.kind === "sketch" ? findFeature(doc, owner.id) : undefined;
    if (sketch?.type === "sketch") {
      const n = frameOf(sketch).normal;
      if (Math.abs(side.plane.normal[0] * n[0] + side.plane.normal[1] * n[1] + side.plane.normal[2] * n[2]) > 0.9998 * Math.hypot(...side.plane.normal)) return false;
    }
    const boxes = wholeBodies(doc, owner.kind, owner.id, this.ctx.viewport.displayedBodies).flatMap((id) => {
      const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
      return b ? [[[...b[0]], [...b[1]]] as [Vec3, Vec3]] : [];
    });
    return !onEnvelope(side.plane, boxes);
  }

  /** The result made again from the faces chosen, and shown. */
  private refresh(): void {
    // The faces chosen stay marked: the one extended in orange, the one reached in blue.
    const moving = this.moving ? [this.moving, ...this.more] : [];
    this.ctx.viewport.setChosen([...moving.map((m) => ({ face: m.pick, role: "first" as const })), ...(this.target ? [{ face: this.target.pick, role: "second" as const }] : [])]);
    const target = this.target;
    const typed = this.typed;
    const dir = this.direction();
    this.made = this.moving && target
      ? this.chained((doc, s, piece) => extendTo(doc, s.bodyId, target.bodyId, s.plane, target.plane, { from: s.ref, to: target.ref }, this.follow, piece, dir))
      : this.moving && typed !== null
        ? this.chained((doc, s, piece) => extendBy(doc, s.bodyId, s.plane, typed, s.ref, piece, dir))
        : null;
    this.render();
    void this.ctx.preview(this.made && typeof this.made !== "string" ? this.made.doc : null).then(() => this.render());
  }

  /** The way chosen (none: perpendicular to the face); straight to the face to reach: against its normal. */
  private direction(): Vec3 | undefined {
    if (this.way === "target") return this.target?.plane.normal;
    if (this.way === "face") return this.wayFace ?? undefined;
    return this.way === "normal" ? undefined : AXES[this.way];
  }

  /** Each element chosen extended in turn, each on the document the one before left: the first's id, every message. */
  private chained(step: (doc: CadDocument, side: Side, piece: boolean) => Extended | string): Extended | string {
    let made: Extended | null = null;
    const ids: string[] = [];
    for (const [side, piece] of [[this.moving!, this.piece] as const, ...this.more.map((m) => [m, m.piece] as const)]) {
      const next = step(made?.doc ?? this.ctx.doc(), side, piece);
      if (typeof next === "string") return next;
      ids.push(next.id);
      made = made ? { ...next, id: made.id, message: `${made.message} ${next.message}` } : next;
    }
    this.madeIds = ids;
    return made!;
  }

  /** The size of what is extended along the clicked face's normal (mm): the whole element, or the piece alone. */
  private sizeAlong(): number | null {
    if (!this.moving) return null;
    const doc = this.ctx.doc();
    const owner = this.piece ? null : extendable(doc, this.moving.bodyId) && wholeOwner(doc, this.moving.bodyId);
    const ids = owner ? wholeBodies(doc, owner.kind, owner.id, this.ctx.viewport.displayedBodies) : [this.moving.bodyId];
    const [x, y, z] = this.moving.plane.normal;
    const l = Math.hypot(x, y, z) || 1;
    const along = ids.flatMap((id) => {
      const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
      if (!b) return [];
      // The corners of its box, measured along the normal.
      const at = (k: number, i: number) => (k ? b[1] : b[0])[i]!;
      return [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (at(k & 1, 0) * x + at((k >> 1) & 1, 1) * y + at((k >> 2) & 1, 2) * z) / l);
    });
    return along.length ? Math.round((Math.max(...along) - Math.min(...along)) * 10) / 10 : null;
  }

  /** A measure typed: the face goes that far, no face to reach. */
  private type(by: number): void {
    this.typed = by;
    this.target = null;
    this.refresh();
  }

  /** Why OK cannot keep the result: nothing made yet, or the kernel cannot make it. */
  private problem(): string | null {
    if (!this.made) return this.moving ? SECOND : FIRST;
    if (typeof this.made === "string") return this.made;
    for (const id of this.madeIds) {
      const status = this.ctx.status(id);
      if (status && status.state !== "ok") return status.message ?? "Cet élément ne peut pas être prolongé ainsi.";
    }
    return null;
  }

  private ok(): void {
    const made = this.made;
    if (!made || typeof made === "string" || this.problem()) return;
    this.close();
    this.ctx.notify(made.message, "success");
    this.ctx.commit(made.doc, made.id);
    // Kept: the tool afresh, for another element to extend; « Terminer » closes it.
    this.ctx.again?.();
  }

  /** Nothing is stored until OK: the panel says what is missing. */
  protected feature(): Feature | string {
    return "";
  }

  protected override finish(): void {
    this.ok();
  }

  /** The links kept in the document, each to be removed. */
  private linkRows(): HTMLElement[] {
    const doc = this.ctx.doc();
    return (doc.extendLinks ?? []).flatMap((link) => {
      const bodies = linkBodies(doc, link);
      if (!bodies) return [];
      const owner = extendable(doc, bodies.from);
      const remove = el("button", { type: "button", class: "size-7 shrink-0 border border-gray-300 hover:bg-red-50 hover:text-red-700 dark:border-gray-600 dark:hover:bg-red-950", title: "Ne plus suivre", "aria-label": "Ne plus suivre", "data-unlink": link.id }, "✕");
      remove.addEventListener("click", () => this.ctx.commit(withoutLinks(this.ctx.doc(), [link.id]), owner?.id ?? bodies.from, () => this.render()));
      return [el("div", { class: "flex items-center gap-1.5" }, el("p", { class: "min-w-0 flex-1 text-gray-600 dark:text-gray-300" }, `« ${owner?.name ?? bodyLabel(doc, bodies.from)} » suit « ${bodyLabel(doc, bodies.to)} »`), remove)];
    });
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    const name = (s: Side) => extendable(doc, s.bodyId)?.name ?? findFeature(doc, s.bodyId)?.name ?? bodyLabel(doc, s.bodyId);
    const problem = this.problem();
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: problem !== null, "data-extend-ok": "" }, "OK");
    ok.addEventListener("click", () => this.ok());
    const cancel = el("button", { type: "button", class: BUTTON, title: "Fermer l'outil ; ce qui n'a pas eu son OK n'est pas gardé (Échap)", "data-panel-done": "" }, "Terminer");
    cancel.addEventListener("click", () => this.cancel());
    const restart = el("button", { type: "button", class: `${BUTTON} w-full` }, "Recommencer");
    restart.addEventListener("click", () => ((this.moving = this.target = null), (this.more = []), (this.typed = null), this.refresh()));
    const links = this.linkRows();
    const owner = this.moving ? extendable(doc, this.moving.bodyId) : null;
    const what = owner && this.moving
      ? this.selectRow("Prolonger", this.piece ? "piece" : "whole", [["whole", `Tout « ${owner.name} »`], ["piece", `Cette pièce seule (« ${bodyLabel(doc, this.moving.bodyId)} »)`]], (v) => ((this.piece = v === "piece"), this.refresh()))
      : null;
    // A piece alone: the way it goes.
    const alone = this.moving && (this.piece || !owner);
    const way = alone
      ? this.selectRow("Direction", this.way, [["normal", "Perpendiculaire à la face"], ["x", "Selon X"], ["y", "Selon Y"], ["z", "Selon Z"], ["target", "Droit vers la face d'arrivée"], ["face", "Comme une autre face (cliquez-la)"]], (v) => ((this.way = lastWay = v as Way), (this.aiming = v === "face"), this.refresh()))
      : null;
    const size = this.sizeAlong();
    const unit = this.ctx.unit();
    const measures = this.moving
      ? el("div", { class: "space-y-1.5 border border-gray-200 p-2 dark:border-gray-700", role: "group", "aria-label": "Prolonger par la mesure", "data-extend-measures": "" },
          el("p", { class: "font-medium" }, "Ou tapez la mesure"),
          this.numberRow("De", this.typed ?? 0, unit, (v) => this.type(v), true),
          size !== null ? this.numberRow("Cote finale", size + (this.typed ?? 0), unit, (v) => this.type(v - size)) : null,
          size !== null ? this.info(`Aujourd'hui : ${formatLength(size, unit)} dans le sens de la face cliquée. « De » : de combien elle avance (négatif : elle recule).`) : null)
      : null;
    return [
      this.info(this.moving ? `À prolonger : ${[`« ${this.piece ? bodyLabel(doc, this.moving.bodyId) : name(this.moving)} »`, ...this.more.map((m) => `« ${m.piece ? bodyLabel(doc, m.bodyId) : name(m)} »`)].join(", ")}, par la face cliquée.` : FIRST),
      this.moving ? this.info(this.more.length ? "Maj + clic sur un élément choisi le retire, sur un autre l'ajoute." : "Maj + clic sur la face d'un autre élément l'ajoute : tous vont jusqu'à la même face, ou de la même mesure, en une seule annulation.") : null,
      what,
      way,
      way && this.way === "face" && this.aiming ? this.info("Cliquez la face qui donne la direction : la pièce avancera perpendiculairement à elle.") : null,
      this.moving ? this.info(this.target ? `Jusqu'à : « ${name(this.target)} ».` : this.typed !== null ? "De la mesure tapée." : SECOND) : null,
      measures,
      this.typed !== null ? null : this.checkRow("Suivre l'autre élément", this.follow, (v) => ((this.follow = lastFollow = v), this.refresh())),
      this.made && typeof this.made !== "string" ? el("p", { class: "bg-sky-50 px-2 py-1.5 text-sky-900 dark:bg-sky-950 dark:text-sky-100", "data-extend-result": "" }, this.made.message) : null,
      problem && this.made ? el("p", { class: "bg-red-50 px-2 py-1.5 text-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, problem) : null,
      el("div", { class: "flex gap-1.5" }, cancel, ok),
      this.moving ? restart : null,
      links.length ? el("p", { class: "border-t border-gray-200 pt-2 font-medium dark:border-gray-700" }, "Éléments qui en suivent un autre") : null,
      ...links,
      this.info("Un caisson s'allonge en largeur, profondeur ou hauteur, avec ses façades ; une Répartition entière en longueur, en hauteur ou en profondeur, avec ses cases, cloisons, étagères et équipements ; une étagère, une cloison ou une autre pièce seule par la face cliquée (son bout, son dessus, son dessous). Une face d'arrivée inclinée : un caisson va jusqu'à la toucher, une pièce en prend la pente."),
    ];
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { face } : null);
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (face) void this.pick(face, removing(event));
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
