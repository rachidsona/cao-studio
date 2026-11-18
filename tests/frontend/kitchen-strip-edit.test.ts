/** Une largeur de la bande d'un linéaire changée dans la calculatrice : un meuble, une porte d'angle, la porte pliante d'un L. */
import { describe, expect, it } from "vitest";
import { stripWidth } from "../../frontend/src/app/kitchen/kitchen-strip-edit";
import { cornerSide } from "../../frontend/src/document/kitchen-corners";
import { KITCHEN_PLAN, kitchenRuns } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";

const items: KitchenRunItem[] = [{ id: "k1", model: "base-bas-1-porte", width: 600 }, { id: "k2", model: "app-sink", width: 600 }];
const at = (patch: Partial<KitchenFloorPlan>) => {
  const plan: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "L-left", ...patch };
  return { plan, run: kitchenRuns(plan).find((r) => r.id === "A")!, items, unit: "cm" as const };
};

describe("largeurs de la bande à la calculatrice", () => {
  it("un meuble prend sa largeur, dans ses limites", () => {
    const host = at({});
    expect(stripWidth(host, { kind: "item", id: "k1", width: 600 }, 523.4)).toEqual({ items: [{ ...items[0], width: 523.4 }, items[1]] });
    expect(stripWidth(host, { kind: "item", id: "k1", width: 600 }, 50)).toMatch(/La largeur va de 10 cm à 240 cm/);
    expect(stripWidth(host, { kind: "item", id: "zz", width: 600 }, 500)).toMatch(/n'est plus/);
  });

  it("un caisson aménagé à la main : sa place prend la largeur (le caisson s'y refait), dans ses limites", () => {
    const held: KitchenRunItem = { id: "k3", model: "space", width: 1000, furnished: "sk1" };
    const host = { ...at({}), items: [...items, held] };
    expect(stripWidth(host, { kind: "item", id: "k3", width: 1000 }, 800)).toEqual({ items: [...items, { ...held, width: 800 }] });
    expect(stripWidth(host, { kind: "item", id: "k3", width: 1000 }, 100)).toMatch(/La largeur va de 15 cm à 240 cm/);
  });

  it("la porte d'un meuble d'angle : sa taille, ses jeux en plus ; elle se retrouve sur la bande", () => {
    const host = at({ corners: { left: "unit" } });
    const made = stripWidth(host, { kind: "corner", side: "left", row: "base", width: 447 }, 497);
    if (typeof made === "string" || !("corners" in made)) throw new Error(String(made));
    expect(made.corners.cornerSizes?.left?.door).toBe(500);
    const door = cornerSide({ ...host.plan, ...made.corners }, host.run, "left")!.fronts.find((f) => f.kind === "door")!;
    expect(door.to - door.from).toBeCloseTo(497, 6);
    expect(stripWidth(host, { kind: "corner", side: "left", row: "base", width: 447 }, 800)).toMatch(/La porte va de 29,7 cm à 59,7 cm/);
  });

  it("la porte pliante d'un angle en L : son bras suit", () => {
    const host = at({ corners: { left: "l" } });
    const made = stripWidth(host, { kind: "corner", side: "left", row: "base", width: 300 }, 400);
    if (typeof made === "string" || !("corners" in made)) throw new Error(String(made));
    const door = cornerSide({ ...host.plan, ...made.corners }, host.run, "left")!.fronts.find((f) => f.kind === "door")!;
    expect(door.to - door.from).toBeCloseTo(400, 6);
  });
});
