/** Un module d'étagères aligné sur les étagères de la colonne voisine : autant d'étagères, leur dessus à la même hauteur. */
import { describe, expect, it } from "vitest";
import { moduleLayout, moduleSizes } from "../../frontend/src/document/dressing-modules";
import { alignedSizes, shelvesBeside } from "../../frontend/src/document/module-align";
import type { NicheBox } from "../../frontend/src/sketcher/shelves";

const niche = (x0: number, y0: number, x1: number, y1: number): NicheBox => ({ x0, y0, x1, y1 });
// The niche of the module: x 18..723, y 100..2400; on its right (past an 18 mm cloison), a column with shelves.
const box = niche(18, 100, 723, 2400);
const right = [niche(741, 100, 1446, 500), niche(741, 518, 1446, 900), niche(741, 918, 1446, 1500), niche(741, 1518, 1446, 2400)];

describe("étagères alignées sur la colonne voisine", () => {
  it("les dessus des étagères d'à côté, dans la hauteur de la niche", () => {
    expect(shelvesBeside(box, right, 18)).toEqual([518, 918, 1518]);
    // Too far (another column beyond), or not across its height: none.
    expect(shelvesBeside(box, right.map((b) => ({ ...b, x0: b.x0 + 200, x1: b.x1 + 200 })), 18)).toEqual([]);
    expect(shelvesBeside(niche(18, 2500, 723, 2900), right, 18)).toEqual([]);
  });

  it("le module en prend autant, leur dessus à la même hauteur", () => {
    const sizes = alignedSizes("shelves", moduleSizes("shelves"), box, right, 18)!;
    expect(sizes.shelves).toBe(3);
    const layout = moduleLayout(box, [0], "shelves", 18, sizes);
    if (typeof layout === "string") throw new Error(layout);
    expect(layout.shelves.map((s) => s.y1)).toEqual([518, 918, 1518]);
    // A penderie, or nothing beside: no alignment.
    expect(alignedSizes("long", moduleSizes("long"), box, right, 18)).toBeNull();
    expect(alignedSizes("shelves", moduleSizes("shelves"), box, [], 18)).toBeNull();
  });
});
