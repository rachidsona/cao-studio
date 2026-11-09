/** Le catalogue de l'atelier : matières du serveur, règles de quincaillerie comptées, en-tête. */
import { describe, expect, it } from "vitest";
import { autoHardware, companyHeaderHtml, furnitureCounts, registerCatalog, toMaterial } from "../../frontend/src/document/catalog";
import { MATERIALS, materialById } from "../../frontend/src/document/materials";
import { DEFAULT_RATES, makeQuote } from "../../frontend/src/document/quote";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import type { CatalogMaterial, HardwareRule, ServerCatalog } from "../../frontend/src/persistence/catalog";

const walnut: CatalogMaterial = { id: "catalog-7", name: "Noyer américain", thickness: 19, price: 210, color: "#5a3a24", category: "wood", sheet: [2800, 2070], default: false };
const hdf: CatalogMaterial = { id: "catalog-4", name: "Fond HDF 3 mm", thickness: 3, price: 12, color: "#b08968", category: "solid", sheet: [2800, 2070], default: false };
const marble: CatalogMaterial = { id: "catalog-9", name: "Marbre de Carrare", thickness: 20, price: 320, color: "#f2f1ec", category: "marble", sheet: [2800, 2070], default: false };

const RULES: HardwareRule[] = [
  { name: "Charnière à clip 35 mm", description: "", unit: "u", price: 1.2, quantity: 1, mode: "door_hinge", perUnit: 1 },
  { name: "Tige d'étagère", description: "", unit: "u", price: 0.08, quantity: 1, mode: "shelf", perUnit: 4 },
  { name: "Poignée de façade", description: "", unit: "u", price: 4.5, quantity: 1, mode: "door", perUnit: 1 },
  { name: "Excentrique minifix", description: "", unit: "u", price: 0.15, quantity: 1, mode: "side", perUnit: 8 },
  { name: "Visserie (lot par caisson)", description: "", unit: "lot", price: 2, quantity: 1, mode: "cabinet", perUnit: 1 },
  { name: "Coulisse à billes 450 mm", description: "", unit: "paire", price: 18, quantity: 1, mode: "", perUnit: 1 },
];

function cabinetDoc(): CadDocument {
  const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Caisson 1", origin: [0, 0, 0], width: 600, height: 2000, depth: 500, thickness: 18, back: "applied", backThickness: 3, shelves: 2, plinth: 0, construction: "sides-through" };
  const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "doors", drawers: 0, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
  return { ...createReferencePlate(), features: [cabinet, fronts] };
}

describe("matières du serveur", () => {
  it("deviennent des matières de l'éditeur : le bois avec son fil, un fond mince en panneau de fond", () => {
    expect(toMaterial(walnut)).toEqual({ id: "catalog-7", name: "Noyer américain", color: "#5a3a24", look: "wood", sheet: [2800, 2070], kind: "panel" });
    expect(toMaterial(hdf).kind).toBe("backing");
    expect(toMaterial(marble)).toMatchObject({ look: "plain", kind: "panel" });
  });

  it("s'ajoutent aux matières intégrées, sans doublon, avec leur prix et ceux de la quincaillerie", () => {
    const before = MATERIALS.length;
    const dup: CatalogMaterial = { ...walnut, id: "catalog-99", name: "Mélaminé blanc" };
    const catalog: ServerCatalog = { materials: [walnut, marble, dup], hardware: RULES, company: { name: "Mon atelier", slogan: "", address: "", phone: "", email: "", website: "", logo: "" } };
    registerCatalog(catalog);
    registerCatalog(catalog);
    expect(MATERIALS.length).toBe(before + 2);
    expect(materialById("catalog-7")?.name).toBe("Noyer américain");
    expect(DEFAULT_RATES.boards["Noyer américain"]).toBe(210);
    expect(DEFAULT_RATES.boards["Mélaminé blanc"]).toBe(18);
    expect(DEFAULT_RATES.hardware["Tige d'étagère"]).toBe(0.08);
  });
});

describe("règles de quincaillerie", () => {
  it("comptent le meuble : caissons, portes, charnières selon la hauteur, étagères, niches, côtés", () => {
    const counts = furnitureCounts(cabinetDoc());
    // Two doors of 2 m: 4 hinges each (features/fronts-parts.ts hingeCount).
    expect(counts).toEqual({ cabinet: 1, door: 2, door_hinge: 8, shelf: 2, niche: 3, side: 2 });
  });

  it("donnent les lignes du devis ; une règle manuelle n'en ajoute pas", () => {
    const lines = autoHardware(cabinetDoc(), RULES);
    expect(lines).toEqual([
      { name: "Charnière à clip 35 mm", quantity: 8, unit: "u", price: 1.2 },
      { name: "Tige d'étagère", quantity: 8, unit: "u", price: 0.08 },
      { name: "Poignée de façade", quantity: 2, unit: "u", price: 4.5 },
      { name: "Excentrique minifix", quantity: 16, unit: "u", price: 0.15 },
      { name: "Visserie (lot par caisson)", quantity: 1, unit: "lot", price: 2 },
    ]);
    const quote = makeQuote([], DEFAULT_RATES, lines);
    expect(quote.lines.map((l) => l.total)).toEqual([9.6, 0.64, 9, 2.4, 2]);
  });

  it("ne comptent rien dans un document sans meuble", () => {
    expect(autoHardware(createReferencePlate(), RULES)).toEqual([]);
  });
});

describe("en-tête de l'atelier", () => {
  it("est vide tant que le profil ne dit rien", () => {
    expect(companyHeaderHtml(null)).toBe("");
    expect(companyHeaderHtml({ name: "Mon atelier", slogan: "", address: "", phone: "", email: "", website: "", logo: "" })).toBe("");
  });

  it("écrit le nom, le slogan, les coordonnées et le logo, le texte échappé", () => {
    const html = companyHeaderHtml({ name: "Atelier <Sona>", slogan: "Bois & co", address: "1 rue du Bois", phone: "01 02", email: "a@b.fr", website: "", logo: "data:image/png;base64,AAAA" });
    expect(html).toContain("Atelier &lt;Sona&gt;");
    expect(html).toContain("Bois &amp; co");
    expect(html).toContain("1 rue du Bois · 01 02 · a@b.fr");
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(companyHeaderHtml({ name: "X", slogan: "", address: "", phone: "", email: "", website: "", logo: "javascript:alert(1)" })).not.toContain("<img");
  });
});
