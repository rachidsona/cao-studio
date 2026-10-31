/** Congé à rayon variable et chanfrein à deux distances, sur le vrai noyau. */
import type { Edge, Shape3D } from "replicad";
import { measureArea } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { createReferencePlate, type CadDocument, type EdgeRef, type Feature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeEdge } from "../../frontend/src/geometry/references";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

// The reference plate without its hole: 80 × 50 × 10 (x −40…40, y −25…25, z 0…10).
const plate = (...more: Feature[]): CadDocument => {
  const base = createReferencePlate();
  return { ...base, features: [...base.features.slice(0, 2), ...more] };
};

function solidOf(r: Recomputer, id: string): Shape3D {
  const out = r.output(id);
  if (out?.kind !== "solid") throw new Error(`no solid for ${id}`);
  return out.shape;
}

function refs(pick: (e: Edge) => boolean): EdgeRef[] {
  const r = new Recomputer();
  try {
    r.recompute(plate());
    const shape = solidOf(r, "ex1");
    return shape.edges.filter(pick).slice(0, 1).map((e) => describeEdge(shape, e));
  } finally {
    r.dispose();
  }
}

/** Volume of the result, and the area of its top face (z = 10). */
function result(d: CadDocument, id: string): { volume: number; top: number } {
  const r = new Recomputer();
  try {
    const out = r.recompute(d);
    const status = out.statuses.find((s) => s.id === id);
    if (status?.state !== "ok") throw new Error(status?.message ?? "échec");
    const shape = solidOf(r, id);
    const top = shape.faces.filter((f) => f.geomType === "PLANE" && Math.abs(f.center.z - 10) < 1e-6 && f.normalAt().z > 0.99);
    return { volume: bodyMetrics(shape).volume, top: top.reduce((s, f) => s + measureArea(f), 0) };
  } finally {
    r.dispose();
  }
}

/** The top long edge at the back (y = 25). */
const backTop = (e: Edge) => e.geomType === "LINE" && Math.abs(e.tangentAt(0.5).x) > 0.99 && e.pointAt(0.5).z > 9.99 && e.pointAt(0.5).y > 24.99;
const corner = (e: Edge) => e.geomType === "LINE" && Math.abs(e.tangentAt(0.5).z) > 0.99;

describe("chanfrein à deux distances", () => {
  it("prend la première distance sur la grande face (le dessus), la seconde sur le chant ; inversé, l'inverse", () => {
    const edges = refs(backTop);
    expect(edges).toHaveLength(1);
    const chamfer = (swap: boolean): Feature => ({ id: "c1", type: "chamfer", name: "Chanfrein 1", target: "ex1", edges, distance: 2, distance2: 5, ...(swap ? { swap } : {}) });
    expect(parseDocument(JSON.parse(JSON.stringify(plate(chamfer(true))))).features.at(-1)).toMatchObject({ distance2: 5, swap: true });
    const normal = result(plate(chamfer(false)), "c1");
    // A prism 2 × 5 / 2 along the 80 mm edge.
    expect(normal.volume).toBeCloseTo(40000 - 400, 6);
    expect(normal.top).toBeCloseTo(80 * 48, 6);
    expect(result(plate(chamfer(true)), "c1").top).toBeCloseTo(80 * 45, 6);
  });
});

describe("congé à rayon variable", () => {
  it("passe du rayon de début au rayon de fin le long de l'arête", () => {
    const edges = refs(corner);
    const fillet = (radiusEnd?: number): Feature => ({ id: "f1", type: "fillet", name: "Congé 1", target: "ex1", edges, radius: 2, ...(radiusEnd ? { radiusEnd } : {}) });
    const removed = (d: CadDocument) => 40000 - result(d, "f1").volume;
    const k = 1 - Math.PI / 4;
    expect(removed(plate(fillet()))).toBeCloseTo(k * 4 * 10, 6);
    // Radius 2 → 8 over the 10 mm edge: about k × h × (r1² + r1·r2 + r2²) / 3.
    const variable = removed(plate(fillet(8)));
    expect(variable).toBeGreaterThan(k * 4 * 10 * 5);
    expect(Math.abs(variable - (k * 10 * (4 + 16 + 64)) / 3) / variable).toBeLessThan(0.05);
  });
});
