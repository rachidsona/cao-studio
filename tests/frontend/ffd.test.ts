/** Déformation FFD 3×3×3 (comme celle de JHS PowerBar) : la grille, le calcul et le solide recousu par le noyau. */
import { beforeAll, describe, expect, it } from "vitest";
import type { Shape3D } from "replicad";
import { createReferencePlate, type CadDocument, type Vec3 } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";
import { ffdPoint, latticeIndex, latticePoints, subdivide, type Box, movedSides } from "../../frontend/src/features/ffd";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const box: Box = [[0, 0, 0], [100, 50, 10]];
const lift = (points: [number, number, number][], dz: number) => {
  const offsets = new Array(81).fill(0);
  for (const [i, j, k] of points) offsets[latticeIndex(i, j, k) * 3 + 2] = dz;
  return offsets;
};

describe("grille FFD", () => {
  it("27 points sur la boîte ; sans déplacement, rien ne bouge", () => {
    const points = latticePoints(box);
    expect(points).toHaveLength(27);
    expect(points[latticeIndex(1, 1, 1)]).toEqual([50, 25, 5]);
    expect(ffdPoint([30, 10, 7], box, new Array(81).fill(0))).toEqual([30, 10, 7]);
  });

  it("le point du milieu du dessus monté de 20 bombe le dessus : 5 au centre, rien aux bords", () => {
    const offsets = lift([[1, 1, 2]], 20);
    expect(ffdPoint([50, 25, 10], box, offsets)[2]).toBeCloseTo(15, 9);
    expect(ffdPoint([0, 25, 10], box, offsets)[2]).toBeCloseTo(10, 9);
    expect(ffdPoint([50, 25, 0], box, offsets)[2]).toBeCloseTo(0, 9);
  });

  it("les triangles recoupés gardent l'aire", () => {
    const tris = subdivide([0, 0, 0, 10, 0, 0, 0, 10, 0], [0, 1, 2], 100);
    expect(tris.length).toBe(100);
    const area = (t: Vec3[]) => Math.abs((t[1]![0] - t[0]![0]) * (t[2]![1] - t[0]![1]) - (t[2]![0] - t[0]![0]) * (t[1]![1] - t[0]![1])) / 2;
    expect(tris.reduce((s, t) => s + area(t), 0)).toBeCloseTo(50, 9);
  });
});

/** The reference plate's board deformed by these offsets. */
function deformed(lattice: number[]): { volume: number; bbox: [number[], number[]]; state: string; ms: number } {
  const doc: CadDocument = createReferencePlate();
  doc.features = [...doc.features.slice(0, 2), { id: "md1", type: "modifier", name: "Déformation 1", target: "ex1", kind: "ffd", amount: 0, lattice }];
  expect(validateDocument(doc).filter((e) => /Déformation/.test(e))).toEqual([]);
  const r = new Recomputer();
  const start = performance.now();
  const statuses = r.recompute(doc).statuses;
  const ms = performance.now() - start;
  const out = r.output("md1");
  const shape = out?.kind === "solid" ? (out.shape as Shape3D) : null;
  return { ms, state: statuses.find((s) => s.id === "md1")?.message ?? "ok", ...(shape ? bodyMetrics(shape) : { volume: 0, bbox: [[], []] }) };
}

describe("déformation FFD dans le noyau", () => {
  it("tout le dessus monté de 20 : un bloc plus haut d'autant, solide", () => {
    const base = deformed(new Array(81).fill(0));
    const top = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => [i, j, 2] as [number, number, number]));
    const raised = deformed(lift(top, 20));
    expect(raised.state).toBe("ok");
    const h = (b: typeof base) => b.bbox[1][2]! - b.bbox[0][2]!;
    expect(h(raised)).toBeCloseTo(h(base) + 20, 3);
    expect(raised.volume).toBeCloseTo((base.volume / h(base)) * (h(base) + 20), -1);
  });

  it("le milieu du dessus monté : le dessus bombe, le volume grandit", () => {
    const base = deformed(new Array(81).fill(0));
    const bulge = deformed(lift([[1, 1, 2]], 40));
    expect(bulge.state).toBe("ok");
    expect(bulge.volume).toBeGreaterThan(base.volume * 1.05);
    expect(bulge.ms).toBeLessThan(8000);
  });
});

describe("tirer tout un côté", () => {
  const box: Box = [[0, 0, 0], [1000, 400, 18]];
  const none = new Array(81).fill(0);

  it("les 9 points du côté bougent ensemble, ceux du milieu de moitié, l'autre côté ne bouge pas", () => {
    const moved = movedSides(none, [latticeIndex(2, 2, 2)], 0, 100);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) {
      expect(moved[latticeIndex(2, j, k) * 3]).toBe(100);
      expect(moved[latticeIndex(1, j, k) * 3]).toBe(50);
      expect(moved[latticeIndex(0, j, k) * 3]).toBe(0);
    }
  });

  it("la pièce s'allonge régulièrement et ses faces restent droites", () => {
    const moved = movedSides(none, [latticeIndex(2, 0, 0)], 0, 200);
    expect(ffdPoint([1000, 400, 18], box, moved)).toEqual([1200, 400, 18]);
    expect(ffdPoint([0, 0, 0], box, moved)).toEqual([0, 0, 0]);
    const middle = ffdPoint([500, 123, 18], box, moved);
    expect(middle[0]).toBeCloseTo(600);
    expect(middle[1]).toBeCloseTo(123);
    expect(middle[2]).toBeCloseTo(18);
  });

  it("réduire marche de la même façon, sur l'axe tiré seulement", () => {
    const moved = movedSides(none, [latticeIndex(0, 2, 1)], 1, -100);
    expect(ffdPoint([300, 400, 9], box, moved)[1]).toBeCloseTo(300);
    expect(ffdPoint([300, 400, 9], box, moved)[0]).toBeCloseTo(300);
  });

  it("une couche du milieu bouge seule, et les deux côtés déplacent tout", () => {
    const middle = movedSides(none, [latticeIndex(1, 0, 0)], 0, 40);
    expect(middle[latticeIndex(1, 2, 2) * 3]).toBe(40);
    expect(middle[latticeIndex(2, 0, 0) * 3]).toBe(0);
    const both = movedSides(none, [latticeIndex(0, 0, 0), latticeIndex(2, 0, 0)], 0, 30);
    expect(new Set(Array.from({ length: 27 }, (_, n) => both[n * 3]))).toEqual(new Set([30]));
  });
});
