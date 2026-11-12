/**
 * « Prolonger élément » : on sélectionne (ou on clique, l'outil ouvert) la face d'un caisson, d'une pièce d'une
 * Répartition ou de toute autre pièce (une plinthe, un fileur, un plan de travail), du côté à prolonger, puis la face
 * d'un autre élément : l'élément s'allonge jusqu'à elle, ou se raccourcit (document/extend-reach.ts). Inclinée (un mur
 * en biais, un rampant), un caisson ou une Répartition va jusqu'à la toucher, une autre pièce en prend la pente. Le
 * résultat se voit avant d'être gardé : OK (ou Entrée) le garde en une annulation, Annuler (ou Échap) ne change rien.
 * « Suivre l'autre élément » : quand l'autre élément change ensuite, l'élément prolongé le suit (app/extend-follow.ts).
 */
import { bodyLabel, findFeature } from "../document/operations";
import { extendable } from "../document/extend-element";
import { extendTo, linkBodies, withoutLinks, type Extended, type FacePlane } from "../document/extend-reach";
import type { FaceRef, Feature } from "../document/types";
import { el } from "../ui/dom";
import type { FacePick } from "../viewport/viewport";
import { planeOf } from "./extend-follow";
import { PanelTool, type ToolContext } from "./panel-tool";

interface Side {
  bodyId: string;
  plane: FacePlane;
  /** The face as the kernel describes it: found again at each regeneration. */
  ref?: FaceRef;
}

const FIRST = "1. Cliquez la face à prolonger : d'un caisson, d'une Répartition ou d'une pièce (plinthe, fileur, plan de travail…).";
const SECOND = "2. Cliquez la face d'arrivée, sur un autre élément (parallèle ou inclinée).";
const BUTTON = "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** Kept for the session: whether the extended element follows the other one. */
let lastFollow = true;

export class ExtendTool extends PanelTool {
  private moving: Side | null = null;
  private target: Side | null = null;
  private follow = lastFollow;
  /** The result shown, or why it cannot be. */
  private made: Extended | string | null = null;

  constructor(ctx: ToolContext, faces: readonly FacePick[]) {
    super(ctx, "Prolonger élément", null);
    if (faces[0]) void this.pick(faces[0]);
  }

  /** The element a body is part of (its cabinet or Répartition), or the body itself. */
  private elementOf(bodyId: string): string {
    return extendable(this.ctx.doc(), bodyId)?.id ?? bodyId;
  }

  /** The face to extend first; then the face to reach, and the result is shown. */
  private async pick(pick: FacePick): Promise<void> {
    try {
      const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
      if (outline.surface !== "PLANE") return this.ctx.notify("Choisissez une face plane.", "info");
      const ref = (await this.ctx.geometry.describe(pick.bodyId, [], pick.faceIndex)).face ?? undefined;
      const side: Side = { bodyId: pick.bodyId, plane: planeOf(outline), ...(ref ? { ref } : {}) };
      // The element itself clicked again: another face of it to extend.
      if (!this.moving || this.elementOf(pick.bodyId) === this.elementOf(this.moving.bodyId)) {
        this.moving = side;
        this.target = null;
      } else this.target = side;
      this.refresh();
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  /** The result made again from the faces chosen, and shown. */
  private refresh(): void {
    this.made = this.moving && this.target ? extendTo(this.ctx.doc(), this.moving.bodyId, this.target.bodyId, this.moving.plane, this.target.plane, { from: this.moving.ref, to: this.target.ref }, this.follow) : null;
    this.render();
    void this.ctx.preview(this.made && typeof this.made !== "string" ? this.made.doc : null).then(() => this.render());
  }

  /** Why OK cannot keep the result: nothing made yet, or the kernel cannot make it. */
  private problem(): string | null {
    if (!this.made) return this.moving ? SECOND : FIRST;
    if (typeof this.made === "string") return this.made;
    const status = this.ctx.status(this.made.id);
    return status && status.state !== "ok" ? (status.message ?? "Cet élément ne peut pas être prolongé ainsi.") : null;
  }

  private ok(): void {
    const made = this.made;
    if (!made || typeof made === "string" || this.problem()) return;
    this.close();
    this.ctx.notify(made.message, "success");
    this.ctx.commit(made.doc, made.id);
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
    const cancel = el("button", { type: "button", class: BUTTON }, "Annuler");
    cancel.addEventListener("click", () => this.cancel());
    const restart = el("button", { type: "button", class: `${BUTTON} w-full` }, "Recommencer");
    restart.addEventListener("click", () => ((this.moving = this.target = null), this.refresh()));
    const links = this.linkRows();
    return [
      this.info(this.moving ? `À prolonger : « ${name(this.moving)} », par la face cliquée.` : FIRST),
      this.moving ? this.info(this.target ? `Jusqu'à : « ${name(this.target)} ».` : SECOND) : null,
      this.checkRow("Suivre l'autre élément", this.follow, (v) => ((this.follow = lastFollow = v), this.refresh())),
      this.made && typeof this.made !== "string" ? el("p", { class: "bg-sky-50 px-2 py-1.5 text-sky-900 dark:bg-sky-950 dark:text-sky-100", "data-extend-result": "" }, this.made.message) : null,
      problem && this.made ? el("p", { class: "bg-red-50 px-2 py-1.5 text-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, problem) : null,
      el("div", { class: "flex gap-1.5" }, cancel, ok),
      this.moving ? restart : null,
      links.length ? el("p", { class: "border-t border-gray-200 pt-2 font-medium dark:border-gray-700" }, "Éléments qui en suivent un autre") : null,
      ...links,
      this.info("Un caisson s'allonge en largeur, profondeur ou hauteur, avec ses façades ; une Répartition en longueur ou en hauteur, avec ses cases ; une autre pièce par la face cliquée. Une face d'arrivée inclinée : un caisson va jusqu'à la toucher, une pièce en prend la pente."),
    ];
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { face } : null);
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (face) void this.pick(face);
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
