/** Les façades de toute la cuisine, réglées dans le Plan de cuisine : pose, style, poignées, couleur, épaisseur, jeu. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN, kitchenPlanProblem } from "../../frontend/src/document/kitchen-plan-shapes";
import { syncKitchenPlans } from "../../frontend/src/document/kitchen-sync";
import { createReferencePlate, PART_SEPARATOR, type CadDocument, type FrontsFeature, type KitchenFrontLook } from "../../frontend/src/document/types";
import { frontsParts } from "../../frontend/src/features/fronts-parts";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const kitchen = (frontLook?: KitchenFrontLook) => {
  const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 2400, frontLook, runs: {}, made: {} });
  const items = [newItem([], "base-bas-2-portes", 800)];
  items.push(newItem(items, "base-bas-3-tiroirs", 600));
  const built = withKitchenBuilt(base.doc, base.id, { runs: { A: items } });
  if (typeof built === "string") throw new Error(built);
  return { doc: built.doc, id: base.id };
};
const frontsOf = (doc: CadDocument) => doc.features.filter((f): f is FrontsFeature => f.type === "fronts");

describe("façades de toute la cuisine", () => {
  it("sans réglage : en applique, 3 mm de jeu, 19 mm, plates, avec poignées", () => {
    const all = frontsOf(kitchen().doc);
    expect(all.map((f) => [f.mount, f.gap, f.thickness, f.style ?? "flat", f.handles, f.grip ?? null])).toEqual([["overlay", 3, 19, "flat", true, null], ["overlay", 3, 19, "flat", true, null]]);
  });

  it("encastrées, à cadre, sans poignée, 22 mm, 2 mm de jeu : chaque façade de la cuisine", () => {
    const all = frontsOf(kitchen({ mount: "inset", gap: 2, thickness: 22, style: { style: "frame", frameWidth: 70, frameDepth: 6 }, handles: "none" }).doc);
    expect(all.map((f) => [f.mount, f.gap, f.thickness, f.style, f.handles])).toEqual([["inset", 2, 22, "frame", false], ["inset", 2, 22, "frame", false]]);
    expect(frontsOf(kitchen({ handles: "gorge" }).doc).every((f) => f.grip === "gorge")).toBe(true);
  });

  it("une couleur de laque : les portes et les façades de tiroirs, pas les caissons des tiroirs", () => {
    const { doc } = kitchen({ color: "#2f5d50" });
    const drawers = frontsOf(doc).find((f) => f.layout === "drawers")!;
    const cabinet = doc.features.find((f) => f.id === drawers.cabinet) as Parameters<typeof frontsParts>[1];
    const parts = frontsParts(drawers, cabinet);
    const info = (i: number) => doc.bodyInfo?.[`${drawers.id}${PART_SEPARATOR}${i}`];
    parts.forEach((p, i) => expect(info(i)?.color ?? null).toBe(p.role ? "#2f5d50" : null));
    expect(parts.some((p) => !p.role)).toBe(true);
  });

  it("le style de toute la cuisine n'est pas pris pour celui d'un meuble seul : le plan ne l'écrit sur aucun", () => {
    const { doc, id } = kitchen({ style: { style: "frame", frameWidth: 70, frameDepth: 6 }, handles: "gorge" });
    const before = kitchenPlanIn(doc, id)!.runs!.A!;
    const moved = { ...doc, features: doc.features.map((f) => (f.type === "cabinet" && f.width === 800 ? { ...f, depth: f.depth - 10 } : f)) };
    const after = kitchenPlanIn(syncKitchenPlans(doc, moved), id)!.runs!.A!;
    expect(after.map((i) => [i.facade ?? null, i.grip ?? null])).toEqual(before.map(() => [null, null]));
  });

  it("refuse une épaisseur ou un jeu hors des limites", () => {
    expect(kitchenPlanProblem({ ...KITCHEN_PLAN, frontLook: { thickness: 50 } })).toMatch(/10 à 40 mm/);
    expect(kitchenPlanProblem({ ...KITCHEN_PLAN, frontLook: { gap: 9 } })).toMatch(/0 à 6 mm/);
  });
});
