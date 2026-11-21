/**
 * « Coller par face » : on sélectionne une face de l'élément à déplacer (ou on la clique, l'outil ouvert), puis on clique
 * une face d'un autre élément, et le premier vient s'y coller, d'un coup. Des faces qui se regardent, ou d'équerre :
 * la face se pose sur l'autre — tournée d'abord s'il le faut —, ses bords affleurant ceux de l'autre au coin le plus
 * proche du clic (features/face-mate.ts). Des faces de même sens (deux façades) affleurent seulement. Un caisson bouge
 * avec ses façades, une Répartition avec tous ses panneaux, ses portes et ses niches, par ses faces extérieures, ou une
 * pièce seule si on le veut (ou si les deux faces sont du même meuble). Un jeu les écarte, ou les met en retrait. Une seule annulation.
 */
import { bodyLabel, findFeature } from "../document/operations";
import { movesNeeded, spacingFeatures, type Moving } from "../document/spacing";
import { elementKey } from "../document/swap";
import type { Feature, MoveFeature, RotateFeature, Vec3 } from "../document/types";
import { glueShift, parallelFaces } from "../features/face-glue";
import { faceOnFace, flushSlide, type FaceMate } from "../features/face-mate";
import { alignWhole, elementEnvelope, wholeMate } from "./align-whole";
import { el } from "../ui/dom";
import type { FacePick } from "../viewport/viewport";
import { freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

/** A planar face clicked: its body, a point of its plane, its outward normal. */
interface Picked extends Laid {
  bodyId: string;
  /** Where it was clicked: the corner nearest it is where the edges meet. */
  clicked: Vec3;
}

/** A face laid on another: a point of it (its centre), its outward normal, its corners and straight sides. */
interface Laid {
  point: Vec3;
  normal: Vec3;
  corners: Vec3[];
  sides: [Vec3, Vec3][];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The piece of furniture a body is in: a Répartition (its sketch, moved with all it holds), a cabinet with its fronts, else its feature. */
export function glueKey(doc: Parameters<typeof elementKey>[0], bodyId: string): string {
  const owner = alignWhole(doc, bodyId);
  return owner?.kind === "sketch" ? owner.id : elementKey(doc, bodyId);
}

/** Kept for the session: whether the whole cabinet moves, and the gap. */
let lastWhole = true;
let lastGap = 0;

export class FaceGlueTool extends PanelTool {
  private moving: Picked | null = null;
  private movingPick: FacePick | null = null;
  private fixed: Picked | null = null;
  private whole = lastWhole;
  private gap = lastGap;
  private slots: { id: string; name: string }[] = [];
  /** A piece turned onto a face that is not parallel: its turn and its move. */
  private turnSlots: { rotate: { id: string; name: string }; move: { id: string; name: string } } | null = null;

  constructor(ctx: ToolContext, faces: readonly FacePick[]) {
    super(ctx, "Coller par face", null);
    if (faces[0]) void this.pick(faces[0]);
  }

  /** The face that moves first; then the face it goes on, and it is glued at once. */
  private async pick(pick: FacePick): Promise<void> {
    try {
      const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
      if (outline.surface !== "PLANE") return this.ctx.notify("Choisissez une face plane.", "info");
      const sides = outline.edges.flatMap((e) => (e.kind === "line" ? [[[...e.a], [...e.b]] as [Vec3, Vec3]] : []));
      const corners = outline.edges.flatMap((e) => (e.kind === "line" ? [e.a, e.b] : e.kind === "arc" ? [e.a, e.b, e.mid] : [])).map((p) => [...p] as Vec3);
      const face: Picked = { bodyId: pick.bodyId, point: [...outline.center] as Vec3, normal: [...outline.normal] as Vec3, corners, sides, clicked: [pick.point.x, pick.point.y, pick.point.z] };
      if (!this.moving || pick.bodyId === this.moving.bodyId) {
        this.moving = face;
        this.movingPick = pick;
        this.slots = [];
        // The face that moves stays marked in orange; the one it goes on, in blue.
        this.ctx.viewport.setChosen([{ face: pick, role: "first" }]);
        return this.render();
      }
      this.fixed = face;
      this.ctx.viewport.setChosen([{ face: this.movingPick ?? pick, role: "first" }, { face: pick, role: "second" }]);
      const made = this.made();
      if (typeof made === "string") {
        this.ctx.notify(made, "error");
        this.fixed = null;
        this.ctx.viewport.setChosen(this.movingPick ? [{ face: this.movingPick, role: "first" }] : []);
        return this.render();
      }
      const glue = glueShift(this.moving, face, this.gap);
      const how = typeof glue !== "string" && glue.meet === "flush" ? "à fleur de" : "sur";
      this.ctx.notify(`« ${this.movingName()} » collé ${how} « ${bodyLabel(this.ctx.doc(), face.bodyId)} ».`, "success");
      this.finish();
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  /** What moves, by name: the cabinet (or the element), or the piece alone. */
  private movingName(): string {
    const doc = this.ctx.doc();
    if (!this.moving) return "";
    return (this.movesWhole() ? findFeature(doc, glueKey(doc, this.moving.bodyId))?.name : undefined) ?? bodyLabel(doc, this.moving.bodyId);
  }

  /** The whole element moves, unless asked otherwise or both faces are of one element (a shelf against its side). */
  private movesWhole(): boolean {
    const doc = this.ctx.doc();
    return this.whole && !!this.moving && !(this.fixed && glueKey(doc, this.fixed.bodyId) === glueKey(doc, this.moving.bodyId));
  }

  /** The cabinet moved in place, or the moves of the bodies; or what is still missing. */
  private made(): Feature[] | string {
    if (!this.moving) return "1. Cliquez la face de l'élément à déplacer (ou sélectionnez-la avant d'ouvrir l'outil).";
    if (!this.fixed) return "2. Cliquez la face où la coller, sur un autre élément.";
    const doc = this.ctx.doc();
    const whole = this.movesWhole();
    // A whole element is glued by its outer faces: the face clicked only says the side (never into the other).
    const [from, to] = whole ? [this.outer(this.moving), this.outer(this.fixed)] : [this.moving, this.fixed];
    // Faces of one way (two fronts): only brought flush, along their normal.
    if (parallelFaces(from, to) && dot(from.normal, to.normal) > 0) {
      const glue = glueShift(from, to, this.gap);
      return typeof glue === "string" ? glue : this.moved(glue.shift, whole);
    }
    // Onto the other, in any direction: turned so that its face looks against the other, laid on it, its edges flush
    // with the other's at the corner nearest the click — glued on it, not only in its plane.
    const mate = faceOnFace({ point: from.point, normal: from.normal }, { point: to.point, normal: to.normal }, this.gap);
    const slide = flushSlide(mate, from.corners, { normal: to.normal, corners: to.corners, sides: to.sides, clicked: this.fixed.clicked });
    mate.translate = mate.translate.map((c, i) => Number((c + slide[i]!).toFixed(6)) || 0) as Vec3;
    return mate.rotation ? this.turned(mate, whole) : this.moved(mate.translate, whole);
  }

  /** Moved without turning: the cabinet in place (or its bodies), or the piece alone. */
  private moved(shift: Vec3, whole: boolean): Feature[] | string {
    const doc = this.ctx.doc();
    const key = whole ? glueKey(doc, this.moving!.bodyId) : this.moving!.bodyId;
    const bodies = whole ? this.ctx.viewport.displayedBodies.filter((id) => glueKey(doc, id) === key) : [this.moving!.bodyId];
    const moving: Moving[] = [{ key, bodies, whole, shift }];
    const needed = movesNeeded(doc, moving);
    if (this.slots.length < needed) this.slots = freshFeatureIds(doc, "mv", "Déplacement", needed);
    const made = spacingFeatures(doc, moving, this.slots);
    return made.length ? made : "Ces deux faces se touchent déjà.";
  }

  /** The outer face of the element on the side of a face clicked (the face itself for a piece of no cabinet). */
  private outer(face: Picked): Laid {
    const box = (id: string) => (this.ctx.viewport.bodyMesh(id)?.metrics.bbox as [Vec3, Vec3] | undefined) ?? null;
    const env = elementEnvelope(this.ctx.doc(), face.bodyId, face.normal, face.clicked, this.ctx.viewport.displayedBodies, box);
    return env ? { point: env.center, normal: env.normal, corners: env.corners, sides: env.sides } : face;
  }

  /** Glued in any direction: turned about its face so that it looks against the other, then laid on it. */
  private turned(mate: FaceMate, whole: boolean): Feature[] | string {
    const doc = this.ctx.doc();
    if (whole && this.moving) {
      const made = wholeMate(doc, this.moving.bodyId, this.ctx.viewport.displayedBodies, mate, this.slots, (n) => freshFeatureIds(doc, "mv", "Déplacement", n));
      if (made !== null) return made;
    }
    if (!this.moving) return "1. Cliquez la face de l'élément à déplacer.";
    if (!this.turnSlots) {
      const [rotate] = freshFeatureIds(doc, "ro", "Rotation", 1);
      const [move] = freshFeatureIds({ ...doc, features: [...doc.features, { id: rotate!.id, name: rotate!.name } as Feature] }, "mv", "Déplacement", 1);
      this.turnSlots = { rotate: rotate!, move: move! };
    }
    const out: Feature[] = [];
    let target = this.moving.bodyId;
    if (mate.rotation) {
      const { dir, angle, center } = mate.rotation;
      const axis = [0, 1, 2].reduce((m, i) => (Math.abs(dir[i]!) > Math.abs(dir[m]!) ? i : m), 0) as 0 | 1 | 2;
      out.push({ ...this.turnSlots.rotate, type: "rotate", target, axis, angle: Number(angle.toFixed(6)), center: center.map((c) => Number(c.toFixed(6))) as Vec3, dir: dir.map((c) => Number(c.toFixed(9))) as Vec3 } satisfies RotateFeature);
      target = this.turnSlots.rotate.id;
    }
    if (Math.hypot(...mate.translate) > 1e-6) out.push({ ...this.turnSlots.move, type: "move", target, translate: mate.translate } satisfies MoveFeature);
    return out.length ? out : "Ces deux faces se touchent déjà.";
  }

  protected feature(): Feature | string {
    const made = this.made();
    return typeof made === "string" ? made : made[0]!;
  }

  protected override companions(): Feature[] {
    const made = this.made();
    return typeof made === "string" ? [] : made.slice(1);
  }

  protected rows(): (HTMLElement | null)[] {
    const restart = el("button", { type: "button", class: "h-8 w-full border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Recommencer");
    restart.addEventListener("click", () => {
      this.moving = this.fixed = null;
      this.ctx.viewport.setChosen([]);
      this.render();
    });
    const doc = this.ctx.doc();
    return [
      this.info(this.moving ? `Face qui bouge : « ${bodyLabel(doc, this.moving.bodyId)} ». 2. Cliquez la face où la coller, sur un autre élément : il s'y colle aussitôt.` : "1. Cliquez la face de l'élément à déplacer."),
      this.selectRow("Ce qui bouge", this.whole ? "whole" : "piece", [["whole", "Le meuble entier (caisson et façades)"], ["piece", "La pièce seule"]], (v) => {
        this.whole = lastWhole = v === "whole";
        this.render();
      }),
      this.numberRow("Jeu", this.gap, this.ctx.unit(), (v) => {
        this.gap = lastGap = Math.max(0, v);
        this.render();
      }),
      this.info("Faces qui se regardent, ou d'équerre : la face se colle sur l'autre, tournée s'il le faut, ses bords affleurant ceux de l'autre au coin le plus proche du clic. Faces de même sens (deux façades) : elles affleurent."),
      this.moving ? restart : null,
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
