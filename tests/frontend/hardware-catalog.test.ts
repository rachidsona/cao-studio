/** Catalogue de quincaillerie : le choix du projet donne leurs noms et prix aux listes, leurs cotes aux perçages. */
import { describe, expect, it } from "vitest";
import { catalogItems, chosenHardware, hardwareGeometry, stampHardware } from "../../frontend/src/document/hardware-catalog";
import { makeQuote } from "../../frontend/src/document/quote";
import { DEFAULT_RATES } from "../../frontend/src/document/quote";
import { createReferencePlate, type CadDocument, type NicheFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

const drawers: NicheFeature = { id: "td1", type: "niche", name: "Tiroirs 1", sketch: "sk1", partition: "of1", niche: [0], fill: "drawers", diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true };
const rod: NicheFeature = { ...drawers, id: "pd1", name: "Penderie 1", fill: "rod" };

describe("catalogue de quincaillerie", () => {
  it("sans choix, les modèles génériques gardent leur nom et leur prix du devis", () => {
    const doc = createReferencePlate();
    expect(chosenHardware(doc).hinge.id).toBe("generic");
    expect(catalogItems(doc, [{ name: "Charnière à boîtier Ø35", quantity: 4 }])).toEqual([{ name: "Charnière à boîtier Ø35", quantity: 4 }]);
    expect(stampHardware(doc)).toBe(doc);
  });

  it("le modèle choisi nomme et chiffre la quincaillerie ; un tarif mis à la main l'emporte", () => {
    const doc: CadDocument = { ...createReferencePlate(), hardware: { hinge: "blum-cliptop-blumotion", handle: "bar-192" } };
    const items = catalogItems(doc, [
      { name: "Charnière à boîtier Ø35", quantity: 4 },
      { name: "Poignée entraxe 128 mm", quantity: 2 },
      { name: "Coulisse de tiroir (paire)", quantity: 1 },
      { name: "Vis confirmat 7 × 50", quantity: 8 },
    ]);
    expect(items.map((i) => [i.name, i.price])).toEqual([
      ["Blum CLIP top BLUMOTION 110° (réf. 71B3550)", 9],
      ["Poignée barre entraxe 192 mm", 8],
      ["Coulisse de tiroir (paire)", undefined],
      ["Vis confirmat 7 × 50", undefined],
    ]);
    const quote = makeQuote([], DEFAULT_RATES, items);
    expect(quote.lines.find((l) => l.label.startsWith("Blum"))?.total).toBe(36);
    expect(quote.lines.find((l) => l.label.startsWith("Coulisse"))?.unitPrice).toBe(18);
    const hand = makeQuote([], { ...DEFAULT_RATES, hardware: { ...DEFAULT_RATES.hardware, "Poignée barre entraxe 192 mm": 10 } }, items);
    expect(hand.lines.find((l) => l.label.startsWith("Poignée"))?.unitPrice).toBe(10);
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    expect(() => parseDocument({ ...doc, hardware: { hinge: 3 } })).toThrow();
  });

  it("les cotes du modèle choisi vont aux tiroirs, portes et façades envoyés au noyau, pas aux penderies", () => {
    const doc: CadDocument = { ...createReferencePlate(), features: [drawers, rod], hardware: { hinge: "small-26", handle: "knob" } };
    expect(hardwareGeometry(doc)).toEqual({ handleSpacing: 0, handleHole: 5, cupDiameter: 26, cupDepth: 11.5, cupEdge: 18 });
    const stamped = stampHardware(doc);
    expect((stamped.features[0] as NicheFeature).hw?.handleSpacing).toBe(0);
    expect((stamped.features[1] as NicheFeature).hw).toBeUndefined();
    // The document itself is not changed.
    expect((doc.features[0] as NicheFeature).hw).toBeUndefined();
  });
});
