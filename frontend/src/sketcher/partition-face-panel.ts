/**
 * La face du mur dans le panneau de la Répartition (partition-tool.ts) et ce qu'on y fait : ce qui est choisi, la
 * barre sous la face (Dupliquer, Aligner, Supprimer, un tiroir de plus ou de moins), le clavier (flèches : un pas ;
 * Ctrl + D : dupliquer ; Suppr : supprimer ; Échap : ne plus rien choisir) et les cotes tapées sur place. Les règles
 * sont dans partition-face-edit.ts. Une Répartition déjà faite enregistre chaque geste aussitôt (une étape chacun, la
 * 3D suit) ; une nouvelle le garde en brouillon (`offsets`, `niches`) jusqu'à OK.
 */
import type { OffsetRecord, SketchGeometry } from "../document/sketch";
import type { DisplayUnit, NicheFeature, SketchFeature } from "../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim } from "../measurements/units";
import { el } from "../ui/dom";
import type { PartitionInput } from "./partition";
import { caseAt, draftOffsets, partitionFace, type FaceDraft, type FacePick, type PartitionFace } from "./partition-face";
import { alignPiece, alignRod, deleteEquip, deletePiece, divisionOn, drawerCount, dropRod, duplicateEquip, duplicatePiece, freeNicheNear, moveEquip, movePiece, nicheUnder, pieceThickness, PITCH, resizeNiche, toSketch, workProblem, type FaceWork } from "./partition-face-edit";
import { pathKey } from "./partition-history";
import { partitionStrip } from "./partition-strip";

export interface FacePanelHost {
  draft(): FaceDraft;
  geometry(): SketchGeometry;
  equipment(): { sketch: SketchFeature; niches: readonly NicheFeature[] } | null;
  unit(): DisplayUnit;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** The measures of the Répartition itself changed (length, height, thickness, plinth, widths of the cases). */
  set(patch: Partial<PartitionInput>): void;
  redraw(): void;
  /** Each change is stored at once (a Répartition already made), not at OK. */
  live(): boolean;
  /** Stores the step as the panel and the face have it, the tool staying open: one undo step. */
  commit(said: string): boolean;
  /** What the face is the face of, for the screen readers. */
  name(): string;
}

/** What is chosen, kept across the drawings (a piece by its step and rank: their order on the face can change). */
type Picked = { kind: "case"; index: number } | { kind: "piece"; record: string; index: number } | { kind: "equip"; id: string };

/** Copies of drawers or rods get these ids until OK gives them their own. */
export const NEW_EQUIP = "face-new-";

const BUTTON = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

export class FacePanel {
  private work: FaceWork | null = null;
  private picked: Picked | null = null;
  private copies = 0;
  /** The strip had the keyboard: it gets it back once drawn again. */
  private focused = false;

  constructor(private readonly host: FacePanelHost) {}

  /** The document changed under the face: it is read again, what is chosen stays chosen. */
  reset(): void {
    this.work = null;
  }

  /** The history as the face changed it (null: unchanged). */
  offsets(): OffsetRecord[] | null {
    return this.work?.offsets ?? null;
  }

  /** What equips the niches and was changed or added on the face. */
  niches(): NicheFeature[] {
    if (!this.work) return [];
    const before = new Map((this.host.equipment()?.niches ?? []).map((f) => [f.id, JSON.stringify(f)]));
    return this.work.niches.filter((f) => before.get(f.id) !== JSON.stringify(f));
  }

  /** What equipped the niches and was taken away on the face. */
  removedNiches(): string[] {
    if (!this.work) return [];
    const kept = new Set(this.work.niches.map((f) => f.id));
    return (this.host.equipment()?.niches ?? []).filter((f) => !kept.has(f.id)).map((f) => f.id);
  }

  private base(): FaceWork {
    return this.work ?? { offsets: [...(this.host.geometry().offsets ?? [])], niches: [...(this.host.equipment()?.niches ?? [])] };
  }

  /** What the rules work on: the sketch with the step as the panel has it, and the draft with it. */
  private context(): { g: SketchGeometry; of: string; work: FaceWork } {
    const base = this.base();
    const { id, offsets } = draftOffsets(this.host.draft(), base.offsets);
    return { g: { ...this.host.geometry(), offsets }, of: id, work: { offsets, niches: base.niches } };
  }

  private face(): PartitionFace | null {
    const base = this.base();
    const equipment = this.host.equipment();
    return partitionFace(this.host.draft(), { ...this.host.geometry(), offsets: base.offsets }, equipment ? { sketch: equipment.sketch, niches: base.niches } : null);
  }

