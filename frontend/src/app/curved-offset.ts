/**
 * Le décalage de « Dessiner sur le corps » sur une face courbe (features/curved-offset.ts), ou sur tout un toit à
 * deux pans d'un seul tenant, par-dessus le faîtage (features/roof-offset.ts).
 * - Au survol, le contour décalé suit le pointeur sur la face.
 * - Un clic le fixe ; le panneau règle le décalage et la profondeur : creusé, un trou s'il traverse la paroi ; négative,
 *   en relief.
 * - OK ajoute l'esquisse de la couronne sur le pignon et son extrusion le long de la face, coupée dans le corps ou
 *   ajoutée, en une annulation.
 */
import { uniqueId } from "../document/operations";
import type { Feature, SketchFeature, Vec3 } from "../document/types";
import { curvedFaceOf, curvedOutline, curvedPointerOffset, curvedRecess, type CurvedFace } from "../features/curved-offset";
import { roofOf, roofOutline, roofPointerOffset, roofRecess, type RoofFace } from "../features/roof-offset";
import { roundTo } from "../viewport/axis-drag";
import type { FacePick } from "../viewport/viewport";
import type { Marks } from "./measure";
import type { ToolContext } from "./panel-tool";

const ORANGE = 0xf97316;

type Picked = { kind: "curve"; face: CurvedFace; bodyId: string } | { kind: "roof"; face: RoofFace; bodyId: string };

const outlineOf = (p: Picked, d: number) => (p.kind === "curve" ? curvedOutline(p.face, d) : roofOutline(p.face, d));
const recessOf = (p: Picked, d: number, depth: number) => (p.kind === "curve" ? curvedRecess(p.face, d, depth) : roofRecess(p.face, d, depth));

export class CurvedOffset {
  private readonly faces = new Map<string, Picked | null>();
  private readonly loading = new Set<string>();
  private hover: Picked | null = null;
  locked: Picked | null = null;
  distance = 0;
  depth = 10;

  constructor(private readonly ctx: ToolContext) {}

  /** The curved face (or, `roof`, the roof of the slope) under the pointer, loaded once (`ready` runs when it arrives). */
  private faceOf(pick: FacePick, ready: () => void, roof: boolean): Picked | null {
    const key = `${pick.bodyId}#${pick.faceIndex}${roof ? "#roof" : ""}`;
    if (this.faces.has(key)) return this.faces.get(key) ?? null;
    if (!this.loading.has(key)) {
      this.loading.add(key);
      void this.ctx.geometry
        .faceOutline(pick.bodyId, pick.faceIndex)
        .then((outline) => {
          const arcs = outline.surface === "CYLINDRE" ? outline.edges.flatMap((e) => (e.kind === "arc" ? [e] : [])) : [];
          const curve = curvedFaceOf(arcs);
          const box = this.ctx.viewport.bodyMesh(pick.bodyId)?.metrics.bbox;
          const lines = outline.edges.flatMap((e) => (e.kind === "line" ? [e] : []));
          const slope = roof && outline.surface === "PLANE" && box ? roofOf(lines, [[...box[0]] as Vec3, [...box[1]] as Vec3]) : null;
          this.faces.set(key, curve ? { kind: "curve", face: curve, bodyId: pick.bodyId } : slope ? { kind: "roof", face: slope, bodyId: pick.bodyId } : null);
        })
        .catch(() => this.faces.set(key, null))
        .finally(ready);
    }
    return null;
  }

  /** Follows the pointer over a curved face (or a roof); false when the face under it is not one (or not loaded yet). */
  move(pick: FacePick | null, step: number, ready: () => void, roof = false): boolean {
    if (this.locked) return true;
    this.hover = pick ? this.faceOf(pick, ready, roof) : null;
    if (!this.hover || !pick) return false;
    const p: Vec3 = [pick.point.x, pick.point.y, pick.point.z];
    this.distance = roundTo(this.hover.kind === "curve" ? curvedPointerOffset(this.hover.face, p) : roofPointerOffset(this.hover.face, p), step);
    return true;
  }

  /** The outline on the face, drawn in orange. */
  draw(marks: Marks): void {
    const f = this.locked ?? this.hover;
    for (const [a, b] of (f && outlineOf(f, this.distance)) || []) marks.line(a as Vec3, b as Vec3, ORANGE, false);
  }

  /** Fixes the outline under the pointer; false when there is none. */
  place(): boolean {
    if (this.locked || !this.hover || !outlineOf(this.hover, this.distance)) return false;
    this.locked = this.hover;
    return true;
  }

  /** What the value box names. */
  get label(): string {
    return (this.locked ?? this.hover)?.kind === "roof" ? "Décalage sur tout le toit" : "Décalage sur la face courbe";
  }

  get text(): string {
    return this.hover && !outlineOf(this.hover, this.distance) ? "trop grand" : "";
  }

  /** The sketch of the ring on the gable and its extrusion through the face, or why not. */
  features(sketchId: string, name: string): Feature[] | string {
    if (!this.locked) return "Survolez la face courbe puis cliquez.";
    const plan = recessOf(this.locked, this.distance, this.depth);
    if (typeof plan === "string") return plan;
    const sketch: SketchFeature = { id: sketchId, type: "sketch", name, plane: plan.plane, offset: Number(plan.offset.toFixed(6)), hidden: true, ...plan.geometry };
    const doc = this.ctx.doc();
    const id = uniqueId({ ...doc, features: [...doc.features, sketch] }, "ex");
    const extrude: Feature = { id, type: "extrude", name: `${this.locked.kind === "roof" ? "Panneau du toit" : "Panneau courbe"} ${name.replace(/^\D+/, "")}`.trim(), sketch: sketchId, distance: plan.distance, operation: plan.operation, target: this.locked.bodyId };
    return [sketch, extrude];
  }
}
