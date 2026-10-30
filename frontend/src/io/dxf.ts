/**
 * Export DXF des pièces pour la commande numérique : chaque panneau est mis à plat sur sa grande face (le
 * contour exact du noyau : lignes, arcs, et les perçages en cercles), posé à côté des autres avec un écart,
 * avec son nom et son épaisseur en texte. DXF R12 ASCII (lu par les logiciels de FAO), en millimètres ;
 * calques CONTOUR (découpe), PERCAGE (cercles) et TEXTE.
 */
import type { BodyMesh, FaceOutline, OutlineEdge } from "../geometry/protocol";

type P3 = [number, number, number];
type P2 = [number, number];

export type FlatEdge =
  | { kind: "line"; a: P2; b: P2 }
  /** A hole (or a round part's outline); `depth` from the face when known (the thickness: through). */
  | { kind: "circle"; center: P2; radius: number; depth?: number }
  /** Counter-clockwise from `start` to `end` (radians). */
  | { kind: "arc"; center: P2; radius: number; start: number; end: number };

export interface FlatPart {
  name: string;
  thickness: number;
  edges: FlatEdge[];
  /** Size of the flattened outline (mm). */
  width: number;
  height: number;
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: P3): P3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The flat faces of a body, from its mesh (face groups whose triangles all share one normal), largest first. */
export function flatFaces(mesh: Pick<BodyMesh, "vertices" | "indices" | "faceGroups">): { face: number; area: number; normal: P3 }[] {
  const out: { face: number; area: number; normal: P3 }[] = [];
  const v = (i: number): P3 => [mesh.vertices[3 * i]!, mesh.vertices[3 * i + 1]!, mesh.vertices[3 * i + 2]!];
  mesh.faceGroups.forEach((group, face) => {
    let area = 0;
    let normal: P3 | null = null;
    let flat = true;
    for (let k = group.start; k + 2 < group.start + group.count; k += 3) {
      const [a, b, c] = [v(mesh.indices[k]!), v(mesh.indices[k + 1]!), v(mesh.indices[k + 2]!)];
      const n = cross(sub(b, a), sub(c, a));
      const twice = Math.hypot(...n);
      if (twice < 1e-9) continue;
      area += twice / 2;
      const u = unit(n);
      if (!normal) normal = u;
      else if (Math.abs(dot(normal, u)) < 0.9999) flat = false;
    }
    if (flat && normal && area > 0) out.push({ face, area, normal });
  });
  return out.sort((a, b) => b.area - a.area);
}

/** The largest flat face of a body (the face of a board); -1 when the body has no flat face. */
export function largestFlatFace(mesh: Pick<BodyMesh, "vertices" | "indices" | "faceGroups">): number {
  return flatFaces(mesh)[0]?.face ?? -1;
}

/**
 * The two faces of a board: the largest flat face and the one opposite it (as large within 10 %: holes and cups
 * take a little of its area). Either may be the one to machine.
 */
export function boardFaces(mesh: Pick<BodyMesh, "vertices" | "indices" | "faceGroups">): number[] {
  const faces = flatFaces(mesh);
  const [first] = faces;
  if (!first) return [];
  const opposite = faces.find((f) => f !== first && dot(f.normal, first.normal) < -0.9999 && f.area >= 0.9 * first.area);
  return opposite ? [first.face, opposite.face] : [first.face];
}

/**
 * The outline of a flat face in its own plane, seen from outside: the x axis along its longest straight edge
 * (a board lies along its length), the lowest corner at (0, 0).
 */
