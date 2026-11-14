/**
 * Drawing tools as small state machines, independent of the DOM: they receive
 * snapped positions and return a preview or the new sketch geometry.
 * Snapping to an existing point reuses it (shared vertex); snapping onto a
 * curve adds a point-on-curve constraint.
 */
import type { SketchGeometry } from "../document/sketch";
import { addArc, addCircle, addConstraint, addLine, addRectangle, cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";
import type { Snap } from "./hit";
import { addPolygon, addSlot } from "./shapes";
import { addPieces, ovalPieces, smoothPieces, type Piece } from "./curves";
import { addCenterRectangle, addCircleThrough, addTangentArc, addThreePointArc, addThreePointRectangle, circleThrough, curvesEndingAt, passesCcw, tangentCircle, tangentOut, threePointCorners } from "./draw-variants";
import { currentStamp, JOINERY_SHAPES, placeJoineryShape, shapePreview } from "./joinery-shapes";

export type ToolName = "select" | "line" | "rectangle" | "circle" | "arc" | "polygon" | "slot" | "oval" | "curve" | "rectangle-center" | "rectangle-3pt" | "circle-2pt" | "circle-3pt" | "arc-3pt" | "arc-tangent" | "joinery";

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
  line: ["Cliquez le premier point", "Cliquez le point suivant — ou tapez la longueur, Tab, l'angle, puis Entrée (Échap pour terminer)"],
  rectangle: ["Cliquez un coin (Échap pour quitter l'outil)", "Cliquez le coin opposé — ou tapez la largeur, Tab, la hauteur, puis Entrée"],
  circle: ["Cliquez le centre (Échap pour quitter l'outil)", "Cliquez un point du cercle — ou tapez le diamètre, puis Entrée"],
  arc: ["Cliquez le centre", "Cliquez le point de départ", "Cliquez la fin (sens antihoraire)"],
  polygon: ["Cliquez le centre du polygone (chiffre 3 à 9 : nombre de côtés)", "Cliquez un sommet"],
  slot: ["Cliquez le premier centre de l'oblong", "Cliquez le second centre", "Cliquez pour la largeur"],
  oval: ["Cliquez le centre de l'ovale", "Cliquez un coin du rectangle qui l'entoure"],
  curve: ["Cliquez le premier point de la courbe", "Cliquez les points suivants ; recliquez le dernier pour finir, le premier pour fermer"],
  "rectangle-center": ["Cliquez le centre du rectangle (Échap pour quitter l'outil)", "Cliquez un coin — ou tapez la largeur, Tab, la hauteur, puis Entrée"],
  "rectangle-3pt": ["Cliquez le début du premier côté", "Cliquez la fin du premier côté (à n'importe quel angle)", "Cliquez pour la largeur, d'un côté ou de l'autre"],
  "circle-2pt": ["Cliquez un bout du diamètre (Échap pour quitter l'outil)", "Cliquez l'autre bout — ou tapez le diamètre, puis Entrée"],
  "circle-3pt": ["Cliquez un premier point du cercle", "Cliquez un deuxième point", "Cliquez un troisième point"],
  "arc-3pt": ["Cliquez le départ de l'arc", "Cliquez la fin de l'arc", "Cliquez un point par où il passe"],
  "arc-tangent": ["Cliquez le bout d'un trait ou d'un arc à prolonger", "Cliquez la fin de l'arc : il part tangent"],
  joinery: ["Cliquez où poser la forme"],
};

/** An arc for the preview, from `a` to `b` about `center`, turning the way given. */
function previewArc(center: Vec2, a: Vec2, b: Vec2, ccw: boolean): Preview["arcs"][number] {
  const [s, e] = ccw ? [a, b] : [b, a];
  const start = Math.atan2(s[1] - center[1], s[0] - center[0]);
  let end = Math.atan2(e[1] - center[1], e[0] - center[0]);
  if (end <= start) end += 2 * Math.PI;
  return { center, radius: Math.hypot(a[0] - center[0], a[1] - center[1]), start, end };
}

/** Pieces of a smooth curve shown as a preview. */
function piecesPreview(preview: Preview, pieces: Piece[]): void {
  for (const p of pieces) {
    if (p.kind === "line") preview.lines.push([p.a, p.b]);
    else {
      const [s, e] = p.ccw ? [p.a, p.b] : [p.b, p.a];
      const start = Math.atan2(s[1] - p.c[1], s[0] - p.c[0]);
      let end = Math.atan2(e[1] - p.c[1], e[0] - p.c[0]);
      if (end <= start) end += 2 * Math.PI;
      preview.arcs.push({ center: p.c, radius: p.r, start, end });
    }
  }
}