  /** A change made: kept when the divisions and the equipments still fit, else said and left; stored at once when live. */
  private apply(result: FaceWork | string, picked: Picked | null = this.picked, said = "Face du mur modifiée."): void {
    if (typeof result === "string") return this.host.notify(result, "error");
    const own = result.offsets.filter((r) => r.id !== "face-draft");
    const { id: of, offsets } = draftOffsets(this.host.draft(), own);
    const problem = workProblem({ ...this.host.geometry(), offsets }, of, { offsets, niches: result.niches }, this.host.equipment()?.sketch ?? null);
    if (problem) return this.host.notify(problem, "error");
    // The step itself stays as the document has it: the panel's measures go in at OK.
    const kept = new Map((this.host.geometry().offsets ?? []).map((r) => [r.id, r]));
    const was = this.work;
    this.work = { offsets: own.map((r) => (r.id === of && kept.has(of) ? kept.get(of)! : r)), niches: result.niches };
    if (this.host.live()) {
      // Stored: the document has it now, the face reads it from there.
      if (this.host.commit(said)) this.work = null;
      else this.work = was;
    }
    this.picked = picked;
    this.host.redraw();
  }

  // ---- the view ---------------------------------------------------------------------------------------------------

  view(): HTMLElement | null {
    const face = this.face();
    if (!face) return null;
    const unit = this.host.unit();
    const pick = this.facePick(face);
    if (!pick) this.picked = null;
    const strip = partitionStrip({
      face,
      picked: pick,
      label: `Face de ${this.host.name()}`,
      pick: (p) => this.pickOn(face, p),
      widths: (widths) => this.measure({ widths }, "Largeur de la case changée."),
      movePiece: (k, at) => this.move(face, k, at),
      dropEquip: (id, x, y, dy) => this.drop(face, id, x, y, dy),
      edit: (k, text) => this.edit(face, k, text),
      format: (mm) => trim(toDisplay(mm, unit), unit === "mm" ? 1 : 2),
      key: (event) => this.key(face, event),
    });
    const svg = strip.querySelector("svg");
    svg?.addEventListener("focus", () => (this.focused = true));
    svg?.addEventListener("blur", () => (this.focused = false));
    if (this.focused && svg) queueMicrotask(() => svg.isConnected && svg.focus());
    return el("div", { class: "space-y-1", "data-ref": "partition-face" }, el("p", { class: "text-gray-600 dark:text-gray-300" }, this.caption(face, pick, unit)), strip, this.bar(face, pick));
  }

  private facePick(face: PartitionFace): FacePick | null {
    const p = this.picked;
    if (p?.kind === "case") return face.cases[p.index] ? p : null;
    if (p?.kind === "piece") {
      const index = face.pieces.findIndex((q) => q.record === p.record && q.index === p.index);
      return index < 0 ? null : { kind: "piece", index };
    }
    if (p?.kind === "equip") return face.equips.some((e) => e.id === p.id) ? p : null;
    return null;
  }

  private pickOn(face: PartitionFace, p: FacePick | null): void {
    if (p?.kind === "piece") {
      const q = face.pieces[p.index];
      this.picked = q ? { kind: "piece", record: q.record, index: q.index } : null;
    } else this.picked = p;
    this.host.redraw();
  }

  private caption(face: PartitionFace, pick: FacePick | null, unit: DisplayUnit): string {
    const f = (mm: number) => formatLength(mm, unit);
    const head = `${f(face.height)} de haut, ${f(face.length)} de long, ${face.cases.length} cases.`;
    if (pick?.kind === "case") return head;
    if (pick?.kind === "piece") {
      const p = face.pieces[pick.index]!;
      const [a, b] = [p.centre - p.travel[0], p.travel[1] - p.centre];
      const word = p.vertical ? "Cloison" : "Étagère";
      return `${word} choisie : ${p.vertical ? `${f(a)} à sa gauche, ${f(b)} à sa droite` : `${f(a)} au-dessus, ${f(b)} dessous`}. Tirez-la : elle s'accroche au pas de ${f(PITCH)} et aux ${p.vertical ? "cloisons" : "étagères"} d'à côté (Alt : librement).`;
    }
    if (pick?.kind === "equip") {
      const e = face.equips.find((q) => q.id === pick.id)!;
      if (e.fill === "rod") {
        const rod = face.rods.find((r) => r.id === e.id);
        return `Tringle choisie${rod ? ` : à ${f(face.height - rod.y)} du sol` : ""}. Tirez-la pour la monter ou la descendre, ou dans une autre niche.`;
      }
      const count = this.base().niches.find((n) => n.id === e.id)?.drawers ?? 0;
      return `${count} tiroir${count > 1 ? "s" : ""} choisi${count > 1 ? "s" : ""}. Tirez-les dans une niche vide pour les y porter.`;
    }
    return `${head} Cliquez une étagère, une cloison, des tiroirs ou une tringle pour les choisir ; tirez un côté entre deux cases pour changer leurs largeurs ; cliquez une cote pour la changer.`;
  }

