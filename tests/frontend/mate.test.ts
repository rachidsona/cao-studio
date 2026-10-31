/** Assemblage de deux pièces face contre face : contact ou affleurement, avec un jeu, et la pièce qui suit l'autre. */
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { mateOf } from "../../frontend/src/app/mate-tool";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { alignDelta, type Box } from "../../frontend/src/features/curic";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A: a box 0..width × 0..400 × 0..700; B: a board 60 × 300 × 18 far away. */
const doc = (width: number, ...more: Feature[]): CadDocument => ({
  format: "cao-studio",
  schemaVersion: 2,
  units: "mm",
  parameters: {},
  features: [
    { id: "sa", type: "sketch", name: "A", plane: "XY", offset: 0, ...rectangleAt(width / 2, 200, width, 400) },
    { id: "a", type: "extrude", name: "A", sketch: "sa", distance: 700, operation: "new" },
    { id: "sb", type: "sketch", name: "B", plane: "XY", offset: 0, ...rectangleAt(2030, 150, 60, 300) },
    { id: "b", type: "extrude", name: "B", sketch: "sb", distance: 18, operation: "new" },
    ...more,
  ],
});

const bbox = (shape: Shape3D) => bodyMetrics(shape).bbox.map((v) => v.map((x) => Number(x.toFixed(6)) + 0));

function boxOf(d: CadDocument, id: string): number[][] {
  const r = new Recomputer();
  const result = r.recompute(d);
  expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
  const out = r.output(id);
  if (out?.kind !== "solid") throw new Error(`solid expected for ${id}`);
  const box = bbox(out.shape);
  r.dispose();
  return box;
}

describe("assemblage", () => {
  it("des faces opposées se touchent, des faces de même sens affleurent ; deux faces non parallèles, rien", () => {
    expect(mateOf({ axis: 2, sign: -1 }, { axis: 2, sign: 1 })).toBe("after");
    expect(mateOf({ axis: 0, sign: 1 }, { axis: 0, sign: -1 })).toBe("before");
    expect(mateOf({ axis: 1, sign: -1 }, { axis: 1, sign: -1 })).toBe("min");
    expect(mateOf({ axis: 1, sign: 1 }, { axis: 1, sign: 1 })).toBe("max");
    expect(mateOf({ axis: 0, sign: 1 }, { axis: 2, sign: 1 })).toBeNull();
  });

  it("garde le jeu entre les faces en contact, le retrait des faces affleurantes, le décalage du centre", () => {
    const t: Box = [[0, 0, 0], [10, 10, 10]];
    const ref: Box = [[100, 100, 100], [200, 200, 200]];
    expect(alignDelta(t, ref, ["after", "before", "none"], [2, 3, 0])).toEqual([202, 87, 0]);
    expect(alignDelta(t, ref, ["min", "max", "center"], [5, 5, 20])).toEqual([105, 185, 165]);
  });

  it("pose B sur A avec 2 mm de jeu, affleurant devant et à gauche ; B suit quand A s'élargit", () => {
    const mate: Feature = { id: "al1", type: "align", name: "Assemblage 1", target: "b", reference: "a", modes: ["max", "min", "after"], gaps: [10, 0, 2] };
    expect(parseDocument(JSON.parse(JSON.stringify(doc(600, mate)))).features.at(-1)).toMatchObject({ gaps: [10, 0, 2] });
    // On top (z 702…720), its right face 10 mm inside A's right face, its front flush with A's.
    expect(boxOf(doc(600, mate), "al1")).toEqual([[530, 0, 702], [590, 300, 720]]);
    // A made wider: B follows its right face.
    expect(boxOf(doc(900, mate), "al1")).toEqual([[830, 0, 702], [890, 300, 720]]);
  });
});