export function flattenOutline(outline: FaceOutline, name: string, thickness: number, depthOf?: (center: P3, radius: number) => number): FlatPart {
  const n = unit(outline.normal);
  const lines = outline.edges.filter((e): e is Extract<OutlineEdge, { kind: "line" }> => e.kind === "line");
  const longest = lines.reduce<Extract<OutlineEdge, { kind: "line" }> | null>((best, e) => (!best || Math.hypot(...sub(e.b, e.a)) > Math.hypot(...sub(best.b, best.a)) ? e : best), null);
  let u: P3 = longest ? sub(longest.b, longest.a) : Math.abs(n[2]) < 0.9 ? cross([0, 0, 1], n) : cross([0, 1, 0], n);
  u = unit(sub(u, n.map((c) => c * dot(u, n)) as P3));
  const w = cross(n, u);
  const o = outline.center;
  const flat = (p: P3): P2 => [dot(sub(p, o), u), dot(sub(p, o), w)];
  const angle = (c: P2, p: P2) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const edges: FlatEdge[] = outline.edges.map((e): FlatEdge => {
    if (e.kind === "line") return { kind: "line", a: flat(e.a), b: flat(e.b) };
    const center = flat(e.center);
    if (e.kind === "circle") return { kind: "circle", center, radius: e.radius, ...(depthOf ? { depth: depthOf(e.center, e.radius) } : {}) };
    const [a, b, m] = [angle(center, flat(e.a)), angle(center, flat(e.b)), angle(center, flat(e.mid))];
    const ccw = (from: number, to: number) => (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // DXF arcs turn counter-clockwise: start at the end that reaches the middle point that way.
    return ccw(a, m) < ccw(a, b) ? { kind: "arc", center, radius: e.radius, start: a, end: b } : { kind: "arc", center, radius: e.radius, start: b, end: a };
  });
  const xs: number[] = [];
  const ys: number[] = [];
  for (const e of edges) {
    if (e.kind === "line") xs.push(e.a[0], e.b[0]), ys.push(e.a[1], e.b[1]);
    else xs.push(e.center[0] - e.radius, e.center[0] + e.radius), ys.push(e.center[1] - e.radius, e.center[1] + e.radius);
  }
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const shift = (p: P2): P2 => [p[0] - x0, p[1] - y0];
  const moved = edges.map((e): FlatEdge => (e.kind === "line" ? { ...e, a: shift(e.a), b: shift(e.b) } : { ...e, center: shift(e.center) }));
  return { name, thickness, edges: moved, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
}

/**
 * How deep a round hole goes into a board, from the mesh: the farthest of the points on its wall (at its radius from
 * its axis) below the face. The thickness when it goes through.
 */
export function holeDepth(vertices: ArrayLike<number>, center: P3, normal: P3, radius: number, thickness: number): number {
  const n = unit(normal);
  let deepest = 0;
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    const d = sub([vertices[i]!, vertices[i + 1]!, vertices[i + 2]!], center);
    const t = -dot(d, n);
    if (t < -0.01 || t > thickness + 0.01) continue;
    const across = Math.hypot(...sub(d, n.map((c) => c * dot(d, n)) as P3));
    if (Math.abs(across - radius) < 0.05) deepest = Math.max(deepest, t);
  }
  return deepest >= thickness - 0.01 ? thickness : Number(deepest.toFixed(3));
}

const num = (v: number) => (Math.abs(v) < 1e-9 ? "0" : Number(v.toFixed(4)).toString());
const deg = (r: number) => num((((r * 180) / Math.PI) % 360 + 360) % 360);

/** A DXF R12 file with the parts side by side along x, `gap` mm apart. */
export function partsDxf(parts: FlatPart[], gap = 20): string {
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "3"];
  for (const [name, color] of [["CONTOUR", 7], ["PERCAGE", 1], ["TEXTE", 3]] as const) out.push("0", "LAYER", "2", name, "70", "0", "62", String(color), "6", "CONTINUOUS");
  out.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
  let x = 0;
  for (const part of parts) {
    const at = (p: P2): string[] => ["10", num(p[0] + x), "20", num(p[1]), "30", "0"];
    for (const e of part.edges) {
      if (e.kind === "line") out.push("0", "LINE", "8", "CONTOUR", ...at(e.a), "11", num(e.b[0] + x), "21", num(e.b[1]), "31", "0");
      // A circle alone is the outline of a round part; among other edges, a hole.
      else if (e.kind === "circle") out.push("0", "CIRCLE", "8", part.edges.length === 1 ? "CONTOUR" : "PERCAGE", ...at(e.center), "40", num(e.radius));
      else out.push("0", "ARC", "8", "CONTOUR", ...at(e.center), "40", num(e.radius), "50", deg(e.start), "51", deg(e.end));
    }
    // R12 text is plain ASCII: accents dropped, other signs replaced.
    const label = `${part.name} - ep. ${num(part.thickness)} mm`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "-");
    out.push("0", "TEXT", "8", "TEXTE", ...at([0, -Math.max(12, part.height * 0.04) - 4]), "40", num(Math.max(8, Math.min(30, part.width / 25))), "1", label);
    x += part.width + gap;
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return `${out.join("\r\n")}\r\n`;
}