  private bar(face: PartitionFace, pick: FacePick | null): HTMLElement | null {
    if (!pick || pick.kind === "case") return null;
    const button = (label: string, action: string, run: () => void, title = label, disabled = false) => {
      const b = el("button", { type: "button", class: BUTTON, title, "data-face-action": action, disabled }, label);
      b.addEventListener("click", run);
      return b;
    };
    const keys = el("span", { class: "text-gray-500 dark:text-gray-400" }, `${pick.kind === "piece" ? "Flèches : un pas de 32 mm · " : ""}Ctrl + D : dupliquer · Suppr : supprimer`);
    const remove = button("Supprimer", "delete", () => this.remove(face), "Suppr");
    const row = (...items: (HTMLElement | null)[]) => el("div", { class: "flex flex-wrap items-center gap-1.5", "data-ref": "partition-face-actions" }, ...items);
    if (pick.kind === "piece") return row(button("Dupliquer", "duplicate", () => this.duplicate(face)), button("Aligner", "align", () => this.align(face), "Sur la plus proche d'une case voisine"), remove, keys);
    const e = face.equips.find((q) => q.id === pick.id);
    if (!e) return null;
    if (e.fill === "rod") return row(button("Dupliquer", "duplicate", () => this.duplicate(face), "Dans la niche vide la plus proche"), button("Aligner", "align", () => this.align(face), "Sur la tringle la plus proche"), remove, keys);
    const count = this.base().niches.find((n) => n.id === e.id)?.drawers ?? 1;
    return row(button("− tiroir", "fewer", () => this.apply(drawerCount(this.base(), e.id, count - 1), this.picked, "Un tiroir de moins."), "Un tiroir de moins", count <= 1), button("+ tiroir", "more", () => this.apply(drawerCount(this.base(), e.id, count + 1), this.picked, "Un tiroir de plus."), "Un tiroir de plus"), button("Dupliquer", "duplicate", () => this.duplicate(face), "Dans la niche vide la plus proche"), remove, keys);
  }

  // ---- what is done -----------------------------------------------------------------------------------------------

  private move(face: PartitionFace, k: number, at: number): void {
    const p = face.pieces[k];
    if (!p) return;
    const { g, of, work } = this.context();
    this.apply(movePiece(g, of, work, p.record, p.index, toSketch(face, p.vertical, at)), { kind: "piece", record: p.record, index: p.index }, `${p.vertical ? "Cloison" : "Étagère"} déplacée.`);
  }

  private drop(face: PartitionFace, id: string, x: number, y: number, dy: number): void {
    const e = face.equips.find((q) => q.id === id);
    if (!e) return;
    const path = nicheUnder(face, x, y);
    const picked: Picked = { kind: "equip", id };
    if (path && pathKey(path) !== pathKey(e.path)) return this.apply(moveEquip(this.base(), id, path), picked, e.fill === "rod" ? "Tringle déplacée." : "Tiroirs déplacés.");
    if (e.fill === "rod" && Math.abs(dy) > 0.05) return this.apply(dropRod(this.base(), id, dy), picked, "Tringle déplacée.");
    this.picked = picked;
    this.host.redraw();
  }

  private duplicate(face: PartitionFace): void {
    const pick = this.facePick(face);
    if (pick?.kind === "piece") {
      const p = face.pieces[pick.index]!;
      const { g, of, work } = this.context();
      return this.apply(duplicatePiece(g, of, work, p.record, p.index), { kind: "piece", record: p.record, index: p.index + 1 }, `${p.vertical ? "Cloison" : "Étagère"} dupliquée.`);
    }
    if (pick?.kind !== "equip") return;
    const { of } = this.context();
    const path = freeNicheNear(face, this.base(), of, pick.id);
    if (!path) return this.host.notify("Aucune niche vide pour la copie : libérez-en une.", "error");
    const id = `${NEW_EQUIP}${++this.copies}`;
    const before = new Set((this.host.equipment()?.niches ?? []).map((f) => f.id));
    this.apply(duplicateEquip(this.base(), pick.id, path, id), { kind: "equip", id }, "Copie posée dans la niche vide la plus proche.");
    // Stored, the copy has an id of its own: it stays chosen.
    if (this.host.live()) {
      const made = (this.host.equipment()?.niches ?? []).find((f) => !before.has(f.id) && pathKey(f.niche) === pathKey(path));
      if (made) (this.picked = { kind: "equip", id: made.id }), this.host.redraw();
    }
  }

