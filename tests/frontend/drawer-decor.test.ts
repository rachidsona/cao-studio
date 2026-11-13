/** Façades décor sur les tiroirs : d'un caisson et d'une niche ; le Plan de cuisine garde le style de ses façades. */
import { measureVolume } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { syncKitchenPlans } from "../../frontend/src/document/kitchen-sync";
import { updateFeature } from "../../frontend/src/document/operations";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { decorGrooves } from "../../frontend/src/features/door-decor";
import { buildFronts } from "../../frontend/src/features/fronts";
import { frontsParts, frontsProblem } from "../../frontend/src/features/fronts-parts";
import { styleChange } from "../../frontend/src/features/glass-door";
import { buildNiche } from "../../frontend/src/features/niche";
import { nicheGeometry, nicheParts, nicheProblem } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Caisson", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 0, plinth: 100, construction: "sides-through" };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "drawers", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: false, ...over });
/** The volume of each drawer front the kernel makes. */
function frontVolumes(f: FrontsFeature): number[] {
  const parts = frontsParts(f, cabinet);
  const out = buildFronts(f, () => undefined as never, cabinet);
  const v = parts.flatMap((p, i) => (p.role?.kind === "drawer" ? [measureVolume(out.shapes[i]!)] : []));
  for (const s of out.shapes) s.delete();
  return v;
}

describe("tiroirs d'un caisson", () => {
  it("chaque façade de tiroir est cannelée, à tasseaux ou à cadre, sur sa propre hauteur", () => {
    const plain = frontVolumes(fronts());
    const slats = fronts({ ...styleChange("slats", {}) });
    const face = frontsParts(slats, cabinet).find((p) => p.role?.kind === "drawer")!;
    const grooves = decorGrooves(slats, face.from[0], face.to[0], face.from[2], face.to[2]);
    const height = face.to[2] - face.from[2];
    frontVolumes(slats).forEach((v, i) => expect(plain[i]! - v).toBeCloseTo(grooves.length * 10 * 4 * height, 0));
    const framed = frontVolumes(fronts({ ...styleChange("frame", {}), frameWidth: 40, frameDepth: 5 }));
    framed.forEach((v, i) => expect(plain[i]! - v).toBeCloseTo((597 - 80) * (height - 80) * 5, 0));
    // Too wide a frame for four drawer fronts 150 mm high.
    expect(frontsProblem(fronts({ ...styleChange("frame", {}) }), cabinet)).toBeNull();
    expect(frontsProblem(fronts({ ...styleChange("frame", {}), drawers: 4 }), cabinet)).toBe("Le cadre est trop large pour ces façades de tiroir.");
    // No hinge cups behind a drawer front: the grooves run to the side edges.
    expect(frontsProblem(fronts({ style: "slats", frameDepth: 8 }), cabinet)).toBeNull();
    // A glass style left from doors: the drawer fronts stay plain.
    expect(frontsProblem(fronts({ ...styleChange("glass", {}) }), cabinet)).toBeNull();
    expect(frontVolumes(fronts({ ...styleChange("glass", {}) }))).toEqual(plain);
  });
});

describe("tiroirs d'une niche", () => {
  const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "R", INPUT, [0, 0], 400)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "E", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const drawers = (over: Partial<NicheFeature> = {}): NicheFeature => ({ id: "td1", type: "niche", name: "Tiroirs 1", sketch: "sk1", partition: "of1", niche: [0], fill: "drawers", diameter: 25, drop: 60, drawers: 4, gap: 3, thickness: 18, handles: false, ...over });

  it("les façades des tiroirs d'une niche se cannèlent ; les caissons ne bougent pas", () => {
    const plain = buildNiche(drawers(), sketch);
    const fluted = buildNiche(drawers({ ...styleChange("fluted", {}) }), sketch);
    const n = nicheGeometry(drawers(), sketch);
    if (typeof n === "string") throw new Error(n);
    const parts = nicheParts(drawers(), n);
    parts.forEach((p, i) => {
      const [a, b] = [measureVolume(plain.shapes[i]!), measureVolume(fluted.shapes[i]!)];
      if (p.role === "front") expect(a - b).toBeGreaterThan(1000);
      else expect(b).toBeCloseTo(a, 3);
    });
    for (const s of [...plain.shapes, ...fluted.shapes]) s.delete();
    expect(nicheProblem({ ...drawers(), ...styleChange("fluted", {}), frameDepth: 16 }, n)).toMatch(/trop profondes/);
    expect(nicheProblem({ ...drawers(), ...styleChange("frame", {}), frameWidth: 220 }, n)).toMatch(/cadre est trop large/);
    expect(nicheProblem({ ...drawers(), ...styleChange("glass", {}) }, n)).toBeNull();
  });
});

describe("le Plan de cuisine garde le style des façades", () => {
  it("cannelées dans la 3D : la cuisine refaite les remet, le document reste valide ; plates, il l'oublie", () => {
    const plan = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: { A: [{ id: "i1", model: "base-bas-1-porte", width: 600 }] }, made: {} });
    const built = withKitchenBuilt(plan.doc, plan.id, {});
    if (typeof built === "string") throw new Error(built);
    const fr = built.doc.features.find((f): f is FrontsFeature => f.type === "fronts")!;
    const styled = updateFeature(built.doc, fr.id, () => ({ ...fr, ...styleChange("fluted", {}), side: "top" }) satisfies FrontsFeature);
    const synced = syncKitchenPlans(built.doc, styled);
    expect(kitchenPlanIn(synced, plan.id)!.runs!.A![0]).toMatchObject({ side: "top", facade: { style: "fluted", pitch: 30, frameDepth: 3, frameWidth: 0 } });
    // Saved with a lift-up door and fluted fronts, it opens again.
    expect(() => parseDocument(JSON.parse(JSON.stringify(synced)))).not.toThrow();
    const again = withKitchenBuilt(synced, plan.id, {});
    if (typeof again === "string") throw new Error(again);
    expect(again.doc.features.find((f) => f.type === "fronts")).toMatchObject({ style: "fluted", pitch: 30 });
    const back = again.doc.features.find((f): f is FrontsFeature => f.type === "fronts")!;
    const plain = syncKitchenPlans(again.doc, updateFeature(again.doc, back.id, () => ({ ...back, style: "flat" }) satisfies FrontsFeature));
    expect(kitchenPlanIn(plain, plan.id)!.runs!.A![0]!.facade).toBeUndefined();
  });
});
