/** Calques de corps : création, affectation, masquage qui cache les corps, suppression qui les rend. */
import { describe, expect, it } from "vitest";
import { addLayer, assignLayer, bodiesOnLayer, removeLayer, renameLayer, setLayerVisible } from "../../frontend/src/document/layers";
import { addPlate, isBodyHidden } from "../../frontend/src/document/operations";
import { createReferencePlate } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

describe("calques", () => {
  it("un corps sur un calque caché est caché ; le calque supprimé, il revient", () => {
    let doc = addPlate(createReferencePlate(), 20, 20, 5, 200, 0);
    const plate = doc.features.at(-1)!.id;
    const added = addLayer(doc, "Façades");
    doc = assignLayer(added.doc, ["h1"], added.id);
    expect(bodiesOnLayer(doc, ["h1", plate], added.id)).toEqual(["h1"]);
    expect(isBodyHidden(doc, "h1")).toBe(false);
    doc = setLayerVisible(doc, added.id, false);
    expect(isBodyHidden(doc, "h1")).toBe(true);
    expect(isBodyHidden(doc, plate)).toBe(false);
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    doc = removeLayer(doc, added.id);
    expect(isBodyHidden(doc, "h1")).toBe(false);
    expect(doc.layers).toEqual([]);
  });

  it("les noms restent uniques et se renomment", () => {
    const a = addLayer(createReferencePlate(), "Caisson");
    const b = addLayer(a.doc, "Caisson");
    expect(b.doc.layers!.map((l) => l.name)).toEqual(["Caisson", "Caisson 2"]);
    expect(renameLayer(b.doc, b.id, "Fonds").layers![1]!.name).toBe("Fonds");
    expect(renameLayer(b.doc, b.id, "  ").layers![1]!.name).toBe("Caisson 2");
  });
});
