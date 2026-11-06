/** Le dressing rempli d'après les besoins du client, et les contrôles du plan. */
import { describe, expect, it } from "vitest";
import { planChecks } from "../../frontend/src/document/dressing-check";
import { NO_NEEDS, proposeNeeds, withNeeds } from "../../frontend/src/document/dressing-needs";
import { planOf, withPlan, withZonePartition, withZoneSliding } from "../../frontend/src/document/plan-layout";
import { linkedPlan, planObstacles } from "../../frontend/src/document/plan-room";
import { PLAN, planCeiling, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type CadDocument, type DressingPlan, type RoomFeature, type SketchFeature } from "../../frontend/src/document/types";

const empty = (): CadDocument => ({ ...createReferencePlate(), features: [] });
const plan = (patch: Partial<DressingPlan> = {}): DressingPlan => ({ ...PLAN, ...patch });
const room = (obstacles: RoomFeature["obstacles"] = []): RoomFeature => ({ id: "rm1", type: "room", name: "Chambre", walls: [{ length: 4000, angle: 90 }, { length: 3000, angle: 90 }, { length: 4000, angle: 90 }, { length: 3000, angle: 90 }], height: 2600, thickness: 150, obstacles });

describe("remplissage selon les besoins", () => {
  const free = (p: DressingPlan) => planZones(p).filter((z) => z.kind === "run");

  it("transforme les besoins en modules, et le bilan couvre la demande", () => {
    const p = plan({ model: "U" });
    const proposal = proposeNeeds({ ...NO_NEEDS, longRod: 1.8, shortRod: 1.8, shoes: 20, drawers: 6, shelves: 2 }, p, free(p));
    const kinds = proposal.zones.flatMap((z) => z.kinds);
    expect(kinds.filter((k) => k === "long")).toHaveLength(2);
    expect(kinds.filter((k) => k === "drawers")).toHaveLength(2);
    expect(proposal.left).toEqual([]);
    for (const row of proposal.report) expect(row.held, row.label).toBeGreaterThanOrEqual(row.asked);
  });

  it("partage le manque de place entre les besoins", () => {
    const p = plan({ model: "L-right", lengthA: 3000, lengthC: 2500 });
    const kinds = proposeNeeds({ longRod: 5, shortRod: 5, shoes: 40, drawers: 9, shelves: 8 }, p, free(p)).zones.flatMap((z) => z.kinds);
    for (const kind of ["long", "double", "drawers", "shoes", "shelves"] as const) expect(kinds, kind).toContain(kind);
  });

  it("annonce ce qui ne tient pas", () => {
    const p = plan({ model: "I", lengthA: 1200 });
    const proposal = proposeNeeds({ ...NO_NEEDS, longRod: 6 }, p, free(p));
    expect(proposal.left.length).toBeGreaterThan(0);
    expect(proposal.report[0]!.held).toBeLessThan(6);
  });

  it("garde les tiroirs loin des bouts du mur", () => {
    const p = plan({ model: "I", lengthA: 4000 });
    const { kinds } = proposeNeeds({ ...NO_NEEDS, longRod: 1.8, shortRod: 1.8, drawers: 3 }, p, free(p)).zones[0]!;
    expect(kinds[0]).toBe("long");
    expect(kinds.at(-1)).toBe("double");
  });

  it("pose une Répartition par zone et un module par case", () => {
    const placed = withPlan(empty(), plan({ model: "I" }));
    const p = planOf(placed.doc)!.dressingPlan!;
    const proposal = proposeNeeds({ ...NO_NEEDS, longRod: 1, drawers: 3 }, p, free(p));
    const doc = withNeeds(placed.doc, placed.id, proposal, p.thickness);
    if (typeof doc === "string") throw new Error(doc);
    expect(doc.features.some((f) => f.type === "niche" && f.fill === "rod")).toBe(true);
    expect(doc.features.some((f) => f.type === "niche" && f.fill === "drawers")).toBe(true);
    expect(planOf(doc)!.dressingPlan!.made?.A).toBeDefined();
  });
});

describe("plan posé sur la pièce", () => {
  it("reprend les longueurs des murs et se pose sur le mur choisi", () => {
    const next = linkedPlan(plan({ model: "U", height: 2800 }), room(), 1);
    if (typeof next === "string") throw new Error(next);
    expect(next).toMatchObject({ lengthA: 3000, lengthB: 4000, lengthC: 4000, height: 2600, room: { id: "rm1", wall: 1 } });
    expect(next.place).toEqual({ quarter: 3, origin: [4000, 0] });
  });

  it("tourne avec le plan : l'esquisse, le plafond en pente", () => {
    const next = linkedPlan(plan({ model: "I", roof: "left", roofLow: 1300, height: 2500 }), room(), 1) as DressingPlan;
    expect(planCeiling(next)).toEqual({ axis: "y", at: 0, rise: -0.4, height: 1300, cap: 2500 });
    const placed = withPlan(empty(), next);
    const made = withZonePartition(placed.doc, placed.id, planZones(next)[0]!);
    if (typeof made === "string") throw new Error(made);
    const sketch = made.doc.features.find((f) => f.id === made.sketch) as SketchFeature;
    expect(sketch.frame).toMatchObject({ origin: [4000, 0, 0], xDir: [0, -1, 0] });
  });

  it("marque les ouvertures des murs utilisés, dans le repère du plan", () => {
    const r = room([{ kind: "window", wall: 0, at: 500, width: 1000, height: 1200, sill: 900 }, { kind: "door", wall: 3, at: 1000, width: 900, height: 2100 }, { kind: "door", wall: 2, at: 100, width: 900, height: 2100 }]);
    const next = linkedPlan(plan({ model: "L-left" }), r, 0) as DressingPlan;
    const marks = planObstacles(next, r);
    expect(marks.map((m) => [m.kind, m.from, m.to])).toEqual([["window", [500, 0], [1500, 0]], ["door", [0, -2000], [0, -1100]]]);
  });

  it("refuse un dos à dos, qui ne s'appuie sur aucun mur", () => {
    expect(linkedPlan(plan({ model: "back" }), room(), 0)).toMatch(/aucun mur/);
  });
});

