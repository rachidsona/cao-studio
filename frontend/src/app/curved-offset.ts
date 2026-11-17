/**
 * Le décalage de « Dessiner sur le corps » sur une face courbe (features/curved-offset.ts), ou sur tout un toit à
 * deux pans d'un seul tenant, par-dessus le faîtage (features/roof-offset.ts).
 * - Au survol, le contour décalé suit le pointeur sur la face.
 * - Un clic le fixe ; le panneau règle le décalage et la profondeur : creusé, un trou s'il traverse la paroi ; négative,
 *   en relief.
 * - OK ajoute l'esquisse de la couronne sur le pignon et son extrusion le long de la face, coupée dans le corps ou
 *   ajoutée, en une annulation.
 * Sur une face courbe (le flanc d'un cylindre aussi), un rectangle — deux coins cliqués, qui suit la face — et un
 * cercle — son centre puis un point du bord, percé vers l'axe ou en bossage — se dessinent de même.
 */
import { uniqueId } from "../document/operations";
import type { Feature, SketchFeature, Vec3 } from "../document/types";
import { curvedCircle, curvedFaceOf, curvedOutline, curvedPointerOffset, curvedRecess, cylinderOf, faceNormal, facePlace, onFace, sectorRecess, type CurvedFace } from "../features/curved-offset";
import { roofOf, roofOutline, roofPointerOffset, roofRecess, type RoofFace } from "../features/roof-offset";
import { roundTo } from "../viewport/axis-drag";
import type { FacePick } from "../viewport/viewport";
import type { Marks } from "./measure";
import type { ToolContext } from "./panel-tool";

const ORANGE = 0xf97316;

type Picked = { kind: "curve"; face: CurvedFace; bodyId: string } | { kind: "roof"; face: RoofFace; bodyId: string };
/** What is drawn on the curved face: its offset outline, or a rectangle or a circle clicked on it. */
export type CurvedShape = "offset" | "rectangle" | "circle" | "ring";
type Place = { s: number; a: number };

const outlineOf = (p: Picked, d: number) => (p.kind === "curve" ? curvedOutline(p.face, d) : roofOutline(p.face, d));
const recessOf = (p: Picked, d: number, depth: number) => (p.kind === "curve" ? curvedRecess(p.face, d, depth) : roofRecess(p.face, d, depth));

export class CurvedOffset {
  private readonly faces = new Map<string, Picked | null>();
  private readonly loading = new Set<string>();
  private hover: Picked | null = null;
  locked: Picked | null = null;
  distance = 0;
  depth = 10;
  shape: CurvedShape = "offset";
  /** The points clicked (a rectangle's first corner, a circle's centre) and the one under the pointer. */
  private points: Place[] = [];
  private cursor: Place | null = null;
  private on: Picked | null = null;

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
          // A piece of cylinder between two arcs, or the whole side of one between its two circles.
          const circles = outline.surface === "CYLINDRE" ? outline.edges.flatMap((e) => (e.kind === "circle" ? [e] : [])) : [];
          const curve = curvedFaceOf(arcs) ?? cylinderOf(circles);
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

  /** Whether this tool's drawing goes to the curved face: an offset (a roof too), or a rectangle or a circle begun on one. */
  wants(shape: string, curved: boolean, roof: boolean): boolean {
    if (shape !== this.shape) [this.shape, this.points, this.locked] = [shape as CurvedShape, [], null];
    if (shape === "offset") return !!this.locked || curved || roof;
    if (shape === "ring") return !!this.locked || curved;
    return (shape === "rectangle" || shape === "circle") && (!!this.locked || this.points.length > 0 || curved);
  }

  /** Follows the pointer over a curved face (or a roof); false when the face under it is not one (or not loaded yet). */
  move(pick: FacePick | null, step: number, ready: () => void, roof = false): boolean {
    if (this.locked) return true;
    this.hover = pick ? this.faceOf(pick, ready, roof) : null;
    // A rectangle or a circle stays on the face of its first point.
    if (this.points.length && this.on && this.hover?.face !== this.on.face) return true;
    if (!this.hover || !pick) return false;
    const p: Vec3 = [pick.point.x, pick.point.y, pick.point.z];
    if (this.shape !== "offset") {
      if (this.hover.kind !== "curve") return false;
      const at = facePlace(this.hover.face, p);
      this.cursor = { s: roundTo(at.s, step), a: at.a };
      // A line from the nearer round rim: its distance from it.
      if (this.shape === "ring") this.distance = roundTo(Math.min(at.s - this.hover.face.s0, this.hover.face.s1 - at.s), step);
      return true;
    }
    this.distance = roundTo(this.hover.kind === "curve" ? curvedPointerOffset(this.hover.face, p) : roofPointerOffset(this.hover.face, p), step);
    return true;
  }

