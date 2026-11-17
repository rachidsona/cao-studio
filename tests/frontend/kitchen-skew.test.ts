/** Murs hors d'équerre : le Plan de cuisine prend un mur B ou C jusqu'à 5° de faux équerrage, ses meubles restant d'équerre au mur A. */
import { describe, expect, it } from "vitest";
import { cabinetBox } from "../../frontend/src/document/kitchen-catalog";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { linkedKitchen } from "../../frontend/src/document/kitchen-plan-room";
import { KITCHEN_PLAN, kitchenRuns, skewNotes, skewShift } from "../../frontend/src/document/kitchen-plan-shapes";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";
import type { KitchenFloorPlan, RoomFeature } from "../../frontend/src/document/types";
import { roomRuns } from "../../frontend/src/features/room-runs";

/** A room whose corner between wall 3 (B of wall 0) and wall 0 is `angle`°, the others square enough to close. */
const room = (angle: number): RoomFeature => ({
  id: "rm1", type: "room", name: "Cuisine", height: 2500, thickness: 200,
  walls: [{ length: 4000, angle: 90 }, { length: 3000, angle: 90 }, { length: 4000, angle: 90 }, { length: 3000, angle }],
  obstacles: [],
});
const plan = (patch: Partial<KitchenFloorPlan> = {}): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "L-left", ...patch });
type Box = [number[], number[]];
const overlaps = (a: Box, b: Box) => [0, 1, 2].every((i) => a[0][i]! < b[1][i]! - 1e-6 && b[0][i]! < a[1][i]! - 1e-6);

describe("murs hors d'équerre", () => {
  it("la pièce lue : refusée d'ordinaire, prise jusqu'à 5° pour la cuisine, le mur B mesuré d'équerre au mur A", () => {
    expect(roomRuns(room(92), 0, "L")).toMatch(/n'est pas droit/);
    const runs = roomRuns(room(92), 0, "L", 5);
    if (typeof runs === "string") throw new Error(runs);
    expect(runs.walls.B!.skew).toBe(2);
    expect(runs.walls.B!.length).toBeCloseTo(3000 * Math.cos((2 * Math.PI) / 180), 6);
    expect(roomRuns(room(97), 0, "L", 5)).toMatch(/5° d'écart au plus/);
    // As surveyed, a few millimetres off: the room still closes, wall B is the one before wall A.
    const surveyed = { ...room(91), walls: [{ length: 3600, angle: 90 }, { length: 2400, angle: 89.6 }, { length: 3600, angle: 90 }, { length: 2400, angle: 90.4 }] };
    expect(typeof roomRuns(surveyed, 0, "L", 5)).toBe("object");
  });

  it("le plan posé garde le faux équerrage ; un mur qui s'ouvre laisse un jour, dit avec sa cote", () => {
    const linked = linkedKitchen(plan(), room(92), 0);
    if (typeof linked === "string") throw new Error(linked);
    expect(linked.skew).toEqual({ B: 2 });
    expect(skewShift(linked, "B")).toBe(0);
    expect(skewNotes(linked)[0]).toMatch(/Mur B hors d'équerre \(angle de 92°\) : il s'écarte des meubles, jusqu'à 105 mm au bout/);
    expect(kitchenFromPlan(linked).notes.join(" ")).toMatch(/à scribe/);
  });

  it("un mur qui rentre : son linéaire avance juste assez, le mur A part de son devant, rien ne touche le mur ni ne se chevauche", () => {
    for (const through of [{}, { left: true }]) {
      const p = plan({ skew: { B: -2 }, through });
      const shift = skewShift(p, "B");
      expect(shift).toBeCloseTo(2400 * Math.tan((2 * Math.PI) / 180), 6);
      const [a, b] = kitchenRuns(p);
      expect(a!.line).toBeCloseTo(shift, 6);
      expect(Math.min(...b!.zone.outline.map((q) => q[0]))).toBeCloseTo(shift, 6);
      const layout = kitchenFromPlan({ ...p, ...proposeKitchen(p) });
      const boxes: Box[] = layout.units.map((u) => cabinetBox(u));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${JSON.stringify(through)} : ${i} et ${j}`).toBe(false);
      // Wall B comes in towards +X going away from the corner: x = t × tan 2° at a distance t.
      const wallAt = (y: number) => -y * Math.tan((2 * Math.PI) / 180);
      for (const [lo, hi] of boxes) expect(lo[0]! >= wallAt(lo[1]!) - 1e-6 && lo[0]! >= wallAt(hi[1]!) - 1e-6).toBe(true);
      expect(skewNotes(p)[0]).toMatch(/avancés de 84 mm/);
    }
  });
});