/** Corners of a regular polygon around `c` with a vertex at `v` (for the preview). */
function polygonCorners(c: Vec2, v: Vec2, sides: number): Vec2[] {
  const r = Math.hypot(v[0] - c[0], v[1] - c[1]);
  const a0 = Math.atan2(v[1] - c[1], v[0] - c[0]);
  return Array.from({ length: sides }, (_, i) => [c[0] + r * Math.cos(a0 + (2 * Math.PI * i) / sides), c[1] + r * Math.sin(a0 + (2 * Math.PI * i) / sides)] as Vec2);
}

/** Width of a slot from c1 to c2 reaching the point p: twice its distance to the axis. */
function slotWidth(c1: Vec2, c2: Vec2, p: Vec2): number {
  const l = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) || 1;
  return (2 * Math.abs((c2[0] - c1[0]) * (p[1] - c1[1]) - (c2[1] - c1[1]) * (p[0] - c1[0]))) / l;
}

export class DrawingTool {
  private clicks: Snap[] = [];
  /** First point of the current polyline, to detect closing. */
  private chainStart: string | null = null;
  /** Sides of the polygon tool (3 to 9, chosen with the digit keys). */
  sides = 6;

  constructor(
    readonly name: Exclude<ToolName, "select">,
    public construction = false,
  ) {}

  get step(): string {
    const steps = TOOL_STEPS[this.name];
    const step = steps[Math.min(this.clicks.length, steps.length - 1)] as string;
    if (this.name === "joinery") {
      const { kind } = currentStamp();
      return `${JOINERY_SHAPES[kind].label} : cliquez ${JOINERY_SHAPES[kind].at} pour la poser — l'outil reste pour la suivante, Échap arrête`;
    }
    return this.name === "polygon" ? `${step} — ${this.sides} côtés` : step;
  }

  /** Smooth curve: points gather; the last one clicked again ends it, the first one closes it. */
  private curveClick(g: SketchGeometry, at: Snap): ToolResult {
    const pos = (s: Snap): Vec2 => (s.pointId ? pointPos(g, s.pointId) : s.pos);
    const near = (a: Snap, b: Snap) => Math.hypot(pos(a)[0] - pos(b)[0], pos(a)[1] - pos(b)[1]) < 1e-6 || (!!a.pointId && a.pointId === b.pointId);
    const first = this.clicks[0];
    const last = this.clicks.at(-1);
    const closing = !!first && this.clicks.length >= 3 && near(at, first);
    const ending = !!last && this.clicks.length >= 2 && near(at, last);
    if (!closing && !ending) {
      this.clicks.push(at);
      return { kind: "preview", preview: this.move(g, at) };
    }
    const points = this.clicks.map(pos);
    this.reset();
    const added = addPieces(cloneGeometry(g), smoothPieces(points, closing), closing, this.construction);
    return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
  }

  reset(): void {
    this.clicks = [];
    this.chainStart = null;
  }

  /** Where the shape being drawn starts, once its first point is clicked and before the next one; else null. */
  anchor(g: SketchGeometry): Vec2 | null {
    const [first] = this.clicks;
    return first && this.clicks.length === 1 ? (first.pointId ? pointPos(g, first.pointId) : first.pos) : null;
  }