describe("contrôle du plan", () => {
  const made = (patch: Partial<DressingPlan>, id = "A") => {
    const placed = withPlan(empty(), plan(patch));
    const p = planOf(placed.doc)!.dressingPlan!;
    const zone = planZones(p).find((z) => z.id === id)!;
    const out = withZonePartition(placed.doc, placed.id, zone);
    if (typeof out === "string") throw new Error(out);
    return { ...out, planId: placed.id, zone };
  };

  it("signale un passage étroit une seule fois", () => {
    const { doc } = made({ model: "facing", aisle: 500 });
    expect(planChecks(doc, planOf(doc)!.dressingPlan!).filter((m) => m.startsWith("Passage"))).toEqual(["Passage de 50 cm seulement entre Mur A et Mur D."]);
  });

  it("voit la case d'angle bloquée par le mur voisin, quand ses portes existent", () => {
    const { doc, sketch } = made({ model: "L-left" });
    const withDoors: CadDocument = { ...doc, features: doc.features.map((f) => (f.id === sketch && f.type === "sketch" ? { ...f, offsets: f.offsets?.map((o) => (o.step?.kind === "partition" ? { ...o, step: { ...o.step, doors: { gap: 3, thickness: 18, handles: false } as never } } : o)) } : f)) };
    const found = planChecks(withDoors, planOf(withDoors)!.dressingPlan!);
    expect(found.some((m) => /Mur A, case 1 : la porte ne s'ouvre pas/.test(m))).toBe(true);
    expect(found.some((m) => /Mur A, case 3/.test(m))).toBe(false);
  });

  it("refuse portes coulissantes sous un rampant, et signale les portes en double", () => {
    const { doc, planId, zone } = made({ model: "I", roof: "left", roofLow: 1300 });
    const next = withZoneSliding(doc, planId, zone, 3);
    expect(planChecks(next, planOf(next)!.dressingPlan!).some((m) => /rampant/.test(m))).toBe(true);
    expect(next.features.some((f) => f.type === "trim" && f.name.includes("coulissantes"))).toBe(false);
  });

  it("dit quelle ouverture de la pièce le dressing cache", () => {
    const r = room([{ kind: "window", wall: 0, at: 500, width: 1000, height: 1200, sill: 900 }, { kind: "beam", wall: 0, depth: 800, drop: 300 }]);
    const p = linkedPlan(plan({ model: "I" }), r, 0) as DressingPlan;
    const doc: CadDocument = { ...empty(), features: [r] };
    const found = planChecks(doc, p);
    expect(found).toContain("La fenêtre du mur A est derrière Mur A.");
    expect(found.some((m) => /Plafond bas sur le mur A/.test(m))).toBe(true);
  });
});

describe("portes coulissantes d'une zone", () => {
  it("posent leurs vantaux et leurs rails, et s'enlèvent", () => {
    const placed = withPlan(empty(), plan({ model: "I" }));
    const zone = planZones(planOf(placed.doc)!.dressingPlan!)[0]!;
    const made = withZonePartition(placed.doc, placed.id, zone);
    if (typeof made === "string") throw new Error(made);
    const doors = withZoneSliding(made.doc, placed.id, zone, 3);
    const trim = doors.features.find((f) => f.type === "trim");
    if (trim?.type !== "trim") throw new Error("pas de portes");
    expect(trim.parts.filter((p) => p.name.startsWith("Porte coulissante"))).toHaveLength(3);
    expect(trim.parts.filter((p) => p.hardware)).toHaveLength(2);
    const none = withZoneSliding(doors, placed.id, zone, 0);
    expect(none.features.some((f) => f.type === "trim")).toBe(false);
  });

  it("attendent la Répartition d'une zone encore libre", () => {
    const placed = withPlan(empty(), plan({ model: "I" }));
    const zone = planZones(planOf(placed.doc)!.dressingPlan!)[0]!;
    const asked = withZoneSliding(placed.doc, placed.id, zone, 2);
    expect(asked.features.some((f) => f.type === "trim")).toBe(false);
    const made = withZonePartition(asked, placed.id, zone);
    if (typeof made === "string") throw new Error(made);
    expect(made.doc.features.some((f) => f.type === "trim")).toBe(true);
  });
});
