/** Implantation de cuisine : modules du commerce, angle en L, caissons tournés avec leurs façades. */
import { beforeAll, describe, expect, it } from "vitest";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { KITCHEN, kitchenLayout, kitchenProblem, splitRun } from "../../frontend/src/features/kitchen-layout";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

type Box = [number, number, number][];
const overlaps = (a: Box, b: Box) => [0, 1, 2].every((i) => a[0]![i]! < b[1]![i]! - 1e-6 && b[0]![i]! < a[1]![i]! - 1e-6);

describe("implantation de cuisine", () => {
  it("découpe un mur en modules du commerce, le reste en fileur", () => {
    expect(splitRun(3000)).toEqual({ widths: [600, 600, 600, 600, 600], filler: 0 });
    expect(splitRun(2650)).toEqual({ widths: [600, 600, 600, 600], filler: 250 });
    expect(splitRun(3420)).toEqual({ widths: [600, 600, 600, 600, 600, 400], filler: 20 });
  });

  it("un mur : bas, hauts, plan de travail et mur", () => {
    const { units, boxes } = kitchenLayout({ ...KITCHEN, lengthA: 2450 });
    expect(units.map((u) => `${u.name}:${u.width}:${u.layout}`)).toEqual([
      "Bas A1:600:drawers", "Bas A2:600:door", "Bas A3:600:drawers", "Bas A4:600:door",
      "Haut A1:600:door", "Haut A2:600:door", "Haut A3:600:door", "Haut A4:600:door",
    ]);
    expect(boxes.map((b) => b.name)).toEqual(["Fileur A", "Plan de travail A", "Mur A"]);
    const filler = boxes[0]!;
    expect(filler.to[0] - filler.from[0]).toBe(50);
  });

  it("en L : l'angle est mort et fermé, rien ne se chevauche", () => {
    const { units, boxes } = kitchenLayout({ ...KITCHEN, layout: "L", lengthA: 3000, lengthB: 2400, wallUnits: false });
    const runB = units.filter((u) => u.name.startsWith("Bas B"));
    expect(runB.every((u) => u.rotation === 90)).toBe(true);
    // Boxes of the base units on the floor, as placed (run B turned: x from 0 to the depth).
    const unitBoxes: Box[] = units.map((u) => (u.rotation ? [[u.origin[0] - u.depth, u.origin[1], 0], [u.origin[0], u.origin[1] + u.width, u.height]] : [[u.origin[0], u.origin[1], 0], [u.origin[0] + u.width, u.origin[1] + u.depth, u.height]]));
    const all: Box[] = [...unitBoxes, ...boxes.filter((b) => b.kind !== "wall").map((b) => [b.from, b.to] as Box)];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i]!, all[j]!), `${i} et ${j}`).toBe(false);
    expect(boxes.filter((b) => b.name.startsWith("Fileur d'angle"))).toHaveLength(2);
  });

  it("refuse un mur trop court ou un plafond trop bas", () => {
    expect(kitchenProblem({ ...KITCHEN, lengthA: 200 })).toMatch(/trop court/);
    expect(kitchenProblem({ ...KITCHEN, wallHeight: 2000 })).toMatch(/plafond/);
    expect(kitchenProblem(KITCHEN)).toBeNull();
  });

  it("un caisson tourné de 90° fait face à +X, ses façades avec lui", () => {
    const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "B", origin: [560, -600, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through", rotation: 90 };
    const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "F", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
    const doc: CadDocument = { ...createReferencePlate(), features: [cabinet, fronts] };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    expect(() => parseDocument(JSON.parse(JSON.stringify({ ...doc, features: [{ ...cabinet, rotation: 45 }] })))).toThrow();
    const r = new Recomputer();
    const { statuses } = r.recompute(doc);
    expect(statuses.map((s) => s.state)).toEqual(["ok", "ok"]);
    const box = (id: string, i: number) => {
      const out = r.output(id);
      return bodyMetrics(out?.kind === "solids" ? out.shapes[i]! : (null as never)).bbox.map((p) => p.map((v) => Math.round(v * 1000) / 1000));
    };
    // The side from X = 3 (behind it, the 3 mm back against the wall) to the depth; the door in front, X 560 to 579.
    expect(box("cb1", 0)[0]![0]).toBeCloseTo(3, 3);
    expect(box("cb1", 0)[1]![0]).toBeCloseTo(560, 3);
    const door = box("fr1", 0);
    expect(door[0]![0]).toBeCloseTo(560, 3);
    expect(door[1]![0]).toBeCloseTo(579, 3);
    expect(door[0]![1]).toBeCloseTo(-598.5, 3);
  });
});
