/** Le dossier de cuisine : plan coté, élévation de chaque linéaire, liste des meubles, et son PDF. */
import { describe, expect, it } from "vitest";
import { kitchenDossier } from "../../frontend/src/document/kitchen-dossier";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { sheetsPdf } from "../../frontend/src/drawing/svg-pdf";

const cm = (mm: number) => `${Math.round(mm / 10)} cm`;

describe("dossier de cuisine", () => {
  it("sans plan, ou vide, il le dit", () => {
    const empty: CadDocument = { ...createReferencePlate(), features: [] };
    expect(kitchenDossier(empty, "Essai", cm)).toMatch(/pas de plan de cuisine/);
    expect(kitchenDossier(withKitchenPlan(empty, { ...KITCHEN_PLAN }).doc, "Essai", cm)).toMatch(/vides/);
  });

  it("un plan en L proposé : le plan coté, une élévation par linéaire, la liste, et un PDF", () => {
    const p = { ...KITCHEN_PLAN, model: "L-left" as const, island: true };
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, p);
    const built = withKitchenBuilt(made.doc, made.id, proposeKitchen(p));
    if (typeof built === "string") throw new Error(built);
    const dossier = kitchenDossier(built.doc, "Cuisine Martin", cm);
    if (typeof dossier === "string") throw new Error(dossier);
    // Plan, walls A and B, the island, the list.
    expect(dossier.pages).toHaveLength(5);
    expect(dossier.pages[0]).toContain("Plan de la cuisine — Cuisine Martin");
    expect(dossier.pages[0]).toContain("Mur A 360 cm");
    expect(dossier.pages[0]).toContain("passage 110 cm");
    expect(dossier.pages[1]).toContain("Mur A vu de face");
    expect(dossier.lines.map((l) => l.n)).toEqual(dossier.lines.map((_, i) => i + 1));
    expect(dossier.lines.some((l) => l.name === "Évier" && l.fronts === "1 porte")).toBe(true);
    expect(dossier.lines.some((l) => l.name === "Lave-vaisselle" && l.fronts === "appareil")).toBe(true);
    const pdf = sheetsPdf(dossier.pages, "Cuisine Martin — dossier");
    expect(pdf.startsWith("%PDF")).toBe(true);
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBe(5);
  });
});
