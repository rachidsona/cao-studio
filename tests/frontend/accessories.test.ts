/** Accessoires intérieurs dans une niche de Répartition : les pièces, ce que chaque modèle demande, le devis. */
import { describe, expect, it } from "vitest";
import { withEquipment } from "../../frontend/src/document/equipment";
import { isHardwareBody, modelHardware } from "../../frontend/src/document/hardware";
import { DEFAULT_RATES, mad, makeQuote } from "../../frontend/src/document/quote";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyAppearance } from "../../frontend/src/appearance/assign";
import { ACCESSORIES, accessoryModel, accessoryParts, accessoryProblem, partBounds, SET_BACK } from "../../frontend/src/features/accessory-parts";
import { nicheGeometry, nicheHardware, nicheMaterials, nicheParts, nichePartsIn, nicheProblem } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

/** A Répartition of 2 cases, 1000 × 2000 (niches 473 wide), its panels 500 deep, in the front plane. */
function sketch(depth = 500): SketchFeature {
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], depth)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
}

const accessory = (model: string, lift = 0, patch: Partial<NicheFeature> = {}): NicheFeature => ({
  id: "ac1", type: "niche", name: "Accessoire 1", sketch: "sk1", partition: "of1", niche: [0], fill: "accessory",
  diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true, accessory: { model, lift }, ...patch,
});

const doc = (...features: NicheFeature[]): CadDocument => ({ ...createReferencePlate(), features: [sketch(), ...features] });
const geometry = (depth = 500) => {
  const n = nicheGeometry(accessory("cutlery"), sketch(depth));
  if (typeof n === "string") throw new Error(n);
  return n;
};

