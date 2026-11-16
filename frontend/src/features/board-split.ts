/**
 * « Séparer les côtés » d'un corps fait de panneaux d'équerre joints en un seul — un caisson, une étagère, un cadre en
 * U — : un corps par panneau. Toutes ses faces sont planes et d'équerre avec les axes ; leurs plans quadrillent le corps
 * en cases, celles qui sont dans la matière sont regroupées en planches entières, la plus grande d'abord. Aux angles,
 * comme dans une Répartition : les côtés passent, ou le dessus et le dessous ; sans choix, la façon qui ne coupe aucun
 * panneau en deux (le moins de panneaux). Pas d'onglet : des panneaux joints se rejoignent bout à bout. Pur : des faces
 * données par leurs contours, des boîtes rendues.
 */

export type Axis = 0 | 1 | 2;
type P2 = [number, number];
export type Box = [[number, number, number], [number, number, number]];

/**
 * A face square to `axis`, at `at` along it, the straight edges of its contours in the two other axes (in their order:
 * y z, x z or x y), in any order and either way round.
 */
export interface AxisFace {
  axis: Axis;
  at: number;
  edges: [P2, P2][];
}

/** Which panels run through at the corners: the sides (upright), the top and bottom (lying), or the largest. */
export type Pass = "sides" | "boards" | "largest";

const EPS = 1e-6;
/** Beyond this, the body is not a few panels but a part with many steps: left to the other ways. */
const MAX_CELLS = 4000;

function levels(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1]! > EPS);
}

/** Inside the contours: a ray from the point crosses an odd number of their edges (holes included). */
function insideEdges(p: P2, edges: readonly [P2, P2][]): boolean {
  let inside = false;
  for (const [[xi, yi], [xj, yj]] of edges) {
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The panels of the body, as boxes; a string: why it cannot be so (not square, too many steps, one panel only).
 * `vertical`: the upright axis (the sides stand along it; the top and bottom lie square to it).
 */
export function boardBoxes(faces: readonly AxisFace[], pass: Pass = "largest", vertical: Axis = 2): Box[] | string {
  // Nothing chosen: the way that cuts no panel in two — the fewest panels — of the three (a bottom raised over a plinth
  // does not run through the sides, which go down to the floor).
  if (pass === "largest") {
    const ways = (["largest", "sides", "boards"] as const).map((way) => panelsOf(faces, way, vertical));
    const found = ways.filter((w): w is Box[] => typeof w !== "string");
    return found.length ? found.reduce((best, w) => (w.length < best.length ? w : best)) : ways[0]!;
  }
  return panelsOf(faces, pass, vertical);
}

function panelsOf(faces: readonly AxisFace[], pass: Pass, vertical: Axis): Box[] | string {
  const grid = ([0, 1, 2] as const).map((a) => levels(faces.filter((f) => f.axis === a).map((f) => f.at)));
  if (grid.some((g) => g.length < 2)) return "ce corps n'est pas fait de faces d'équerre sur ses trois axes.";
  const [nx, ny, nz] = grid.map((g) => g.length - 1) as [number, number, number];
  if (nx * ny * nz > MAX_CELLS) return "ce corps a trop de décrochements pour être lu en panneaux.";
  const mid = (a: Axis, i: number) => (grid[a]![i]! + grid[a]![i + 1]!) / 2;
  const across = faces.filter((f) => f.axis === 0);
  // A cell is in the matter when a ray from its middle along x crosses an odd number of the faces square to x.
  const full = new Uint8Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => (i * ny + j) * nz + k;
  for (let i = 0; i < nx; i++) {
    const x = mid(0, i);
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const p: P2 = [mid(1, j), mid(2, k)];
        let count = 0;
        for (const f of across) if (f.at > x && insideEdges(p, f.edges)) count++;
        full[at(i, j, k)] = count % 2;
      }
    }
  }
  const size = (a: Axis, lo: number, hi: number) => grid[a]![hi + 1]! - grid[a]![lo]!;
  const free = (lo: number[], hi: number[]) => {
    for (let i = lo[0]!; i <= hi[0]!; i++) for (let j = lo[1]!; j <= hi[1]!; j++) for (let k = lo[2]!; k <= hi[2]!; k++) if (!full[at(i, j, k)]) return false;
    return true;
  };
  const counts = [nx, ny, nz];
  const ORDERS: Axis[][] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  /** The largest box of cells grown from a seed, along the axes in this order. */
  const grow = (seed: number[], order: Axis[]) => {
    const lo = [...seed];
    const hi = [...seed];
    for (const a of order) {
      for (;;) {
        if (lo[a]! === 0) break;
        const l = [...lo];
        const h = [...hi];
        l[a] = lo[a]! - 1;
        h[a] = lo[a]! - 1;
        if (!free(l, h)) break;
        lo[a] = lo[a]! - 1;
      }
      for (;;) {
        if (hi[a]! === counts[a]! - 1) break;
        const l = [...lo];
        const h = [...hi];
        l[a] = hi[a]! + 1;
        h[a] = hi[a]! + 1;
        if (!free(l, h)) break;
        hi[a] = hi[a]! + 1;
      }
    }
    return { lo, hi };
  };
  // A panel lying (top, bottom, shelf) is thin along the upright; a side, along another axis.
  const score = (lo: number[], hi: number[]) => {
    const sizes = ([0, 1, 2] as const).map((a) => size(a, lo[a]!, hi[a]!));
    const volume = sizes[0]! * sizes[1]! * sizes[2]!;
    const thin = sizes.indexOf(Math.min(...sizes));
    const lying = thin === vertical;
    return pass === "largest" ? volume : volume * ((pass === "boards") === lying ? 16 : 1);
  };
  const boxes: Box[] = [];
  for (;;) {
    let best: { lo: number[]; hi: number[]; score: number } | null = null;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          if (!full[at(i, j, k)]) continue;
          for (const order of ORDERS) {
            const { lo, hi } = grow([i, j, k], order);
            const s = score(lo, hi);
            if (!best || s > best.score + EPS) best = { lo, hi, score: s };
          }
        }
      }
    }
    if (!best) break;
    for (let i = best.lo[0]!; i <= best.hi[0]!; i++) for (let j = best.lo[1]!; j <= best.hi[1]!; j++) for (let k = best.lo[2]!; k <= best.hi[2]!; k++) full[at(i, j, k)] = 0;
    boxes.push([
      [grid[0]![best.lo[0]!]!, grid[1]![best.lo[1]!]!, grid[2]![best.lo[2]!]!],
      [grid[0]![best.hi[0]! + 1]!, grid[1]![best.hi[1]! + 1]!, grid[2]![best.hi[2]! + 1]!],
    ]);
  }
  if (boxes.length < 2) return "ce corps est d'un seul panneau.";
  return boxes;
}

/** Whether the boxes are panels (each thin against its next size): a caisson, not a solid block with a step. */
export function arePanels(boxes: readonly Box[], thickest = 100): boolean {
  return boxes.every(([lo, hi]) => {
    const sizes = [0, 1, 2].map((a) => hi[a]! - lo[a]!).sort((a, b) => a - b);
    return sizes[0]! <= thickest && sizes[0]! * 2 <= sizes[1]!;
  });
}
