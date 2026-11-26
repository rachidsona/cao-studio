/** La pièce d'un Plan de cuisine fermée d'office : les murs qui manquent, le sol, le plafond, et d'où on la regarde. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, kitchenRunOf, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { ROOM_MADE, roomBounds, roomLook, roomShell } from "../../frontend/src/document/kitchen-plan-shell";
import { bodyInfo } from "../../frontend/src/document/materials";
import { createReferencePlate, type KitchenFloorPlan } from "../../frontend/src/document/types";
import { flatsBehind } from "../../frontend/src/viewport/wall-cutaway";

const plan = (more: Partial<KitchenFloorPlan>): KitchenFloorPlan => ({ ...KITCHEN_PLAN, island: false, ...more });
const spans = (p: KitchenFloorPlan) => Object.fromEntries(roomShell(p).map((b) => [b.name, [b.from, b.to].map((v) => v.map(Math.round))]));

describe("pièce d'un plan de cuisine", () => {
  it("un mur droit : la pièce large comme lui, profonde de 3 m, fermée sur ses trois autres côtés", () => {
    const p = plan({ model: "I", lengthA: 3600 });
    expect(roomBounds(p)).toEqual({ x: [0, 3600], y: [-3000, 0] });
    expect(spans(p)).toEqual({
      "Mur D": [[0, -3100, 0], [3600, -3000, 2500]],
      // The side walls through the corners, wall A's too (it stops at its ends).
      "Mur B": [[-100, -3100, 0], [0, 100, 2500]],
      "Mur C": [[3600, -3100, 0], [3700, 100, 2500]],
      Sol: [[0, -3000, -20], [3600, 0, 0]],
      Plafond: [[-100, -3100, 2500], [3700, 100, 2520]],
    });
    expect(roomShell(p).find((b) => b.name === "Sol")?.look).toBe("wood-oak");
  });

  it("en L : le mur B du plan continué jusqu'au fond, le mur C et le mur d'en face ajoutés", () => {
    const p = plan({ model: "L-left", lengthA: 3600, lengthB: 2400 });
    expect(Object.keys(spans(p))).toEqual(["Mur D", "Mur B, suite", "Mur C", "Sol", "Plafond"]);
    // From the end of wall B (2,40 m) to the far corner; wall C through the far corner, up to wall A's own corner.
    expect(spans(p)["Mur B, suite"]).toEqual([[-100, -3100, 0], [0, -2400, 2500]]);
    expect(spans(p)["Mur C"]).toEqual([[3600, -3100, 0], [3700, 100, 2500]]);
    // A wall B longer than 3 m: the room as deep as it, nothing to add on its side.
    const deep = plan({ model: "L-left", lengthA: 3600, lengthB: 4200 });
    expect(roomBounds(deep).y).toEqual([-4200, 0]);
    expect(Object.keys(spans(deep))).toEqual(["Mur D", "Mur B, suite", "Mur C", "Sol", "Plafond"]);
    expect(spans(deep)["Mur B, suite"]).toEqual([[-100, -4300, 0], [0, -4200, 2500]]);
  });

  it("parallèle : le mur d'en face est celui du plan ; un îlot : 1,20 m de passage derrière lui", () => {
    const facing = plan({ model: "facing", lengthA: 3600, lengthD: 3600, aisle: 1200 });
    const far = roomBounds(facing).y[0];
    expect(far).toBeLessThan(-1200);
    expect(Object.keys(spans(facing))).toEqual(["Mur B", "Mur C", "Sol", "Plafond"]);
    const island = plan({ model: "I", lengthA: 4000, island: true, passage: 1100, islandDepth: 900 });
    expect(roomBounds(island).y[0]).toBe(-(island.depth + 1100 + 900 + 1200));
  });

  it("bâtie avec le plan, à part de ses linéaires ; sans murs, pas de pièce", () => {
    const base = withKitchenPlan(createReferencePlate(), plan({ model: "I", lengthA: 3600, runs: {}, made: {} }));
    const built = withKitchenBuilt(base.doc, base.id, {});
    if (typeof built === "string") throw new Error(built);
    const made = kitchenPlanIn(built.doc, base.id)!.made!;
    const names = (ids: string[]) => ids.map((id) => built.doc.features.find((f) => f.id === id)).filter((f) => f?.type === "extrude").map((f) => f!.name);
    expect(names(made.A!)).toEqual(["Mur A"]);
    expect(names(made[ROOM_MADE]!)).toEqual(["Mur D", "Mur B", "Mur C", "Sol", "Plafond"]);
    // Of the room (out of the cut list), the floor in its wood; of no run.
    const floor = made[ROOM_MADE]!.find((id) => built.doc.features.find((f) => f.id === id)?.name === "Sol")!;
    expect(bodyInfo(built.doc, floor)).toMatchObject({ room: true, appearance: "wood-oak" });
    expect(kitchenRunOf(built.doc, floor)).toBeNull();
    expect(kitchenRunOf(built.doc, made.A![made.A!.length - 1]!)).toEqual({ plan: base.id, run: "A" });
    // Built again: one room still; the walls taken off: none.
    const again = withKitchenBuilt(built.doc, base.id, {});
    if (typeof again === "string") throw new Error(again);
    expect(again.doc.features.filter((f) => f.name === "Sol")).toHaveLength(1);
    const bare = withKitchenBuilt(built.doc, base.id, { noWalls: true });
    if (typeof bare === "string") throw new Error(bare);
    expect(bare.doc.features.filter((f) => /^(Mur|Sol|Plafond)/.test(f.name)).map((f) => f.name)).toEqual([]);
    expect(kitchenPlanIn(bare.doc, base.id)!.made![ROOM_MADE]).toBeUndefined();
  });

  it("vue de l'intérieur : vers le coin des linéaires, l'œil plus bas que le plafond ; le plafond s'efface vu de dessus", () => {
    const l = roomLook(plan({ model: "L-left", lengthA: 3600, lengthB: 2400 }));
    expect(l.target).toEqual([1800, -1200, 1125]);
    // From the right of a kitchen on walls A and B, from the room, a little above.
    expect(l.way[0]).toBeGreaterThan(0.4);
    expect(l.way[1]).toBeLessThan(-0.7);
    expect(l.way[2]).toBeGreaterThan(0);
    expect(l.way[2]).toBeLessThan(0.15);
    expect(l.box).toEqual([[0, -2400, 0], [3600, 0, 2500]]);
    expect(roomLook(plan({ model: "L-right", lengthA: 3600, lengthC: 2400 })).way[0]).toBeLessThan(-0.4);
    const flats = new Map<string, [number, number]>([["floor", [-20, 0]], ["ceiling", [2500, 2520]]]);
    expect(flatsBehind(flats, 1250, 1600)).toEqual([]);
    expect(flatsBehind(flats, 1250, 4000)).toEqual(["ceiling"]);
    expect(flatsBehind(flats, 1250, -500)).toEqual(["floor"]);
  });
});
