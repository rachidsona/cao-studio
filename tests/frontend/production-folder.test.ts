/** Le dossier de production : sa page de garde et la liste d'achat en tableur. */
import { describe, expect, it } from "vitest";
import { FOLDER_ITEMS, folderReadme } from "../../frontend/src/document/production-folder";
import { purchaseCsv } from "../../frontend/src/document/purchase";

describe("page de garde du dossier", () => {
  it("dit ce qu'il contient et que le contrôle est bon", () => {
    const text = folderReadme("Dressing", "06/11/2026", ["01-liste-de-debit.csv"], { errors: [], warnings: [] }, []);
    expect(text).toContain("Dossier de production : Dressing");
    expect(text).toContain("  - 01-liste-de-debit.csv");
    expect(text).toContain("aucun problème trouvé");
  });

  it("garde les erreurs et les remarques avec les fichiers", () => {
    const text = folderReadme("D", "06/11/2026", [], { errors: ["Deux pièces se chevauchent."], warnings: ["Étagère longue."] }, ["Perçages sur chant à faire à part."]);
    expect(text).toContain("ERREURS à corriger avant de fabriquer\n  - Deux pièces se chevauchent.");
    expect(text).toContain("Points à vérifier\n  - Étagère longue.");
    expect(text).toContain("Remarques\n  - Perçages sur chant");
    expect(text).not.toContain("aucun problème trouvé");
  });

  it("laisse le devis hors du dossier de l'atelier, sauf à le demander", () => {
    expect(FOLDER_ITEMS.filter((i) => i.off).map((i) => i.key)).toEqual(["quote"]);
  });
});

describe("liste d'achat en tableur", () => {
  it("met une ligne par article, en décimales françaises, et protège les points-virgules", () => {
    const csv = purchaseCsv([
      { label: "Mélaminé blanc 18 mm", quantity: 3, unit: "panneaux" },
      { label: "Chant ; 1 mm", quantity: 12.5, unit: "m", detail: 'dit "fin"' },
    ] as Parameters<typeof purchaseCsv>[0]);
    expect(csv.split("\n")).toEqual(["Article;Quantité;Unité;Détail", "Mélaminé blanc 18 mm;3;panneaux;", '"Chant ; 1 mm";12,5;m;"dit ""fin"""']);
  });
});
