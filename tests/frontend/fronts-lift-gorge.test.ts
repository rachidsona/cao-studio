/** Portes relevables, abattants et façades sans poignée (gorge) : pièces, perçages, compas, ouverture, devis. */
import { beforeAll, describe, expect, it } from "vitest";
import { doorSwing, swingPose } from "../../frontend/src/app/drawer-toggle";
import { bodyAppearance } from "../../frontend/src/appearance/assign";
import { doorOf, withDoorFlipped } from "../../frontend/src/document/door-edit";
import { frontMass, isHardwareBody, modelHardware } from "../../frontend/src/document/hardware";
import { doorProblems } from "../../frontend/src/document/hardware-rules";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { syncKitchenPlans } from "../../frontend/src/document/kitchen-sync";
import { updateFeature } from "../../frontend/src/document/operations";
import { DEFAULT_RATES, makeQuote } from "../../frontend/src/document/quote";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { drillings, frontsHoleCount } from "../../frontend/src/features/fronts-drillings";
import { FLAP_STAY, FOLD_LIFT, frontsHardware, frontsParts, frontsProblem, GORGE, GORGE_PROFILE, liftStay } from "../../frontend/src/features/fronts-parts";
import { rotationMatrix } from "../../frontend/src/features/motion";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A wall unit, 600 × 360 × 320, and a base unit, 600 × 720 × 560 on a plinth of 100. */
const wall: CabinetFeature = { id: "cb1", type: "cabinet", name: "Haut", origin: [0, 0, 1400], width: 600, height: 360, depth: 320, thickness: 18, back: "applied", backThickness: 3, shelves: 0, plinth: 0, construction: "sides-through" };
const base: CabinetFeature = { ...wall, name: "Bas", origin: [0, 0, 0], height: 720, depth: 560, plinth: 100 };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true, ...over });
const docOf = (cabinet: CabinetFeature, f: FrontsFeature): CadDocument => ({ ...createReferencePlate(), features: [cabinet, f] });

/** Where the swing puts a point. */
function swung(swing: NonNullable<ReturnType<typeof doorSwing>>, p: number[]): number[] {
  const r = rotationMatrix(swing.axis, swing.angle);
  const d = p.map((c, i) => c - swing.pivot[i]!);
  return [0, 1, 2].map((i) => swing.pivot[i]! + r[i * 3]! * d[0]! + r[i * 3 + 1]! * d[1]! + r[i * 3 + 2]! * d[2]!);
}

