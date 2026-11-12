/**
 * « Face sur face » d'Aligner : on clique une face plane du corps qui bouge, puis la face où la coller — d'un autre
 * corps, droite ou inclinée (le pan d'un toit). Le corps tourne pour que sa face se plaque contre l'autre et se pose
 * bords affleurant ceux de l'autre au coin le plus proche du clic (ou son centre au point cliqué, ou au centre de la
 * face), avec un jeu et un quart de tour sur la face si l'on veut
 * (features/face-mate.ts). Le résultat est une rotation (autour d'un axe quelconque) suivie d'un déplacement : une
 * seule annulation.
 */
import { bodyLabel, findFeature } from "../document/operations";
import { alignWhole, elementEnvelope, wholeMate, type BoxFace } from "./align-whole";
import type { Feature, MoveFeature, RotateFeature, Vec3 } from "../document/types";
import { faceOnFace, flushSlide } from "../features/face-mate";
import type { FacePick } from "../viewport/viewport";
import { freshFeatureIds } from "./curic-common";
import type { ToolContext } from "./panel-tool";

/** A planar face clicked: its body, the point clicked, its centre and outward normal. */
interface Picked {
  bodyId: string;
  point: Vec3;
  center: Vec3;
  normal: Vec3;
  /** Its corners and straight sides (from its outline): to lay it flush at a corner. */
  corners: Vec3[];
  sides: [Vec3, Vec3][];
  /** For a piece of a cabinet or a Répartition: the outer face of the whole element on that side (what lies against the other when it moves whole). */
  envelope?: BoxFace;
}

export class AlignFaces {
  moving: Picked | null = null;
  fixed: Picked | null = null;
  /** Where it lands: its edges flush with the other's at the corner nearest the click (the default), its centre on the point clicked, or on the other's centre. */
  where: "corner" | "point" | "center" = "corner";
  gap = 0;
  /** The whole cabinet or Répartition the face belongs to moves (the default), or the piece alone. */
  whole = true;
  private wholeSlots: { id: string; name: string }[] = [];
  spin = 0;
  /** Where the faces were clicked, to mark them in the view. */
  private picks: { moving?: FacePick; fixed?: FacePick } = {};
  private slots: { rotate: { id: string; name: string }; move: { id: string; name: string } } | null = null;

  constructor(
    private readonly ctx: ToolContext,
    private readonly changed: () => void,
  ) {}

  /** The ids of the operations made (the bodies the preview shows in place of the one that moves). */
  get madeIds(): string[] {
    return this.slots ? [this.slots.rotate.id, this.slots.move.id] : [];
  }

