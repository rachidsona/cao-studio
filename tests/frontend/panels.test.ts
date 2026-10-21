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

  it("noms des corps, relecture et refus d'un document mal formé", () => {
    const d = doc();
    expect(bodyLabel(d, "pn#1")).toBe("Panneaux 1 — panneau 2");
    expect(parseDocument(JSON.parse(JSON.stringify(d))).features.at(-1)).toEqual(d.features.at(-1));
    const bad = JSON.parse(JSON.stringify(d));
    bad.features[1].align = "dessus";
    expect(() => parseDocument(bad)).toThrow(/côté des panneaux/);
  });
});
