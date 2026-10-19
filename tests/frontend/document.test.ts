import { describe, expect, it } from "vitest";
import { createReferencePlate } from "../../frontend/src/document/types";
import { parseDocument, validateDocument } from "../../frontend/src/document/validate";
import { UndoStack } from "../../frontend/src/history/undo";

describe("validation du document natif", () => {
  it("accepte la plaque de référence", () => {
    expect(validateDocument(createReferencePlate())).toEqual([]);
  });

  it("rejette les entrées non conformes", () => {
    expect(validateDocument(null)).toHaveLength(1);
    expect(validateDocument({ ...createReferencePlate(), format: "autre" })[0]).toMatch(/Format/);
    const doc = createReferencePlate() as unknown as { features: Record<string, unknown>[] };
    doc.features[1]!.id = "sk1";
    doc.features[2]!.diameter = "10";
    const errors = validateDocument(doc);
    expect(errors.some((e) => e.includes("dupliqué"))).toBe(true);
    expect(errors.some((e) => e.includes("diameter"))).toBe(true);
  });

  it("rejette les nombres non finis", () => {
    const doc = createReferencePlate();
    (doc.features[1] as { distance: number }).distance = Number.NaN;
    expect(() => parseDocument(doc)).toThrow(/distance/);
  });
});

describe("annuler / rétablir", () => {
  it("restaure les états successifs", () => {
    const stack = new UndoStack();
    const v1 = createReferencePlate();
    const v2 = structuredClone(v1);
    (v2.features[1] as { distance: number }).distance = 20;

    stack.push(v1);
    expect(stack.undo(v2)).toEqual(v1);
    expect(stack.redo(v1)).toEqual(v2);
    expect(stack.canRedo).toBe(false);
  });

  it("vide les états rétablissables après une nouvelle modification", () => {
    const stack = new UndoStack();
    const doc = createReferencePlate();
    stack.push(doc);
    stack.undo(doc);
    stack.push(doc);
    expect(stack.canRedo).toBe(false);
  });
});
