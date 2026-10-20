/**
 * Reference acceptance test: 80 x 50 x 10 mm plate with a 10 mm through hole,
 * computed with the real OpenCascade kernel, then modified and recomputed.
 */
import { importSTEP, measureVolume, type Shape3D } from "replicad";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createReferencePlate, type CadDocument, type HoleFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics, isShapeValid } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { exportBodies } from "../../frontend/src/io/exporters";
import { setupKernel } from "./kernel-setup";

const HOLE_AREA = Math.PI * 5 * 5;

function plateShape(recomputer: Recomputer, id = "h1"): Shape3D {
  const output = recomputer.output(id);
  if (!output || output.kind !== "solid") throw new Error(`no solid for ${id}`);
  return output.shape;
}

function sketch(doc: CadDocument): SketchFeature {
  return doc.features[0] as SketchFeature;
}

function hole(doc: CadDocument): HoleFeature {
  return doc.features[2] as HoleFeature;
}

/** Changes a driving dimension of the plate sketch (d1 = longueur X, d2 = largeur Y). */
function setDimension(doc: CadDocument, id: "d1" | "d2", value: number): void {
  const dim = sketch(doc).constraints.find((c) => c.id === id);
  if (!dim || !("value" in dim)) throw new Error("dimension expected");
  dim.value = value;
}

