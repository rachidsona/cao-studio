/** Les caissons en Répartition d'un Plan de cuisine : la matière des façades changée les suit, et le plan suit un caisson poussé dans la 3D. */
import { describe, expect, it } from "vitest";
import { withCaissonsPlaced } from "../../frontend/src/document/cabinet-furnish";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { syncKitchenPlans } from "../../frontend/src/document/kitchen-sync";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature, type Vec3 } from "../../frontend/src/document/types";
import { isSpace, newItem } from "../../frontend/src/features/kitchen-run-items";
import { nichePartsIn } from "../../frontend/src/features/niche-parts";
import { heldAsCabinet, heldWidened, selectedHeld } from "../../frontend/src/app/kitchen/held-drag";

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
    const pushed = { ...doc, features: doc.features.map((f) => (f.id === second ? { ...sk, frame: { ...sk.frame!, origin: sk.frame!.origin.map((v, k) => v + 300 * x[k]!) as Vec3 } } : f)) };
    const synced = syncKitchenPlans(doc, pushed);
    const items = kitchenPlanIn(synced, plan)!.runs!.A!;
    const k = items.findIndex((i) => i.id === "u2");
    expect(items[k - 1] && isSpace(items[k - 1]!) && !items[k - 1]!.furnished ? items[k - 1]!.width : 0).toBeCloseTo(300, 0);
    // The caisson stays where it was pushed.
    const now = synced.features.find((f): f is SketchFeature => f.id === second)!;
    expect(now.frame!.origin.map((v, k2) => Math.round(v - sk.frame!.origin[k2]!))).toEqual(x.map((v) => Math.round(300 * v)));
  });

  it("choisi dans la 3D, un caisson a les poignées d'un meuble : sa largeur tirée est celle de sa place, le caisson refait", () => {
    const { doc, plan } = kitchen();
    const second = kitchenPlanIn(doc, plan)!.runs!.A!.find((i) => i.id === "u2")!.furnished!;
    const board = doc.features.find((f) => f.type === "extrude" && f.sketch === second)!.id;
    const held = selectedHeld(doc, [board])!;
    expect([held.item, held.width, heldAsCabinet(held).rotation]).toEqual(["u2", 400, 0]);
    const wide = heldWidened(doc, held, 500);
    if (typeof wide === "string") throw new Error(wide);
    expect(kitchenPlanIn(wide, plan)!.runs!.A!.find((i) => i.id === "u2")!.width).toBe(500);
    expect(heldWidened(doc, held, 100)).toMatch(/de 15 à 240 cm/);
  });

  it("sorti de son mur dans la 3D (Coller par face, Déplacer), un caisson revient à sa place, avancé de ce qu'il a fait le long du mur", () => {
    const { doc, plan } = kitchen();
    const second = kitchenPlanIn(doc, plan)!.runs!.A!.find((i) => i.id === "u2")!.furnished!;
    const sk = doc.features.find((f): f is SketchFeature => f.id === second)!;
    const [x, n] = [sk.frame!.xDir, sk.frame!.normal];
    // 200 along its wall, and 500 off it.
    const off = sk.frame!.origin.map((v, k) => v + 200 * x[k]! + 500 * n[k]!) as Vec3;
    const synced = syncKitchenPlans(doc, { ...doc, features: doc.features.map((f) => (f.id === second ? { ...sk, frame: { ...sk.frame!, origin: off } } : f)) });
    const now = synced.features.find((f): f is SketchFeature => f.id === second)!;
    expect(now.frame!.origin.map((v, k) => Math.round(v - sk.frame!.origin[k]!))).toEqual(x.map((v) => Math.round(200 * v)));
  });

  it("un caisson que le plan avait perdu (poussé au-delà du bout) retrouve sa place là où il est, sans rien bouger", () => {
    const { doc, plan } = kitchen();
    const p = kitchenPlanIn(doc, plan)!;
    const frames = (d: CadDocument) => d.features.filter((f): f is SketchFeature => f.type === "sketch" && !!f.frame && f.id !== plan).map((f) => [f.id, f.frame!.origin.map(Math.round)]);
    // A room of 2,5 m written before the second caisson: its items no longer hold it on the run, though it stands there.
    const lost = { ...doc, features: doc.features.map((f) => (f.id === plan && f.type === "sketch" ? { ...f, kitchenPlan: { ...p, runs: { ...p.runs, A: [p.runs!.A![0]!, { id: "kx", model: "space", width: 2500 }, p.runs!.A![1]!] } } } : f)) } as CadDocument;
    const built = withKitchenBuilt(lost, plan, {});
    if (typeof built === "string") throw new Error(built);
    const items = kitchenPlanIn(built.doc, plan)!.runs!.A!;
    expect(items.filter((i) => i.furnished).map((i) => i.id)).toEqual(["u1", "u2"]);
    // Right after the first, as it stands: no room kept between them, what was kept after it.
    expect(items.map((i) => [i.furnished ? i.id : "libre", i.width])).toEqual([["u1", 900], ["u2", 400], ["libre", 2100]]);
    expect(frames(built.doc)).toEqual(frames(doc));
  });

  it("déplacé par « Déplacer » ou « Coller par face » (un décalage dans son plan, son repère gardé), le plan le suit de même", () => {
    const { doc, plan } = kitchen();
    const second = kitchenPlanIn(doc, plan)!.runs!.A!.find((i) => i.id === "u2")!.furnished!;
    const sk = doc.features.find((f): f is SketchFeature => f.id === second)!;
    // 300 along its wall, written as these tools do: in `shift`.
    const synced = syncKitchenPlans(doc, { ...doc, features: doc.features.map((f) => (f.id === second ? { ...sk, shift: [300, 0] as [number, number] } : f)) });
    const items = kitchenPlanIn(synced, plan)!.runs!.A!;
    const k = items.findIndex((i) => i.id === "u2");
    expect(items[k - 1] && isSpace(items[k - 1]!) && !items[k - 1]!.furnished ? items[k - 1]!.width : 0).toBeCloseTo(300, 0);
    // Its frame is now there, the shift gone into it: it does not come back at the next rebuild.
    const now = synced.features.find((f): f is SketchFeature => f.id === second)!;
    expect(now.shift).toBeUndefined();
    expect(now.frame!.origin.map((v, i) => Math.round(v - sk.frame!.origin[i]!))).toEqual(sk.frame!.xDir.map((v) => Math.round(300 * v)));
    const again = withKitchenBuilt(synced, plan, {});
    if (typeof again === "string") throw new Error(again);
    expect(again.doc.features.find((f): f is SketchFeature => f.id === second)!.frame).toEqual(now.frame);
  });
});
