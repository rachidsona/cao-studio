/** Bodies of the browser: their name, the feature that created them, hiding and deleting. */
import { describe, expect, it } from "vitest";
import { addExtrude, addHole, addPlate, bodyLabel, bodyOrigin, deleteFeature, renameBody, toggleHidden } from "../../frontend/src/document/operations";
import { createReferencePlate } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

describe("corps", () => {
  it("un corps est nommé « Corps n » dans l'ordre de création, pas du nom de sa dernière opération", () => {
    const doc = createReferencePlate(); // sk1, ex1 (plate), h1 (hole on ex1)
    expect(doc.features.map((f) => f.id)).toEqual(["sk1", "ex1", "h1"]);
    expect(bodyOrigin(doc, "h1")).toBe("ex1");
    expect(bodyLabel(doc, "h1")).toBe("Corps 1");
    const two = addPlate(doc, 20, 20, 5, 200, 0);
    const second = two.features.at(-1)!.id;
    expect(bodyLabel(two, second)).toBe("Corps 2");
    expect(bodyLabel(two, "h1")).toBe("Corps 1");
  });

  it("renommer un corps garde le nom à travers ses opérations suivantes", () => {
    const named = renameBody(createReferencePlate(), "h1", "Plaque");
    expect(bodyLabel(named, "h1")).toBe("Plaque");
    expect(bodyLabel(named, "ex1")).toBe("Plaque"); // same body, before the hole
    expect(named.bodyNames).toEqual({ ex1: "Plaque" });
    // A hole added later keeps the body's name.
    const more = addHole(named, "h1", 20, 10, 4);
    expect(bodyLabel(more, more.features.at(-1)!.id)).toBe("Plaque");
  });

  it("supprimer l'origine d'un corps retire ses opérations et son nom, qu'un nouvel id ne reprend pas", () => {
    const named = renameBody(createReferencePlate(), "h1", "Plaque");
    const without = deleteFeature(named, "ex1");
    expect(without.features.map((f) => f.id)).toEqual(["sk1"]);
    expect(without.bodyNames).toEqual({});
    // The freed id is reused by the next extrusion: it starts without the old name.
    const again = addExtrude(without, "sk1", 5);
    expect(again.features.at(-1)!.id).toBe("ex1");
    expect(bodyLabel(again, "ex1")).toBe("Corps 1");
  });

  it("masquer bascule le champ hidden sans toucher au reste", () => {
    const doc = createReferencePlate();
    const hidden = toggleHidden(doc, "ex1");
    expect(hidden.features.find((f) => f.id === "ex1")).toMatchObject({ hidden: true });
    expect(toggleHidden(hidden, "ex1").features.find((f) => f.id === "ex1")).toMatchObject({ hidden: false });
    expect(doc.features.find((f) => f.id === "ex1")).not.toHaveProperty("hidden"); // the input is not modified
  });

  it("le document accepte bodyNames et refuse un nom qui n'est pas du texte", () => {
    const doc = renameBody(createReferencePlate(), "h1", "Plaque");
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    expect(() => parseDocument({ ...doc, bodyNames: { ex1: 3 } })).toThrow(/bodyNames/);
  });
});
