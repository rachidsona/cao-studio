/** Une cote d'un linéaire vu seul, tapée : largeur d'un meuble, porte d'un meuble d'angle, longueur du mur, hauteurs. */
import { describe, expect, it } from "vitest";
import { withRunDim } from "../../frontend/src/document/kitchen-dim-edit";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import { runDims } from "../../frontend/src/document/kitchen-run-dims";
import { createReferencePlate, type CadDocument, type KitchenFloorPlan } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const built = (patch: Partial<KitchenFloorPlan>, items: [string, number][]) => {
  const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "L-left", lengthA: 2400, runs: {}, made: {}, ...patch });
  const list = items.reduce<ReturnType<typeof newItem>[]>((all, [m, w]) => [...all, newItem(all, m, w)], []);
  const made = withKitchenBuilt(base.doc, base.id, { runs: { A: list } });
  if (typeof made === "string") throw new Error(made);
  return { doc: made.doc, id: base.id, items: list };
};
const docOf = (r: CadDocument | string): CadDocument => {
  if (typeof r === "string") throw new Error(r);
  return r;
};

describe("cotes tapées sur un linéaire vu seul", () => {
  it("chaque cote dit ce qu'elle change ; un fileur ou une place libre, rien", () => {
    const { doc, id } = built({ corners: { left: "unit" } }, [["base-bas-1-porte", 600], ["app-sink", 600]]);
    const plan = kitchenPlanIn(doc, id)!;
    const run = kitchenRuns(plan).find((r) => r.id === "A")!;
    const dims = runDims(plan, run, runGeometry(plan, run), kitchenFromPlan(plan).fills.A!);
    const low = dims.filter((d) => d.axis === "u" && d.at === -150);
    // First the 10 cm left empty between the corner unit and the wall, then the corner unit (its door).
    expect(low.map((d) => d.edit?.kind ?? "rien")).toEqual(["rien", "corner", "item", "item", "rien"]);
    expect(low[0]!.b - low[0]!.a).toBe(100);
    expect(dims.find((d) => d.at === -330)!.edit).toEqual({ kind: "plan", key: "lengthA" });
    // Up: the worktop, the space under the wall units (typed: how high they hang), the wall row, what is left above it, the ceiling.
    expect(dims.filter((d) => d.axis === "z").map((d) => d.edit?.kind ?? "rien")).toEqual(["plan", "plan", "rien", "plan", "rien"]);
  });

  it("la largeur d'un meuble : appliquée, refusée si elle ne tient plus (avec le plus large possible), un appareil garde ses largeurs", () => {
    const { doc, id, items } = built({}, [["base-bas-1-porte", 600], ["app-sink", 600]]);
    const wider = docOf(withRunDim(doc, id, "A", { kind: "item", item: items[0]!.id }, 700));
    expect(kitchenPlanIn(wider, id)!.runs!.A![0]!.width).toBe(700);
    expect(wider.features.some((f) => f.type === "cabinet" && f.name === "Bas 1 porte 700 (A1)")).toBe(true);
    // Wall A: 2400 less the corner, 1200 taken.
    const room = 2400 - kitchenSizes(KITCHEN_PLAN).corner - 600;
    expect(withRunDim(doc, id, "A", { kind: "item", item: items[0]!.id }, 2000)).toBe(`À 200 cm, Bas 1 porte ne tient plus : ${Number((room / 10).toFixed(1)).toLocaleString("fr-FR")} cm au plus.`);
    expect(withRunDim(doc, id, "A", { kind: "item", item: items[1]!.id }, 700)).toBe("Évier existe en 60 cm, 80 cm, 120 cm.");
  });

  it("la porte d'un meuble d'angle, la longueur du mur et la hauteur du plan de travail", () => {
    const { doc, id } = built({ corners: { left: "unit" } }, [["base-bas-1-porte", 600]]);
    const s = kitchenSizes(KITCHEN_PLAN);
    const door = docOf(withRunDim(doc, id, "A", { kind: "corner", joint: "left", key: "door", less: s.corner }, s.corner + 500));
    expect(kitchenPlanIn(door, id)!.cornerSizes?.left?.door).toBe(500);
    expect(withRunDim(doc, id, "A", { kind: "corner", joint: "left", key: "door", less: s.corner }, s.corner + 900)).toMatch(/^Cette cote va de/);
    const longer = docOf(withRunDim(doc, id, "A", { kind: "plan", key: "lengthA" }, 3000));
    expect(kitchenPlanIn(longer, id)!.lengthA).toBe(3000);
    expect(withRunDim(doc, id, "A", { kind: "plan", key: "worktopHeight" }, 500)).toBe("Le plan de travail est de 70 à 110 cm du sol.");
  });
});
