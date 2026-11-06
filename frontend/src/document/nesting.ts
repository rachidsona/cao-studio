/**
 * Sheet layout (optimisation de découpe): the parts of the cut list placed
 * on standard sheets of their material and thickness, in strips (the way a
 * panel saw cuts: across, then along), the longest parts first. The saw kerf
 * is left between parts and a trimming margin around the sheet. A part with a
 * grain keeps it along the sheet's length (or across, for a grain in its
 * width); a part without grain may be turned to fit better. Offcuts of the
 * workshop's stock (same material and thickness) are filled first, before
 * any new sheet; what is left of each sheet big enough to keep is given back. The fronts of a run (BodyInfo.grainRun) go
 * side by side across the grain, cut from the same strip of board, so that the grain goes on from one to the next.
 */
import type { CutRow } from "./cut-list";
import { barLength } from "./bars";
import { MATERIALS } from "./materials";

export interface Placement {
  name: string;
  /** Mark of the part in the cut list (A, B…). */
  tag?: string;
  x: number;
  y: number;
  /** Size on the sheet (after turning). */
  w: number;
  h: number;
  rotated: boolean;
}

export interface Sheet {
  material: string;
  thickness: number;
  size: [number, number];
  placements: Placement[];
  /** Share of the sheet used by parts (0..1). */
  usage: number;
  /** An offcut of the stock (its id), not a new sheet. */
  offcut?: number;
  /** What is left that is worth keeping: x, y, length, width (mm). */
  leftovers: [number, number, number, number][];
  /** The runs of fronts laid together so that their grain goes on: x, y, length, width (mm). */
  runs?: [number, number, number, number][];
}

/** An offcut of the workshop's stock (apps/projects/production.py). */
export interface StockPiece {
  id: number;
  material: string;
  thickness: number;
  length: number;
  width: number;
  quantity: number;
}

/** Smallest leftover worth keeping (mm). */
export const KEEP: [number, number] = [300, 150];

export interface LayoutOptions {
  kerf: number;
  margin: number;
}

interface Piece {
  name: string;
  tag?: string;
  w: number;
  h: number;
  canTurn: boolean;
  /** A run of fronts: the parts cut side by side, across the grain, in their order. */
  members?: Piece[];
  run?: { id: string; at: number };
}

/** The fronts of each run as one block, side by side across the grain; a block too large for its sheet stays in parts. */
function withRuns(pieces: Piece[], size: [number, number], options: LayoutOptions): { pieces: Piece[]; broken: string[] } {
  const runs = new Map<string, Piece[]>();
  for (const p of pieces) if (p.run) runs.set(p.run.id, [...(runs.get(p.run.id) ?? []), p]);
  const broken: string[] = [];
  const blocks: Piece[] = [];
  const taken = new Set<Piece>();
  for (const members of runs.values()) {
    if (members.length < 2) continue;
    const ordered = [...members].sort((a, b) => (a.run?.at ?? 0) - (b.run?.at ?? 0));
    const [w, h] = [Math.max(...ordered.map((m) => m.w)), ordered.reduce((sum, m) => sum + m.h, 0) + (ordered.length - 1) * options.kerf];
    if (w > size[0] - 2 * options.margin || h > size[1] - 2 * options.margin) {
      broken.push(ordered.map((m) => m.name).join(", "));
      continue;
    }
    ordered.forEach((m) => taken.add(m));
    blocks.push({ name: ordered[0]?.name ?? "", w, h, canTurn: false, members: ordered });
  }
  return { pieces: [...pieces.filter((p) => !taken.has(p)), ...blocks], broken };
}

