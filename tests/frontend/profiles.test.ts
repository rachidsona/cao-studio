/** Closed-profile extraction and v1 → v2 migration, checked through real extrusions. */
import { beforeAll, describe, expect, it } from "vitest";
import { migrateDocument } from "../../frontend/src/document/migrate";
import { centeredRectangle, type SketchGeometry } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

function extrudedVolume(geometry: SketchGeometry, distance = 10): { volume?: number; message?: string } {
  const doc: CadDocument = {
    format: "cao-studio",
    schemaVersion: 2,
    units: "mm",
    parameters: {},
    features: [
      { id: "sk", type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...geometry },
      { id: "ex", type: "extrude", name: "Extrusion", sketch: "sk", distance, operation: "new" },
    ],
  };
  const recomputer = new Recomputer();
  try {
    const result = recomputer.recompute(doc);
    const output = recomputer.output("ex");
    if (output?.kind !== "solid") return { message: result.statuses.find((s) => s.message)?.message };
    return { volume: bodyMetrics(output.shape).volume };
  } finally {
    recomputer.dispose();
  }
}

const circle = (id: string, x: number, y: number, r: number): Pick<SketchGeometry, "points" | "curves"> => ({
  points: [{ id: `${id}c`, x, y }],
  curves: [{ id, kind: "circle", center: `${id}c`, radius: r }],
});

function merge(...parts: Partial<SketchGeometry>[]): SketchGeometry {
  return {
    points: parts.flatMap((p) => p.points ?? []),
    curves: parts.flatMap((p) => p.curves ?? []),
    constraints: parts.flatMap((p) => p.constraints ?? []),
  };
}

describe("profils fermés", () => {
  beforeAll(setupKernel);

  it("perce un trou pour une boucle intérieure (règle pair-impair)", () => {
    const { volume } = extrudedVolume(merge(centeredRectangle(80, 50), circle("k", 10, 5, 5)));
    expect(volume).toBeCloseTo(40000 - Math.PI * 25 * 10, 6);
  });

  it("garde un îlot à l'intérieur d'un trou et signale les corps disjoints", () => {
    // The island is material again, hence a second, disconnected solid: one body per extrusion is required.
    const { message } = extrudedVolume(merge(centeredRectangle(80, 50), circle("k1", 0, 0, 20), circle("k2", 0, 0, 5)));
    expect(message).toMatch(/2 solides/);
  });

  it("garde un îlot relié au reste par la règle pair-impair (anneau)", () => {
    const { volume } = extrudedVolume(merge(circle("k1", 0, 0, 20), circle("k2", 0, 0, 5)));
    expect(volume).toBeCloseTo(Math.PI * (400 - 25) * 10, 6);
  });

  it("extrude une oblongue faite de lignes et d'arcs", () => {
    // Slot: two half circles of radius 5 joined by lines of length 20.
    const geometry: SketchGeometry = {
      points: [
        { id: "a", x: -10, y: -5 },
        { id: "b", x: 10, y: -5 },
        { id: "c", x: 10, y: 5 },
        { id: "d", x: -10, y: 5 },
        { id: "o1", x: 10, y: 0 },
        { id: "o2", x: -10, y: 0 },
      ],
      curves: [
        { id: "l1", kind: "line", p1: "a", p2: "b" },
        { id: "r", kind: "arc", center: "o1", start: "b", end: "c", radius: 5, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 },
        { id: "l2", kind: "line", p1: "c", p2: "d" },
        { id: "l", kind: "arc", center: "o2", start: "d", end: "a", radius: 5, startAngle: Math.PI / 2, endAngle: (3 * Math.PI) / 2 },
      ],
      constraints: [],
    };
    const { volume } = extrudedVolume(geometry, 2);
    expect(volume).toBeCloseTo((20 * 10 + Math.PI * 25) * 2, 6);
  });

  it("ignore la géométrie de construction", () => {
    const geometry = merge(centeredRectangle(80, 50), {
      points: [{ id: "x1", x: -40, y: -25 }, { id: "x2", x: 40, y: 25 }],
      curves: [{ id: "diag", kind: "line", p1: "x1", p2: "x2", construction: true }],
    });
    expect(extrudedVolume(geometry).volume).toBeCloseTo(40000, 6);
  });

  it("signale un profil ouvert", () => {
    const geometry = centeredRectangle(80, 50);
    geometry.curves = geometry.curves.filter((c) => c.id !== "l3");
    geometry.constraints = geometry.constraints.filter((c) => !("line" in c && c.line === "l3"));
    expect(extrudedVolume(geometry).message).toMatch(/Profil ouvert/);
  });

  it("ignore un segment qui dépasse : seule la zone fermée est extrudée", () => {
    // A spur from the corner to the middle used to make the whole sketch "branched" and unextrudable.
    const geometry = merge(centeredRectangle(80, 50), {
      points: [{ id: "m", x: 0, y: 0 }],
      curves: [{ id: "spur", kind: "line", p1: "p1", p2: "m" }],
    });
    expect(extrudedVolume(geometry).volume).toBeCloseTo(40000, 6);
  });
});

