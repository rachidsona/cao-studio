/** Cartes du panneau de droite : retenues pliées sous leur nom, sans ce qui y change. */
import { describe, expect, it } from "vitest";
import { sectionKey } from "../../frontend/src/ui/fields";

describe("cartes dépliables", () => {
  it("se retiennent sous leur nom, sans le nombre ni le détail qui changent", () => {
    expect(sectionKey("Contraintes (4)")).toBe("Contraintes");
    expect(sectionKey("Sélection (1 face, 2 arêtes)")).toBe("Sélection");
    expect(sectionKey("Mesures — Caisson bas — Étagère 1")).toBe("Mesures");
    expect(sectionKey("Cotes")).toBe("Cotes");
  });
});