/** The layout of all the cut list's parts; parts larger than their sheet are returned apart. */
export function layoutSheets(rows: CutRow[], options: LayoutOptions = { kerf: 4, margin: 10 }, stock: readonly StockPiece[] = []): { sheets: Sheet[]; tooBig: string[]; brokenRuns: string[] } {
  const groups = new Map<string, { material: string; thickness: number; pieces: Piece[] }>();
  for (const r of rows) {
    // Battens are cut from bars (document/bars.ts), not from sheets.
    if (barLength(r.material) !== null) continue;
    const key = `${r.material}|${r.thickness}`;
    const group = groups.get(key) ?? { material: r.material, thickness: r.thickness, pieces: [] };
    for (let i = 0; i < r.quantity; i++) {
      // Solid wood is sawn oversize, then planed to the cutting size.
      const [l, wd] = [r.roughLength ?? r.cutLength, r.roughWidth ?? r.cutWidth];
      // The sheet's length runs along X: a grain in the part's length keeps its length along X.
      const [w, h] = r.grain === "width" ? [wd, l] : [l, wd];
      const run = r.grain === "none" ? null : r.runs?.[i];
      group.pieces.push({ name: r.names[i] ?? r.names[0] ?? "", ...(r.tag ? { tag: r.tag } : {}), w, h, canTurn: r.grain === "none", ...(run ? { run } : {}) });
    }
    groups.set(key, group);
  }
  const sheets: Sheet[] = [];
  const tooBig: string[] = [];
  const brokenRuns: string[] = [];
  type Board = { strips: { y: number; h: number; x: number }[]; used: number; placements: Placement[]; runs?: [number, number, number, number][]; size: [number, number]; W: number; H: number; offcut?: number };
  /** A piece down on a board; the fronts of a run one against the other, from its corner. */
  const lay = (board: Board, p: Piece, x: number, y: number, w: number, h: number, rotated: boolean) => {
    if (!p.members) return void board.placements.push({ name: p.name, ...(p.tag ? { tag: p.tag } : {}), x, y, w, h, rotated });
    let at = y;
    for (const m of p.members) {
      board.placements.push({ name: m.name, ...(m.tag ? { tag: m.tag } : {}), x, y: at, w: m.w, h: m.h, rotated: false });
      at += m.h + options.kerf;
    }
    board.runs = [...(board.runs ?? []), [x, y, w, h]];
  };
  for (const { material, thickness, pieces: parts } of groups.values()) {
    const size = MATERIALS.find((m) => m.name === material)?.sheet ?? [2800, 2070];
    const { pieces, broken } = withRuns(parts, size, options);
    brokenRuns.push(...broken);
    const fresh = (): Board => ({ strips: [], used: 0, placements: [], size, W: size[0] - 2 * options.margin, H: size[1] - 2 * options.margin });
    // The offcuts first, the biggest first; they were trimmed already (no margin).
    const own: Board[] = stock
      .filter((o) => o.material === material && Math.abs(o.thickness - thickness) < 0.05)
      .flatMap((o) => Array.from({ length: o.quantity }, (): Board => ({ strips: [], used: 0, placements: [], size: [o.length, o.width], W: o.length, H: o.width, offcut: o.id })))
      .sort((a, b) => b.W * b.H - a.W * a.H);
    const offcuts = own.length;
    const margin = (b: Board) => (b.offcut === undefined ? options.margin : 0);
    pieces.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
    for (const p of pieces) {
      const orientations = (p.canTurn ? [[p.w, p.h, false], [p.h, p.w, true]] : [[p.w, p.h, false]]) as [number, number, boolean][];
      const sheetFits = ([w, h]: [number, number, boolean]) => w <= size[0] - 2 * options.margin && h <= size[1] - 2 * options.margin;
      if (!orientations.some(sheetFits) && !own.slice(0, offcuts).some((b) => orientations.some(([w, h]) => w <= b.W && h <= b.H))) {
        tooBig.push(p.name);
        continue;
      }
      let placed = false;
      // An existing strip first (the lowest waste in height), then a new strip, then a new sheet.
      for (const sheet of own) {
        let best: { strip: (typeof sheet.strips)[number]; w: number; h: number; turned: boolean; waste: number } | null = null;
        for (const strip of sheet.strips) {
          for (const [w, h, turned] of orientations) {
            if (strip.x + w <= sheet.W && h <= strip.h && (!best || strip.h - h < best.waste)) best = { strip, w, h, turned, waste: strip.h - h };
          }
        }
        if (best) {
          lay(sheet, p, margin(sheet) + best.strip.x, margin(sheet) + best.strip.y, best.w, best.h, best.turned);
          best.strip.x += best.w + options.kerf;
          sheet.used += best.w * best.h;
          placed = true;
          break;
        }
        const top = sheet.strips.reduce((y, s) => Math.max(y, s.y + s.h + options.kerf), 0);
        const fit = orientations.filter(([w, h]) => w <= sheet.W && top + h <= sheet.H).sort((a, b) => a[1] - b[1])[0];
        if (fit) {
          const [w, h, turned] = fit;
          sheet.strips.push({ y: top, h, x: w + options.kerf });
          lay(sheet, p, margin(sheet), margin(sheet) + top, w, h, turned);
          sheet.used += w * h;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const first = orientations.filter(sheetFits).sort((a, b) => a[1] - b[1])[0];
        // Bigger than a sheet, and the offcut it would fit is taken.
        if (!first) {
          tooBig.push(p.name);
          continue;
        }
        const board = fresh();
        const [w, h, turned] = first;
        board.strips.push({ y: 0, h, x: w + options.kerf });
        lay(board, p, options.margin, options.margin, w, h, turned);
        board.used = w * h;
        own.push(board);
      }
    }
    for (const b of own) {
      if (!b.placements.length) continue;
      sheets.push({ material, thickness, size: b.size, placements: b.placements, usage: b.used / (b.size[0] * b.size[1]), ...(b.offcut !== undefined ? { offcut: b.offcut } : {}), ...(b.runs ? { runs: b.runs } : {}), leftovers: leftovers(b, margin(b), options.kerf) });
    }
  }
  return { sheets, tooBig, brokenRuns };
}

/** The pieces left on a board after its strips (the end of each strip, the band above the last), big enough to keep. */
function leftovers(b: { strips: { y: number; h: number; x: number }[]; W: number; H: number }, margin: number, kerf: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const keep = (x: number, y: number, w: number, h: number) => {
    const [l, wd] = w >= h ? [w, h] : [h, w];
    if (l >= KEEP[0] && wd >= KEEP[1]) out.push([margin + x, margin + y, Math.floor(w), Math.floor(h)]);
  };
  for (const s of b.strips) keep(s.x, s.y, b.W - s.x, s.h);
  const top = b.strips.reduce((y, s) => Math.max(y, s.y + s.h + kerf), 0);
  keep(0, top, b.W, b.H - top);
  return out;
}
