/**
 * Export DXF des pièces pour la commande numérique : chaque panneau est mis à plat sur sa grande face (le
 * contour exact du noyau : lignes, arcs, et les perçages en cercles), posé à côté des autres avec un écart,
 * avec son nom et son épaisseur en texte. DXF R12 ASCII (lu par les logiciels de FAO), en millimètres ;
 * calques CONTOUR (découpe), POCHE (une rainure, une poche : un contour intérieur qui ne traverse pas, à sa
 * profondeur), PERCAGE (cercles) et TEXTE — ou, selon le profil de la machine, des noms de calques qui portent la
 * profondeur et le diamètre (« PERCAGE_D8_Z12 », « Z12-D8 », « FK-1T101R »…), comme les lisent beaucoup de logiciels
 * de commande numérique qui usinent d'après le nom du calque. Pour ceux-là, les contours peuvent être enchaînés en
 * polylignes fermées tournant dans le sens des aiguilles d'une montre : une compensation à droite met alors la fraise
 * dans la chute, dehors pour le tour de la pièce, dedans pour une découpe intérieure.
 */
import type { BodyMesh, FaceOutline, OutlineEdge } from "../geometry/protocol";

type P3 = [number, number, number];
type P2 = [number, number];

export type FlatEdge =
  /** `depth`: an inner outline that does not go through (a groove, a pocket), its depth from the face. */
  | { kind: "line"; a: P2; b: P2; depth?: number }
  /** A hole (or a round part's outline); `depth` from the face when known (the thickness: through). */
  | { kind: "circle"; center: P2; radius: number; depth?: number }
  /** Counter-clockwise from `start` to `end` (radians). */
  | { kind: "arc"; center: P2; radius: number; start: number; end: number; depth?: number };

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
export function flatFaces(mesh: Pick<BodyMesh, "vertices" | "indices" | "faceGroups">): { face: number; area: number; normal: P3; center: P3 }[] {
  const out: { face: number; area: number; normal: P3; center: P3 }[] = [];
  const v = (i: number): P3 => [mesh.vertices[3 * i]!, mesh.vertices[3 * i + 1]!, mesh.vertices[3 * i + 2]!];
  mesh.faceGroups.forEach((group, face) => {
    let area = 0;
    let normal: P3 | null = null;
    let flat = true;
    const sum: P3 = [0, 0, 0];
    for (let k = group.start; k + 2 < group.start + group.count; k += 3) {
      const [a, b, c] = [v(mesh.indices[k]!), v(mesh.indices[k + 1]!), v(mesh.indices[k + 2]!)];
      const n = cross(sub(b, a), sub(c, a));
      const twice = Math.hypot(...n);
      if (twice < 1e-9) continue;
      area += twice / 2;
      for (let i = 0; i < 3; i++) sum[i] = sum[i]! + ((a[i]! + b[i]! + c[i]!) / 3) * (twice / 2);
      const u = unit(n);
      if (!normal) normal = u;
      else if (Math.abs(dot(normal, u)) < 0.9999) flat = false;
    }
    if (flat && normal && area > 0) out.push({ face, area, normal, center: [sum[0] / area, sum[1] / area, sum[2] / area] });
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
export function flattenOutline(outline: FaceOutline, name: string, thickness: number, depthOf?: (center: P3, radius: number) => number, loopDepth?: (points: P3[]) => number, pockets: readonly { edges: readonly OutlineEdge[]; depth: number }[] = []): FlatPart {
  const n = unit(outline.normal);
  const lines = outline.edges.filter((e): e is Extract<OutlineEdge, { kind: "line" }> => e.kind === "line");
  const longest = lines.reduce<Extract<OutlineEdge, { kind: "line" }> | null>((best, e) => (!best || Math.hypot(...sub(e.b, e.a)) > Math.hypot(...sub(best.b, best.a)) ? e : best), null);
  let u: P3 = longest ? sub(longest.b, longest.a) : Math.abs(n[2]) < 0.9 ? cross([0, 0, 1], n) : cross([0, 1, 0], n);
  u = unit(sub(u, n.map((c) => c * dot(u, n)) as P3));
  const w = cross(n, u);
  const o = outline.center;
  const flat = (p: P3): P2 => [dot(sub(p, o), u), dot(sub(p, o), w)];
  const angle = (c: P2, p: P2) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const flatEdge = (e: OutlineEdge): FlatEdge => {
    if (e.kind === "line") return { kind: "line", a: flat(e.a), b: flat(e.b) };
    const center = flat(e.center);
    if (e.kind === "circle") return { kind: "circle", center, radius: e.radius, ...(depthOf ? { depth: depthOf(e.center, e.radius) } : {}) };
    const [a, b, m] = [angle(center, flat(e.a)), angle(center, flat(e.b)), angle(center, flat(e.mid))];
    const ccw = (from: number, to: number) => (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // DXF arcs turn counter-clockwise: start at the end that reaches the middle point that way.
    return ccw(a, m) < ccw(a, b) ? { kind: "arc", center, radius: e.radius, start: a, end: b } : { kind: "arc", center, radius: e.radius, start: b, end: a };
  };
  const edges: FlatEdge[] = outline.edges.map(flatEdge);
  // The inner outlines (the largest is the part's own): a groove or a pocket is as deep as the mesh says.
  if (loopDepth) {
    const loops = edgeLoops(edges);
    const size = (loop: number[]) => {
      const pts = loop.flatMap((i) => ends(edges[i]!));
      return (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) * (Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])));
    };
    const outer = loops.reduce<number[] | null>((best, l) => (!best || size(l) > size(best) ? l : best), null);
    for (const loop of loops) {
      if (loop === outer) continue;
      const points = loop.flatMap((i) => {
        const e = outline.edges[i]!;
        return e.kind === "circle" ? [] : [e.a, e.b];
      });
      const depth = Math.min(loopDepth(points), thickness);
      if (depth < thickness - 0.01) for (const i of loop) (edges[i] as Exclude<FlatEdge, { kind: "circle" }>).depth = depth;
    }
  }
  // The bottoms of the grooves and pockets read on the board (board-flat.ts): their outlines at their depth.
  for (const pocket of pockets) {
    for (const e of pocket.edges) {
      if (e.kind === "circle") continue;
      const made = flatEdge(e);
      if (made.kind !== "circle") edges.push({ ...made, depth: Math.min(pocket.depth, thickness) });
    }
  }
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

/** The two ends of a line or an arc. */
function ends(e: FlatEdge): P2[] {
  if (e.kind === "line") return [e.a, e.b];
  if (e.kind === "circle") return [];
  return [e.start, e.end].map((t): P2 => [e.center[0] + e.radius * Math.cos(t), e.center[1] + e.radius * Math.sin(t)]);
}

const near = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;

/** The lines and arcs that meet end to end, in groups (a loop each), by their indexes; circles left out. */
export function edgeLoops(edges: readonly FlatEdge[]): number[][] {
  const parent = edges.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  const open = edges.flatMap((e, i) => (e.kind === "circle" ? [] : [i]));
  for (const i of open) for (const j of open) if (j > i && ends(edges[i]!).some((p) => ends(edges[j]!).some((q) => near(p, q)))) parent[root(j)] = root(i);
  const groups = new Map<number, number[]>();
  for (const i of open) groups.set(root(i), [...(groups.get(root(i)) ?? []), i]);
  return [...groups.values()];
}

/**
 * How deep an inner outline goes into a board, from the mesh: the farthest point below the face under one of its
 * corners. The thickness when it goes through, or when no wall is found.
 */
export function loopDepthOf(vertices: ArrayLike<number>, normal: P3, points: readonly P3[], thickness: number): number {
  const n = unit(normal);
  let deepest = 0;
  for (const p of points) {
    for (let i = 0; i + 2 < vertices.length; i += 3) {
      const d = sub([vertices[i]!, vertices[i + 1]!, vertices[i + 2]!], p);
      const t = -dot(d, n);
      if (t < 0.01 || t > thickness + 0.01) continue;
      if (Math.hypot(...sub(d, n.map((c) => c * dot(d, n)) as P3)) < 0.05) deepest = Math.max(deepest, t);
    }
  }
  return deepest === 0 || deepest >= thickness - 0.01 ? thickness : Number(deepest.toFixed(3));
}

/** A hole as the document drills it (document/hardware-rules.ts opsOf): where, into which direction, how wide and deep. */
export interface DrilledHole {
  at: P3;
  dir: P3;
  diameter: number;
  depth: number;
}

/**
 * How deep a round hole goes, as the document says (audit of 11/11/2026): the drilled hole whose axis passes through
 * this circle of the face, with its diameter; null when none does (then the mesh is read, holeDepth).
 */
export function documentedHoleDepth(holes: readonly DrilledHole[], center: P3, radius: number, thickness: number): number | null {
  for (const hole of holes) {
    if (Math.abs(hole.diameter / 2 - radius) > 0.05) continue;
    const n = unit(hole.dir);
    const d = sub(center, hole.at);
    const along = dot(d, n);
    const off = Math.hypot(...sub(d, n.map((c) => c * along) as P3));
    // On its axis, and the circle at its entry (along ≈ 0) or at its bottom when it is seen from the other face.
    if (off < 0.05 && along > -0.05 && along < hole.depth + 0.05) return Math.min(hole.depth, thickness);
  }
  return null;
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

/**
 * How the layers are named for a machine: templates where {d} is the hole's diameter, {z} its depth (or a pocket's)
 * and {t} the board's thickness (the contour is cut through it), in mm. `chain`: the outlines as closed polylines
 * turning clockwise (a right compensation then keeps the tool in the waste), not loose lines.
 */
export interface LayerProfile {
  contour: string;
  drill: string;
  /** A groove or a pocket: an inner outline that does not go through. */
  pocket?: string;
  chain?: boolean;
}

/** The pocket layer of a profile kept before pockets had one. */
export const DEFAULT_POCKET = "POCHE_Z{z}";

/**
 * Ready-made namings. Only woodWOP's contour (« FK », Z under the panel, tool, compensation : Stiles Machinery, 2006)
 * and ABF's drilling and groove are written after what their makers or users show; the rest are starting points, to set
 * to the table of the machine's post-processor (each field is editable, and a set is kept under the machine's name).
 */
export const LAYER_PROFILES: { id: string; label: string; profile: LayerProfile }[] = [
  { id: "generic", label: "Générique : CONTOUR, POCHE_Z8, PERCAGE", profile: { contour: "CONTOUR", drill: "PERCAGE", pocket: DEFAULT_POCKET } },
  { id: "named", label: "Diamètre et profondeur : PERCAGE_D8_Z12, CONTOUR_Z19", profile: { contour: "CONTOUR_Z{t}", drill: "PERCAGE_D{d}_Z{z}", pocket: DEFAULT_POCKET } },
  { id: "short", label: "Court : Z12-D8, Z19", profile: { contour: "Z{t}", drill: "Z{z}-D{d}", pocket: "Z{z}" } },
  { id: "woodwop", label: "woodWOP (HOMAG, Weeke) : FK-1T101R, contours enchaînés", profile: { contour: "FK-1T101R", drill: "BOHRUNG_D{d}_Z{z}", pocket: "TASCHE_Z{z}", chain: true } },
  { id: "abf", label: "ABF : ABF-Z12-D8, ABF_GROOVE-Z8, contours enchaînés", profile: { contour: "ABF-Z{t}", drill: "ABF-Z{z}-D{d}", pocket: "ABF_GROOVE-Z{z}", chain: true } },
  { id: "vectric", label: "Vectric (Aspire, VCarve, Cut2D) : un calque par opération", profile: { contour: "Profil_Ext_{t}mm", drill: "Percage_D{d}_{z}mm", pocket: "Poche_{z}mm", chain: true } },
];

/** DXF R12 layer names: up to 31 letters, digits and - _ . */
const NAME_LENGTH = 31;

/** A layer name from a template: DXF names keep letters, digits and - _ . only. */
export function layerName(template: string, values: { d?: number; z?: number; t: number }): string {
  const name = template.replace(/\{([dzt])\}/g, (_, k: "d" | "z" | "t") => num(values[k] ?? 0)).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_.-]/g, "_");
  return name.slice(0, NAME_LENGTH) || "0";
}

/** A piece of an outline from `a` to `b`, straight (bulge 0) or an arc (bulge: tan of a quarter of its angle, + counter-clockwise). */
interface Span {
  a: P2;
  b: P2;
  bulge: number;
}

const spanOf = (e: Exclude<FlatEdge, { kind: "circle" }>): Span => {
  if (e.kind === "line") return { a: e.a, b: e.b, bulge: 0 };
  const [a, b] = ends(e) as [P2, P2];
  const sweep = ((((e.end - e.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) || 2 * Math.PI;
  return { a, b, bulge: Math.tan(sweep / 4) };
};
const flip = (s: Span): Span => ({ a: s.b, b: s.a, bulge: -s.bulge });

/** These spans chained end to end into one closed loop, or null when they do not close. */
export function chainLoop(spans: readonly Span[]): Span[] | null {
  const left = [...spans];
  const loop = [left.shift()!];
  while (left.length) {
    const end = loop.at(-1)!.b;
    const i = left.findIndex((s) => near(s.a, end) || near(s.b, end));
    if (i < 0) return null;
    const [s] = left.splice(i, 1);
    loop.push(near(s!.a, end) ? s! : flip(s!));
  }
  return near(loop.at(-1)!.b, loop[0]!.a) ? loop : null;
}

/** The area inside a loop, positive when it turns counter-clockwise (arcs counted by their segments). */
export function loopArea(loop: readonly Span[]): number {
  let area = 0;
  for (const s of loop) {
    area += (s.a[0] * s.b[1] - s.b[0] * s.a[1]) / 2;
    if (s.bulge) {
      const theta = 4 * Math.atan(s.bulge);
      const chord = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
      area += Math.sign(theta) * ((r * r) / 2) * (Math.abs(theta) - Math.sin(Math.abs(theta)));
    }
  }
  return area;
}

/** A DXF R12 file with the parts side by side along x, `gap` mm apart, its layers named by `profile`. */
export function partsDxf(parts: FlatPart[], gap = 20, profile: LayerProfile = LAYER_PROFILES[0]!.profile): string {
  // A circle alone is the outline of a round part; among other edges, a hole.
  const hole = (part: FlatPart, e: FlatEdge) => e.kind === "circle" && part.edges.length > 1;
  const layerOf = (part: FlatPart, e: FlatEdge) =>
    hole(part, e) && e.kind === "circle"
      ? layerName(profile.drill, { d: e.radius * 2, z: e.depth ?? part.thickness, t: part.thickness })
      : e.kind !== "circle" && e.depth !== undefined
        ? layerName(profile.pocket ?? DEFAULT_POCKET, { z: e.depth, t: part.thickness })
        : layerName(profile.contour, { t: part.thickness });
  const colorOf = (part: FlatPart, e: FlatEdge) => (hole(part, e) ? 1 : e.kind !== "circle" && e.depth !== undefined ? 5 : 7);
  const layers = new Map<string, number>([["TEXTE", 3]]);
  for (const part of parts) for (const e of part.edges) if (!layers.has(layerOf(part, e))) layers.set(layerOf(part, e), colorOf(part, e));
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(layers.size)];
  for (const [name, color] of layers) out.push("0", "LAYER", "2", name, "70", "0", "62", String(color), "6", "CONTINUOUS");
  out.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
  let x = 0;
  for (const part of parts) {
    const at = (p: P2): string[] => ["10", num(p[0] + x), "20", num(p[1]), "30", "0"];
    const loose = (e: FlatEdge) => {
      const layer = layerOf(part, e);
      if (e.kind === "line") out.push("0", "LINE", "8", layer, ...at(e.a), "11", num(e.b[0] + x), "21", num(e.b[1]), "31", "0");
      else if (e.kind === "circle") out.push("0", "CIRCLE", "8", layer, ...at(e.center), "40", num(e.radius));
      else out.push("0", "ARC", "8", layer, ...at(e.center), "40", num(e.radius), "50", deg(e.start), "51", deg(e.end));
    };
    if (profile.chain) {
      // Each outline one closed polyline turning clockwise; what does not close is written as it is.
      for (const loop of edgeLoops(part.edges)) {
        const spans = chainLoop(loop.map((i) => spanOf(part.edges[i] as Exclude<FlatEdge, { kind: "circle" }>)));
        if (!spans) {
          for (const i of loop) loose(part.edges[i]!);
          continue;
        }
        const clockwise = loopArea(spans) > 0 ? spans.map(flip).reverse() : spans;
        const layer = layerOf(part, part.edges[loop[0]!]!);
        out.push("0", "POLYLINE", "8", layer, "66", "1", "10", "0", "20", "0", "30", "0", "70", "1");
        for (const s of clockwise) out.push("0", "VERTEX", "8", layer, ...at(s.a), ...(s.bulge ? ["42", num(s.bulge)] : []));
        out.push("0", "SEQEND", "8", layer);
      }
      for (const e of part.edges) if (e.kind === "circle") loose(e);
    } else for (const e of part.edges) loose(e);
    // R12 text is plain ASCII: accents dropped, other signs replaced.
    const label = `${part.name} - ep. ${num(part.thickness)} mm`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "-");
    out.push("0", "TEXT", "8", "TEXTE", ...at([0, -Math.max(12, part.height * 0.04) - 4]), "40", num(Math.max(8, Math.min(30, part.width / 25))), "1", label);
    x += part.width + gap;
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return `${out.join("\r\n")}\r\n`;
}
