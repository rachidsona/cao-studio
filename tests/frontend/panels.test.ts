/** Panels from a skeleton (furniture): each line of the sketch becomes a board, without shared material at the corners. */
import { beforeAll, describe, expect, it } from "vitest";
import { bodyLabel } from "../../frontend/src/document/operations";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, PanelsFeature, SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { boardOutlines } from "../../frontend/src/features/panels";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** Cabinet 600 × 800 seen from the front (outline) and a shelf at mid-height. */
function skeleton(withShelf = true): SketchGeometry {
  const pts: [string, number, number][] = [["a", 0, 0], ["b", 600, 0], ["c", 600, 800], ["d", 0, 800], ["e", 0, 400], ["f", 600, 400]];
  const lines: [string, string, string][] = [["bottom", "a", "b"], ["right", "b", "c"], ["top", "c", "d"], ["left", "d", "a"]];
  if (withShelf) lines.push(["shelf", "e", "f"]);
  return {
    points: pts.map(([id, x, y]) => ({ id, x, y })),
    curves: lines.map(([id, p1, p2]) => ({ id, kind: "line" as const, p1, p2 })),
    constraints: [],
  };
}

const range = (poly: [number, number][]) => {
  const xs = poly.map((p) => Number(p[0].toFixed(6)));
  const ys = poly.map((p) => Number(p[1].toFixed(6)));
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
};

describe("planches d'un squelette", () => {
  it("sur le contour, vers l'intérieur ; une étagère intérieure est centrée ; les côtés passent", () => {
    const boards = boardOutlines(skeleton(), { thickness: 18, align: "inside", through: "vertical" });
    const by = (id: string) => boards.find((b) => b.lineId === id)!;
    expect(range(by("left").polygon)).toEqual([0, 18, 0, 800]);
    expect(range(by("right").polygon)).toEqual([582, 600, 0, 800]);
    expect(range(by("bottom").polygon)).toEqual([0, 600, 0, 18]);
    expect(range(by("shelf").polygon)).toEqual([0, 600, 391, 409]);
    expect(by("left").through).toBe(true);
    expect(by("bottom").cutBy).toHaveLength(2); // cut against both sides
    expect(by("shelf").cutBy).toHaveLength(2);
  });

  it("vers l'extérieur, ou centrées sur les traits", () => {
    const out = boardOutlines(skeleton(false), { thickness: 18, align: "outside", through: "vertical" });
    expect(range(out.find((b) => b.lineId === "left")!.polygon)).toEqual([-18, 0, 0, 800]);
    const centred = boardOutlines(skeleton(false), { thickness: 18, align: "center", through: "vertical" });
    expect(range(centred.find((b) => b.lineId === "left")!.polygon)).toEqual([-9, 9, 0, 800]);
  });
});

describe("coupe d'onglet aux coins", () => {
  const area = (poly: [number, number][]) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const has = (poly: [number, number][], x: number, y: number) => poly.some((p) => Math.hypot(p[0] - x, p[1] - y) < 1e-6);

  it("les deux planches d'un coin sont coupées sur sa bissectrice (45° d'équerre), sans matière partagée", () => {
    const boards = boardOutlines(skeleton(), { thickness: 18, align: "inside", through: "miter" });
    const by = (id: string) => boards.find((b) => b.lineId === id)!;
    // The corner (0, 0): the outer point and the inner one at (18, 18), on both boards.
    for (const id of ["left", "bottom"]) expect(has(by(id).polygon, 0, 0) && has(by(id).polygon, 18, 18)).toBe(true);
    expect(has(by("top").polygon, 582, 782)).toBe(true);
    // The frame's boards fill the ring exactly: no overlap, no gap.
    const frame = ["left", "right", "top", "bottom"].reduce((s, id) => s + area(by(id).polygon), 0);
    expect(frame).toBeCloseTo(600 * 800 - 564 * 764, 6);
    // The shelf is cut against both sides, the frame's boards against nothing.
    expect(by("shelf").cutBy).toHaveLength(2);
    expect(by("left").cutBy).toHaveLength(0);
  });

  it("un triangle aux angles aigus : les trois planches remplissent l'anneau, sans chevauchement", () => {
    const P: [number, number][] = [[0, 0], [400, 60], [380, -700]];
    const g: SketchGeometry = {
      points: P.map(([x, y], i) => ({ id: `p${i}`, x, y })),
      curves: [0, 1, 2].map((i) => ({ id: `l${i}`, kind: "line" as const, p1: `p${i}`, p2: `p${(i + 1) % 3}` })),
      constraints: [],
    };
    const boards = boardOutlines(g, { thickness: 18, align: "inside", through: "miter" });
    const outer = area(P);
    const perimeter = P.reduce((s, p, i) => s + Math.hypot(P[(i + 1) % 3]![0] - p[0], P[(i + 1) % 3]![1] - p[1]), 0);
    const r = (2 * outer) / perimeter; // inradius: the inner triangle is the outer one scaled by (r − t) / r
    const ring = outer * (1 - ((r - 18) / r) ** 2);
    expect(boards.reduce((s, b) => s + area(b.polygon), 0)).toBeCloseTo(ring, 6);
  });

  it("centrées sur les traits, l'onglet passe aussi par le coin", () => {
    const boards = boardOutlines(skeleton(false), { thickness: 18, align: "center", through: "miter" });
    const left = boards.find((b) => b.lineId === "left")!;
    expect(has(left.polygon, -9, -9) && has(left.polygon, 9, 9)).toBe(true);
  });
});

