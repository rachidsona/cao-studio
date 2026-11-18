/** Une porte sur niches en applique, au bord d'une étagère : à mi-épaisseur, sur toute l'étagère, ou au ras de sa face. */
import { describe, expect, it } from "vitest";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { nicheGeometry } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain, shelvesRecord } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 700, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function sketch(): SketchFeature {
  const offsets = [partitionRecord("of1", "Répartition", INPUT, [0, 0], 300), shelvesRecord("sh1", "Étagères", "of1", [0], { count: 1, thickness: 18, mode: "equal", fixed: 0 }, 300)];
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
}
// The niche over the shelf: the second one of the case, from the bottom.
const door = (cover?: NicheFeature["cover"]): NicheFeature => ({
  id: "pn1", type: "niche", name: "Porte 1", sketch: "sk1", partition: "of1", niche: [0, 1], fill: "door",
  diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true, ...(cover ? { cover } : {}),
});

describe("porte en applique au bord d'une étagère", () => {
  it("à mi-épaisseur d'origine, sur toute l'étagère, ou au ras de sa face ; le bord du meuble couvert entier", () => {
    const bottom = (f: NicheFeature) => {
      const n = nicheGeometry(f, sketch());
      if (typeof n === "string") throw new Error(n);
      return [Math.round(n.box.y0 * 10) / 10, Math.round(n.box.y1 * 10) / 10];
    };
    const [half, top] = bottom(door());
    // 700 high, 18 boards: the shelf in the middle of 664, from 341 to 359.
    expect(half).toBeCloseTo(350, 0);
    expect(top).toBe(700);
    expect(bottom(door("whole"))).toEqual([341, 700]);
    expect(bottom(door("none"))).toEqual([359, 700]);
    const doc = { ...createReferencePlate(), features: [sketch(), door("whole")] } as unknown as CadDocument;
    expect(() => parseDocument(doc)).not.toThrow();
    expect(() => parseDocument({ ...doc, features: [sketch(), { ...door(), cover: "moitié" }] } as unknown as CadDocument)).toThrow(/recouvrement/);
  });
});
