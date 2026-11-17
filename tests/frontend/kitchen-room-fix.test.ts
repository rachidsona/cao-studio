/** Une cuisine aux cotes tapées qui entre dans les murs de la Pièce relevée : corrigée en la posant sur la pièce. */
import { describe, expect, it } from "vitest";
import { cabinetBox } from "../../frontend/src/document/kitchen-catalog";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { kitchenRoomFixes, planOnRoom, withKitchenOnRoom } from "../../frontend/src/document/kitchen-room-fix";
import { createReferencePlate, type CabinetFeature, type CadDocument, type RoomFeature } from "../../frontend/src/document/types";
import { roomClashes } from "../../frontend/src/features/room-plan";

// The room as the Pièce tool makes it (3 × 2,5 m, a door on wall A), and a U kitchen typed 3,6 m wide in it.
const room: RoomFeature = {
  id: "pc1", type: "room", name: "Pièce 1", height: 2500, thickness: 200,
  walls: [{ length: 3000, angle: 90 }, { length: 2500, angle: 90 }, { length: 3000, angle: 90 }, { length: 2500, angle: 90 }],
  obstacles: [{ kind: "door", wall: 2, at: 1000, width: 830, height: 2100 }],
};

function typedKitchen(): { doc: CadDocument; plan: string } {
  const base: CadDocument = { ...createReferencePlate(), features: [room] };
  const typed = { ...KITCHEN_PLAN, model: "U" as const, lengthA: 3600, lengthB: 2400, lengthC: 2400 };
  const { doc, id } = withKitchenPlan(base, typed);
  const built = withKitchenBuilt(doc, id, proposeKitchen(typed, undefined));
  if (typeof built === "string") throw new Error(built);
  return { doc: built.doc, plan: id };
}

const cabinets = (doc: CadDocument) => doc.features.filter((f): f is CabinetFeature => f.type === "cabinet" && !f.suppressed);
const inWalls = (doc: CadDocument) => cabinets(doc).filter((c) => roomClashes(room, cabinetBox(c)).hits.length > 0);

describe("cuisine qui entre dans les murs de la pièce", () => {
  it("propose de la poser sur la pièce, sur le mur qui la déplace le moins", () => {
    const { doc, plan } = typedKitchen();
    const clashing = inWalls(doc);
    expect(clashing.length).toBeGreaterThan(0);
    const fixes = kitchenRoomFixes(doc, clashing.map((c) => c.id));
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ plan, wall: 0 });
    expect(fixes[0]!.label).toMatch(/Pièce 1/);
  });

  it("une fois posée, elle prend les cotes de la pièce et plus aucun caisson n'entre dans un mur", () => {
    const { doc, plan } = typedKitchen();
    const [fix] = kitchenRoomFixes(doc, inWalls(doc).map((c) => c.id));
    const fixed = withKitchenOnRoom(doc, fix!);
    if (typeof fixed === "string") throw new Error(fixed);
    const after = kitchenPlanIn(fixed.doc, plan)!;
    expect(after.room).toEqual({ id: "pc1", wall: 0 });
    expect([after.lengthA, after.lengthB, after.lengthC]).toEqual([3000, 2500, 2500]);
    expect(cabinets(fixed.doc).length).toBeGreaterThan(0);
    expect(inWalls(fixed.doc).map((c) => c.name)).toEqual([]);
    // Nothing more to fix: the kitchen follows its room.
    expect(kitchenRoomFixes(fixed.doc, cabinets(fixed.doc).map((c) => c.id))).toEqual([]);
  });

  it("rien à proposer sans pièce, ni pour un corps qui n'est pas de la cuisine", () => {
    const { doc } = typedKitchen();
    const noRoom = { ...doc, features: doc.features.filter((f) => f.type !== "room") };
    expect(kitchenRoomFixes(noRoom, cabinets(noRoom).map((c) => c.id))).toEqual([]);
    expect(kitchenRoomFixes(doc, ["inconnu"])).toEqual([]);
  });
});

describe("un plan neuf dans un projet qui a une pièce", () => {
  const base: CadDocument = { ...createReferencePlate(), features: [room] };
  const typed = { ...KITCHEN_PLAN, model: "U" as const, lengthA: 3600, lengthB: 2400, lengthC: 2400 };

  it("est posé d'office sur la pièce : ses cotes sont celles des murs, aucun caisson proposé n'entre dans un mur", () => {
    const plan = planOnRoom(base, typed);
    expect(plan.room).toEqual({ id: "pc1", wall: 0 });
    expect(plan.lengthA).toBeLessThanOrEqual(3000);
    expect(plan.lengthB).toBeLessThanOrEqual(2500);
    const { doc, id } = withKitchenPlan(base, plan);
    const built = withKitchenBuilt(doc, id, proposeKitchen(plan, undefined));
    if (typeof built === "string") throw new Error(built);
    expect(cabinets(built.doc).length).toBeGreaterThan(0);
    expect(inWalls(built.doc)).toEqual([]);
  });

  it("une autre forme reprend ses cotes sur son mur ; sans pièce, ou sa pièce d'un autre projet, les cotes tapées restent", () => {
    const onRoom = planOnRoom(base, { ...typed, model: "I" as const });
    expect(planOnRoom(base, { ...onRoom, model: "U" as const, lengthB: 9999 })).toMatchObject({ room: { id: "pc1", wall: 0 }, lengthB: planOnRoom(base, typed).lengthB });
    expect(planOnRoom(createReferencePlate(), typed)).toEqual(typed);
    const elsewhere = planOnRoom(createReferencePlate(), { ...onRoom, room: { id: "pc9", wall: 0 } });
    expect(elsewhere.room).toBeUndefined();
  });
});

