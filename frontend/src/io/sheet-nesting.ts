/**
 * L'imbrication des pièces mises à plat sur les panneaux de leur matière, pour une CNC à plat (nesting) : chaque pièce
 * par son contour réel — arrondis, encoches, découpes —, pas par sa boîte. Bas-gauche d'abord, la plus grande pièce
 * d'abord, quatre sens (deux quand le fil compte), l'écart de la fraise entre deux pièces et une marge au bord du
 * panneau. Pur : des pièces et des placements ; le DXF d'un panneau en est tiré par `placedPart`.
 */
import type { FlatEdge, FlatPart } from "./dxf";

type P2 = [number, number];
type Seg = [P2, P2];

export interface NestOptions {
  /** The sheet (mm): its length along x, its width along y. */
  sheet: [number, number];
  /** Between two parts: the cutter's diameter and a little more. */
  gap: number;
  /** Kept free all round the sheet. */
  margin: number;
  /** The grain counts: only half turns (the part keeps its way along the sheet). */
  grain?: boolean;
}

export interface Placement {
  part: number;
  sheet: number;
  /** Where the part's lower left corner (of its box, turned) lies on the sheet. */
  x: number;
  y: number;
  turn: 0 | 90 | 180 | 270;
}

const ARC_STEPS = 12;

/** The part's cutting outline as segments: its contour and through cut-outs, not its holes nor its pockets. */
function outline(part: FlatPart): Seg[] {
  const hole = (e: FlatEdge) => e.kind === "circle" && part.edges.length > 1;
  const segs: Seg[] = [];
  for (const e of part.edges) {
    if (hole(e) || e.depth !== undefined) continue;
    if (e.kind === "line") segs.push([e.a, e.b]);
    else {
      const [a0, a1] = e.kind === "circle" ? [0, 2 * Math.PI] : [e.start, e.end <= e.start ? e.end + 2 * Math.PI : e.end];
      const at = (t: number): P2 => [e.center[0] + e.radius * Math.cos(t), e.center[1] + e.radius * Math.sin(t)];
      for (let k = 0; k < ARC_STEPS; k++) segs.push([at(a0 + ((a1 - a0) * k) / ARC_STEPS), at(a0 + ((a1 - a0) * (k + 1)) / ARC_STEPS)]);
    }
  }
  return segs;
}

const turnPoint = ([x, y]: P2, turn: number): P2 => (turn === 90 ? [-y, x] : turn === 180 ? [-x, -y] : turn === 270 ? [y, -x] : [x, y]);

