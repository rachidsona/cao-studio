/**
 * « Face sur face » d'Aligner : on clique une face plane du corps qui bouge, puis la face où la coller — d'un autre
 * corps, droite ou inclinée (le pan d'un toit). Le corps tourne pour que sa face se plaque contre l'autre et se pose
 * au point cliqué (ou au centre de la face), avec un jeu et un quart de tour sur la face si l'on veut
 * (features/face-mate.ts). Le résultat est une rotation (autour d'un axe quelconque) suivie d'un déplacement : une
 * seule annulation.
 */
import { bodyLabel } from "../document/operations";
import type { Feature, MoveFeature, RotateFeature, Vec3 } from "../document/types";
import { faceOnFace } from "../features/face-mate";
import type { FacePick } from "../viewport/viewport";
import { freshFeatureIds } from "./curic-common";
import type { ToolContext } from "./panel-tool";

/** A planar face clicked: its body, the point clicked, its centre and outward normal. */
interface Picked {
  bodyId: string;
  point: Vec3;
  center: Vec3;
  normal: Vec3;
}

export class AlignFaces {
  moving: Picked | null = null;
  fixed: Picked | null = null;
  where: "point" | "center" = "point";
  gap = 0;
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
      const face: Picked = { bodyId: pick.bodyId, point: [pick.point.x, pick.point.y, pick.point.z], center: [...outline.center] as Vec3, normal: [...outline.normal] as Vec3 };
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
    const mate = faceOnFace({ point: this.moving.center, normal: this.moving.normal }, { point: this.where === "center" ? this.fixed.center : this.fixed.point, normal: this.fixed.normal }, this.gap, this.spin);
    if (!this.slots) {
      const doc = this.ctx.doc();
      const [rotate] = freshFeatureIds(doc, "ro", "Rotation", 1);
      const [move] = freshFeatureIds({ ...doc, features: [...doc.features, { id: rotate!.id, name: rotate!.name } as Feature] }, "mv", "Déplacement", 1);
      this.slots = { rotate: rotate!, move: move! };
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
