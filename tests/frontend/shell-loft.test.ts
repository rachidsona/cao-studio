/** Coque et lissage : un bac ouvert creusé dans un bloc, un pied qui passe d'un carré à un plus petit. */
import { beforeAll, describe, expect, it } from "vitest";
import type { Shape3D } from "replicad";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type SketchFeature } from "../../frontend/src/document/types";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeFace } from "../../frontend/src/geometry/references";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

function block(): CadDocument {
  const doc = createReferencePlate();
  doc.features = doc.features.slice(0, 2); // sk1 (80 × 50) + ex1 (10 high)
  (doc.features[1] as { distance: number }).distance = 40;
  return doc;
}

function solid(r: Recomputer, id: string): Shape3D {
  const out = r.output(id);
  if (out?.kind !== "solid") throw new Error(`pas de solide ${id}`);
  return out.shape;
}

describe("coque", () => {
  it("un bloc 80 × 50 × 40 creusé à 3 mm, dessus ouvert : volume des parois", () => {
    const doc = block();
    const r = new Recomputer();
    r.recompute(doc);
    const shape = solid(r, "ex1");
    const top = shape.faces.find((f) => Math.abs(f.center.z - 40) < 1e-6)!;
    doc.features.push({ id: "sh1", type: "shell", name: "Coque 1", target: "ex1", faces: [describeFace(shape, top)], thickness: 3 });
    const statuses = r.recompute(doc).statuses;
    expect(statuses.find((s) => s.id === "sh1")?.state).toBe("ok");
    const walls = 80 * 50 * 40 - 74 * 44 * 37;
    expect(bodyMetrics(solid(r, "sh1")).volume).toBeCloseTo(walls, 0);
  });
});

describe("lissage", () => {
  it("relie un carré de 40 en bas à un carré de 20 à 100 mm : tronc de pyramide", () => {
    const sketch = (id: string, offset: number, side: number): SketchFeature => ({ id, type: "sketch", name: id, plane: "XY", offset, ...centeredRectangle(side, side) });
    const doc: CadDocument = { ...createReferencePlate(), features: [sketch("a", 0, 40), sketch("b", 100, 20), { id: "lo1", type: "loft", name: "Lissage 1", profiles: ["a", "b"], ruled: true, operation: "new" }] };
    const r = new Recomputer();
    const statuses = r.recompute(doc).statuses;
    expect(statuses.find((s) => s.id === "lo1")?.state).toBe("ok");
    const frustum = (100 / 3) * (40 * 40 + 20 * 20 + 40 * 20);
    expect(bodyMetrics(solid(r, "lo1")).volume).toBeCloseTo(frustum, 0);
  });
});
