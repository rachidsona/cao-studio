/** Rangement en hauteur : les niches hors de portée, ce qu'elles portent, et la penderie escamotable posée à la place d'une tringle trop haute. */
import { describe, expect, it } from "vitest";
import { highNiches, withPullDown } from "../../frontend/src/document/high-storage";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const cm = (mm: number) => `${Math.round(mm) / 10} cm`;

function sketch(id: string, name: string, input: PartitionParams, origin: [number, number]): SketchFeature {
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord(`of-${id}`, "Répartition", input, origin, 600)] }, `of-${id}`);
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id, type: "sketch", name, plane: "XZ", offset: 0, ...rebuilt.geometry };
}

const PARTITION: Omit<PartitionParams, "height"> = { length: 1000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
const equip = (patch: Partial<NicheFeature>): NicheFeature => ({ id: "n1", type: "niche", name: "Penderie 1", sketch: "low", partition: "of-low", niche: [0], fill: "rod", diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: false, ...patch });

function doc(): CadDocument {
  // A tall wardrobe 2,5 m high (a rod 6 cm under its top, at 2,422 m, in its left case), and boxes above 2,1 m.
  const low = sketch("low", "Penderie", { ...PARTITION, height: 2500 }, [0, 0]);
  const high = sketch("high", "Surmeuble", { ...PARTITION, height: 400 }, [1200, 2100]);
  return { ...createReferencePlate(), features: [low, high, equip({}), equip({ id: "n2", name: "Tiroirs 1", sketch: "high", partition: "of-high", niche: [1], fill: "drawers" })] };
}

describe("rangement en hauteur", () => {
  it("dit les niches hors de portée, ce qu'elles portent, et propose la penderie escamotable où elle tient", () => {
    const rows = highNiches(doc(), cm);
    expect(rows.map((r) => [r.name, r.holds, r.pulldown])).toEqual([
      ["Penderie, niche 1", "Penderie 1 (tringle à 242.2 cm)", true],
      ["Surmeuble, niche 1", "vide", false],
      ["Surmeuble, niche 2", "Tiroirs 1", false],
    ]);
    expect(rows[0]!.advice).toBe("Tringle à 242.2 cm du sol, hors de portée : une penderie escamotable la descend à hauteur de main.");
    expect(rows[1]).toMatchObject({ bottom: 2118, top: 2482, advice: "Rangement saisonnier : valises, couettes, boîtes, prises avec un escabeau." });
    expect(rows[2]!.advice).toBe("Tiroirs à 211.8 cm du sol, hors de portée : des portes ou un abattant valent mieux là-haut.");
  });

  it("pose la penderie escamotable à la place de la tringle, et la niche n'est plus hors de portée", () => {
    const base = doc();
    const row = highNiches(base, cm)[0]!;
    const made = withPullDown(base, row);
    if (typeof made === "string") throw new Error(made);
    expect(made.name).toBe("Penderie escamotable 1");
    expect(made.doc.features.some((f) => f.id === "n1")).toBe(false);
    expect(made.doc.features.find((f) => f.name === "Penderie escamotable 1")).toMatchObject({ type: "niche", fill: "accessory", accessory: { model: "pulldown", lift: 0 }, niche: [0] });
    // Not offered there again: its advice says it comes down.
    expect(highNiches(made.doc, cm).map((r) => r.name)).not.toContain("Penderie, niche 1");
    // Drawers are not taken out for it.
    expect(withPullDown(base, highNiches(base, cm)[2]!)).toMatch(/trop étroite|trop basse|porte déjà/);
  });
});
