/**
 * Le décalage de « Dessiner sur le corps » sur une face courbe (features/curved-offset.ts).
 * - Au survol, le contour décalé suit le pointeur sur la face.
 * - Un clic le fixe ; le panneau règle le décalage et la profondeur : creusé, un trou s'il traverse la paroi ; négative,
 *   en relief.
 * - OK ajoute l'esquisse de la couronne sur le pignon et son extrusion le long de la face, coupée dans le corps ou
 *   ajoutée, en une annulation.
 */
import { uniqueId } from "../document/operations";
import type { Feature, SketchFeature, Vec3 } from "../document/types";
import { curvedFaceOf, curvedOutline, curvedPointerOffset, curvedRecess, type CurvedFace } from "../features/curved-offset";
import { roundTo } from "../viewport/axis-drag";
import type { FacePick } from "../viewport/viewport";
import type { Marks } from "./measure";
import type { ToolContext } from "./panel-tool";

const ORANGE = 0xf97316;

interface Picked {
  face: CurvedFace;
  bodyId: string;
}

export class CurvedOffset {
  private readonly faces = new Map<string, Picked | null>();
  private readonly loading = new Set<string>();
  private hover: Picked | null = null;
  locked: Picked | null = null;
  distance = 0;
  depth = 10;

  constructor(private readonly ctx: ToolContext) {}

  /** The curved face under the pointer, loaded once (`ready` runs when it arrives); null when it is not one. */
  private faceOf(pick: FacePick, ready: () => void): Picked | null {
    const key = `${pick.bodyId}#${pick.faceIndex}`;
    if (this.faces.has(key)) return this.faces.get(key) ?? null;
    if (!this.loading.has(key)) {
      this.loading.add(key);
      void this.ctx.geometry
        .faceOutline(pick.bodyId, pick.faceIndex)
        .then((outline) => {
          const arcs = outline.surface === "CYLINDRE" ? outline.edges.flatMap((e) => (e.kind === "arc" ? [e] : [])) : [];
          const face = curvedFaceOf(arcs);
          this.faces.set(key, face ? { face, bodyId: pick.bodyId } : null);
        })
        .catch(() => this.faces.set(key, null))
        .finally(ready);
    }
    return null;
  }

  /** Follows the pointer over a curved face; false when the face under it is not one (or not loaded yet). */
  move(pick: FacePick | null, step: number, ready: () => void): boolean {
    if (this.locked) return true;
    this.hover = pick ? this.faceOf(pick, ready) : null;
    if (!this.hover || !pick) return false;
    this.distance = roundTo(curvedPointerOffset(this.hover.face, [pick.point.x, pick.point.y, pick.point.z]), step);
    return true;
  }

  /** The outline on the face, drawn in orange. */
  draw(marks: Marks): void {
    const f = this.locked ?? this.hover;
    for (const [a, b] of (f && curvedOutline(f.face, this.distance)) || []) marks.line(a as Vec3, b as Vec3, ORANGE, false);
  }

  /** Fixes the outline under the pointer; false when there is none. */
  place(): boolean {
    if (this.locked || !this.hover || !curvedOutline(this.hover.face, this.distance)) return false;
    this.locked = this.hover;
    return true;
  }

  get text(): string {
    return this.hover && !curvedOutline(this.hover.face, this.distance) ? "trop grand" : "";
  }

  /** The sketch of the ring on the gable and its extrusion through the face, or why not. */
  features(sketchId: string, name: string): Feature[] | string {
    if (!this.locked) return "Survolez la face courbe puis cliquez.";
    const plan = curvedRecess(this.locked.face, this.distance, this.depth);
    if (typeof plan === "string") return plan;
    const sketch: SketchFeature = { id: sketchId, type: "sketch", name, plane: plan.plane, offset: Number(plan.offset.toFixed(6)), hidden: true, ...plan.geometry };
    const doc = this.ctx.doc();
    const id = uniqueId({ ...doc, features: [...doc.features, sketch] }, "ex");
    const extrude: Feature = { id, type: "extrude", name: `Panneau courbe ${name.replace(/^\D+/, "")}`.trim(), sketch: sketchId, distance: plan.distance, operation: plan.operation, target: this.locked.bodyId };
    return [sketch, extrude];
  }
}
