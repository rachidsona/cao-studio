/** Modificateurs de planche : cintrée, effilée, vrillée — volumes exacts attendus. */
import { beforeAll, describe, expect, it } from "vitest";
import type { Shape3D } from "replicad";
import { createReferencePlate, type CadDocument, type ModifierFeature } from "../../frontend/src/document/types";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A board 80 long (x) × 50 wide (y) × 10 thick (z), then the modifier. */
function modified(kind: ModifierFeature["kind"], amount: number): { volume: number; bbox: [number[], number[]]; state: string } {
  const doc: CadDocument = createReferencePlate();
  doc.features = [...doc.features.slice(0, 2), { id: "md1", type: "modifier", name: "Modificateur 1", target: "ex1", kind, amount }];
  const r = new Recomputer();
  const statuses = r.recompute(doc).statuses;
  const out = r.output("md1");
  const shape = out?.kind === "solid" ? (out.shape as Shape3D) : null;
  return { state: statuses.find((s) => s.id === "md1")?.message ?? "ok", ...(shape ? bodyMetrics(shape) : { volume: 0, bbox: [[], []] }) };
}

describe("modificateurs", () => {
  it("effiler à 50 % : tronc de pyramide de la section", () => {
    const { volume } = modified("taper", 50);
    const [a1, a2] = [50 * 10, 25 * 5];
    expect(volume).toBeCloseTo((80 / 3) * (a1 + a2 + Math.sqrt(a1 * a2)), 0);
  });

  it("vriller de 90° garde le volume (sections égales)", () => {
    expect(modified("twist", 90).volume).toBeCloseTo(80 * 50 * 10, -1);
  });

  it("cintrer à 100 mm de rayon : même volume (longueur sur la fibre neutre), forme courbée", () => {
    const bent = modified("bend", 100);
    expect(bent.volume).toBeCloseTo(80 * 50 * 10, 0);
    // The board no longer lies flat: it rises out of its 10 mm thickness.
    expect(bent.bbox[1][2]! - bent.bbox[0][2]!).toBeGreaterThan(20);
  });

  it("refuse un rayon plus petit que la demi-épaisseur", () => {
    expect(modified("bend", 3).state).toMatch(/demi-épaisseur/);
  });
});

describe("copie liée", () => {
  it("une copie posée à côté, qui suit une modification de l'original", async () => {
    const { addLinkedCopy } = await import("../../frontend/src/app/linked-copy");
    const doc: CadDocument = createReferencePlate(); // the plate is 80 wide in X
    const { doc: withCopy, id } = addLinkedCopy(doc, ["h1"], [[-40, -25, 0], [40, 25, 10]], 20);
    const r = new Recomputer();
    r.recompute(withCopy);
    const copy = r.output(`${id}#0`);
    expect(copy?.kind === "solid" && bodyMetrics(copy.shape).bbox[0][0]).toBeCloseTo(60, 6);
    // The original's width changes: the copy follows.
    const sketch = withCopy.features[0] as { constraints: { id: string; value?: number }[] };
    sketch.constraints.find((c) => c.id === "d1")!.value = 100;
    r.recompute(withCopy);
    const after = r.output(`${id}#0`);
    expect(after?.kind === "solid" && bodyMetrics(after.shape).bbox[1][0] - bodyMetrics(after.shape).bbox[0][0]).toBeCloseTo(100, 6);
  });
});
