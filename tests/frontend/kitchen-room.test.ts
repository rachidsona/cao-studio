/** Cuisine sur une Pièce relevée : murs repris, porte et fenêtre contournées, électroménager, U, îlot, angle. */
import { beforeAll, describe, expect, it } from "vitest";
import { kitchenPlan } from "../../frontend/src/document/kitchen-plan";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { ergonomics } from "../../frontend/src/features/kitchen-appliances";
import { KITCHEN, kitchenLayout, kitchenProblem, type KitchenSettings } from "../../frontend/src/features/kitchen-layout";
import type { RoomInput } from "../../frontend/src/features/room-plan";
import { freeStretches, placeBox, roomRuns } from "../../frontend/src/features/room-runs";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

type Box = [number, number, number][];
const overlaps = (a: Box, b: Box) => [0, 1, 2].every((i) => a[0]![i]! < b[1]![i]! - 1e-6 && b[0]![i]! < a[1]![i]! - 1e-6);

// A 4 × 3 m room: wall A (4 m, a window 1.2 m wide at 1.4 m), B (3 m, a door 0.9 m at 1.5 m), C, D.
const ROOM: RoomInput = {
  walls: [{ length: 4000, angle: 90 }, { length: 3000, angle: 90 }, { length: 4000, angle: 90 }, { length: 3000, angle: 90 }],
  height: 2500, thickness: 200,
  obstacles: [{ kind: "window", wall: 0, at: 1400, width: 1200, height: 1100, sill: 1000 }, { kind: "door", wall: 1, at: 1500, width: 900, height: 2100 }],
};

