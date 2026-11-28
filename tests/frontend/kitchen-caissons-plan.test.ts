/** Les caissons en Répartition d'un Plan de cuisine : la matière des façades changée les suit, et le plan suit un caisson poussé dans la 3D. */
import { describe, expect, it } from "vitest";
import { withCaissonsPlaced } from "../../frontend/src/document/cabinet-furnish";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { syncKitchenPlans } from "../../frontend/src/document/kitchen-sync";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { isSpace, newItem } from "../../frontend/src/features/kitchen-run-items";
import { nichePartsIn } from "../../frontend/src/features/niche-parts";

const empty = () => ({ ...createReferencePlate(), features: [] }) as unknown as CadDocument;
/** A kitchen on one wall, its units made caissons: a drawer unit of 90 and a door unit of 40. */
function kitchen() {
  const made = withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "I" });
  const built = withKitchenBuilt(made.doc, made.id, { asCaissons: true, runs: { A: [{ ...newItem([], "base-bas-2-tiroirs-et-casserolier", 900), id: "u1" }, { ...newItem([], "base-bas-1-porte", 400), id: "u2" }] } });
  if (typeof built === "string") throw new Error(built);
  return { doc: withCaissonsPlaced(built.doc, made.id).doc, plan: made.id };
}
const fronts = (doc: CadDocument) =>
  doc.features.filter((f): f is NicheFeature => f.type === "niche" && (f.fill === "drawers" || f.fill === "doors")).flatMap((f) => nichePartsIn(doc.features, f).flatMap((p, i) => (p.role === "front" ? [[`${f.id}#${i}`, doc.bodyInfo?.[`${f.id}#${i}`]?.material] as const] : [])));

describe("caissons en Répartition d'un plan de cuisine", () => {
  it("la matière des façades changée passe sur leurs portes et les façades de leurs tiroirs, pas sur une façade choisie à la main", () => {
    const { doc, plan } = kitchen();
    const all = fronts(doc);
    expect(all.length).toBeGreaterThan(2);
    expect(all.every(([, m]) => m === "lacquer-white")).toBe(true);
    // One drawer front painted by hand in walnut.
    const [hand] = all[0]!;
    const painted = { ...doc, bodyInfo: { ...doc.bodyInfo, [hand]: { ...doc.bodyInfo?.[hand], material: "walnut" } } };
    const oak = withKitchenBuilt(painted, plan, { frontMaterial: "solid-oak" });
    if (typeof oak === "string") throw new Error(oak);
    for (const [id, m] of fronts(oak.doc)) expect([id, m]).toEqual([id, id === hand ? "walnut" : "solid-oak"]);
  });

  it("poussé le long de son mur dans la 3D, un caisson garde sa place : le linéaire garde la place libre avant lui, la cuisine refaite autour", () => {
    const { doc, plan } = kitchen();
    const second = kitchenPlanIn(doc, plan)!.runs!.A!.find((i) => i.id === "u2")!.furnished!;
    const sk = doc.features.find((f): f is SketchFeature => f.id === second)!;
    const x = sk.frame!.xDir;
    const pushed = { ...doc, features: doc.features.map((f) => (f.id === second ? { ...sk, frame: { ...sk.frame!, origin: sk.frame!.origin.map((v, k) => v + 300 * x[k]!) as typeof sk.frame.origin } } : f)) };
    const synced = syncKitchenPlans(doc, pushed);
    const items = kitchenPlanIn(synced, plan)!.runs!.A!;
    const k = items.findIndex((i) => i.id === "u2");
    expect(items[k - 1] && isSpace(items[k - 1]!) && !items[k - 1]!.furnished ? items[k - 1]!.width : 0).toBeCloseTo(300, 0);
    // The caisson stays where it was pushed.
    const now = synced.features.find((f): f is SketchFeature => f.id === second)!;
    expect(now.frame!.origin.map((v, k2) => Math.round(v - sk.frame!.origin[k2]!))).toEqual(x.map((v) => Math.round(300 * v)));
  });
});
