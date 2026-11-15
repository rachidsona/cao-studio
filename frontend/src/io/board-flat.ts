/**
 * Une planche mise à plat pour la commande numérique, d'après le noyau, juste même quand une rainure la traverse de
 * bout en bout. Une rainure de fond qui court sur toute la longueur coupe sa face en deux : ni l'une ni l'autre moitié
 * n'est le contour de la pièce (la pièce en sortait 14 mm trop courte, sans sa rainure). Ici :
 * - le contour vient d'une coupe au milieu de ce qu'aucune rainure n'atteint (la vraie taille de la pièce, et ses
 *   découpes qui la traversent) ;
 * - chaque côté est lu : ses perçages (les cercles de ses faces au niveau du côté, même coupées en morceaux) et le fond
 *   de ses rainures et poches (les faces tournées comme lui, plus bas que lui), à leur profondeur ;
 * - le côté qui porte le plus d'usinages est mis dessus ; l'autre, s'il a des perçages borgnes ou des rainures, est
 *   dit à faire en retournant la pièce.
 */
import type { BodyMesh, EdgeOutline, FaceOutline, OutlineEdge } from "../geometry/protocol";
import { flatFaces, flattenOutline, type FlatPart } from "./dxf";

type P3 = [number, number, number];

const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const neg = (a: P3): P3 => [-a[0], -a[1], -a[2]];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: P3): P3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Closer than this to the side's plane, a face is on it (mm). */
const ON = 0.05;

/** One side of a board: its outward normal, where its plane is (along the normal), its faces, its pockets' bottoms. */
export interface BoardSide {
  normal: P3;
  level: number;
  /** The faces on the side's plane (one, or the pieces a through groove leaves). */
  entry: number[];
  /** The faces turned the same way, deeper: the bottoms of its grooves and pockets, with how deep they are. */
  pockets: { face: number; depth: number }[];
}

/** The two sides of a board, along the normal of its largest flat face; null without a flat face. */
export function boardSides(mesh: Pick<BodyMesh, "vertices" | "indices" | "faceGroups">, thickness: number): [BoardSide, BoardSide] | null {
  const faces = flatFaces(mesh);
  const top = faces[0];
  if (!top) return null;
  const side = (normal: P3, fallback: number): BoardSide => {
    const mine = faces.filter((f) => dot(f.normal, normal) > 0.9999);
    const level = mine.length ? Math.max(...mine.map((f) => dot(f.center, normal))) : fallback;
    const depth = (f: (typeof faces)[number]) => level - dot(f.center, normal);
    return {
      normal,
      level,
      entry: mine.filter((f) => depth(f) < ON).map((f) => f.face),
      pockets: mine.filter((f) => depth(f) >= ON && depth(f) < thickness - ON).map((f) => ({ face: f.face, depth: Math.round(depth(f) * 1000) / 1000 })),
    };
  };
  const a = side(top.normal, dot(top.center, top.normal));
  return [a, side(neg(top.normal), -(a.level - thickness))];
}

/** What the board needs from the kernel: its faces' outlines, and where a plane cuts it. */
export interface BoardGeometry {
  mesh: Pick<BodyMesh, "vertices" | "indices" | "faceGroups">;
  faceOutline(face: number): Promise<FaceOutline>;
  section(origin: P3, u: P3, v: P3): Promise<EdgeOutline[]>;
}

/** What a side carries: its holes (each once, with its depth from that side) and its pockets' outlines. */
interface SideWork {
  side: BoardSide;
  /** The outlines of its faces on its plane. */
  outlines: FaceOutline[];
  circles: Extract<OutlineEdge, { kind: "circle" }>[];
  blind: number;
  pockets: { edges: OutlineEdge[]; depth: number }[];
}

const sameCircle = (a: Extract<OutlineEdge, { kind: "circle" }>, b: Extract<OutlineEdge, { kind: "circle" }>, n: P3) => {
  if (Math.abs(a.radius - b.radius) > 0.05) return false;
  const d: P3 = [a.center[0] - b.center[0], a.center[1] - b.center[1], a.center[2] - b.center[2]];
  const along = dot(d, n);
  return Math.hypot(d[0] - n[0] * along, d[1] - n[1] * along, d[2] - n[2] * along) < 0.05;
};

/**
 * The board laid flat on the side that carries the most machining (holes and pockets), its outline cut through where
 * no pocket reaches; `otherSide`: the other side has blind holes or pockets too (the board is turned over for them).
 * `holeDepth`: how deep a hole of that side goes (the document first, else the mesh). Null: no flat face.
 */
export async function flatBoard(g: BoardGeometry, name: string, thickness: number, holeDepth: (center: P3, radius: number, normal: P3) => number): Promise<{ part: FlatPart; otherSide: boolean } | null> {
  const sides = boardSides(g.mesh, thickness);
  if (!sides) return null;
  const read = async (side: BoardSide): Promise<SideWork> => {
    const circles: SideWork["circles"] = [];
    const outlines = await Promise.all(side.entry.map((f) => g.faceOutline(f)));
    for (const outline of outlines) {
      for (const e of outline.edges) if (e.kind === "circle" && !circles.some((c) => sameCircle(c, e, side.normal))) circles.push(e);
    }
    const pockets = (await Promise.all(side.pockets.map(async (p) => ({ edges: (await g.faceOutline(p.face)).edges.filter((e) => e.kind !== "circle"), depth: p.depth })))).filter((p) => p.edges.length);
    const blind = circles.filter((c) => holeDepth(c.center, c.radius, side.normal) < thickness - 0.01).length;
    return { side, outlines, circles, blind, pockets };
  };
  const [a, b] = await Promise.all(sides.map(read)) as [SideWork, SideWork];
  // A through hole is in both sides: what counts is what is drilled or milled from each.
  const score = (w: SideWork) => w.blind + w.pockets.length;
  const [up, down] = score(b) > score(a) ? [b, a] : [a, b];
  // A plain board (each side one face, no groove nor pocket): its face's outline is its own, as read (a cut costs more).
  // (The bottom of a hinge cup or a hole is no pocket: its outline is a circle, read as the hole.)
  const plain = a.side.entry.length === 1 && b.side.entry.length <= 1 && !a.pockets.length && !b.pockets.length;
  if (plain && up.outlines[0]) {
    const part = flattenOutline(up.outlines[0], name, thickness, (center, radius) => holeDepth(center, radius, up.side.normal));
    return { part, otherSide: down.blind > 0 };
  }
  // Else its outline: where a plane cuts the board halfway through what no pocket of either side reaches.
  const reach = (w: SideWork) => Math.max(0, ...w.side.pockets.map((p) => p.depth));
  const below = (reach(a) + thickness - reach(b)) / 2;
  const n = a.side.normal;
  const origin: P3 = [n[0] * (a.side.level - below), n[1] * (a.side.level - below), n[2] * (a.side.level - below)];
  const u = unit(cross(n, Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
  const section = (await g.section(origin, u, cross(n, u))).flatMap((e) => e.edges);
  // The cut's circles are already read on a side (a hole, or a round part's outline): taken from there, once.
  const known = [...a.circles, ...b.circles];
  const outline = section.filter((e) => e.kind !== "circle" || !known.some((c) => sameCircle(c, e, n)));
  const part = flattenOutline(
    { surface: "PLANE", center: origin, normal: up.side.normal, edges: [...outline, ...up.circles] },
    name,
    thickness,
    (center, radius) => holeDepth(center, radius, up.side.normal),
    undefined,
    up.pockets,
  );
  return { part, otherSide: down.blind > 0 || down.pockets.length > 0 };
}
