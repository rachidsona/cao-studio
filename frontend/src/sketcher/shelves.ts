/**
 * « Étagères » of the sketch (as Polyboard's division of a compartment): a niche — a closed rectangular area of the
 * sketch, a case of a « Répartition » — is divided by shelves drawn with their thickness (two lines each). The space
 * between the bottom and a shelf, between two shelves, or between a shelf and the top is a niche in its turn, which
 * can be divided again. The niches are equal, or the bottom one (or the top one) has a given height and the others
 * share what is left. « Cloisons » are the same division across: upright panels from the bottom to the top of the
 * niche, which divide it from left to right. Pure: lengths in mm, in the sketch's own coordinates.
 */
import type { SketchGeometry, ShelfMode, ShelfParams } from "../document/sketch";
import { addLine, type Vec2 } from "./edit";
import type { Region } from "./loops";

export interface NicheBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type { ShelfMode };
export type ShelfInput = ShelfParams;

export interface ShelfLayout {
  /** The niches from bottom to top, as [y0, y1] (cloisons: from left to right, as [x0, x1]). */
  niches: [number, number][];
  /** The shelves from bottom to top, as [y0, y1] (cloisons: from left to right, as [x0, x1]). */
  shelves: [number, number][];
  /** Cloisons: the intervals are along x. */
  vertical?: true;
}

/** « étagère » or « cloison », for the messages. */
export const pieceWord = (vertical: boolean | undefined) => (vertical ? "cloison" : "étagère");

export const MAX_SHELVES = 20;

const TOLERANCE = 1e-6;
const round = (v: number) => Number(v.toFixed(6));

/** The rectangle of an area when it is one (straight sides along the axes, no hole), else null. */
export function nicheBox(region: Pick<Region, "outer" | "holes">): NicheBox | null {
  if (region.holes.length > 0 || region.outer.length < 4) return null;
  const xs = region.outer.map((p) => p[0]);
  const ys = region.outer.map((p) => p[1]);
  const box: NicheBox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  if (box.x1 - box.x0 < TOLERANCE || box.y1 - box.y0 < TOLERANCE) return null;
  const onEdge = (p: Vec2) => [box.x0, box.x1].some((x) => Math.abs(p[0] - x) < TOLERANCE) || [box.y0, box.y1].some((y) => Math.abs(p[1] - y) < TOLERANCE);
  // Every corner lies on the box; the rectangle is filled by the area (no L, no notch).
  if (!region.outer.every(onEdge)) return null;
  let area = 0;
  region.outer.forEach((a, i) => {
    const b = region.outer[(i + 1) % region.outer.length] as Vec2;
    area += a[0] * b[1] - b[0] * a[1];
  });
  const boxArea = (box.x1 - box.x0) * (box.y1 - box.y0);
  return Math.abs(Math.abs(area) / 2 - boxArea) <= boxArea * 1e-6 ? box : null;
}

/** The niches and shelves, or the reason it is impossible. */
export function shelfLayout(box: NicheBox, input: ShelfInput): ShelfLayout | string {
  const { count, thickness: t, mode, fixed, vertical } = input;
  const word = pieceWord(vertical);
  if (!Number.isInteger(count) || count < 1 || count > MAX_SHELVES) return `Le nombre de ${word}s va de 1 à ${MAX_SHELVES}.`;
  if (!(Number.isFinite(t) && t > 0)) return `Donnez une épaisseur de ${word} positive.`;
  // Cloisons divide along x what shelves divide along y.
  const [start, end] = vertical ? [box.x0, box.x1] : [box.y0, box.y1];
  const free = end - start - count * t;
  if (free <= TOLERANCE) return `Les ${word}s prennent toute la ${vertical ? "largeur" : "hauteur"} de la niche : il n'y a plus de place pour les niches.`;
  let heights: number[];
  if (mode === "equal") heights = Array.from({ length: count + 1 }, () => free / (count + 1));
  else {
    if (!(Number.isFinite(fixed) && fixed > 0)) return "Donnez la hauteur de la niche fixe.";
    const rest = (free - fixed) / count;
    if (rest <= TOLERANCE) return "La niche fixe ne laisse pas de place aux autres niches.";
    heights = mode === "bottom" ? [fixed, ...Array.from({ length: count }, () => rest)] : [...Array.from({ length: count }, () => rest), fixed];
  }
  const niches: [number, number][] = [];
  const shelves: [number, number][] = [];
  let y = start;
  heights.forEach((h, i) => {
    niches.push([round(y), round(y + h)]);
    y += h;
    if (i < count) {
      shelves.push([round(y), round(y + t)]);
      y += t;
    }
  });
  return vertical ? { niches, shelves, vertical: true } : { niches, shelves };
}

/** The box of an interval of a layout (a niche or a shelf) inside the niche divided. */
export function partBox(box: NicheBox, [a, b]: [number, number], layout: Pick<ShelfLayout, "vertical">): NicheBox {
  return layout.vertical ? { x0: a, x1: b, y0: box.y0, y1: box.y1 } : { x0: box.x0, x1: box.x1, y0: a, y1: b };
}

/** The lines of the shelves: the bottom and the top edge of each, side to side of the niche (cloisons: their left and right edges, bottom to top). */
export function shelfLines(box: NicheBox, layout: ShelfLayout): [Vec2, Vec2][] {
  if (layout.vertical)
    return layout.shelves.flatMap(([a, b]): [Vec2, Vec2][] => [
      [[a, box.y0], [a, box.y1]],
      [[b, box.y0], [b, box.y1]],
    ]);
  return layout.shelves.flatMap(([a, b]): [Vec2, Vec2][] => [
    [[box.x0, a], [box.x1, a]],
    [[box.x0, b], [box.x1, b]],
  ]);
}

/** The sketch with the shelves drawn in the niche; its sides are cut where the shelves meet them. */
export function addShelves(base: SketchGeometry, box: NicheBox, layout: ShelfLayout): SketchGeometry {
  let g = base;
  for (const [from, to] of shelfLines(box, layout)) g = addLine(g, { at: from }, { at: to }, { autoAlign: false }).geometry;
  return g;
}