describe("cuisine dans une pièce relevée", () => {
  it("prend le mur A et ses voisins, et ce qui gêne en distance depuis l'angle", () => {
    const runs = roomRuns(ROOM, 1, "L");
    if (typeof runs === "string") throw new Error(runs);
    // Wall 1 (B of the room) as wall A: it runs along −Y from (4000, 0); wall B is the room's wall before it.
    expect(runs.place).toEqual({ quarter: 3, origin: [4000, 0] });
    expect(runs.walls.A!.spans).toEqual([{ from: 1500, to: 2400, what: "la porte du mur B", bottom: 0, top: 2100 }]);
    // The room's wall A, read back from its end: the window from 4000 − 2600 to 4000 − 1400.
    expect(runs.walls.B!.spans[0]).toMatchObject({ from: 1400, to: 2600 });
    expect(freeStretches(runs.walls.A!.spans, 0, 3000, 0, 900, 50)).toEqual([[0, 1450], [2450, 3000]]);
    // A box of the kitchen's frame turned a quarter clockwise onto that wall.
    expect(placeBox(runs.place, [0, -560, 0], [600, 0, 870])).toEqual([[3440, -600, 0], [4000, 0, 870]]);
  });

  it("refuse un angle qui n'est pas droit", () => {
    const skew: RoomInput = { ...ROOM, walls: [{ length: 4000, angle: 100 }, ...ROOM.walls.slice(1)] };
    expect(roomRuns(skew, 1, "L")).toMatch(/pas droit|pas d.équerre/);
  });

  it("laisse la porte libre, et pas de meuble haut devant la fenêtre", () => {
    const runs = roomRuns(ROOM, 0, "L");
    if (typeof runs === "string") throw new Error(runs);
    const s: KitchenSettings = { ...KITCHEN, layout: "L", lengthA: 4000, lengthB: 3000 };
    const { units, boxes, notes } = kitchenLayout(s, runs.walls);
    // Wall B of the kitchen is the room's wall D (no door); wall A has the window between 1400 and 2600.
    const highs = units.filter((u) => u.name.startsWith("Haut A"));
    expect(highs.every((u) => u.origin[0] + u.width <= 1350 + 1e-6 || u.origin[0] >= 2650 - 1e-6)).toBe(true);
    expect(notes.join(" ")).toMatch(/fenêtre/);
    expect(boxes.some((b) => b.kind === "wall")).toBe(false);
    // With the door wall as wall A: no base unit in front of the door.
    const other = roomRuns(ROOM, 1, "I");
    if (typeof other === "string") throw new Error(other);
    const k = kitchenLayout({ ...KITCHEN, lengthA: 3000 }, other.walls);
    expect(k.units.filter((u) => u.name.startsWith("Bas")).every((u) => u.origin[0] + u.width <= 1450 + 1e-6 || u.origin[0] >= 2450 - 1e-6)).toBe(true);
    expect(k.boxes.filter((b) => b.kind === "worktop")).toHaveLength(2);
  });

  it("place l'électroménager : évier sous la fenêtre, lave-vaisselle à côté, plaque plus loin, hotte au-dessus", () => {
    const runs = roomRuns(ROOM, 0, "I");
    if (typeof runs === "string") throw new Error(runs);
    const { units, boxes, ergonomics: e } = kitchenLayout({ ...KITCHEN, lengthA: 4000, appliances: true, fridge: true, splashback: true, kick: true }, runs.walls);
    const sink = units.find((u) => u.name.startsWith("Évier"))!;
    expect(sink.top).toBe("rails");
    expect(sink.origin[0] + sink.width > 1400 && sink.origin[0] < 2600).toBe(true);
    expect(boxes.map((b) => b.name)).toEqual(expect.arrayContaining(["Lave-vaisselle", "Plaque de cuisson", "Four", "Hotte", "Crédence A", "Plinthe A"]));
    expect(units.some((u) => u.name === "Colonne réfrigérateur")).toBe(true);
    const worktop = boxes.find((b) => b.kind === "worktop")!;
    expect(worktop.holes!.map((h) => h.appliance)).toEqual(expect.arrayContaining(["sink-under", "hob-60"]));
    expect([...e.ok, ...e.warn].join(" ")).toMatch(/triangle/);
    // Nothing overlaps (furniture, appliances, worktop).
    const all: Box[] = [
      ...units.map((u): Box => [[u.origin[0], u.origin[1], u.origin[2]], [u.origin[0] + u.width, u.origin[1] + u.depth, u.origin[2] + u.height]]),
      // (the oven sits inside its unit, the hob on the worktop, the duct over the hood)
      ...boxes.filter((b) => !["Conduit de hotte", "Plaque de cuisson", "Four"].includes(b.name)).map((b): Box => [b.from, b.to]),
    ];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i]!, all[j]!), `${i} et ${j}`).toBe(false);
  });

  it("en U, avec meubles d'angle et un îlot : rien ne se chevauche", () => {
    const s: KitchenSettings = { ...KITCHEN, layout: "U", lengthA: 3600, lengthB: 2600, lengthC: 2600, corner: "unit", island: 1800, passage: 1100, wallUnits: false };
    expect(kitchenProblem(s)).toBeNull();
    const { units, boxes, ergonomics: e } = kitchenLayout(s);
    const box = (u: (typeof units)[number]): Box => {
      const [o, w, d] = [u.origin, u.width, u.depth];
      const lo = u.rotation === 0 ? [o[0], o[1]] : u.rotation === 90 ? [o[0] - d, o[1]] : u.rotation === 180 ? [o[0] - w, o[1] - d] : [o[0], o[1] - w];
      const hi = u.rotation === 0 ? [o[0] + w, o[1] + d] : u.rotation === 90 ? [o[0], o[1] + w] : u.rotation === 180 ? [o[0], o[1]] : [o[0] + d, o[1]];
      return [[lo[0]!, lo[1]!, o[2]], [hi[0]!, hi[1]!, o[2] + u.height]];
    };
    expect(units.filter((u) => u.name.startsWith("Meuble d'angle"))).toHaveLength(2);
    expect(units.filter((u) => u.name.startsWith("Îlot")).every((u) => u.rotation === 180)).toBe(true);
    const all: Box[] = [...units.map(box), ...boxes.filter((b) => b.kind !== "wall").map((b): Box => [b.from, b.to])];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i]!, all[j]!), `${i} et ${j}`).toBe(false);
    expect(e.ok.join(" ")).toMatch(/Passage devant l'îlot/);
  });

  it("l'ergonomie : un triangle trop grand, un passage trop étroit", () => {
    const e = ergonomics({ sink: [0, 0], hob: [4000, 0], fridge: [4000, -3000] }, { islandPassage: 800 });
    expect(e.warn.join(" ")).toMatch(/trop de pas/);
    expect(e.warn.join(" ")).toMatch(/trop étroit/);
  });

  it("toute la cuisine se construit, plan découpé compris", () => {
    const runs = roomRuns(ROOM, 0, "L");
    if (typeof runs === "string") throw new Error(runs);
    const doc: CadDocument = createReferencePlate();
    const plan = kitchenPlan({ ...doc, features: [] }, { ...KITCHEN, layout: "L", lengthA: 4000, lengthB: 3000, appliances: true, fridge: true, splashback: true, kick: true, corner: "unit" }, "lacquer-white", "solid-oak", runs);
    expect(plan.problems).toEqual([]);
    expect(plan.features.some((f) => f.type === "machining")).toBe(true);
    const r = new Recomputer();
    const { statuses } = r.recompute({ ...doc, features: plan.features });
    expect(statuses.filter((s) => s.state !== "ok").map((s) => `${s.id} ${s.message}`)).toEqual([]);
    const worktop = plan.features.find((f) => f.type === "machining")!;
    const out = r.output(worktop.id);
    expect(out?.kind).toBe("solid");
    if (out?.kind === "solid") expect(bodyMetrics(out.shape).volume).toBeGreaterThan(0);
  });
});