function box(segs: Seg[]): [P2, P2] {
  const xs = segs.flatMap(([a, b]) => [a[0], b[0]]);
  const ys = segs.flatMap(([a, b]) => [a[1], b[1]]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

/** The outline turned, then moved so that its box starts at (x, y). */
function placed(segs: Seg[], turn: number, x: number, y: number): Seg[] {
  const turned = segs.map(([a, b]): Seg => [turnPoint(a, turn), turnPoint(b, turn)]);
  const [lo] = box(turned);
  return turned.map(([a, b]): Seg => [[a[0] - lo[0] + x, a[1] - lo[1] + y], [b[0] - lo[0] + x, b[1] - lo[1] + y]]);
}

function segDistance([a, b]: Seg, [c, d]: Seg): number {
  const cross = (o: P2, p: P2, q: P2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const s1 = cross(a, b, c);
  const s2 = cross(a, b, d);
  const s3 = cross(c, d, a);
  const s4 = cross(c, d, b);
  if (s1 * s2 < 0 && s3 * s4 < 0) return 0;
  const toSeg = (p: P2, [u, v]: Seg) => {
    const [dx, dy] = [v[0] - u[0], v[1] - u[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(u[0] + dx * t - p[0], u[1] + dy * t - p[1]);
  };
  return Math.min(toSeg(a, [c, d]), toSeg(b, [c, d]), toSeg(c, [a, b]), toSeg(d, [a, b]));
}

/** Inside the outline: a ray from the point crosses it an odd number of times. */
function inside(p: P2, segs: Seg[]): boolean {
  let odd = false;
  for (const [[xi, yi], [xj, yj]] of segs) if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) odd = !odd;
  return odd;
}

/** Two placed outlines closer than `gap`, or one in the other. */
function clash(a: { segs: Seg[]; box: [P2, P2] }, b: { segs: Seg[]; box: [P2, P2] }, gap: number): boolean {
  if (a.box[1][0] + gap <= b.box[0][0] || b.box[1][0] + gap <= a.box[0][0] || a.box[1][1] + gap <= b.box[0][1] || b.box[1][1] + gap <= a.box[0][1]) return false;
  for (const s of a.segs) for (const t of b.segs) if (segDistance(s, t) < gap - 1e-6) return true;
  return inside(a.segs[0]![0], b.segs) || inside(b.segs[0]![0], a.segs);
}

/** The parts nested on as few sheets as it can; a part larger than the sheet is in `tooLarge`. */
export function nestParts(parts: readonly FlatPart[], o: NestOptions): { placements: Placement[]; sheets: number; tooLarge: number[] } {
  const outlines = parts.map(outline);
  const order = parts.map((_, i) => i).filter((i) => outlines[i]!.length).sort((i, j) => parts[j]!.width * parts[j]!.height - parts[i]!.width * parts[i]!.height);
  const turns: Placement["turn"][] = o.grain ? [0, 180] : [0, 90, 180, 270];
  const [L, W] = o.sheet;
  const sheets: { segs: Seg[]; box: [P2, P2] }[][] = [];
  const placements: Placement[] = [];
  const tooLarge: number[] = [];
  for (const i of order) {
    let done = false;
    for (let s = 0; s <= sheets.length && !done; s++) {
      const on = sheets[s] ?? [];
      // Bottom left: the sheet's corner, then beside and above each part already there.
      const spots: P2[] = [[o.margin, o.margin], ...on.flatMap(({ box: [lo, hi] }): P2[] => [[hi[0] + o.gap, lo[1]], [lo[0], hi[1] + o.gap], [hi[0] + o.gap, o.margin], [o.margin, hi[1] + o.gap]])];
      spots.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
      for (const [x, y] of spots) {
        // Every way round that fits there, slid down and left as far as its outline lets it (it nests into the room
        // the others leave); the lowest, then the leftmost, is kept.
        let best: Placement | null = null;
        for (const turn of turns) {
          const segs = placed(outlines[i]!, turn, x, y);
          const b = box(segs);
          if (b[1][0] > L - o.margin + 1e-6 || b[1][1] > W - o.margin + 1e-6 || on.some((other) => clash({ segs, box: b }, other, o.gap))) continue;
          let [px, py] = [x, y];
          const free = (nx: number, ny: number) => {
            const moved = placed(outlines[i]!, turn, nx, ny);
            return nx >= o.margin - 1e-6 && ny >= o.margin - 1e-6 && !on.some((other) => clash({ segs: moved, box: box(moved) }, other, o.gap));
          };
          for (let pass = 0; pass < 3; pass++) {
            for (let step = 512; step >= 1; step /= 2) while (free(px, py - step)) py -= step;
            for (let step = 512; step >= 1; step /= 2) while (free(px - step, py)) px -= step;
          }
          if (!best || py < best.y - 1e-6 || (Math.abs(py - best.y) < 1e-6 && px < best.x)) best = { part: i, sheet: s, x: px, y: py, turn };
        }
        if (!best) continue;
        const segsAt = placed(outlines[i]!, best.turn, best.x, best.y);
        if (!sheets[s]) sheets[s] = [];
        sheets[s]!.push({ segs: segsAt, box: box(segsAt) });
        placements.push(best);
        done = true;
        break;
      }
      // A new sheet that cannot take it: the part is larger than a sheet.
      if (!done && s === sheets.length) {
        tooLarge.push(i);
        break;
      }
    }
  }
  return { placements, sheets: sheets.length, tooLarge };
}

/** The part as it lies on its sheet: its edges turned and moved to the placement (holes and pockets with it). */
export function placedPart(part: FlatPart, p: Placement): FlatPart {
  const segs = placed(outline(part), p.turn, 0, 0);
  const shift = box(outline(part).map(([a, b]): Seg => [turnPoint(a, p.turn), turnPoint(b, p.turn)]))[0];
  const move = (q: P2): P2 => {
    const t = turnPoint(q, p.turn);
    return [t[0] - shift[0] + p.x, t[1] - shift[1] + p.y];
  };
  const angle = (a: number) => a + (p.turn * Math.PI) / 180;
  const edges = part.edges.map((e): FlatEdge => (e.kind === "line" ? { ...e, a: move(e.a), b: move(e.b) } : e.kind === "circle" ? { ...e, center: move(e.center) } : { ...e, center: move(e.center), start: angle(e.start), end: angle(e.end) }));
  const [lo, hi] = box(segs);
  return { ...part, edges, width: hi[0] - lo[0], height: hi[1] - lo[1] };
}
