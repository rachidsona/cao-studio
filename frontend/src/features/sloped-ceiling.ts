/**
 * Un plafond en pente dans le noyau : ce qu'un dressing garde sous un rampant, en biais jusqu'à sa hauteur haute puis à
 * plat, ou la seule tranche qui fait son dessus. La pente suit X ou Y : l'outil est son profil, tiré en travers.
 */
import { draw, type Shape3D } from "replicad";
import type { SlopedCeiling } from "../document/types";
import { GeometryError, solidCount } from "../geometry/kernel";

/** Further than any dressing (mm). */
const REACH = 40000;
/** Under any slope, however steep. */
const FLOOR = -1e6;

type Point = [number, number];

/** The ceiling seen from the side, `down` mm lower: from its low side to where it flattens, then flat. */
function surface(c: SlopedCeiling, down: number): Point[] {
  const high = c.rise > 0 ? REACH : -REACH;
  const flat = c.at + (c.cap - c.height) / c.rise;
  return [[-high, c.height + c.rise * (-high - c.at) - down], [flat, c.cap - down], [high, c.cap - down]];
}

function toolOf(c: SlopedCeiling): Shape3D {
  const top = surface(c, 0);
  const outline = c.slab ? [...top, ...surface(c, c.slab).reverse()] : [...top, [top[2]![0], FLOOR] as Point, [top[0]![0], FLOOR] as Point];
  const [first, ...rest] = outline as [Point, ...Point[]];
  return rest.reduce((pen, p) => pen.lineTo(p), draw(first)).close().sketchOnPlane(c.axis === "x" ? "XZ" : "YZ", -REACH).extrude(2 * REACH) as Shape3D;
}

/** What of this solid is under the ceiling; takes ownership of `solid`. */
export function underCeiling(solid: Shape3D, ceiling: SlopedCeiling, name: string): Shape3D {
  const tool = toolOf(ceiling);
  try {
    const kept = solid.intersect(tool);
    if (solidCount(kept) > 0) return kept;
    kept.delete();
    throw new GeometryError(`${name} : cette pièce est entièrement au-dessus du rampant ; descendez-la ou retirez-la.`);
  } finally {
    solid.delete();
    tool.delete();
  }
}
