/** « Cintrer contre un corps rond » : un panneau droit s'enroule sur la face ronde d'un fût, à son épaisseur. */
import { measureVolume } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

/** A drum Ø600, 700 high, and a board 400 × 18, 700 high, standing against it at x = 300 (its length along y). */
function doc(onto: object | null, corners: number[][] = [[300, -200], [318, -200], [318, 200], [300, 200]], extra: object[] = []): CadDocument {
  const board = { points: corners.map(([x, y], i) => ({ id: `b${i}`, x, y })), curves: corners.map((_, i) => ({ id: `l${i}`, kind: "line", p1: `b${i}`, p2: `b${(i + 1) % corners.length}` })), constraints: [] };
  const drum = { points: [{ id: "c0", x: 0, y: 0 }], curves: [{ id: "c", kind: "circle", center: "c0", radius: 300 }], constraints: [] };
  return {
    ...createReferencePlate(),
    features: [
      { id: "sk1", type: "sketch", name: "Fût", plane: "XY", offset: 0, ...drum },
      { id: "ex1", type: "extrude", name: "Fût", sketch: "sk1", distance: 700, operation: "new" },
      { id: "sk2", type: "sketch", name: "Panneau", plane: "XY", offset: 0, ...board },
      { id: "ex2", type: "extrude", name: "Panneau", sketch: "sk2", distance: 700, operation: "new" },
      ...extra,
      ...(onto ? [{ id: "md1", type: "modifier", name: "Cintrage 1", target: extra.length ? "ex3" : "ex2", kind: "bend", amount: 0, onto }] : []),
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

  it("un panneau qui part du fût d'un seul côté s'enroule dans le sens où il part ; un corps déjà prolongé est refusé", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { describeFace } = await import("../../frontend/src/geometry/references");
    const r = new Recomputer();
    r.recompute(doc(null));
    const drum = r.output("ex1");
    const solid = drum?.kind === "solid" ? drum.shape : null;
    const ref = describeFace(solid!, solid!.faces.find((f) => f.geomType === "CYLINDRE")!);
    // On top of the drum (y 300…318), from x = 0 to 400: it leaves the drum at its top, towards +x.
    const result = r.recompute(doc({ body: "ex1", face: ref }, [[0, 300], [400, 300], [400, 318], [0, 318]]));
    expect(result.statuses.filter((s) => s.state !== "ok")).toEqual([]);
    const bent = r.output("md1");
    const shape = bent?.kind === "solid" ? bent.shape : null;
    expect(measureVolume(shape!)).toBeCloseTo(400 * 18 * 700, -2);
    const [low, high] = shape!.boundingBox.bounds;
    // From the top (90°) round towards +x, about 74°: it stays above y = 0, on the +x side.
    expect(low[1]).toBeGreaterThan(0);
    expect(low[0]).toBeGreaterThan(-1);
    expect(high[0]).toBeGreaterThan(250);
    // A board extended by another block: no longer a straight board, said so.
    const block = { points: [[318, -200], [400, -200], [400, 200], [318, 200]].map(([x, y], i) => ({ id: `k${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `m${i}`, kind: "line", p1: `k${i}`, p2: `k${(i + 1) % 4}` })), constraints: [] };
    const joined = r.recompute(doc({ body: "ex1", face: ref }, undefined, [
      { id: "sk3", type: "sketch", name: "Bloc", plane: "XY", offset: 0, ...block },
      { id: "ex3", type: "extrude", name: "Bloc", sketch: "sk3", distance: 300, operation: "join", target: "ex2" },
    ]));
    expect(joined.statuses.find((s) => s.id === "md1")?.message).toMatch(/plus un panneau droit/);
    r.dispose();
  }, 120_000);
});
