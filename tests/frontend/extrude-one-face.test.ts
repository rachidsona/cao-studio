/** Un côté du profil tracé en deux traits à la suite ne fait qu'une face de l'extrusion (l'assise d'un canapé). */
import { measureArea } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { createReferencePlate } from "../../frontend/src/document/types";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

/** The seat of a sofa: its front (y = −850) drawn in two lines that meet at x = 2180, under the arm. */
const P: [string, number, number][] = [["p2", 2230, 0], ["p3", 0, -850], ["p5", 2230, -50], ["p6", 2180, 0], ["p7", 2180, -850], ["p9", 280, 0], ["p10", 2230, -630], ["p1", 2180, -630], ["p11", 280, -50], ["p8", 2230, -850]];
const L: [string, string, string][] = [["l1", "origin", "p2"], ["l2", "p2", "p10"], ["l4", "p3", "origin"], ["l5", "p11", "p5"], ["l6", "p6", "p1"], ["l7", "p11", "p9"], ["l8", "p10", "p1"], ["l10", "p7", "p3"], ["l11", "p7", "p8"], ["l12", "p8", "p10"]];

describe("une face par plan", () => {
  it("l'avant de l'assise, tracé en deux traits, est une seule face ; la marche autour du dossier reste", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const sketch = { id: "sk1", type: "sketch", name: "Canapé", plane: "XY", offset: 0, points: P.map(([id, x, y]) => ({ id, x, y })), curves: L.map(([id, p1, p2]) => ({ id, kind: "line", p1, p2 })), constraints: [] };
    const doc = { ...createReferencePlate(), features: [sketch, { id: "ex1", type: "extrude", name: "Assise", sketch: "sk1", distance: 50, startOffset: 250, operation: "new", regions: [[1115, -637.5]] }] };
    const r = new Recomputer();
    const result = r.recompute(doc as never);
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    const out = r.output("ex1");
    const seat = out?.kind === "solid" ? out.shape : null;
    expect(seat).not.toBeNull();
    const front = seat!.faces.filter((f) => {
      const n = f.normalAt(f.center);
      return f.geomType === "PLANE" && n.y < -0.99;
    });
    // One front face, the whole 2230 by 50.
    expect(front).toHaveLength(1);
    expect(measureArea(front[0]!)).toBeCloseTo(2230 * 50, 0);
    // The step round the back's end (a real one) stays: 50 by 50.
    expect(seat!.faces.some((f) => Math.abs(measureArea(f) - 2500) < 1 && Math.abs(f.center.x - 280) < 1)).toBe(true);
    r.dispose();
  }, 120_000);
});
