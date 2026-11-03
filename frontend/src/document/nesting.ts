/**
 * Sheet layout (optimisation de découpe): the parts of the cut list placed
 * on standard sheets of their material and thickness, in strips (the way a
 * panel saw cuts: across, then along), the longest parts first. The saw kerf
 * is left between parts and a trimming margin around the sheet. A part with a
 * grain keeps it along the sheet's length (or across, for a grain in its
 * width); a part without grain may be turned to fit better. Offcuts of the
 * workshop's stock (same material and thickness) are filled first, before
 * any new sheet; what is left of each sheet big enough to keep is given back.
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
}

/** The layout of all the cut list's parts; parts larger than their sheet are returned apart. */
export function layoutSheets(rows: CutRow[], options: LayoutOptions = { kerf: 4, margin: 10 }, stock: readonly StockPiece[] = []): { sheets: Sheet[]; tooBig: string[] } {
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
      group.pieces.push({ name: r.names[i] ?? r.names[0] ?? "", ...(r.tag ? { tag: r.tag } : {}), w, h, canTurn: r.grain === "none" });
    }
    groups.set(key, group);
  }
  const sheets: Sheet[] = [];
  const tooBig: string[] = [];
  type Board = { strips: { y: number; h: number; x: number }[]; used: number; placements: Placement[]; size: [number, number]; W: number; H: number; offcut?: number };
  for (const { material, thickness, pieces } of groups.values()) {
    const size = MATERIALS.find((m) => m.name === material)?.sheet ?? [2800, 2070];
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
          sheet.placements.push({ name: p.name, ...(p.tag ? { tag: p.tag } : {}), x: margin(sheet) + best.strip.x, y: margin(sheet) + best.strip.y, w: best.w, h: best.h, rotated: best.turned });
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
          sheet.placements.push({ name: p.name, ...(p.tag ? { tag: p.tag } : {}), x: margin(sheet), y: margin(sheet) + top, w, h, rotated: turned });
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
        board.placements.push({ name: p.name, ...(p.tag ? { tag: p.tag } : {}), x: options.margin, y: options.margin, w, h, rotated: turned });
        board.used = w * h;
        own.push(board);
      }
    }
    for (const b of own) {
      if (!b.placements.length) continue;
      sheets.push({ material, thickness, size: b.size, placements: b.placements, usage: b.used / (b.size[0] * b.size[1]), ...(b.offcut !== undefined ? { offcut: b.offcut } : {}), leftovers: leftovers(b, margin(b), options.kerf) });
    }
  }
  return { sheets, tooBig };
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
