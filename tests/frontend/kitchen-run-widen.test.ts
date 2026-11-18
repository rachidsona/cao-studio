/** Combler le vide d'un linéaire en prolongeant un meuble. */
import { describe, expect, it } from "vitest";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { fillRun, newItem, openRoom } from "../../frontend/src/features/kitchen-run-items";
import { restToFill, widenedToFill } from "../../frontend/src/features/kitchen-run-widen";

const units = (list: [string, number][]) => list.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);
const plan = (rest: "end" | "both" | "walls", A: KitchenRunItem[]): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "I", lengthA: 3000, rest: { A: rest }, runs: { A } });
const heights = (p: KitchenFloorPlan) => ({ worktop: p.worktopHeight, wallBottom: kitchenSizes(p).wallBottom, wallTop: kitchenSizes(p).wallTop });
const geometry = (p: KitchenFloorPlan) => runGeometry(p, kitchenRuns(p)[0]!);

describe("prolonger un meuble pour combler le vide", () => {
  it("le meuble choisi prend le reste de sa rangée, ses voisins se poussent : plus rien d'ouvert", () => {
    const items = units([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 600]]);
    for (const rest of ["end", "both"] as const) {
      const p = plan(rest, items);
      expect(restToFill(geometry(p), fillRun(geometry(p), items, heights(p)), "base")).toBeCloseTo(1400);
      const made = widenedToFill(p, geometry(p), items, heights(p), items[0]!.id);
      if (typeof made === "string") throw new Error(made);
      expect(made.by).toBeCloseTo(1400);
      const fill = fillRun(geometry(p), made.items, heights(p));
      expect([openRoom(fill, "base"), fill.fillers]).toEqual([[], []]);
    }
  });

  it("dans ses limites, pas sur la place gardée, et refusé quand rien n'est à combler", () => {
    const items = units([["base-bas-1-porte", 600], ["space", 500], ["base-bas-1-porte", 600]]);
    const p = plan("end", items);
    // 3000 − 1700 = 1300 to fill, the 500 kept free not; a « Bas 1 porte » stops at 240 cm.
    const made = widenedToFill(p, geometry(p), items, heights(p), items[0]!.id);
    if (typeof made === "string") throw new Error(made);
    expect(made.items[0]!.width).toBe(1900);
    expect(widenedToFill(p, geometry(p), made.items, heights(p), items[2]!.id)).toMatch(/Rien à combler/);
    expect(widenedToFill(p, geometry(p), items, heights(p), items[1]!.id)).toMatch(/ne se prolonge pas/);
  });
});
