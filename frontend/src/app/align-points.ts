/**
 * « Point sur point » d'Aligner : on clique un point du corps qui bouge — un coin s'accroche à quelques pixels, sinon le
 * point de la face —, puis le point où l'amener sur un autre corps : l'élément entier (un caisson avec ses façades, un
 * corps, une étagère seule si les deux points sont du même caisson) glisse pour que les deux points se touchent, dans
 * les trois sens ou seulement certains (garder la hauteur, par exemple). Le calcul est celui d'Espacement
 * (document/spacing.ts) : un caisson par sa position, un autre corps par un déplacement ; une seule annulation.
 */
import * as THREE from "three";
import { bodyLabel, findFeature } from "../document/operations";
import { movesNeeded, spacingFeatures, type Moving } from "../document/spacing";
import { elementKey } from "../document/swap";
import type { Feature, Vec3 } from "../document/types";
import { bodyVertices } from "../viewport/body-points";
import { freshFeatureIds } from "./curic-common";
import { Marks } from "./measure";
import type { ToolContext } from "./panel-tool";

/** A corner within this many pixels of the pointer is taken instead of the point of the face. */
const CORNER_PX = 16;
export type PointAxes = "xyz" | "xy" | "x" | "y" | "z";
export const POINT_AXES: [PointAxes, string][] = [
  ["xyz", "Dans les trois sens"],
  ["xy", "À plat (X et Y, même hauteur)"],
  ["x", "Seulement en X"],
  ["y", "Seulement en Y"],
  ["z", "Seulement en Z (hauteur)"],
];

interface Picked {
  bodyId: string;
  point: Vec3;
  corner: boolean;
}

export class AlignPoints {
  moving: Picked | null = null;
  fixed: Picked | null = null;
  axes: PointAxes = "xyz";
  /** The bodies of what moves, as shown when its point was clicked. */
  private bodies: string[] = [];
  private whole = true;
  private slots: { id: string; name: string }[] = [];
  private readonly marks: Marks;

  constructor(
    private readonly ctx: ToolContext,
    private readonly changed: () => void,
  ) {
    this.marks = new Marks(ctx.viewport.scene);
  }

  /** The point under the pointer: a corner of the body within a few pixels, or the point of its face. */
  pointAt(event: PointerEvent): Picked | null {
    const face = this.ctx.viewport.pickFace(event);
    if (!face || this.slots.some((s) => s.id === face.bodyId || face.bodyId.startsWith(`${s.id}#`))) return null;
    const mesh = this.ctx.viewport.bodyMesh(face.bodyId);
    const rect = this.ctx.viewport.renderer.domElement.getBoundingClientRect();
    let best: Vec3 | null = null;
    let distance = CORNER_PX;
    for (const p of mesh ? bodyVertices(mesh) : []) {
      const v = new THREE.Vector3(...p).project(this.ctx.viewport.camera);
      const d = Math.hypot(rect.left + ((v.x + 1) / 2) * rect.width - event.clientX, rect.top + ((1 - v.y) / 2) * rect.height - event.clientY);
      if (d < distance) [best, distance] = [[...p] as Vec3, d];
    }
    return { bodyId: face.bodyId, point: best ?? [face.point.x, face.point.y, face.point.z], corner: best !== null };
  }

  /** The first click: the point that moves; the second: where it goes, on another element. A third starts again. */
  pick(event: PointerEvent): void {
    const at = this.pointAt(event);
    if (!at) return;
    const doc = this.ctx.doc();
    if (!this.moving || this.fixed) {
      this.moving = at;
      this.fixed = null;
      this.slots = [];
    } else if (at.bodyId === this.moving.bodyId) this.moving = at;
    else {
      this.fixed = at;
      // Two points of one element (two shelves of a cabinet): only the piece moves.
      const key = elementKey(doc, this.moving.bodyId);
      this.whole = elementKey(doc, at.bodyId) !== key;
      this.bodies = this.whole ? this.ctx.viewport.displayedBodies.filter((id) => elementKey(doc, id) === key) : [this.moving.bodyId];
    }
    this.changed();
  }

  restart(): void {
    this.moving = this.fixed = null;
    this.slots = [];
    this.changed();
  }

  /** How far the element moves: from its point to the other, on the axes kept. */
  private shift(): Vec3 {
    const [a, b] = [this.moving!.point, this.fixed!.point];
    return [0, 1, 2].map((i) => (this.axes.includes("xyz"[i]!) ? Number((b[i]! - a[i]!).toFixed(6)) : 0)) as Vec3;
  }

  /** The move (or the cabinet moved), or what is still missing. */
  features(): Feature[] | string {
    if (!this.moving) return "Cliquez un point (un coin) du corps à déplacer.";
    if (!this.fixed) return `Cliquez maintenant le point où l'amener, sur un autre corps.`;
    const doc = this.ctx.doc();
    const key = this.whole ? elementKey(doc, this.moving.bodyId) : this.moving.bodyId;
    const moving: Moving[] = [{ key, bodies: this.bodies, whole: this.whole, shift: this.shift() }];
    const needed = movesNeeded(doc, moving);
    if (this.slots.length < needed) this.slots = freshFeatureIds(doc, "mv", "Déplacement", needed);
    const made = spacingFeatures(doc, moving, this.slots);
    return made.length ? made : "Ces deux points sont déjà l'un sur l'autre.";
  }

  /** What moves, in words. */
  describe(): string {
    if (!this.moving) return "1. Cliquez un point du corps à déplacer (un coin s'accroche).";
    const doc = this.ctx.doc();
    const name = (this.whole ? findFeature(doc, elementKey(doc, this.moving.bodyId))?.name : undefined) ?? bodyLabel(doc, this.moving.bodyId);
    if (!this.fixed) return `Point de « ${bodyLabel(doc, this.moving.bodyId)} »${this.moving.corner ? " (coin)" : ""}. 2. Cliquez le point d'arrivée sur un autre corps.`;
    return `« ${name} » amené sur le point de « ${bodyLabel(doc, this.fixed.bodyId)} »${this.fixed.corner ? " (coin)" : ""}.`;
  }

  /** The two points (rose: it moves, green: where it goes) and the corner under the pointer. */
  draw(hover: Picked | null): void {
    this.marks.clear();
    if (hover) this.marks.cross(hover.point, hover.corner ? 0xf97316 : 0x9ca3af, 16);
    if (this.moving) this.marks.dot(this.moving.point, 0xe11d48);
    if (this.fixed) {
      this.marks.dot(this.fixed.point, 0x16a34a);
      if (this.moving) this.marks.line(this.moving.point, this.fixed.point, 0x16a34a, true);
    }
  }

  dispose(): void {
    this.marks.clear();
  }
}
