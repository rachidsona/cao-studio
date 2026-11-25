/** Une apparence donnée à tout un dressing laisse le verre et le métal : vitres, tringles, poignées, cadres alu. */
import { describe, expect, it } from "vitest";
import { keepsOwnLook, lookFamily, lookTargets } from "../../frontend/src/document/own-look";
import { APPEARANCES } from "../../frontend/src/appearance/library";
import { setBodyInfo } from "../../frontend/src/document/materials";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { nichePartsIn } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function dressing(profile: "brushed" | "wood"): CadDocument {
  const record = partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], 400);
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [record] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "Mur", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base = createReferencePlate();
  return {
    ...base,
    features: [
      ...base.features,
      sketch,
      { id: "pd1", type: "niche", name: "Penderie 1", sketch: "sk9", partition: "of1", niche: [0], fill: "rod", diameter: 25, drop: 60, drawers: 1, gap: 3, thickness: 18, handles: false },
      { id: "pn1", type: "niche", name: "Porte 1", sketch: "sk9", partition: "of1", niche: [1], fill: "door", drawers: 1, gap: 3, thickness: 18, handles: true, style: "glass", profile, glass: "clear", frameWidth: 20 },
    ] as CadDocument["features"],
  };
}

describe("le verre et le métal gardent leur aspect", () => {
  it("tringle, poignée et vitre gardent le leur ; un cadre alu aussi, un cadre bois prend le bois", () => {
    const doc = dressing("brushed");
    const door = doc.features.find((f): f is NicheFeature => f.id === "pn1")!;
    const parts = nichePartsIn(doc.features, door);
    const at = (kind: string) => `pn1#${parts.findIndex((p) => (kind === "front" ? p.role === "front" : p.name.startsWith(kind)))}`;
    expect(keepsOwnLook(doc, "pd1#0")).toBe(true);
    expect(keepsOwnLook(doc, at("Poignée"))).toBe(true);
    expect(keepsOwnLook(doc, at("Vitre"))).toBe(true);
    expect(keepsOwnLook(doc, at("front"))).toBe(true);
    expect(keepsOwnLook(dressing("wood"), at("front"))).toBe(false);
    // The panels take it; a glass alone, picked on purpose, too.
    expect(keepsOwnLook(doc, "sk9#0")).toBe(false);
    expect(lookTargets(doc, ["sk9#0", "pd1#0", at("Vitre")])).toEqual(["sk9#0"]);
    expect(lookTargets(doc, [at("Vitre")])).toEqual([at("Vitre")]);
  });

  it("dans une sélection, chaque pièce ne prend que l'apparence de sa sorte : un bois va aux panneaux, pas au plan de travail en marbre ni à l'électroménager", () => {
    const id = (category: string) => APPEARANCES.find((a) => a.category === category)!.id;
    expect([lookFamily("wood"), lookFamily("melamine"), lookFamily("stone"), lookFamily("sintered"), lookFamily("metal"), lookFamily("custom")]).toEqual(["panel", "panel", "top", "top", "metal", null]);
    const base = createReferencePlate();
    const features = [
      ...base.features,
      { id: "ex1", type: "extrude", name: "Caisson", sketch: "s", distance: 18, operation: "new" },
      { id: "ex2", type: "extrude", name: "Plan de travail", sketch: "s", distance: 38, operation: "new" },
      { id: "ex3", type: "extrude", name: "Brut", sketch: "s", distance: 18, operation: "new" },
      { id: "ap1", type: "appliance", name: "Réfrigérateur", model: "fridge-american", origin: [0, 0, 0], width: 910, height: 1780, depth: 700 },
    ] as CadDocument["features"];
    let doc: CadDocument = { ...base, features };
    doc = setBodyInfo(doc, ["ex1"], { appearance: id("melamine") });
    doc = setBodyInfo(doc, ["ex2"], { appearance: id("stone") });
    const all = ["ex1", "ex2", "ex3", "ap1"];
    // A wood: the panel and the bare body; a stone: the worktop and the bare body; never the appliance.
    expect(lookTargets(doc, all, id("wood"))).toEqual(["ex1", "ex3"]);
    expect(lookTargets(doc, all, id("stone"))).toEqual(["ex2", "ex3"]);
    // Back to their material's look: all; one piece aimed alone takes anything.
    expect(lookTargets(doc, all, null)).toEqual(all);
    expect(lookTargets(doc, ["ex2"], id("wood"))).toEqual(["ex2"]);
    expect(lookTargets(doc, ["ap1"], id("wood"))).toEqual(["ap1"]);
  });
});
