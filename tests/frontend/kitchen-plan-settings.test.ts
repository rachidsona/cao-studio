/** Les réglages de l'Implantation sur le Plan de cuisine : socle, épaisseur du plan, crédence, plinthes, et ce que « Proposer » met. */
import { describe, expect, it } from "vitest";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN, kitchenPlanProblem, kitchenSizes } from "../../frontend/src/document/kitchen-plan-shapes";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";
import type { KitchenFloorPlan } from "../../frontend/src/document/types";
import { itemEntry } from "../../frontend/src/features/kitchen-run-items";

const plan = (patch: Partial<KitchenFloorPlan> = {}): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "L-left", lengthA: 3600, ...patch });
const models = (p: KitchenFloorPlan) => Object.values(proposeKitchen(p).runs).flat().map((i) => i.model);
const built = (p: KitchenFloorPlan) => kitchenFromPlan({ ...p, ...proposeKitchen(p) });

describe("réglages de l'Implantation sur le plan de cuisine", () => {
  it("socle et épaisseur du plan de travail : les bas, les fileurs et les plinthes les suivent", () => {
    const p = plan({ plinth: 100, worktopThickness: 50 });
    expect(kitchenSizes(p).base).toBe(p.worktopHeight - 50);
    expect(kitchenSizes(p).plinth).toBe(100);
    const layout = built(p);
    const base = layout.units.find((u) => u.name.startsWith("Bas"))!;
    expect([base.plinth, base.height]).toEqual([100, p.worktopHeight - 50]);
    const kick = layout.boxes.find((b) => b.kind === "kick")!;
    expect(kick.to[2] - kick.from[2]).toBe(97);
    expect(kitchenPlanProblem(plan({ plinth: 20 }))).toBe("Le socle va de 5 à 25 cm.");
  });

  it("sans crédence ni plinthes, la cuisine bâtie n'en a pas", () => {
    expect(built(plan()).boxes.some((b) => b.kind === "splashback")).toBe(true);
    const layout = built(plan({ splashback: false, kick: false }));
    expect(layout.boxes.some((b) => b.kind === "splashback" || b.kind === "kick")).toBe(false);
  });

  it("« Proposer » suit les façades, les meubles hauts, l'électroménager et les colonnes choisis", () => {
    const fronts = (p: KitchenFloorPlan) => new Set(Object.values(proposeKitchen(p).runs).flat().filter((i) => !i.model.startsWith("app-")).map((i) => itemEntry(i)).filter((e) => e.kind === "base").map((e) => e.layout));
    expect(fronts(plan({ fronts: "drawers" }))).toEqual(new Set(["drawers"]));
    expect([...fronts(plan({ fronts: "doors" }))].every((l) => l === "door" || l === "doors")).toBe(true);
    expect(fronts(plan()).has("drawers") && (fronts(plan()).has("door") || fronts(plan()).has("doors"))).toBe(true);
    expect(models(plan({ wallUnits: false })).some((m) => m.startsWith("wall-") || m === "app-hood")).toBe(false);
    expect(models(plan({ appliances: false })).filter((m) => m.startsWith("app-"))).toEqual(["app-fridge"]);
    expect(models(plan({ fridge: false })).includes("app-fridge")).toBe(false);
    const oven = models(plan({ ovenColumn: true }));
    expect(oven.includes("app-oven-column") && oven.includes("app-hob") && !oven.includes("app-hob-oven")).toBe(true);
    expect(models(plan()).includes("app-hob-oven")).toBe(true);
  });
});

describe("« Proposer » suit les conseils de son propre triangle d'activité", () => {
  const warnings = (p: KitchenFloorPlan) => built(p).ergonomics?.warn ?? [];

  it("en U et en G : la plaque n'est plus mise juste après l'angle, à côté de l'évier (deux modules d'écart dans l'ordre, côte à côte au sol)", () => {
    for (const p of [plan({ model: "U" }), plan({ model: "U", lengthA: 4800 }), plan({ model: "G-left", lengthA: 4800 }), plan({ model: "U", ovenColumn: true })]) expect(warnings(p)).toEqual([]);
  });

  it("avec un îlot, la plaque reste sur un mur, sous sa hotte", () => {
    const runs = proposeKitchen(plan({ island: true })).runs;
    expect(runs.I!.map((i) => i.model).filter((m) => m.startsWith("app-hob"))).toEqual([]);
    expect(Object.values(runs).flat().some((i) => i.model === "app-hood")).toBe(true);
  });

  it("deux postes à 1,20 m tout juste ne sont pas « à moins de 1,20 m »", () => {
    expect(warnings(plan({ model: "I", lengthA: 4800 }))).toEqual([]);
  });

  it("sur toutes les formes et longueurs, deux fois moins d'avertissements qu'avant", () => {
    let n = 0;
    for (const model of ["I", "L-left", "L-right", "U", "G-left", "G-right", "facing"] as const)
      for (const lengthA of [2400, 3000, 3600, 4200, 4800]) for (const ovenColumn of [false, true]) n += warnings(plan({ model, lengthA, ovenColumn })).length;
    // 67 before: the hob chosen two slots from the sink in run order, the sink always at a third of wall A.
    expect(n).toBeLessThanOrEqual(30);
  });
});