describe("plans d'esquisse", () => {
  beforeAll(setupKernel);

  it.each([
    ["XZ", [[-40, -10, -25], [40, 0, 25]]],
    ["YZ", [[0, -40, -25], [10, 40, 25]]],
  ] as const)("extrude une esquisse du plan %s le long de sa normale", (plane, bbox) => {
    const doc: CadDocument = {
      format: "cao-studio",
      schemaVersion: 2,
      units: "mm",
      parameters: {},
      features: [
        { id: "sk", type: "sketch", name: "Esquisse", plane, offset: 0, ...centeredRectangle(80, 50) },
        { id: "ex", type: "extrude", name: "Extrusion", sketch: "sk", distance: 10, operation: "new" },
      ],
    };
    const recomputer = new Recomputer();
    recomputer.recompute(doc);
    const output = recomputer.output("ex");
    if (output?.kind !== "solid") throw new Error("solid expected");
    const metrics = bodyMetrics(output.shape);
    expect(metrics.volume).toBeCloseTo(40000, 6);
    metrics.bbox.forEach((corner, i) => corner.forEach((v, j) => expect(v).toBeCloseTo(bbox[i]![j]!, 6)));
    recomputer.dispose();
  });
});

describe("migration du schéma v1", () => {
  beforeAll(setupKernel);

  it("convertit rectangles et cercles v1 en esquisses contraintes équivalentes", () => {
    const v1 = {
      format: "cao-studio",
      schemaVersion: 1,
      units: "mm",
      parameters: {},
      features: [
        {
          id: "sk1",
          type: "sketch",
          name: "Esquisse 1",
          plane: "XY",
          offset: 0,
          entities: [
            { id: "r1", kind: "rectangle", cx: 5, cy: -3, width: 80, height: 50 },
            { id: "c1", kind: "circle", cx: 20, cy: 0, diameter: 8 },
          ],
        },
        { id: "ex1", type: "extrude", name: "Extrusion 1", sketch: "sk1", distance: 10, operation: "new" },
      ],
    };
    const doc = parseDocument(v1);
    expect(doc.schemaVersion).toBe(2);
    const recomputer = new Recomputer();
    const result = recomputer.recompute(doc);
    expect(result.statuses.map((s) => s.state)).toEqual(["ok", "ok"]);
    const output = recomputer.output("ex1");
    if (output?.kind !== "solid") throw new Error("solid expected");
    const metrics = bodyMetrics(output.shape);
    expect(metrics.volume).toBeCloseTo(40000 - Math.PI * 16 * 10, 6);
    expect(metrics.bbox[0]).toEqual([-35, -28, 0]);
    const sketch = recomputer.output("sk1");
    expect(sketch?.kind === "profile" && sketch.dof).toBe(0);
    recomputer.dispose();
  });

  it("laisse intact un document déjà en v2", () => {
    const doc = createReferencePlate();
    expect(migrateDocument(doc)).toBe(doc);
  });
});