  /** A click on a face: the face that moves first, then the face it goes on (another one replaces it). */
  async pick(pick: FacePick): Promise<void> {
    if (this.madeIds.includes(pick.bodyId)) return this.ctx.notify("Cliquez la face d'arrivée sur un autre corps, ou « Recommencer ».", "info");
    try {
      const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
      if (outline.surface !== "PLANE") return this.ctx.notify("Choisissez une face plane.", "info");
      const sides = outline.edges.flatMap((e) => (e.kind === "line" ? [[[...e.a], [...e.b]] as [Vec3, Vec3]] : []));
      const corners = outline.edges.flatMap((e) => (e.kind === "line" ? [e.a, e.b] : e.kind === "arc" ? [e.a, e.b, e.mid] : [])).map((p) => [...p] as Vec3);
      const face: Picked = { bodyId: pick.bodyId, point: [pick.point.x, pick.point.y, pick.point.z], center: [...outline.center] as Vec3, normal: [...outline.normal] as Vec3, corners, sides };
      const envelope = this.envelopeOf(face);
      if (envelope) face.envelope = envelope;
      if (!this.moving || pick.bodyId === this.moving.bodyId) {
        this.moving = face;
        this.fixed = null;
        this.picks = { moving: pick };
      } else {
        this.fixed = face;
        this.picks = { ...this.picks, fixed: pick };
      }
      this.mark();
      this.changed();
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  /** The outer face, on the side clicked, of the cabinet or Répartition a face belongs to (its bodies as shown). */
  private envelopeOf(face: Picked): BoxFace | undefined {
    const box = (id: string) => (this.ctx.viewport.bodyMesh(id)?.metrics.bbox as [Vec3, Vec3] | undefined) ?? null;
    return elementEnvelope(this.ctx.doc(), face.bodyId, face.normal, face.point, this.ctx.viewport.displayedBodies, box) ?? undefined;
  }

  /** The name of what moves: the cabinet or Répartition, or the piece. */
  movingName(): string {
    const doc = this.ctx.doc();
    if (!this.moving) return "";
    const owner = this.movesWhole() ? alignWhole(doc, this.moving.bodyId) : null;
    return (owner && findFeature(doc, owner.id)?.name) ?? bodyLabel(doc, this.moving.bodyId);
  }

  /** Whether the whole moves: asked, the face part of a whole, the other face not of the same one (a shelf on its side). */
  movesWhole(): boolean {
    if (!this.whole || !this.moving) return false;
    const doc = this.ctx.doc();
    const owner = alignWhole(doc, this.moving.bodyId);
    const other = this.fixed ? alignWhole(doc, this.fixed.bodyId) : null;
    return !!owner && !(other && other.kind === owner.kind && other.id === owner.id);
  }

  restart(): void {
    this.moving = this.fixed = null;
    this.picks = {};
    this.mark();
    this.changed();
  }

  /** The faces clicked stay marked: the one that moves in orange, the one it goes on in blue. */
  private mark(): void {
    const { moving, fixed } = this.picks;
    this.ctx.viewport.setChosen([...(moving ? [{ face: moving, role: "first" as const }] : []), ...(fixed ? [{ face: fixed, role: "second" as const }] : [])]);
  }

  /** The turn and the move, or what is still missing. */
  features(): Feature[] | string {
    if (!this.moving) return "Cliquez la face du corps à déplacer.";
    if (!this.fixed) return `Cliquez maintenant la face où coller « ${bodyLabel(this.ctx.doc(), this.moving.bodyId)} » (même inclinée).`;
    // A whole element lies by its outer faces: exactly face on face, the one against the other, never into it.
    const whole = this.movesWhole();
    const from = (whole && this.moving.envelope) || this.moving;
    const to = (whole && this.fixed.envelope) || this.fixed;
    const mate = faceOnFace({ point: from.center, normal: from.normal }, { point: this.where === "point" ? this.fixed.point : to.center, normal: to.normal }, this.gap, this.spin);
    if (this.where === "corner") {
      // Slid in the plane of the other face: its edges flush with the other's at the corner nearest the click.
      const slide = flushSlide(mate, from.corners, { normal: to.normal, corners: to.corners, sides: to.sides, clicked: this.fixed.point });
      mate.translate = mate.translate.map((c, i) => c + slide[i]!) as Vec3;
    }
    if (!this.slots) {
      const doc = this.ctx.doc();
      const [rotate] = freshFeatureIds(doc, "ro", "Rotation", 1);
      const [move] = freshFeatureIds({ ...doc, features: [...doc.features, { id: rotate!.id, name: rotate!.name } as Feature] }, "mv", "Déplacement", 1);
      this.slots = { rotate: rotate!, move: move! };
    }
    // The whole cabinet (with its fronts and appliances) or Répartition, not a face of another piece of it.
    if (this.movesWhole()) {
      const doc = this.ctx.doc();
      const made = wholeMate(doc, this.moving.bodyId, this.ctx.viewport.displayedBodies, mate, this.wholeSlots, (n) => freshFeatureIds(doc, "mv", "Déplacement", n));
      if (made !== null) return made;
    }
    const out: Feature[] = [];
    let target = this.moving.bodyId;
    if (mate.rotation) {
      const { dir, angle, center } = mate.rotation;
      const axis = [0, 1, 2].reduce((m, i) => (Math.abs(dir[i]!) > Math.abs(dir[m]!) ? i : m), 0) as 0 | 1 | 2;
      out.push({ ...this.slots.rotate, type: "rotate", target, axis, angle: Number(angle.toFixed(6)), center: center.map((c) => Number(c.toFixed(6))) as Vec3, dir: dir.map((c) => Number(c.toFixed(9))) as Vec3 } satisfies RotateFeature);
      target = this.slots.rotate.id;
    }
    if (Math.hypot(...mate.translate) > 1e-6) out.push({ ...this.slots.move, type: "move", target, translate: mate.translate.map((c) => Number(c.toFixed(6))) as Vec3 } satisfies MoveFeature);
    return out.length ? out : "Ces deux faces sont déjà l'une contre l'autre.";
  }
}