describe("plaque de référence 80 × 50 × 10 avec perçage Ø10", () => {
  let recomputer: Recomputer;

  beforeAll(setupKernel);
  afterEach(() => recomputer?.dispose());

  it("génère un solide exact et valide", () => {
    recomputer = new Recomputer();
    const result = recomputer.recompute(createReferencePlate());

    expect(result.statuses.map((s) => s.state)).toEqual(["ok", "ok", "ok"]);
    expect(result.bodies).toEqual(["h1"]);
    const shape = plateShape(recomputer);
    const metrics = bodyMetrics(shape);
    expect(isShapeValid(shape)).toBe(true);
    expect(metrics.volume).toBeCloseTo(80 * 50 * 10 - HOLE_AREA * 10, 6);
    expect(metrics.bbox).toEqual([[-40, -25, 0], [40, 25, 10]]);
    expect(metrics.faceCount).toBe(7); // 6 faces of the box + 1 cylindrical face
    // Lateral area of the bore + both caps minus the hole openings.
    const expectedArea = 2 * (80 * 50 - HOLE_AREA) + 2 * (80 + 50) * 10 + Math.PI * 10 * 10;
    expect(metrics.area).toBeCloseTo(expectedArea, 6);
  });

  it("recalcule la géométrie quand la largeur change", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    recomputer.recompute(doc);

    setDimension(doc, "d2", 60);
    const result = recomputer.recompute(doc);

    expect(result.statuses.every((s) => s.state === "ok" && !s.reused)).toBe(true);
    const metrics = bodyMetrics(plateShape(recomputer));
    expect(metrics.volume).toBeCloseTo(80 * 60 * 10 - HOLE_AREA * 10, 6);
    expect(metrics.bbox[1][1] - metrics.bbox[0][1]).toBeCloseTo(60, 9);
    expect(isShapeValid(plateShape(recomputer))).toBe(true);
  });

  it("ne recalcule que les opérations en aval d'un changement", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    recomputer.recompute(doc);

    hole(doc).diameter = 12;
    const result = recomputer.recompute(doc);
    expect(result.statuses.map((s) => s.reused)).toEqual([true, true, false]);
    expect(bodyMetrics(plateShape(recomputer)).volume).toBeCloseTo(40000 - Math.PI * 36 * 10, 6);

    doc.features[1]!.name = "Plaque";
    expect(recomputer.recompute(doc).statuses.every((s) => s.reused)).toBe(true);
  });

  it("perce un trou borgne à la profondeur demandée", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    hole(doc).depth = 4;
    recomputer.recompute(doc);
    const metrics = bodyMetrics(plateShape(recomputer));
    expect(metrics.volume).toBeCloseTo(40000 - HOLE_AREA * 4, 6);
    expect(metrics.faceCount).toBe(8); // flat bottom face added
  });

  it("signale un perçage invalide et conserve le dernier corps valide", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    hole(doc).diameter = 0;
    const result = recomputer.recompute(doc);

    expect(result.statuses[2]).toMatchObject({ state: "error" });
    expect(result.statuses[2]?.message).toMatch(/diamètre/);
    expect(result.bodies).toEqual(["ex1"]);
    expect(bodyMetrics(plateShape(recomputer, "ex1")).volume).toBeCloseTo(40000, 6);
  });

  it("refuse un perçage hors du corps", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    hole(doc).x = 200;
    const result = recomputer.recompute(doc);
    expect(result.statuses[2]?.message).toMatch(/ne traverse pas/);
  });

  it("refuse une largeur qui coupe la plaque en deux", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    setDimension(doc, "d2", 8);
    const result = recomputer.recompute(doc);
    expect(result.statuses[1]?.state).toBe("ok");
    expect(result.statuses[2]?.message).toMatch(/2 solides/);
  });

  it("bloque les opérations dépendantes d'une esquisse invalide puis se rétablit", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    setDimension(doc, "d1", -5);
    let result = recomputer.recompute(doc);
    expect(result.statuses.map((s) => s.state)).toEqual(["error", "blocked", "blocked"]);
    expect(result.bodies).toEqual([]);

    setDimension(doc, "d1", 90);
    result = recomputer.recompute(doc);
    expect(result.statuses.map((s) => s.state)).toEqual(["ok", "ok", "ok"]);
    expect(bodyMetrics(plateShape(recomputer)).volume).toBeCloseTo(90 * 50 * 10 - HOLE_AREA * 10, 6);
  });

  it("laisse passer le corps quand le perçage est supprimé", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    hole(doc).suppressed = true;
    const result = recomputer.recompute(doc);
    expect(result.statuses[2]?.state).toBe("suppressed");
    expect(result.bodies).toEqual(["h1"]);
    expect(bodyMetrics(plateShape(recomputer)).volume).toBeCloseTo(40000, 6);
  });

  it("exporte un STEP qui se réimporte avec le même volume", async () => {
    recomputer = new Recomputer();
    recomputer.recompute(createReferencePlate());
    const blob = exportBodies([{ name: "Plaque", shape: plateShape(recomputer) }], "step");
    const text = await blob.text();
    expect(text).toContain("ISO-10303-21");
    expect(text).toContain("MANIFOLD_SOLID_BREP");

    const reimported = (await importSTEP(new Blob([text]))) as Shape3D;
    expect(measureVolume(reimported)).toBeCloseTo(40000 - HOLE_AREA * 10, 4);
    reimported.delete();
  });

  it("exporte un STL binaire non vide", async () => {
    recomputer = new Recomputer();
    recomputer.recompute(createReferencePlate());
    const blob = exportBodies([{ name: "Plaque", shape: plateShape(recomputer) }], "stl");
    const bytes = new DataView(await blob.arrayBuffer());
    const triangles = bytes.getUint32(80, true);
    expect(triangles).toBeGreaterThan(12);
    expect(bytes.byteLength).toBe(84 + triangles * 50);
  });

  it("conserve paramètres et géométrie après sérialisation du document", () => {
    recomputer = new Recomputer();
    const doc = createReferencePlate();
    setDimension(doc, "d2", 62.5);
    const reloaded = parseDocument(JSON.parse(JSON.stringify(doc)));
    expect(reloaded).toEqual(doc);

    recomputer.recompute(reloaded);
    expect(bodyMetrics(plateShape(recomputer)).volume).toBeCloseTo(80 * 62.5 * 10 - HOLE_AREA * 10, 6);
  });
});