  /** What is chosen taken away: a shelf or a cloison (its two niches make one), drawers or a rod. */
  private remove(face: PartitionFace): void {
    const pick = this.facePick(face);
    if (pick?.kind === "piece") {
      const p = face.pieces[pick.index]!;
      const { g, of, work } = this.context();
      return this.apply(deletePiece(g, of, work, p.record, p.index), null, `${p.vertical ? "Cloison" : "Étagère"} supprimée : ses deux niches n'en font plus qu'une.`);
    }
    if (pick?.kind !== "equip") return;
    const e = face.equips.find((q) => q.id === pick.id);
    this.apply(deleteEquip(this.base(), pick.id), null, e?.fill === "rod" ? "Tringle supprimée." : "Tiroirs supprimés.");
  }

  private align(face: PartitionFace): void {
    const pick = this.facePick(face);
    if (pick?.kind === "piece") {
      const p = face.pieces[pick.index]!;
      const at = alignPiece(face, pick.index);
      if (at === null) return this.host.notify(`Aucune ${p.vertical ? "cloison" : "étagère"} à côté sur laquelle l'aligner.`, "info");
      return this.move(face, pick.index, at);
    }
    if (pick?.kind !== "equip") return;
    const rod = face.rods.find((r) => r.id === pick.id);
    const at = alignRod(face, pick.id);
    if (!rod || at === null) return this.host.notify("Aucune autre tringle sur laquelle l'aligner.", "info");
    this.apply(dropRod(this.base(), pick.id, at - rod.y));
  }

  private key(face: PartitionFace, event: KeyboardEvent): void {
    const pick = this.facePick(face);
    if (!pick) return;
    const mod = event.ctrlKey || event.metaKey;
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[event.key];
    const handled = () => (event.preventDefault(), event.stopPropagation());
    if (mod && event.key.toLowerCase() === "d") return (handled(), this.duplicate(face));
    if (event.key === "Delete" || event.key === "Backspace") return (handled(), this.remove(face));
    if (event.key === "Escape") {
      handled();
      this.picked = null;
      return this.host.redraw();
    }
    if (step === undefined) return;
    const vertical = event.key === "ArrowLeft" || event.key === "ArrowRight";
    if (pick.kind === "piece") {
      const p = face.pieces[pick.index]!;
      if (p.vertical !== vertical) return;
      handled();
      return this.move(face, pick.index, Math.min(Math.max(p.centre + step * (event.altKey ? 1 : PITCH), p.travel[0] + 1), p.travel[1] - 1));
    }
    if (pick.kind === "equip" && !vertical && face.rods.some((r) => r.id === pick.id)) {
      handled();
      this.apply(dropRod(this.base(), pick.id, step * 10));
    }
  }

  /** A measure of the Répartition itself changed on the face: in the panel (stored at once when live, as every setting). */
  private measure(patch: Partial<PartitionInput>, _said: string): void {
    this.host.set(patch);
  }

  /** A dimension typed on the face. */
  private edit(face: PartitionFace, k: number, text: string): void {
    const entry = face.edits[k];
    const typed = parseNumber(text);
    if (!entry) return;
    if (typed === null || typed <= 0) return this.host.notify("Tapez une longueur positive.", "error");
    const mm = fromDisplay(typed, this.host.unit());
    const e = entry.edit;
    const { g, of, work } = this.context();
    switch (e.what) {
      case "length":
      case "height":
      case "thickness":
      case "plinth":
        return this.measure({ [e.what]: mm }, "Cote changée.");
      case "case": {
        const widths = caseAt(face, e.index, mm);
        return typeof widths === "string" ? this.host.notify(widths, "error") : this.measure({ widths }, "Largeur de la case changée.");
      }
      case "division":
        return this.apply(pieceThickness(work, e.record, mm));
      case "niche": {
        if (e.axis === "x" && !divisionOn(work, of, e.path, "x")) return this.edit(face, 2 + e.path[0]!, text);
        return this.apply(resizeNiche(g, of, work, e.path, e.axis, mm));
      }
      case "front": {
        // The fronts share the niche: each one taller by d makes the niche taller by d for each front.
        const niche = face.equips.find((q) => q.id === e.id)?.niche;
        if (!niche) return;
        return this.apply(resizeNiche(g, of, work, e.path, "y", niche.h + e.count * (mm - entry.value)));
      }
      case "rod":
        return this.apply(dropRod(this.base(), e.id, entry.value - mm));
    }
  }
}
