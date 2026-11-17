/** Magie extrusion sur le flanc d'un cylindre : rainure tout autour, rectangle creusé, perçage radial, bossage. */
import { beforeAll, describe, expect, it } from "vitest";
import { curvedCircle, cylinderOf, facePlace, sectorRecess } from "../../frontend/src/features/curved-offset";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const cylinder = cylinderOf([{ center: [0, 0, 0], radius: 40 }, { center: [0, 0, 60], radius: 40 }])!;
const planeOf = (n: number[]) => (Math.abs(n[0]!) > 0.7 ? "YZ" : Math.abs(n[1]!) > 0.7 ? "XZ" : "XY");

async function cut(extra: (target: string) => object[]) {
  const { Recomputer } = await import("../../frontend/src/history/recompute");
  const { createReferencePlate } = await import("../../frontend/src/document/types");
  const { measureVolume } = await import("replicad");
  const doc = { ...createReferencePlate(), features: [
    { id: "sk1", type: "sketch", name: "Rond", plane: "XY", offset: 0, points: [{ id: "c", x: 0, y: 0 }], curves: [{ id: "k", kind: "circle", center: "c", radius: 40 }], constraints: [] },
    { id: "ex1", type: "extrude", name: "Cylindre", sketch: "sk1", distance: 60, operation: "new" },
    ...extra("ex1"),
  ] };
  const r = new Recomputer();
  const made = r.recompute(doc as never);
  const last = (doc.features.at(-1) as { id: string }).id;
  const out = r.output(last);
  const shape = out?.kind === "solid" ? out.shape : out?.kind === "solids" ? out.shapes[0] : null;
  const result = { states: made.statuses.filter((s) => s.state !== "ok").map((s) => s.message), volume: shape ? measureVolume(shape) : 0 };
  r.dispose();
  return result;
}
const full = Math.PI * 40 * 40 * 60;

describe("tracer et dessiner sur le flanc d'un cylindre", () => {
  it("lit le flanc d'un cylindre entier, et la place d'un point sur lui", () => {
    expect(cylinder).toMatchObject({ axis: 2, radius: 40, s0: 0, s1: 60, a0: 0 });
    expect(facePlace(cylinder, [0, 40, 25])).toEqual({ s: 25, a: Math.PI / 2 });
  });

  it("le décalage du contour d'un cylindre entier fait le tour, sans couture", async () => {
    const { curvedRecess, curvedPointerOffset } = await import("../../frontend/src/features/curved-offset");
    expect(curvedPointerOffset(cylinder, [40, 0, 20])).toBe(20);
    const plan = curvedRecess(cylinder, 10, 2);
    if (typeof plan === "string") throw new Error(plan);
    expect(plan.geometry.curves.map((c) => c.kind)).toEqual(["circle", "circle"]);
    expect(plan.distance).toBe(40);
  });

  it("une rainure tout autour, depuis le bord rond", async () => {
    const plan = sectorRecess(cylinder, 0, 2 * Math.PI, 50, 55, 3);
    if (typeof plan === "string") throw new Error(plan);
    const { states, volume } = await cut((t) => [
      { id: "sk2", type: "sketch", name: "Rainure", plane: plan.plane, offset: plan.offset, hidden: true, ...plan.geometry },
      { id: "ex2", type: "extrude", name: "Rainure", sketch: "sk2", distance: plan.distance, operation: plan.operation, target: t },
    ]);
    expect(states).toEqual([]);
    expect(full - volume).toBeCloseTo(Math.PI * (40 * 40 - 37 * 37) * 5, 0);
  }, 120_000);

  it("un rectangle creusé sur un quart du flanc", async () => {
    const plan = sectorRecess(cylinder, 0, Math.PI / 2, 10, 30, 2);
    if (typeof plan === "string") throw new Error(plan);
    const { states, volume } = await cut((t) => [
      { id: "sk2", type: "sketch", name: "Rectangle", plane: plan.plane, offset: plan.offset, hidden: true, ...plan.geometry },
      { id: "ex2", type: "extrude", name: "Rectangle", sketch: "sk2", distance: plan.distance, operation: plan.operation, target: t },
    ]);
    expect(states).toEqual([]);
    expect(full - volume).toBeCloseTo((Math.PI / 4) * (40 * 40 - 38 * 38) * 20, 0);
  }, 120_000);

  it("un cercle : perçage vers l'axe, ou bossage en relief", async () => {
    for (const depth of [5, -4]) {
      const plan = curvedCircle(cylinder, 30, Math.PI, 8, depth);
      if (typeof plan === "string") throw new Error(plan);
      const { states, volume } = await cut((t) => [
        { id: "sk2", type: "sketch", name: "Cercle", plane: planeOf(plan.frame.normal), offset: 0, frame: plan.frame, hidden: true, ...plan.geometry },
        { id: "ex2", type: "extrude", name: "Cercle", sketch: "sk2", distance: plan.distance, startOffset: plan.startOffset, operation: plan.operation, target: t },
      ]);
      expect(states).toEqual([]);
      if (depth > 0) expect(full - volume).toBeGreaterThan(Math.PI * 64 * 4);
      else expect(volume - full).toBeGreaterThan(Math.PI * 64 * 3.5);
    }
  }, 120_000);
});
