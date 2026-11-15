import { describe, expect, it } from "vitest";
import { selectAllText } from "../../frontend/src/app/select-all";

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
