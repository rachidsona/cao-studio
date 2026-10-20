/**
 * Offset in the sketch, business side: turns the selected curves into paths
 * for the kernel (chains of lines and arcs, or circles), and the curves
 * returned by the kernel into new sketch geometry. The original geometry is
 * never touched. Computation itself is in geometry/offset.ts.
 */
import type { SketchCurve, SketchGeometry } from "../document/sketch";
import type { OffsetCurve, OffsetPath, OffsetStep } from "../geometry/offset";
import { orientedArc } from "./arc";
import { cloneGeometry, inferAlignment, nextId, pointPos, type Vec2 } from "./edit";
import type { Preview } from "./tools";

/** Points closer than this (mm) are one vertex. */
const NODE_TOLERANCE = 1e-6;

export class OffsetSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OffsetSelectionError";
  }
}

type PathCurve = Exclude<SketchCurve, { kind: "circle" }>;

interface Link {
  curve: PathCurve;
  a: number;
  b: number;
}

interface Graph {
  nodes: Vec2[];
  links: Link[];
  /** Link indices at each node. */
  at: Map<number, number[]>;
}

/** Vertex graph of the line and arc curves among `ids` (vertices merged by position). */
function graphOf(g: SketchGeometry, curves: SketchCurve[]): Graph {
  const nodes: Vec2[] = [];
  const node = (pointId: string): number => {
    const pos = pointPos(g, pointId);
    const found = nodes.findIndex((n) => Math.hypot(n[0] - pos[0], n[1] - pos[1]) <= NODE_TOLERANCE);
    if (found >= 0) return found;
    nodes.push(pos);
    return nodes.length - 1;
  };
  const links: Link[] = [];
  const at = new Map<number, number[]>();
  for (const curve of curves) {
    if (curve.kind === "circle") continue;
    const [p, q] = curve.kind === "line" ? [curve.p1, curve.p2] : [curve.start, curve.end];
    const a = node(p);
    const b = node(q);
    if (a === b) throw new OffsetSelectionError(`La courbe « ${curve.id} » a une longueur nulle.`);
    links.push({ curve, a, b });
    for (const n of [a, b]) at.set(n, [...(at.get(n) ?? []), links.length - 1]);
  }
  return { nodes, links, at };
}

const where = ([x, y]: Vec2) => `(${x.toFixed(3)} ; ${y.toFixed(3)})`;

/**
 * Curves of the unbranched chain `seedId` belongs to: neighbours are followed
 * through vertices shared by exactly two curves (construction and normal
 * geometry are not mixed). A circle is a chain of its own.
 */
export function connectedChain(g: SketchGeometry, seedId: string): string[] {
  const seed = g.curves.find((c) => c.id === seedId);
  if (!seed) return [];
  if (seed.kind === "circle") return [seed.id];
  const same = g.curves.filter((c) => !!c.construction === !!seed.construction);
  const graph = graphOf(g, same);
  const start = graph.links.findIndex((l) => l.curve.id === seedId);
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const link = graph.links[queue.shift() as number] as Link;
    for (const n of [link.a, link.b]) {
      const incident = graph.at.get(n) ?? [];
      if (incident.length !== 2) continue; // free end or junction: the chain stops here
      for (const i of incident) if (!seen.has(i)) (seen.add(i), queue.push(i));
    }
  }
  return [...seen].map((i) => (graph.links[i] as Link).curve.id);
}

/** Midpoint of an arc, whatever the direction it is walked in. */
function arcMid(g: SketchGeometry, arc: Extract<SketchCurve, { kind: "arc" }>): Vec2 {
  const [cx, cy] = pointPos(g, arc.center);
  const angle = (arc.startAngle + arc.endAngle) / 2;
  return [cx + arc.radius * Math.cos(angle), cy + arc.radius * Math.sin(angle)];
}

/**
 * Paths to offset for the selected curves: one per circle and one per
 * connected chain. An open chain is walked from the free end of its first
 * curve (in drawing order), which fixes what "left" means for its offset.
 */