  /** A rectangle's angles, the short way round, and its axial span. */
  private span(a: Place, b: Place): [number, number, number, number] {
    let [b0, b1] = [Math.min(a.a, b.a), Math.max(a.a, b.a)];
    if (b1 - b0 > Math.PI) [b0, b1] = [b1, b0 + 2 * Math.PI];
    return [b0, b1, Math.min(a.s, b.s), Math.max(a.s, b.s)];
  }

  /** A ring's band: from the nearer round rim to the line through the point. */
  private band(f: CurvedFace, p: Place): [number, number] {
    return p.s - f.s0 <= f.s1 - p.s ? [f.s0, p.s] : [p.s, f.s1];
  }

  /** A circle's radius: from its centre to the point, across the face. */
  private radius(f: CurvedFace, c: Place, p: Place): number {
    const [x, y] = [onFace(f, c.s, c.a), onFace(f, p.s, p.a)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  }

  /** The outline on the face, drawn in orange. */
  draw(marks: Marks): void {
    if (this.shape !== "offset") return this.drawShape(marks);
    const f = this.locked ?? this.hover;
    for (const [a, b] of (f && outlineOf(f, this.distance)) || []) marks.line(a as Vec3, b as Vec3, ORANGE, false);
  }

  /** A rectangle following the face, or a circle on it (on its tangent plane, laid back onto the face). */
  private drawShape(marks: Marks): void {
    const f = (this.on ?? this.hover)?.face as CurvedFace | undefined;
    const [first, last] = [this.points[0], this.points[1] ?? this.cursor];
    const seg = (pts: Vec3[]) => pts.slice(1).forEach((p, k) => marks.line(pts[k]!, p, ORANGE, false));
    if (f && last && this.shape === "ring") return this.band(f, last).forEach((s) => seg(Array.from({ length: 65 }, (_, k) => onFace(f, s, f.a0 + ((f.a1 - f.a0) * k) / 64))));
    if (!f || !first || !last || (this.on ?? this.hover)?.kind !== "curve") return;
    if (this.shape === "rectangle") {
      const [b0, b1, s0, s1] = this.span(first, last);
      const arc = (s: number) => Array.from({ length: 33 }, (_, k) => onFace(f, s, b0 + ((b1 - b0) * k) / 32));
      return [arc(s0), arc(s1), [onFace(f, s0, b0), onFace(f, s1, b0)], [onFace(f, s0, b1), onFace(f, s1, b1)]].forEach(seg);
    }
    const r = this.radius(f, first, last);
    const n = faceNormal(f, first.a);
    const c = onFace(f, first.s, first.a);
    const along: Vec3 = [0, 0, 0];
    along[f.axis] = 1;
    const side: Vec3 = [n[1] * along[2] - n[2] * along[1], n[2] * along[0] - n[0] * along[2], n[0] * along[1] - n[1] * along[0]];
    seg(Array.from({ length: 49 }, (_, k) => {
      const t = (2 * Math.PI * k) / 48;
      const q: Vec3 = [0, 1, 2].map((i) => c[i]! + r * (Math.cos(t) * along[i]! + Math.sin(t) * side[i]!)) as Vec3;
      // Back onto the face: the point at the same angle and axial place.
      const at = facePlace(f, q);
      return onFace(f, at.s, at.a);
    }));
  }

  /** Fixes the outline under the pointer, or a point of the rectangle or circle; false when there is none. */
  place(): boolean {
    if (this.shape !== "offset") {
      if (this.locked || !this.cursor || (!this.hover && !this.on)) return false;
      if (!this.points.length) this.on = this.hover;
      this.points.push(this.cursor);
      if (this.points.length === 2 || this.shape === "ring") this.locked = this.on;
      return true;
    }
    if (this.locked || !this.hover || !outlineOf(this.hover, this.distance)) return false;
    this.locked = this.hover;
    return true;
  }

  /** What the value box names. */
  get label(): string {
    if (this.shape === "rectangle") return "Rectangle sur la face courbe : largeur (sur la face) ; hauteur";
    if (this.shape === "circle") return "Cercle sur la face courbe : diamètre";
    if (this.shape === "ring") return "Trait depuis le bord rond : distance";
    return (this.locked ?? this.hover)?.kind === "roof" ? "Décalage sur tout le toit" : "Décalage sur la face courbe";
  }

  /** The value read (mm), or what is missing. */
  reading(fmt: (mm: number) => string): string {
    if (this.shape === "offset") return `${fmt(this.distance)} ${this.hover && !outlineOf(this.hover, this.distance) ? "trop grand" : ""}`;
    if (this.shape === "ring") return fmt(this.distance);
    const f = (this.on ?? this.hover)?.face as CurvedFace | undefined;
    const [first, last] = [this.points[0], this.points[1] ?? this.cursor];
    if (!f || !first || !last) return "—";
    if (this.shape === "circle") return fmt(2 * this.radius(f, first, last));
    const [b0, b1, s0, s1] = this.span(first, last);
    return `${fmt(f.radius * (b1 - b0))} ; ${fmt(s1 - s0)}`;
  }

  get hint(): string {
    if (this.locked) return "Réglez la profondeur dans le panneau : elle est enregistrée aussitôt.";
    if (this.shape === "rectangle") return this.points.length ? "Cliquez le coin opposé." : "Cliquez un coin sur la face courbe.";
    if (this.shape === "circle") return this.points.length ? "Cliquez un point du bord." : "Cliquez le centre sur la face courbe.";
    if (this.shape === "ring") return "Cliquez : la bande entre le bord rond et le trait se creuse tout autour (profondeur négative : un collet).";
    return "Cliquez pour le poser, puis réglez la profondeur.";
  }

  /** The sketch of the ring on the gable and its extrusion through the face, or why not. */
  features(sketchId: string, name: string): Feature[] | string {
    if (!this.locked) return "Survolez la face courbe puis cliquez.";
    if (this.shape !== "offset") return this.shapeFeatures(sketchId, name);
    const plan = recessOf(this.locked, this.distance, this.depth);
    if (typeof plan === "string") return plan;
    const sketch: SketchFeature = { id: sketchId, type: "sketch", name, plane: plan.plane, offset: Number(plan.offset.toFixed(6)), hidden: true, ...plan.geometry };
    const doc = this.ctx.doc();
    const id = uniqueId({ ...doc, features: [...doc.features, sketch] }, "ex");
    const extrude: Feature = { id, type: "extrude", name: `${this.locked.kind === "roof" ? "Panneau du toit" : "Panneau courbe"} ${name.replace(/^\D+/, "")}`.trim(), sketch: sketchId, distance: plan.distance, operation: plan.operation, target: this.locked.bodyId };
    return [sketch, extrude];
  }

  /** A rectangle (a crown sector along the axis) or a circle (on the tangent plane, towards the axis) on the face. */
  private shapeFeatures(sketchId: string, name: string): Feature[] | string {
    const picked = this.locked;
    const [first, second] = this.points;
    const ring = this.shape === "ring";
    if (!picked || picked.kind !== "curve" || !first || (!second && !ring)) return "Cliquez les deux points sur la face courbe.";
    const f = picked.face;
    const doc = this.ctx.doc();
    const words = ring ? "Bande ronde" : this.shape === "rectangle" ? "Rectangle courbe" : "Cercle courbe";
    if (ring || this.shape === "rectangle") {
      const [b0, b1, s0, s1] = ring ? [f.a0, f.a1, ...this.band(f, first).sort((x, y) => x - y)] as [number, number, number, number] : this.span(first, second!);
      const plan = sectorRecess(f, b0, b1, s0, s1, this.depth);
      if (typeof plan === "string") return plan;
      const sketch: SketchFeature = { id: sketchId, type: "sketch", name, plane: plan.plane, offset: Number(plan.offset.toFixed(6)), hidden: true, ...plan.geometry };
      const id = uniqueId({ ...doc, features: [...doc.features, sketch] }, "ex");
      return [sketch, { id, type: "extrude", name: `${words} ${name.replace(/^\D+/, "")}`.trim(), sketch: sketchId, distance: plan.distance, operation: plan.operation, target: picked.bodyId }];
    }
    const plan = curvedCircle(f, first.s, first.a, this.radius(f, first, second!), this.depth);
    if (typeof plan === "string") return plan;
    const n = plan.frame.normal;
    const plane = Math.abs(n[0]) > 0.7 ? "YZ" : Math.abs(n[1]) > 0.7 ? "XZ" : "XY";
    const sketch: SketchFeature = { id: sketchId, type: "sketch", name, plane, offset: 0, frame: plan.frame, hidden: true, ...plan.geometry };
    const id = uniqueId({ ...doc, features: [...doc.features, sketch] }, "ex");
    return [sketch, { id, type: "extrude", name: `${words} ${name.replace(/^\D+/, "")}`.trim(), sketch: sketchId, distance: plan.distance, startOffset: plan.startOffset, operation: plan.operation, target: picked.bodyId }];
  }
}
