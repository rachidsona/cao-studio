/** Les cotes d'un meuble du linéaire, sur mesure : largeur libre, hauteur d'un haut ou d'une colonne, profondeur. */
import { describe, expect, it } from "vitest";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN, kitchenSizes } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { itemEntry, itemSize, newItem, sizeLimits } from "../../frontend/src/features/kitchen-run-items";

const plan = (runs: KitchenFloorPlan["runs"]): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs });
const item = (model: string, width: number, patch: Partial<KitchenRunItem> = {}): KitchenRunItem => ({ ...newItem([], model, width), ...patch });

describe("cotes sur mesure d'un meuble du linéaire", () => {
  it("sans cote à lui, un meuble a celles de son modèle et du plan", () => {
    const p = plan({});
    const s = kitchenSizes(p);
    const base = item("base-bas-1-porte", 600);
    expect(itemSize(p, base)).toEqual({ height: s.base, depth: s.cabinet, z: 0 });
    expect(itemSize(p, item("wall-haut-1-porte", 600))).toEqual({ height: s.wallTop - s.wallBottom, depth: p.wallDepth, z: s.wallBottom });
    expect(itemSize(p, item("tall-colonne-rangement", 600)).height).toBe(s.wallTop);
    // A base unit's height is the worktop's: not to be set.
    expect(sizeLimits(p, itemEntry(base)).height).toBeNull();
    expect(sizeLimits(p, itemEntry(base)).depth[1]).toBe(s.cabinet);
  });

  it("ses cotes à lui passent dans la cuisine 3D : largeur libre, profondeur, hauteur d'un haut posé sous le même dessus", () => {
    const base = item("base-bas-1-porte", 643, { depth: 400 });
    const wall = item("wall-haut-1-porte", 600, { height: 900, depth: 300 });
    const tall = item("tall-colonne-rangement", 600, { height: 2000 });
    const p = plan({ A: [base, wall, tall] });
    const s = kitchenSizes(p);
    const units = kitchenFromPlan(p).units;
    const of = (id: string) => units.find((u) => u.item === id)!;
    expect([of(base.id).width, of(base.id).depth, of(base.id).height]).toEqual([643, 400, s.base]);
    expect(of(base.id).name).toBe("Bas 1 porte 643 (A1)");
    expect([of(wall.id).height, of(wall.id).depth, of(wall.id).origin[2]]).toEqual([900, 300, s.wallTop - 900]);
    expect(of(tall.id).height).toBe(2000);
  });
});