describe("accessoires intérieurs", () => {
  it("le range-couverts tient dans sa niche, à la hauteur demandée, en retrait de l'avant", () => {
    const n = geometry();
    const parts = nicheParts(accessory("cutlery", 300), n);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.every((p) => p.role === "hardware")).toBe(true);
    const low = Math.min(...parts.map((p) => p.from[1]));
    const high = Math.max(...parts.map((p) => p.to[1]));
    expect(low).toBeCloseTo(n.box.y0 + 300);
    expect(high).toBeCloseTo(n.box.y0 + 300 + 55);
    expect(Math.max(...parts.map((p) => p.to[2]))).toBeCloseTo(500 - SET_BACK);
    expect(Math.min(...parts.map((p) => p.from[2]))).toBeCloseTo(500 - SET_BACK - 400);
  });

  it("chaque modèle du catalogue, dans une niche à sa taille, reste dans la niche et nomme ses pièces une seule fois", () => {
    for (const m of ACCESSORIES) {
      const width = Math.min(m.width[1], Math.max(m.width[0], 500));
      const n = { box: { x0: 100, x1: 100 + width, y0: 50, y1: 50 + m.height + 200 }, depth: m.depth + SET_BACK + 30 };
      const f = { accessory: { model: m.id, lift: m.hung ? 0 : 100 }, thickness: 18 };
      expect(accessoryProblem(f, n), m.id).toBeNull();
      const parts = accessoryParts(f, n);
      expect(parts.length, m.id).toBeGreaterThan(1);
      expect(new Set(parts.map((p) => p.name)).size, m.id).toBe(parts.length);
      for (const p of parts) {
        const { from, to } = partBounds(p);
        expect(from[0], `${m.id} ${p.name}`).toBeGreaterThanOrEqual(n.box.x0 - 1e-6);
        expect(to[0], `${m.id} ${p.name}`).toBeLessThanOrEqual(n.box.x1 + 1e-6);
        expect(from[1], `${m.id} ${p.name}`).toBeGreaterThanOrEqual(n.box.y0 - 1e-6);
        expect(to[1], `${m.id} ${p.name}`).toBeLessThanOrEqual(n.box.y1 + 1e-6);
        expect(from[2], `${m.id} ${p.name}`).toBeGreaterThanOrEqual(-1e-6);
        expect(to[2], `${m.id} ${p.name}`).toBeLessThanOrEqual(n.depth + 1e-6);
        // No part is flat: the kernel makes a solid of each.
        for (const i of [0, 1, 2]) expect(to[i]! - from[i]!, `${m.id} ${p.name}`).toBeGreaterThan(0.5);
      }
    }
  });

  it("dit ce qui manque à la niche : largeur, profondeur, hauteur", () => {
    const n = geometry();
    expect(nicheProblem(accessory("bottles"), n)).toMatch(/trop large .* 270 mm au plus/);
    expect(nicheProblem(accessory("bin-3"), n)).toMatch(/trop étroite .* 480 mm de large au moins/);
    expect(nicheProblem(accessory("trousers"), geometry(400))).toMatch(/pas assez profonde .* 470 mm au moins/);
    expect(nicheProblem(accessory("cutlery", 1950), n)).toMatch(/dépasse le haut/);
    expect(nicheProblem(accessory("cutlery", -5), n)).toMatch(/négative/);
    expect(nicheProblem(accessory("inconnu"), n)).toMatch(/plus au catalogue/);
    expect(nicheProblem(accessory("cutlery"), { ...n, cut: true })).toMatch(/angle coupé/);
    expect(nicheParts(accessory("bottles"), n)).toEqual([]);
  });

  it("la penderie escamotable se pend sous le haut de la niche, quelle que soit la hauteur demandée", () => {
    const n = geometry();
    const rod = nicheParts(accessory("pulldown", 400), n).find((p) => p.name === "Tringle");
    expect(rod?.from[1]).toBeCloseTo(n.box.y1 - 300);
    expect(rod?.from[2]).toBeCloseTo(250);
  });

  it("va au devis à son prix du catalogue, hors du débit ; un tarif réglé à la main le remplace", () => {
    const d = doc(accessory("basket-kitchen"), accessory("basket-kitchen", 0, { id: "ac2", niche: [1] }), accessory("trousers", 600, { id: "ac3" }));
    const basket = accessoryModel("basket-kitchen")!;
    expect(nicheHardware(d.features, accessory("basket-kitchen"))).toEqual([{ name: basket.label, quantity: 1, price: mad(32) }]);
    const hardware = modelHardware(d);
    expect(hardware).toEqual(expect.arrayContaining([{ name: basket.label, quantity: 2, price: mad(32) }, { name: "Porte-pantalons coulissant", quantity: 1, price: mad(45) }]));
    expect(nichePartsIn(d.features, accessory("basket-kitchen")).every((_, i) => isHardwareBody(d, `ac1#${i}`))).toBe(true);
    const line = (rates = DEFAULT_RATES) => makeQuote([], rates, hardware).lines.find((l) => l.label === basket.label);
    expect(line()).toMatchObject({ quantity: 2, unitPrice: mad(32), total: 2 * mad(32) });
    expect(line({ ...DEFAULT_RATES, hardware: { ...DEFAULT_RATES.hardware, [basket.label]: 500 } })).toMatchObject({ unitPrice: 500, total: 1000 });
  });

  it("la tablette coulissante est débitée, à son épaisseur, sur une paire de coulisses du devis", () => {
    const d = withEquipment(doc(), [accessory("shelf", 200, { thickness: 19 })]);
    const parts = nichePartsIn(d.features, accessory("shelf", 200, { thickness: 19 }));
    const board = parts.findIndex((p) => p.name === "Tablette coulissante");
    expect(parts[board]!.to[1] - parts[board]!.from[1]).toBeCloseTo(19);
    expect(isHardwareBody(d, `ac1#${board}`)).toBe(false);
    expect(isHardwareBody(d, "ac1#0")).toBe(true);
    expect(modelHardware(d)).toEqual(expect.arrayContaining([{ name: "Coulisse de tiroir (paire)", quantity: 1 }]));
    // Like the panels: no material of its own.
    expect(nicheMaterials(d.features, accessory("shelf", 200))).toEqual(parts.map(() => null));
    expect(d.bodyInfo?.[`ac1#${board}`]?.material).toBeUndefined();
  });

  it("chromé tant qu'on ne lui donne pas d'apparence ; le miroir en miroir, la tablette comme sa matière", () => {
    const d = doc(accessory("mirror"), accessory("shelf", 0, { id: "ac2", niche: [1] }));
    const names = nichePartsIn(d.features, accessory("mirror")).map((p) => p.name);
    expect(bodyAppearance(d, `ac1#${names.indexOf("Coulisse")}`, undefined)?.appearance.id).toBe("chrome");
    expect(bodyAppearance(d, `ac1#${names.indexOf("Miroir")}`, undefined)?.appearance.id).toBe("mirror");
    const board = nichePartsIn(d.features, accessory("shelf", 0, { id: "ac2", niche: [1] })).findIndex((p) => p.name === "Tablette coulissante");
    expect(bodyAppearance(d, `ac2#${board}`, undefined)).toBeNull();
  });

  it("le document reste valide ; sans modèle, il est refusé", () => {
    const d = withEquipment(doc(), [accessory("cutlery")]);
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
    const { accessory: _gone, ...bare } = accessory("cutlery");
    expect(() => parseDocument({ ...d, features: [sketch(), bare] })).toThrow(/accessoire invalide/);
  });
});