describe("porte relevable et abattant", () => {
  it("pliante : deux volets, le bas plié contre le haut en montant, son bord bas le long de la façade ; une poignée, une ferrure", () => {
    const f = fronts({ side: "top", fold: true });
    const parts = frontsParts(f, wall);
    expect(parts.map((p) => [p.name, p.role])).toEqual([["Volet haut", { kind: "door", hinge: "top" }], ["Volet bas", { kind: "door", hinge: "fold" }]]);
    const [upper, lower] = parts as [(typeof parts)[0], (typeof parts)[0]];
    expect(upper.from[2] - lower.to[2]).toBeCloseTo(f.gap, 6);
    const hw = frontsHardware(f, wall);
    expect(hw.find((h) => h.name === FOLD_LIFT)?.quantity).toBe(1);
    expect(hw.find((h) => h.name.startsWith("Poignée"))?.quantity).toBe(1);
    expect(drillings(upper, f, []).filter((h) => h.radius < 10)).toEqual([]);
    expect(drillings(lower, f, []).filter((h) => h.radius > 10).every((h) => Math.abs(h.at[2] - (lower.to[2] - 22.5)) < 1e-6)).toBe(true);
    // Opening: the upper leaf lifts about its top edge; the lower one stays hinged to it, its bottom edge up the front.
    const doc = docOf(wall, f);
    const [su, sl] = [doorSwing(doc, "fr1#0")!, doorSwing(doc, "fr1#1")!];
    expect(Math.abs(su.angle)).toBe(80);
    expect(sl.fold).toBeDefined();
    const at = (pose: { rotation: number[]; translation: number[] }, p: number[]) => [0, 1, 2].map((i) => pose.rotation[i * 3]! * p[0]! + pose.rotation[i * 3 + 1]! * p[1]! + pose.rotation[i * 3 + 2]! * p[2]! + pose.translation[i]!);
    const x = (lower.from[0] + lower.to[0]) / 2;
    for (const s of [0.25, 0.5, 1]) {
      const [pu, pl] = [swingPose(su, s), swingPose(sl, s)];
      // The middle hinge: the bottom of the upper leaf and the top of the lower one stay together (within the gap).
      const [a, b] = [at(pu, [x, upper.from[1], upper.from[2]]), at(pl, [x, lower.from[1], lower.to[2]])];
      expect(Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!), String(s)).toBeLessThan(f.gap + 0.01);
      // Its bottom edge: never into the cabinet, and up as it opens.
      const bottom = at(pl, [x, lower.from[1], lower.from[2]]);
      expect(bottom[1]!, String(s)).toBeLessThanOrEqual(lower.from[1] + 0.5);
      expect(bottom[2]!, String(s)).toBeGreaterThan(lower.from[2]);
    }
  });

  it("la porte relevable a ses charnières le long du chant haut, ses trous de poignée en bas au milieu", () => {
    const f = fronts({ side: "top" });
    const [door] = frontsParts(f, wall);
    expect(door).toMatchObject({ name: "Porte relevable", role: { kind: "door", hinge: "top" } });
    const holes = drillings(door!, f, []);
    const cups = holes.filter((h) => h.radius > 10);
    expect(cups.map((h) => h.at[2])).toEqual([door!.to[2] - 22.5, door!.to[2] - 22.5]);
    expect(cups.map((h) => h.at[0])).toEqual([door!.from[0] + 100, door!.to[0] - 100]);
    const handle = holes.filter((h) => h.radius < 10);
    expect(handle.map((h) => h.at[2])).toEqual([door!.from[2] + 40, door!.from[2] + 40]);
    expect(handle.map((h) => h.at[0])).toEqual([300 - 64, 300 + 64]);
    // The flap: the other way up.
    const flap = fronts({ side: "bottom" });
    const [low] = frontsParts(flap, wall);
    expect(low!.name).toBe("Abattant");
    expect(drillings(low!, flap, []).filter((h) => h.radius > 10).every((h) => h.at[2] === low!.from[2] + 22.5)).toBe(true);
  });

  it("les compas se choisissent d'après le poids et la hauteur ; l'abattant a les siens", () => {
    expect(liftStay(400, 4)).toEqual({ name: "Compas de porte relevable force 1 (paire)", factor: 1600 });
    expect(liftStay(400, 4.1)?.name).toBe("Compas de porte relevable force 2 (paire)");
    expect(liftStay(700, 13)).toBeNull();
    const f = fronts({ side: "top" });
    // 10 kg: three hinges along its top edge (4,5 kg each), more than its width alone asks.
    expect(frontsHardware(f, wall, () => 10)).toEqual([
      { name: "Charnière à boîtier Ø35", quantity: 3 },
      { name: "Compas de porte relevable force 3 (paire)", quantity: 1 },
      { name: "Poignée entraxe 128 mm", quantity: 1 },
    ]);
    expect(frontsHardware(fronts({ side: "bottom" }), wall).map((h) => h.name)).toContain(FLAP_STAY);
    // In the model: its weight from its size and its material; in the quote at the price of its class.
    const d = docOf(wall, f);
    const stay = liftStay(357, frontMass(d, f, 0))!;
    expect(frontMass(d, f, 0)).toBeCloseTo(597 * 19 * 357 * 1e-9 * 650, 3);
    expect(modelHardware(d)).toEqual(expect.arrayContaining([{ name: stay.name, quantity: 1 }]));
    expect(makeQuote([], DEFAULT_RATES, modelHardware(d)).lines.find((l) => l.label === stay.name)?.unitPrice).toBe(DEFAULT_RATES.hardware[stay.name]);
  });

  it("s'ouvre vers le haut autour de son chant haut ; l'abattant vers le bas, à l'horizontale", () => {
    const up = doorSwing(docOf(wall, fronts({ side: "top" })), "fr1#0")!;
    const [door] = frontsParts(fronts({ side: "top" }), wall);
    expect(up.axis).toBe(0);
    expect(up.pivot[2]).toBeCloseTo(door!.to[2]);
    // Its bottom edge comes out in front (−Y) and goes up.
    const free = swung(up, [300, door!.from[1], door!.from[2]]);
    expect(free[1]!).toBeLessThan(door!.from[1] - 300);
    expect(free[2]!).toBeGreaterThan(door!.to[2]);
    // A cabinet turned a quarter: about the other horizontal axis.
    expect(doorSwing(docOf({ ...wall, rotation: 90 }, fronts({ side: "top" })), "fr1#0")!.axis).toBe(1);
    const down = doorSwing(docOf(wall, fronts({ side: "bottom" })), "fr1#0")!;
    const top = swung(down, [300, door!.from[1], door!.to[2]]);
    expect(Math.abs(down.angle)).toBe(90);
    expect(top[1]!).toBeLessThan(door!.from[1] - 300);
    expect(top[2]!).toBeCloseTo(door!.from[2], 3);
  });

  it("trop lourde ou trop haute pour une paire de compas : le contrôle le dit", () => {
    const tall: CabinetFeature = { ...wall, width: 900, height: 950 };
    const heavy = doorProblems(docOf(tall, fronts({ side: "top" })));
    expect(heavy.map((p) => p.message).join(" ")).toMatch(/plus qu'une paire de compas ne tient/);
    expect(doorProblems(docOf(wall, fronts({ side: "top" })))).toEqual([]);
  });

  it("le menu de la porte la retourne (relevable ↔ abattant) ; le document reste valide", () => {
    const d = docOf(wall, fronts({ side: "top" }));
    expect(doorOf(d, "fr1#0")).toMatchObject({ kind: "fronts", hinge: null });
    const flipped = withDoorFlipped(d, "fr1#0");
    if (typeof flipped === "string") throw new Error(flipped);
    expect(flipped.features.find((x): x is FrontsFeature => x.id === "fr1")!.side).toBe("bottom");
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
    expect(() => parseDocument({ ...d, features: [wall, { ...fronts(), side: "up" }] })).toThrow(/côté des charnières/);
  });
});

