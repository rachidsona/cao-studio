/** Extrusion avec départ décalé (comme Fusion) : le solide commence à une distance du plan de l'esquisse. */
import { beforeAll, describe, expect, it } from "vitest";
import { addPlate } from "../../frontend/src/document/operations";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A 100 × 50 plate 10 thick, extruded from a start offset. */
function plate(startOffset?: number): { doc: CadDocument; id: string } {
  const doc = addPlate({ ...createReferencePlate(), features: [] }, 100, 50, 10);
  const id = doc.features.at(-1)!.id;
  return { doc: { ...doc, features: doc.features.map((f) => (f.id === id && f.type === "extrude" ? { ...f, ...(startOffset === undefined ? {} : { startOffset }) } : f)) }, id };
}

function zRange(doc: CadDocument, id: string): [number, number] {
  const r = new Recomputer();
  const { statuses } = r.recompute(doc);
  expect(statuses.find((s) => s.id === id)?.state).toBe("ok");
  const out = r.output(id);
  const box = bodyMetrics(out?.kind === "solid" ? out.shape : (null as never)).bbox;
  return [Number(box[0][2].toFixed(6)), Number(box[1][2].toFixed(6))];
}

describe("extrusion décalée", () => {
  it("sans décalage, depuis le plan de l'esquisse", () => {
    const { doc, id } = plate();
    expect(zRange(doc, id)).toEqual([0, 10]);
  });

  it("décalée de 50 mm, puis de l'autre côté", () => {
    const up = plate(50);
    expect(zRange(up.doc, up.id)).toEqual([50, 60]);
    expect(() => parseDocument(JSON.parse(JSON.stringify(up.doc)))).not.toThrow();
    const down = plate(-30);
    expect(zRange(down.doc, down.id)).toEqual([-30, -20]);
  });

  it("refuse un décalage qui n'est pas un nombre", () => {
    const { doc, id } = plate();
    const bad = { ...doc, features: doc.features.map((f) => (f.id === id ? { ...f, startOffset: "beaucoup" } : f)) };
    expect(() => parseDocument(JSON.parse(JSON.stringify(bad)))).toThrow(/décalage de départ/);
  });
});