  move(g: SketchGeometry, cursor: Snap): Preview {
    const preview = emptyPreview();
    const pos = (s: Snap): Vec2 => (s.pointId ? pointPos(g, s.pointId) : s.pos);
    if (this.name === "joinery") return shapePreview(g, cursor.pos);
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
      case "polygon": {
        const corners = polygonCorners(a, b, this.sides);
        corners.forEach((p, i) => preview.lines.push([p, corners[(i + 1) % corners.length]!]));
        preview.circles.push({ center: a, radius: Math.hypot(b[0] - a[0], b[1] - a[1]) });
        break;
      }
      case "slot": {
        if (!second) {
          preview.lines.push([a, b]);
          break;
        }
        const z = pos(second);
        const r = slotWidth(a, z, b) / 2;
        const l = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1;
        const n: Vec2 = [(-(z[1] - a[1]) / l) * r, ((z[0] - a[0]) / l) * r];
        const axis = Math.atan2(z[1] - a[1], z[0] - a[0]);
        preview.lines.push([[a[0] + n[0], a[1] + n[1]], [z[0] + n[0], z[1] + n[1]]], [[a[0] - n[0], a[1] - n[1]], [z[0] - n[0], z[1] - n[1]]]);
        preview.arcs.push({ center: a, radius: r, start: axis + Math.PI / 2, end: axis + (3 * Math.PI) / 2 }, { center: z, radius: r, start: axis - Math.PI / 2, end: axis + Math.PI / 2 });
        break;
      }
      case "oval": {
        const pieces = ovalPieces(a, Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
        if (typeof pieces !== "string") piecesPreview(preview, pieces);
        break;
      }
      case "curve":
        piecesPreview(preview, smoothPieces([...this.clicks.map(pos), b]));
        break;
      case "rectangle-center": {
        const n: Vec2 = [2 * a[0] - b[0], 2 * a[1] - b[1]];
        preview.lines.push([n, [b[0], n[1]]], [[b[0], n[1]], b], [b, [n[0], b[1]]], [[n[0], b[1]], n]);
        break;
      }
      case "rectangle-3pt": {
        if (!second) {
          preview.lines.push([a, b]);
          break;
        }
        const corners = threePointCorners(a, pos(second), b);
        if (corners) corners.forEach((p, i) => preview.lines.push([p, corners[(i + 1) % 4]!]));
        else preview.lines.push([a, pos(second)]);
        break;
      }
      case "circle-2pt":
        preview.circles.push({ center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], radius: Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 });
        break;
      case "circle-3pt": {
        const c = second ? circleThrough(a, pos(second), b) : null;
        if (c) preview.circles.push(c);
        else preview.lines.push([a, second ? pos(second) : b], ...(second ? [[pos(second), b] as [Vec2, Vec2]] : []));
        break;
      }
      case "arc-3pt": {
        if (!second) {
          preview.lines.push([a, b]);
          break;
        }
        const e = pos(second);
        const c = circleThrough(a, e, b);
        if (c) preview.arcs.push(previewArc(c.center, a, e, passesCcw(c.center, a, e, b)));
        else preview.lines.push([a, e]);
        break;
      }
      case "arc-tangent": {
        const curve = first.pointId ? curvesEndingAt(g, first.pointId).at(-1) : undefined;
        const direction = curve && first.pointId ? tangentOut(g, curve, first.pointId) : null;
        const c = direction ? tangentCircle(a, direction, b) : null;
        if (c) preview.arcs.push(previewArc(c.center, a, b, c.ccw));
        else preview.lines.push([a, b]);
        break;
      }
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
    if (this.name === "curve") return this.curveClick(g, at);
    if (this.name === "joinery") {
      const { kind, values } = currentStamp();
      const placed = placeJoineryShape(g, kind, values, at.pointId ? pointPos(g, at.pointId) : at.pos);
      return { kind: "commit", geometry: placed.geometry, created: placed.created, done: true };
    }
    // A tangent arc starts at the end of a line or an arc.
    if (this.name === "arc-tangent" && !this.clicks.length && !(at.pointId && curvesEndingAt(g, at.pointId).length)) throw new Error("Cliquez le bout d'un trait ou d'un arc : l'arc tangent le prolonge.");
    this.clicks.push(at);
    const needed = ["arc", "slot", "rectangle-3pt", "circle-3pt", "arc-3pt"].includes(this.name) ? 3 : 2;
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
      case "oval": {
        const center = s1.pointId ? pointPos(work, s1.pointId) : s1.pos;
        const pieces = ovalPieces(center, Math.abs(s2.pos[0] - center[0]), Math.abs(s2.pos[1] - center[1]));
        this.reset();
        if (typeof pieces === "string") throw new Error(pieces);
        const added = addPieces(work, pieces, true, c);
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
      }
      case "polygon": {
        const center = s1.pointId ? pointPos(work, s1.pointId) : s1.pos;
        const added = addPolygon(work, center, s2.pos, this.sides, c, s1.pointId);
        this.reset();
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
      }
      case "slot": {
        const [c1, c2] = [s1, s2].map((s) => (s.pointId ? pointPos(work, s.pointId) : s.pos)) as [Vec2, Vec2];
        const added = addSlot(work, c1, c2, slotWidth(c1, c2, (s3 as Snap).pos), c, [s1.pointId, s2.pointId]);
        this.reset();
        if (typeof added === "string") throw new Error(added);
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
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
      case "rectangle-center": {
        const center = resolve(work, s1);
        const added = addCenterRectangle(work, center, s2.pos, c);
        this.reset();
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
      }
      case "rectangle-3pt": {
        const [a, b] = [resolve(work, s1), resolve(work, s2)];
        const added = addThreePointRectangle(work, a, b, (s3 as Snap).pos, c);
        this.reset();
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
      }
      case "circle-2pt":
      case "circle-3pt": {
        const through = [s1, s2, ...(s3 ? [s3] : [])].map((s) => resolve(work, s));
        this.reset();
        const added = addCircleThrough(work, through, c);
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
      }
      case "arc-3pt": {
        const [a, b] = [resolve(work, s1), resolve(work, s2)];
        this.reset();
        const added = addThreePointArc(work, a, b, (s3 as Snap).pos, c);
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
      }
      case "arc-tangent": {
        const from = s1.pointId as string;
        const curve = curvesEndingAt(work, from).at(-1) as string;
        const end = resolve(work, s2);
        this.reset();
        const added = addTangentArc(work, from, curve, end, c);
        // The arc's end: where a next tangent arc may go on from.
        return { kind: "commit", geometry: added.geometry, created: added.created, done: true };
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
