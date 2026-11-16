/** « Cintrer contre un corps rond » : un panneau droit s'enroule sur la face ronde d'un fût, à son épaisseur. */
import { measureVolume } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

/** A drum Ø600, 700 high, and a board 400 × 18, 700 high, standing against it at x = 300 (its length along y). */
function doc(onto: object | null): CadDocument {
  const board = { points: [[300, -200], [318, -200], [318, 200], [300, 200]].map(([x, y], i) => ({ id: `b${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `l${i}`, kind: "line", p1: `b${i}`, p2: `b${(i + 1) % 4}` })), constraints: [] };
  const drum = { points: [{ id: "c0", x: 0, y: 0 }], curves: [{ id: "c", kind: "circle", center: "c0", radius: 300 }], constraints: [] };
  return {
    ...createReferencePlate(),
    features: [
      { id: "sk1", type: "sketch", name: "Fût", plane: "XY", offset: 0, ...drum },
      { id: "ex1", type: "extrude", name: "Fût", sketch: "sk1", distance: 700, operation: "new" },
      { id: "sk2", type: "sketch", name: "Panneau", plane: "XY", offset: 0, ...board },
      { id: "ex2", type: "extrude", name: "Panneau", sketch: "sk2", distance: 700, operation: "new" },
      ...(onto ? [{ id: "md1", type: "modifier", name: "Cintrage 1", target: "ex2", kind: "bend", amount: 0, onto }] : []),
    ],
  } as unknown as CadDocument;
}

describe("cintrer un panneau contre un corps rond", () => {
  it("il épouse le fût : rayons 300 à 318, même volume (longueur prise au milieu de l'épaisseur), toujours debout", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { describeFace } = await import("../../frontend/src/geometry/references");
    const r = new Recomputer();
    r.recompute(doc(null));
    const drum = r.output("ex1");
    const solid = drum?.kind === "solid" ? drum.shape : null;
    const side = solid!.faces.find((f) => f.geomType === "CYLINDRE")!;
    const ref = describeFace(solid!, side);
    const result = r.recompute(doc({ body: "ex1", face: ref }));
    expect(result.statuses.filter((s) => s.state !== "ok")).toEqual([]);
    const bent = r.output("md1");
    const shape = bent?.kind === "solid" ? bent.shape : null;
    expect(shape).not.toBeNull();
    // Its volume: 18 thick, 700 high, 400 long at the middle of its thickness.
    expect(measureVolume(shape!)).toBeCloseTo(400 * 18 * 700, -2);
    const [low, high] = shape!.boundingBox.bounds;
    expect(Math.round(high[2] - low[2])).toBe(700);
    // Wrapped on the drum: nothing inside its radius, nothing beyond 318.
    expect(Math.round(high[0])).toBeLessThanOrEqual(318);
    expect(low[0]).toBeGreaterThan(200);
    r.dispose();
  }, 120_000);
});
