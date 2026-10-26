/**
 * Sheet layout (optimisation de découpe): the parts of the cut list placed
 * on standard sheets of their material and thickness, in strips (the way a
 * panel saw cuts: across, then along), the longest parts first. The saw kerf
 * is left between parts and a trimming margin around the sheet. A part with a
 * grain keeps it along the sheet's length (or across, for a grain in its
 * width); a part without grain may be turned to fit better.
 */
import type { CutRow } from "./cut-list";
import { MATERIALS } from "./materials";

export interface Placement {
  name: string;
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
}

export interface LayoutOptions {
  kerf: number;
  margin: number;
}

interface Piece {
  name: string;
  w: number;
  h: number;
  canTurn: boolean;
}

/** The layout of all the cut list's parts; parts larger than their sheet are returned apart. */
export function layoutSheets(rows: CutRow[], options: LayoutOptions = { kerf: 4, margin: 10 }): { sheets: Sheet[]; tooBig: string[] } {
  const groups = new Map<string, { material: string; thickness: number; pieces: Piece[] }>();
  for (const r of rows) {
    const key = `${r.material}|${r.thickness}`;
    const group = groups.get(key) ?? { material: r.material, thickness: r.thickness, pieces: [] };
    for (let i = 0; i < r.quantity; i++) {
      // The sheet's length runs along X: a grain in the part's length keeps its length along X.
      const [w, h] = r.grain === "width" ? [r.cutWidth, r.cutLength] : [r.cutLength, r.cutWidth];
      group.pieces.push({ name: r.names[i] ?? r.names[0] ?? "", w, h, canTurn: r.grain === "none" });
    }
    groups.set(key, group);
  }
  const sheets: Sheet[] = [];
  const tooBig: string[] = [];
  for (const { material, thickness, pieces } of groups.values()) {
    const size = MATERIALS.find((m) => m.name === material)?.sheet ?? [2800, 2070];
    const [W, H] = [size[0] - 2 * options.margin, size[1] - 2 * options.margin];
    const own: { strips: { y: number; h: number; x: number }[]; used: number; placements: Placement[] }[] = [];
    pieces.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
    for (const p of pieces) {
      const orientations = p.canTurn ? [[p.w, p.h, false], [p.h, p.w, true]] : [[p.w, p.h, false]];
      if (!orientations.some(([w, h]) => (w as number) <= W && (h as number) <= H)) {
        tooBig.push(p.name);
        continue;
      }
      let placed = false;
      // An existing strip first (the lowest waste in height), then a new strip, then a new sheet.
      for (const sheet of own) {
        let best: { strip: (typeof sheet.strips)[number]; w: number; h: number; turned: boolean; waste: number } | null = null;
        for (const strip of sheet.strips) {
          for (const [w, h, turned] of orientations as [number, number, boolean][]) {
            if (strip.x + w <= W && h <= strip.h && (!best || strip.h - h < best.waste)) best = { strip, w, h, turned, waste: strip.h - h };
          }
        }
        if (best) {
          sheet.placements.push({ name: p.name, x: options.margin + best.strip.x, y: options.margin + best.strip.y, w: best.w, h: best.h, rotated: best.turned });
          best.strip.x += best.w + options.kerf;
          sheet.used += best.w * best.h;
          placed = true;
          break;
        }
        const top = sheet.strips.reduce((y, s) => Math.max(y, s.y + s.h + options.kerf), 0);
        const fit = (orientations as [number, number, boolean][]).filter(([w, h]) => w <= W && top + h <= H).sort((a, b) => a[1] - b[1])[0];
        if (fit) {
          const [w, h, turned] = fit;
          sheet.strips.push({ y: top, h, x: w + options.kerf });
          sheet.placements.push({ name: p.name, x: options.margin, y: options.margin + top, w, h, rotated: turned });
          sheet.used += w * h;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const [w, h, turned] = (orientations as [number, number, boolean][]).filter(([ow, oh]) => ow <= W && oh <= H).sort((a, b) => a[1] - b[1])[0]!;
        own.push({ strips: [{ y: 0, h, x: w + options.kerf }], used: w * h, placements: [{ name: p.name, x: options.margin, y: options.margin, w, h, rotated: turned }] });
      }
    }
    for (const sheet of own) sheets.push({ material, thickness, size, placements: sheet.placements, usage: sheet.used / (size[0] * size[1]) });
  }
  return { sheets, tooBig };
}
