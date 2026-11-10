/** La liste de débit rangée par type d'élément, par bois, par épaisseur, ou par type et épaisseur. */
import { describe, expect, it } from "vitest";
import { cutGroups, partKind, rowKinds } from "../../frontend/src/document/cut-groups";
import type { CutRow } from "../../frontend/src/document/cut-list";

const row = (tag: string, names: string[], material: string, thickness: number, length = 700, width = 500): CutRow => ({
  tag, names, ids: names.map((_, i) => `${tag}${i}`), runs: names.map(() => null), quantity: names.length, length, width, thickness, material,
  grain: "length", edges: { length1: false, length2: false, width1: false, width2: false }, band: 0, cutLength: length, cutWidth: width, approximate: false,
});

describe("type d'élément d'une pièce", () => {
  it("se lit dans son nom, sans son meuble, son numéro ni son côté", () => {
    expect(partKind("Bas 2 portes 1000 (A1) — Côté gauche")).toBe("Côté");
    expect(partKind("Bas 2 portes 1000 (A1) — Côté droit")).toBe("Côté");
    expect(partKind("Étagère 12")).toBe("Étagère");
    expect(partKind("Bas évier 800 (A2) — Traverse avant")).toBe("Traverse");
    expect(partKind("Façades Bas 2 portes 1000 (A1) — Porte gauche")).toBe("Porte");
    expect(partKind("Plan de travail A")).toBe("Plan de travail");
    expect(partKind("Plinthe d'angle A")).toBe("Plinthe");
    expect(partKind("Fond 1 — Fond")).toBe("Fond");
    expect(partKind("Façade tiroir 2")).toBe("Façade tiroir");
    expect(partKind("Porte pliante haute C")).toBe("Porte pliante");
    expect(partKind("Habillage — panneau 3")).toBe("Panneau");
    // A copy says nothing: the piece before it does.
    expect(partKind("Caisson 1 — Dessus — symétrie")).toBe("Dessus");
    expect(partKind("Cloison 4 — Réseau 1 (2)")).toBe("Cloison");
    expect(partKind("")).toBe("Pièce");
  });
});

describe("listes de la liste de débit", () => {
  const rows = [
    row("A", ["Caisson — Côté gauche", "Caisson — Côté droit"], "Chêne massif", 18, 870, 560),
    row("B", ["Cloison 1", "Étagère 1", "Étagère 2"], "Chêne massif", 18),
    row("C", ["Étagère 3"], "Mélaminé blanc", 18, 600, 400),
    row("D", ["Fond"], "Mélaminé blanc", 8, 860, 560),
    row("E", ["Étagère 4"], "Mélaminé blanc", 22, 900, 400),
  ];
  const shape = (by: Parameters<typeof cutGroups>[1]) => cutGroups(rows, by).map((g) => [g.title, g.thickness ?? null, g.rows.map((r) => `${r.tag}×${r.quantity}`).join(" ")]);

  it("par matière et épaisseur : comme elle est faite", () => {
    expect(shape("material")).toEqual([["Chêne massif", 18, "A×2 B×3"], ["Mélaminé blanc", 18, "C×1"], ["Mélaminé blanc", 8, "D×1"], ["Mélaminé blanc", 22, "E×1"]]);
  });

  it("par type d'élément : une ligne de pièces identiques de types différents est partagée, sous le même repère", () => {
    expect(shape("kind")).toEqual([["Cloison", null, "B×1"], ["Côté", null, "A×2"], ["Étagère", null, "B×2 C×1 E×1"], ["Fond", null, "D×1"]]);
    const shelves = cutGroups(rows, "kind").find((g) => g.title === "Étagère")!.rows[0]!;
    expect(shelves).toMatchObject({ tag: "B", names: ["Étagère 1", "Étagère 2"], ids: ["B1", "B2"], quantity: 2 });
    // Nothing lost, nothing counted twice.
    expect(cutGroups(rows, "kind").flatMap((g) => g.rows).reduce((sum, r) => sum + r.quantity, 0)).toBe(8);
  });

  it("par type de bois, par épaisseur (de la plus forte), par type et épaisseur à la fois", () => {
    expect(shape("wood")).toEqual([["Chêne massif", null, "A×2 B×3"], ["Mélaminé blanc", null, "C×1 D×1 E×1"]]);
    expect(shape("thickness")).toEqual([["Épaisseur", 22, "E×1"], ["Épaisseur", 18, "A×2 B×3 C×1"], ["Épaisseur", 8, "D×1"]]);
    expect(shape("kind-thickness")).toEqual([["Cloison", 18, "B×1"], ["Côté", 18, "A×2"], ["Étagère", 22, "E×1"], ["Étagère", 18, "B×2 C×1"], ["Fond", 8, "D×1"]]);
    expect(rowKinds(rows[1]!)).toBe("Cloison, Étagère");
  });
});