describe("façades sans poignée (gorge)", () => {
  it("la porte s'arrête sous le dessus, 30 mm de prise de main au-dessus d'elle, devant un profilé sur toute la largeur", () => {
    const f = fronts({ grip: "gorge" });
    const [door, profile] = frontsParts(f, wall);
    const top = 1400 + 360 - 18 - GORGE.space;
    expect(door!.to[2]).toBeCloseTo(top);
    expect(profile).toMatchObject({ name: "Profil gorge 1", gorge: true, from: [0, 0, top + GORGE.space - GORGE.height], to: [600, GORGE.depth, top + GORGE.space] });
    // No handle: its hinge cups only, the profile by the metre.
    expect(frontsHoleCount(f, wall)).toBe(2);
    expect(frontsHardware(f, wall)).toEqual([{ name: "Charnière à boîtier Ø35", quantity: 2 }, { name: GORGE_PROFILE, quantity: 0.6, unit: "m" }]);
    const d = docOf(wall, f);
    expect(isHardwareBody(d, "fr1#0")).toBe(false);
    expect(isHardwareBody(d, "fr1#1")).toBe(true);
    expect(bodyAppearance(d, "fr1#1", undefined)?.appearance.id).toBe("aluminium-brushed");
    expect(doorOf(d, "fr1#0")?.handles).toBeNull();
  });

  it("des tiroirs : une gorge par façade, 30 mm entre deux façades, les caissons sous les profilés", () => {
    const f = fronts({ layout: "drawers", drawers: 3, grip: "gorge" });
    const parts = frontsParts(f, base);
    const faces = parts.filter((p) => p.role?.kind === "drawer");
    const profiles = parts.filter((p) => p.gorge);
    expect(profiles.map((p) => p.name)).toEqual(["Profil gorge 1", "Profil gorge 2", "Profil gorge 3"]);
    expect(parts.slice(-3)).toEqual(profiles);
    expect(faces[0]!.to[2]).toBeCloseTo(720 - 18 - GORGE.space);
    expect(faces[0]!.from[2] - faces[1]!.to[2]).toBeCloseTo(GORGE.space);
    for (const [i, face] of faces.entries()) {
      expect(profiles[i]!.to[2]).toBeCloseTo(face.to[2] + GORGE.space);
      const side = parts.find((p) => p.name === `Tiroir ${i + 1} — côté gauche`)!;
      expect(side.to[2]).toBeLessThanOrEqual(profiles[i]!.from[2] - 5 + 1e-6);
    }
    expect(frontsHardware(f, base)).toEqual([{ name: "Coulisse de tiroir (paire)", quantity: 3 }, { name: GORGE_PROFILE, quantity: 1.8, unit: "m" }]);
    expect(frontsHoleCount(f, base)).toBe(0);
  });

  it("refuse les façades encastrées, les portes vitrées et un caisson trop bas", () => {
    expect(frontsProblem(fronts({ grip: "gorge", mount: "inset" }), wall)).toMatch(/en applique/);
    expect(frontsProblem(fronts({ grip: "gorge", style: "glass" }), wall)).toMatch(/porte vitrée/);
    expect(frontsProblem(fronts({ grip: "gorge", layout: "drawers", drawers: 4 }), wall)).toMatch(/trop bas/);
    expect(frontsProblem(fronts({ grip: "gorge", layout: "drawers", drawers: 3 }), wall)).toBeNull();
    expect(() => parseDocument({ ...docOf(wall, fronts()), features: [wall, { ...fronts(), grip: "bar" }] })).toThrow(/prise de main/);
  });

  it("le noyau construit la porte relevable sans poignée et son profilé", () => {
    const d = docOf(wall, fronts({ side: "top", grip: "gorge" }));
    const { statuses, bodies } = new Recomputer().recompute(d);
    expect(statuses.find((s) => s.id === "fr1")?.state).toBe("ok");
    expect(bodies).toEqual(expect.arrayContaining(["fr1#0", "fr1#1"]));
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
  });

  it("dans une cuisine, le plan garde la porte relevable et la gorge : la cuisine refaite les remet", () => {
    const plan = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: { A: [{ id: "i1", model: "base-bas-1-porte", width: 600 }] }, made: {} });
    const built = withKitchenBuilt(plan.doc, plan.id, {});
    if (typeof built === "string") throw new Error(built);
    const fr = built.doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.layout === "door")!;
    const changed = updateFeature(built.doc, fr.id, () => ({ ...fr, side: "top", grip: "gorge" }) satisfies FrontsFeature);
    const synced = syncKitchenPlans(built.doc, changed);
    expect(kitchenPlanIn(synced, plan.id)!.runs!.A![0]).toMatchObject({ side: "top", grip: "gorge" });
    const again = withKitchenBuilt(synced, plan.id, {});
    if (typeof again === "string") throw new Error(again);
    expect(again.doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.layout === "door")).toMatchObject({ side: "top", grip: "gorge" });
    // Its handles back: the plan forgets the gorge.
    const back = again.doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.layout === "door")!;
    const { grip: _gone, ...plain } = back;
    const restored = syncKitchenPlans(again.doc, updateFeature(again.doc, back.id, () => plain satisfies FrontsFeature));
    expect(kitchenPlanIn(restored, plan.id)!.runs!.A![0]!.grip).toBeUndefined();
  });
});