export function pathsFromCurves(g: SketchGeometry, ids: Iterable<string>): OffsetPath[] {
  const wanted = new Set(ids);
  const selected = g.curves.filter((c) => wanted.has(c.id));
  const paths: OffsetPath[] = [];
  for (const curve of selected) {
    if (curve.kind === "circle") paths.push({ kind: "circle", center: pointPos(g, curve.center), radius: curve.radius });
  }
  const graph = graphOf(g, selected);
  for (const [n, incident] of graph.at) {
    if (incident.length > 2) {
      throw new OffsetSelectionError(`Sélection ramifiée au point ${where(graph.nodes[n] as Vec2)} : choisissez des éléments sans embranchement.`);
    }
  }
  const done = new Set<number>();
  graph.links.forEach((_, first) => {
    if (done.has(first)) return;
    // Component of `first`, then its two free ends (none when it closes on itself).
    const component = new Set<number>([first]);
    const queue = [first];
    while (queue.length) {
      const link = graph.links[queue.shift() as number] as Link;
      for (const n of [link.a, link.b]) for (const i of graph.at.get(n) ?? []) if (!component.has(i)) (component.add(i), queue.push(i));
    }
    const members = [...component].sort((x, y) => x - y);
    const lead = graph.links[members[0] as number] as Link;
    const free = (n: number) => (graph.at.get(n) ?? []).length === 1;
    const ends = members.flatMap((i) => [(graph.links[i] as Link).a, (graph.links[i] as Link).b]).filter(free);
    const closed = ends.length === 0;
    // Open chain: start from the free end of its first curve.
    const start = closed ? lead.a : free(lead.a) ? lead.a : free(lead.b) ? lead.b : (ends[0] as number);
    let node = start;
    const steps: OffsetStep[] = [];
    const used = new Set<number>();
    for (;;) {
      const next = (graph.at.get(node) ?? []).find((i) => !used.has(i));
      if (next === undefined) break;
      used.add(next);
      const link = graph.links[next] as Link;
      const to = link.a === node ? link.b : link.a;
      steps.push(link.curve.kind === "line" ? { kind: "line", to: graph.nodes[to] as Vec2 } : { kind: "arc", to: graph.nodes[to] as Vec2, mid: arcMid(g, link.curve) });
      node = to;
      if (closed && node === start) break;
    }
    for (const i of members) done.add(i);
    paths.push({ kind: "chain", start: graph.nodes[start] as Vec2, steps, closed });
  });
  return paths;
}

/**
 * Whether the offset is construction geometry: only when every selected curve is
 * construction. Curves projected from a body face count as real geometry, so the
 * offset of a face outline (an inset pocket, a rim) is a usable profile.
 */
export function allConstruction(g: SketchGeometry, ids: Iterable<string>): boolean {
  const wanted = new Set(ids);
  const selected = g.curves.filter((c) => wanted.has(c.id));
  return selected.length > 0 && selected.every((c) => c.construction && !c.projected);
}

/** Adds the offset curves to a copy of the sketch; vertices shared by two new curves are merged. */
export function addOffsetCurves(base: SketchGeometry, curves: OffsetCurve[], construction = false): { geometry: SketchGeometry; created: string[] } {
  const g = cloneGeometry(base);
  const made: { id: string; pos: Vec2 }[] = [];
  const vertex = (pos: Vec2): string => {
    const existing = made.find((p) => Math.hypot(p.pos[0] - pos[0], p.pos[1] - pos[1]) <= NODE_TOLERANCE);
    if (existing) return existing.id;
    const id = nextId(g, "p");
    g.points.push({ id, x: pos[0], y: pos[1] });
    made.push({ id, pos });
    return id;
  };
  const flag = construction ? { construction: true } : {};
  const created: string[] = [];
  for (const curve of curves) {
    if (curve.kind === "line") {
      const p1 = vertex(curve.a);
      const p2 = vertex(curve.b);
      if (p1 === p2) continue;
      const id = nextId(g, "l");
      g.curves.push({ id, kind: "line", p1, p2, ...flag });
      created.push(id);
      // Same inference as for a drawn line: an axis-aligned offset stays horizontal or vertical.
      const align = inferAlignment(curve.a, curve.b);
      if (align) g.constraints.push({ id: nextId(g, "c"), kind: align, line: id });
    } else if (curve.kind === "circle") {
      const id = nextId(g, "k");
      g.curves.push({ id, kind: "circle", center: vertex(curve.center), radius: curve.radius, ...flag });
      created.push(id);
    } else {
      const arc = orientedArc(curve.center, curve.a, curve.mid, curve.b);
      const id = nextId(g, "a");
      // The centre is a point of its own: arcs around one corner share it.
      g.curves.push({ id, kind: "arc", center: vertex(curve.center), start: vertex(arc.start), end: vertex(arc.end), radius: curve.radius, startAngle: arc.startAngle, endAngle: arc.endAngle, ...flag });
      created.push(id);
    }
  }
  return { geometry: g, created };
}

/** Preview shapes of offset curves, in the form the sketch overlay draws. */
export function offsetPreview(curves: OffsetCurve[]): Preview {
  const preview: Preview = { lines: [], circles: [], arcs: [] };
  for (const curve of curves) {
    if (curve.kind === "line") preview.lines.push([curve.a, curve.b]);
    else if (curve.kind === "circle") preview.circles.push({ center: curve.center, radius: curve.radius });
    else {
      const arc = orientedArc(curve.center, curve.a, curve.mid, curve.b);
      preview.arcs.push({ center: curve.center, radius: curve.radius, start: arc.startAngle, end: arc.endAngle });
    }
  }
  return preview;
}
