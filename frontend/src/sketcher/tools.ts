/**
 * Drawing tools as small state machines, independent of the DOM: they receive
 * snapped positions and return a preview or the new sketch geometry.
 * Snapping to an existing point reuses it (shared vertex); snapping onto a
 * curve adds a point-on-curve constraint.
 */
import type { SketchGeometry } from "../document/sketch";
import { addArc, addCircle, addConstraint, addLine, addRectangle, cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";
import type { Snap } from "./hit";

export type ToolName = "select" | "line" | "rectangle" | "circle" | "arc";

export interface Preview {
  lines: [Vec2, Vec2][];
  circles: { center: Vec2; radius: number }[];
  arcs: { center: Vec2; radius: number; start: number; end: number }[];
}

export type ToolResult =
  | { kind: "preview"; preview: Preview }
  | { kind: "commit"; geometry: SketchGeometry; created: string[]; done: boolean };

const emptyPreview = (): Preview => ({ lines: [], circles: [], arcs: [] });

/** Turns a snap into a point id on a working copy (creating the point when needed). */
function resolve(g: SketchGeometry, s: Snap): string {
  if (s.pointId) return s.pointId;
  const id = nextId(g, "p");
  g.points.push({ id, x: s.pos[0], y: s.pos[1] });
  if (s.curveId) {
    const { geometry } = addConstraint(g, { kind: "pointOnCurve", point: id, curve: s.curveId } as never);
    g.constraints = geometry.constraints;
  }
  return id;
}

export const TOOL_STEPS: Record<Exclude<ToolName, "select">, string[]> = {
  line: ["Cliquez le premier point", "Cliquez le point suivant (Échap pour terminer)"],
  rectangle: ["Cliquez un coin", "Cliquez le coin opposé"],
  circle: ["Cliquez le centre", "Cliquez un point du cercle"],
  arc: ["Cliquez le centre", "Cliquez le point de départ", "Cliquez la fin (sens antihoraire)"],
};

export class DrawingTool {
  private clicks: Snap[] = [];
  /** First point of the current polyline, to detect closing. */
  private chainStart: string | null = null;

  constructor(
    readonly name: Exclude<ToolName, "select">,
    public construction = false,
  ) {}

  get step(): string {
    const steps = TOOL_STEPS[this.name];
    return steps[Math.min(this.clicks.length, steps.length - 1)] as string;
  }

  reset(): void {
    this.clicks = [];
    this.chainStart = null;
  }

  move(g: SketchGeometry, cursor: Snap): Preview {
    const preview = emptyPreview();
    const pos = (s: Snap): Vec2 => (s.pointId ? pointPos(g, s.pointId) : s.pos);
    const [first, second] = this.clicks;
    if (!first) return preview;
    const a = pos(first);
    const b = cursor.pos;
    switch (this.name) {
      case "line":
        preview.lines.push([a, b]);
        break;
      case "rectangle":
        preview.lines.push([a, [b[0], a[1]]], [[b[0], a[1]], b], [b, [a[0], b[1]]], [[a[0], b[1]], a]);
        break;
      case "circle":
        preview.circles.push({ center: a, radius: Math.hypot(b[0] - a[0], b[1] - a[1]) });
        break;
      case "arc": {
        if (!second) {
          preview.lines.push([a, b]);
          break;
        }
        const s = pos(second);
        const radius = Math.hypot(s[0] - a[0], s[1] - a[1]);
        const start = Math.atan2(s[1] - a[1], s[0] - a[0]);
        let end = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (end <= start) end += 2 * Math.PI;
        preview.arcs.push({ center: a, radius, start, end });
        break;
      }
    }
    return preview;
  }

  click(g: SketchGeometry, at: Snap): ToolResult {
    this.clicks.push(at);
    const needed = this.name === "arc" ? 3 : 2;
    if (this.clicks.length < needed) return { kind: "preview", preview: this.move(g, at) };
    const work = cloneGeometry(g);
    const [s1, s2, s3] = this.clicks as [Snap, Snap, Snap?];
    const c = this.construction;
    switch (this.name) {
      case "line": {
        const p1 = resolve(work, s1);
        const p2 = resolve(work, s2);
        if (p1 === p2) {
          this.clicks = [s1];
          return { kind: "preview", preview: emptyPreview() };
        }
        const added = addLine(work, { pointId: p1 }, { pointId: p2 }, { construction: c });
        this.chainStart ??= p1;
        const closed = p2 === this.chainStart;
        // Polyline: the end becomes the start of the next segment, until the chain closes.
        this.clicks = closed ? [] : [{ pos: pointPos(added.geometry, p2), pointId: p2 }];
        if (closed) this.chainStart = null;
        return { kind: "commit", geometry: added.geometry, created: added.created, done: closed };
      }
      case "rectangle": {
        const added = addRectangle(work, { pointId: resolve(work, s1) }, { pointId: resolve(work, s2) }, c);
        this.reset();
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
      }
      case "circle": {
        const center = resolve(work, s1);
        const [cx, cy] = pointPos(work, center);
        const radius = Math.hypot(s2.pos[0] - cx, s2.pos[1] - cy);
        let { geometry, created } = addCircle(work, { pointId: center }, radius, c);
        if (s2.pointId) geometry = addConstraint(geometry, { kind: "pointOnCurve", point: s2.pointId, curve: created[0] } as never).geometry;
        this.reset();
        return { kind: "commit", geometry, created, done: true };
      }
      case "arc": {
        const center = resolve(work, s1);
        const start = resolve(work, s2);
        let { geometry, created, lastPoint } = addArc(work, { pointId: center }, { pointId: start }, (s3 as Snap).pos, c);
        if (s3?.pointId) geometry = addConstraint(geometry, { kind: "coincident", a: lastPoint, b: s3.pointId } as never).geometry;
        this.reset();
        return { kind: "commit", geometry, created, done: true };
      }
    }
  }
}
