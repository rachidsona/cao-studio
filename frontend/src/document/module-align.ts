/**
 * Des étagères alignées sur celles d'à côté : un module « Étagères » ou « Chaussures » posé dans une niche prend les
 * hauteurs des étagères de la colonne voisine (à gauche ou à droite, celle qui en a le plus dans sa hauteur) — autant
 * d'étagères, leur dessus à la même hauteur. Règle par défaut de l'outil Module ; « Aligner sur les étagères voisines »
 * la rejoue sur un module posé. Pur : des boîtes de niches, en mm.
 */
import type { NicheBox } from "../sketcher/shelves";
import type { ModuleKind, ModuleSizes } from "./dressing-modules";

/** At most this between two niches side by side (a cloison, a double one). */
const BESIDE = 80;
/** Not a niche lower than this between two shelves. */
const LOWEST = 60;
const EPS = 0.5;

/** The tops of the shelves beside `box` (from the bottom), on the side that has the most of them; [] when none. */
export function shelvesBeside(box: NicheBox, leaves: readonly NicheBox[], thickness: number): number[] {
  const across = (b: NicheBox) => b.y1 > box.y0 + EPS && b.y0 < box.y1 - EPS;
  const sides = [(b: NicheBox) => b.x1 <= box.x0 + EPS && box.x0 - b.x1 < BESIDE, (b: NicheBox) => b.x0 >= box.x1 - EPS && b.x0 - box.x1 < BESIDE];
  const levels = sides.map((side) => {
    // The bottom of a niche over a shelf is the top of that shelf.
    const tops = [...new Set(leaves.filter((b) => side(b) && across(b)).map((b) => Math.round(b.y0 * 10) / 10))].sort((a, b) => a - b);
    const kept: number[] = [];
    for (const top of tops) {
      const below = kept.length ? kept[kept.length - 1]! : box.y0;
      if (top - thickness - below >= LOWEST && box.y1 - top >= LOWEST) kept.push(top);
    }
    return kept;
  });
  return levels[0]!.length >= levels[1]!.length ? levels[0]! : levels[1]!;
}

/** The sizes of a module of shelves in `box` with its shelves level with those beside it; null: none to follow. */
export function alignedSizes(kind: ModuleKind, sizes: ModuleSizes, box: NicheBox, leaves: readonly NicheBox[], thickness: number): ModuleSizes | null {
  if (kind !== "shelves" && kind !== "shoes") return null;
  const tops = shelvesBeside(box, leaves, thickness);
  if (!tops.length) return null;
  // Each niche from the bottom up to the next shelf: the last one takes what is left.
  const heights = Object.fromEntries(tops.map((top, k) => [String(k), Number((top - thickness - (k ? tops[k - 1]! : box.y0)).toFixed(3))]));
  return { ...sizes, shelves: tops.length, heights };
}
