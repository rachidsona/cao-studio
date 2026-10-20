/** Offsets as operations of the timeline: they are recorded with their sketch, renamed, redone or deleted. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import type { OffsetRecord, SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature, SketchFeature } from "../../frontend/src/document/types";
import { uniqueOffsetId } from "../../frontend/src/document/operations";
import { parseDocument } from "../../frontend/src/document/validate";
import { offsetPaths } from "../../frontend/src/geometry/offset";
import { Recomputer } from "../../frontend/src/history/recompute";
import { addRectangle, cloneGeometry, removeEntities } from "../../frontend/src/sketcher/edit";
import { addOffsetCurves, offsetName, pathsFromCurves, removeOffsetFrom, renameOffsetIn } from "../../frontend/src/sketcher/offset";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });

/** A 10 × 10 square with one offset recorded (what the tool stores on confirmation). */
function withOffset(): { sketch: SketchFeature; record: OffsetRecord } {
  const base = addRectangle(empty(), { at: [0, 0] }, { at: [10, 10] }).geometry;
  const source = base.curves.map((c) => c.id);
  const { curves } = offsetPaths(pathsFromCurves(base, source), -2, "sharp");
  const { geometry, created } = addOffsetCurves(base, curves);
  const record: OffsetRecord = { id: "of1", name: "Décalage 1", curves: created, source, distance: -2, both: false, join: "sharp" };
  return { sketch: { id: "sk", type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...geometry, offsets: [record] }, record };
}

describe("décalages enregistrés", () => {
  it("la copie et le solveur gardent l'enregistrement", () => {
    const { sketch, record } = withOffset();
    expect(cloneGeometry(sketch).offsets).toEqual([record]);
    expect(solveSketch(sketch).geometry.offsets).toEqual([record]);
  });

  it("supprimer un décalage retire ses courbes et son enregistrement, jamais l'original", () => {
    const { sketch, record } = withOffset();
    const after = removeOffsetFrom(sketch, "of1");
    expect(after.offsets).toBeUndefined();
    expect(after.curves.map((c) => c.id)).toEqual(sketch.curves.filter((c) => !record.curves.includes(c.id)).map((c) => c.id));
    expect(after.curves).toHaveLength(4); // the original square
    expect(removeOffsetFrom(after, "of1")).toBe(after); // unknown offset: nothing changes
  });

  it("effacer à la main des courbes du décalage met l'enregistrement à jour", () => {
    const { sketch, record } = withOffset();
    const partial = removeEntities(sketch, [record.curves[0] as string]);
    expect(partial.offsets?.[0]?.curves).toHaveLength(record.curves.length - 1);
    const all = removeEntities(sketch, record.curves);
    expect(all.offsets).toBeUndefined();
  });

  it("renommer ne change que le nom", () => {
    const { sketch } = withOffset();
    const renamed = renameOffsetIn(sketch, "of1", "Retrait");
    expect(renamed.offsets?.[0]).toMatchObject({ id: "of1", name: "Retrait", distance: -2 });
    expect(renamed.curves).toBe(sketch.curves);
  });

  it("noms et identifiants uniques", () => {
    const { sketch } = withOffset();
    expect(offsetName(sketch)).toBe("Décalage 2");
    expect(offsetName(empty())).toBe("Décalage 1");
    const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [sketch] };
    expect(uniqueOffsetId(doc)).toBe("of2");
    expect(uniqueOffsetId({ ...doc, features: [] })).toBe("of1");
  });

  it("renommer un décalage ne recalcule ni l'esquisse ni l'extrusion", () => {
    const { sketch } = withOffset();
    const extrude: Feature = { id: "ex", type: "extrude", name: "X", sketch: "sk", distance: 5, operation: "new" };
    const doc = (s: SketchFeature): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [s, extrude] });
    const r = new Recomputer();
    r.recompute(doc(sketch));
    const again = r.recompute(doc(renameOffsetIn(sketch, "of1", "Autre nom")));
    expect(again.statuses.map((s) => [s.id, s.reused])).toEqual([["sk", true], ["ex", true]]);
    r.dispose();
  });

  it("le document accepte les décalages et refuse un enregistrement mal formé", () => {
    const { sketch } = withOffset();
    const doc = (offsets: unknown) => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [{ ...sketch, offsets }] });
    expect(() => parseDocument(doc(sketch.offsets))).not.toThrow();
    expect(() => parseDocument(doc([{ id: "of1" }]))).toThrow(/décalages/);
    expect(() => parseDocument(doc("non"))).toThrow(/décalages/);
  });
});
