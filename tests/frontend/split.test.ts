/** Splitting a body into separate pieces (e.g. a frame into four boards). */
import { beforeAll, describe, expect, it } from "vitest";
import { bodyLabel, deleteFeature, dependentsOf } from "../../frontend/src/document/operations";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

/** Frame 100 × 80 outside, 80 × 60 inside, 18 mm thick (boards 10 mm wide). */
function frame(): Feature[] {
  const outer = rectangleAt(0, 0, 100, 80);
  const inner = rectangleAt(0, 0, 80, 60);
  // Prefix the inner rectangle's ids so both rectangles fit in one sketch.
  const p = (id: string) => (id === "origin" ? id : `i${id}`);
  const innerPoints = inner.points.map((pt) => ({ ...pt, id: p(pt.id) }));
  const innerCurves = inner.curves.map((c) => (c.kind === "line" ? { ...c, id: p(c.id), p1: p(c.p1), p2: p(c.p2) } : c));
  const innerConstraints = inner.constraints.map((c) => {
    const copy: Record<string, unknown> = { ...c, id: p(c.id) };
    for (const key of ["line", "a", "b", "axis"]) if (typeof copy[key] === "string") copy[key] = p(copy[key] as string);
    return copy as unknown as (typeof inner.constraints)[number];
  });
  return [
    {
      id: "sk",
      type: "sketch",
      name: "Cadre",
      plane: "XY",
      offset: 0,
      points: [...outer.points, ...innerPoints],
      curves: [...outer.curves, ...innerCurves],
      constraints: [...outer.constraints, ...innerConstraints],
    },
    { id: "ex", type: "extrude", name: "Cadre", sketch: "sk", distance: 18, operation: "new" },
  ];
}

const doc = (...features: Feature[]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features });

const splitFrame: Feature = {
  id: "sp",
  type: "split",
  name: "Scission",
  target: "ex",
  planes: [
    { point: [0, 30, 0], normal: [0, 1, 0] },
    { point: [0, -30, 0], normal: [0, -1, 0] },
  ],
};

describe("scinder un corps", () => {
  beforeAll(setupKernel);

  it("découpe le cadre en quatre planches", () => {
    const r = new Recomputer();
    const result = r.recompute(doc(...frame(), splitFrame));
    expect(result.statuses.at(-1)).toMatchObject({ state: "ok" });
    expect(result.bodies).toEqual(["sp#0", "sp#1", "sp#2", "sp#3"]);
    const volumes = result.bodies.map((id) => {
      const out = r.output(id);
      if (out?.kind !== "solid") throw new Error(id);
      return Math.round(bodyMetrics(out.shape).volume);
    });
    // Sorted by x then y: left side, bottom board, top board, right side.
    expect(volumes).toEqual([10800, 18000, 18000, 10800]);
    r.dispose();
  });

  it("permet une opération sur une seule pièce et garde les autres", () => {
    const d = doc(...frame(), splitFrame, { id: "h", type: "hole", name: "Trou", target: "sp#2", x: 0, y: 35, diameter: 4, depth: "through" });
    const r = new Recomputer();
    const result = r.recompute(d);
    expect(result.statuses.at(-1)).toMatchObject({ state: "ok" });
    expect(result.bodies).toEqual(["sp#0", "sp#1", "sp#3", "h"]);
    const out = r.output("h");
    if (out?.kind !== "solid") throw new Error("h");
    expect(bodyMetrics(out.shape).volume).toBeCloseTo(18000 - Math.PI * 4 * 18, 6);
    r.dispose();
  });

  it("supprime en cascade les opérations posées sur une pièce", () => {
    const d = doc(...frame(), splitFrame, { id: "h", type: "hole", name: "Trou", target: "sp#2", x: 0, y: 35, diameter: 4, depth: "through" });
    expect(dependentsOf(d, "sp")).toEqual(["h"]);
    expect(deleteFeature(d, "sp").features.map((f) => f.id)).toEqual(["sk", "ex"]);
    expect(bodyLabel(d, "sp#2")).toBe("Scission — pièce 3");
  });

  it("signale un plan qui ne coupe pas le corps", () => {
    const r = new Recomputer();
    const miss: Feature = { ...splitFrame, planes: [{ point: [0, 500, 0], normal: [0, 1, 0] }] } as Feature;
    const result = r.recompute(doc(...frame(), miss));
    expect(result.statuses.at(-1)?.message).toMatch(/aucun plan ne coupe/);
    r.dispose();
  });

  it("valide le document", () => {
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc(...frame(), splitFrame))))).not.toThrow();
    expect(() => parseDocument(doc(...frame(), { ...splitFrame, planes: [{ point: [0, 0], normal: [0, 1, 0] }] } as unknown as Feature))).toThrow(/plans/);
  });
});
