/** Une apparence donnée à tout un dressing laisse le verre et le métal : vitres, tringles, poignées, cadres alu. */
import { describe, expect, it } from "vitest";
import { keepsOwnLook, lookTargets } from "../../frontend/src/document/own-look";
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
});
