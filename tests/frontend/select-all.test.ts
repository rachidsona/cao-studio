import { describe, expect, it } from "vitest";
import { selectAllText, selectSketchesText } from "../../frontend/src/app/select-all";

describe("Tout sélectionner", () => {
  it("dit ce qui est pris", () => {
    expect(selectAllText(12, 2)).toBe("Tout est sélectionné : 12 corps et 2 esquisses. Échap vide la sélection.");
    expect(selectAllText(1, 0)).toBe("Tout est sélectionné : 1 corps. Échap vide la sélection.");
    expect(selectAllText(0, 1)).toBe("Tout est sélectionné : 1 esquisse. Échap vide la sélection.");
  });

  it("dit pourquoi rien ne l'est", () => {
    expect(selectAllText(0, 0)).toMatch(/^Rien à sélectionner/);
  });
});

describe("Sélectionner les esquisses", () => {
  it("dit combien sont prises, et celles cachées laissées", () => {
    expect(selectSketchesText(3, 3)).toBe("3 esquisses sélectionnées. Échap vide la sélection.");
    expect(selectSketchesText(1, 3)).toBe("1 esquisse sélectionnée (2 cachées, non prises). Échap vide la sélection.");
  });

  it("dit pourquoi aucune ne l'est", () => {
    expect(selectSketchesText(0, 2)).toMatch(/^Aucune esquisse montrée.*2 esquisses sont cachées/);
    expect(selectSketchesText(0, 0)).toBe("Aucune esquisse dans le projet.");
  });
});
