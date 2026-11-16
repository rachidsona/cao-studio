/** Corriger un chevauchement : une pièce coupée par l'autre, qui reste entière. */
import { measureVolume } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { withOverlapCut, withOverlapsCut } from "../../frontend/src/document/overlap-fix";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

/** A seat 1000 × 600 × 50 at 250 high, and a back 1000 × 50 × 750 standing in it. */
const sofa = (): CadDocument => {
  const back = centeredRectangle(1000, 50);
  back.points.forEach((p) => (p.y += 275));
  back.constraints = [];
  return {
    ...createReferencePlate(),
    features: [
      { id: "sk1", type: "sketch", name: "Assise", plane: "XY", offset: 0, ...centeredRectangle(1000, 600) },
      { id: "ex1", type: "extrude", name: "Assise", sketch: "sk1", distance: 50, startOffset: 250, operation: "new" },
      { id: "sk2", type: "sketch", name: "Dossier", plane: "XY", offset: 0, ...back },
      { id: "ex2", type: "extrude", name: "Dossier", sketch: "sk2", distance: 750, operation: "new" },
    ],
  } as unknown as CadDocument;
};

describe("corriger un chevauchement", () => {
  it("l'assise coupée par le dossier : elle perd la part commune, le dossier reste entier", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const r = new Recomputer();
    const doc = withOverlapCut(sofa(), "ex1", "ex2");
    const result = r.recompute(doc);
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    const cut = doc.features.at(-1)!;
    expect(cut).toMatchObject({ type: "combine", target: "ex1", tools: ["ex2"], operation: "cut", keepTools: true });
    const seat = r.output(cut.id);
    const back = r.output("ex2");
    expect(seat?.kind === "solid" ? measureVolume(seat.shape) : 0).toBeCloseTo(1000 * 600 * 50 - 1000 * 50 * 50, -2);
    expect(back?.kind === "solid" ? measureVolume(back.shape) : 0).toBeCloseTo(1000 * 50 * 750, -2);
    // The other way: the back crossed right through by the seat falls in two, each a body (no error).
    const other = withOverlapCut(sofa(), "ex2", "ex1");
    expect(r.recompute(other).statuses.every((s) => s.state === "ok")).toBe(true);
    const pieces = r.output(other.features.at(-1)!.id);
    expect(pieces?.kind === "solids" ? pieces.shapes.length : 1).toBe(2);
    r.dispose();
  }, 120_000);

  it("tous d'un coup : une pièce coupée deux fois repart de sa dernière découpe", () => {
    const doc = withOverlapsCut(sofa(), [["ex2", "ex1"], ["ex3", "ex1"]]);
    const cuts = doc.features.filter((f) => f.type === "combine");
    expect(cuts.map((c) => (c as { target: string }).target)).toEqual(["ex1", cuts[0]!.id]);
  });
});