describe("caisson en panneaux (noyau)", () => {
  const doc = (over: Partial<PanelsFeature> = {}): CadDocument => ({
    format: "cao-studio",
    schemaVersion: 2,
    units: "mm",
    parameters: {},
    features: [
      { id: "sk", type: "sketch", name: "Squelette", plane: "XY", offset: 0, ...skeleton() } as SketchFeature,
      { id: "pn", type: "panels", name: "Panneaux 1", sketch: "sk", thickness: 18, depth: 400, align: "inside", through: "vertical", ...over },
    ],
  });

  it("un corps par planche, aux bonnes dimensions, sans matière partagée", () => {
    const r = new Recomputer();
    const result = r.recompute(doc());
    expect(result.statuses.find((s) => s.id === "pn")).toMatchObject({ state: "ok" });
    expect(result.bodies).toHaveLength(5);
    const volumes = result.bodies.map((id) => {
      const out = r.output(id);
      if (out?.kind !== "solid") throw new Error("solid expected");
      return bodyMetrics(out.shape).volume;
    });
    const side = 18 * 800 * 400;
    const across = (600 - 36) * 18 * 400;
    expect(volumes.sort((a, b) => a - b).map((v) => Math.round(v))).toEqual([across, across, across, side, side].sort((a, b) => a - b));
    r.dispose();
  });

  it("dessus et dessous passants : ce sont les côtés qui sont raccourcis", () => {
    const r = new Recomputer();
    const result = r.recompute(doc({ through: "horizontal" }));
    const heights = result.bodies.map((id) => {
      const out = r.output(id);
      if (out?.kind !== "solid") throw new Error("solid expected");
      const [min, max] = bodyMetrics(out.shape).bbox;
      return Math.round(max[1] - min[1]);
    });
    expect(heights.filter((h) => h === 800 - 36)).toHaveLength(2);
    r.dispose();
  });

  it("en coupe d'onglet : cinq corps valides, le cadre sans matière partagée, relu tel quel", () => {
    const r = new Recomputer();
    const d = doc({ through: "miter" });
    const result = r.recompute(d);
    expect(result.statuses.find((s) => s.id === "pn")).toMatchObject({ state: "ok" });
    expect(result.bodies).toHaveLength(5);
    const total = result.bodies.reduce((s, id) => {
      const out = r.output(id);
      if (out?.kind !== "solid") throw new Error("solid expected");
      return s + bodyMetrics(out.shape).volume;
    }, 0);
    expect(total).toBeCloseTo((600 * 800 - 564 * 764 + 564 * 18) * 400, -2);
    expect(parseDocument(JSON.parse(JSON.stringify(d))).features.at(-1)).toMatchObject({ through: "miter" });
    r.dispose();
  });

  it("noms des corps, relecture et refus d'un document mal formé", () => {
    const d = doc();
    expect(bodyLabel(d, "pn#1")).toBe("Panneaux 1 — panneau 2");
    expect(parseDocument(JSON.parse(JSON.stringify(d))).features.at(-1)).toEqual(d.features.at(-1));
    const bad = JSON.parse(JSON.stringify(d));
    bad.features[1].align = "dessus";
    expect(() => parseDocument(bad)).toThrow(/côté des panneaux/);
  });
});
