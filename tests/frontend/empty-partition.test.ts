/** Une Répartition dont tous les panneaux sont retirés part avec la dernière pièce visible qu'on supprime ; les outils ne la prennent plus par défaut. */
import { describe, expect, it } from "vitest";
import { deletionOf } from "../../frontend/src/app/delete-selection";
import { emptiedPartitions, isEmptyPartition } from "../../frontend/src/document/empty-partition";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type SketchFeature } from "../../frontend/src/document/types";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

/** A module kept « seulement les pièces choisies »: its wall's panels out, a drawer front split into its frame shown. */
function kept(): CadDocument {
  const record = partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], 400);
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [record] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "Plan — mur a 1", plane: "XZ", offset: 0, hidden: true, ...rebuilt.geometry };
  const base = createReferencePlate();
  return {
    ...base,
    features: [
      ...base.features,
      sketch,
      { id: "ex8", type: "extrude", name: "Côté 1", sketch: "sk9", distance: 400, operation: "new" },
      { id: "ex9", type: "extrude", name: "Côté 2", sketch: "sk9", distance: 400, operation: "new" },
      { id: "td1", type: "niche", name: "Tiroirs 1", sketch: "sk9", partition: "of1", niche: [0], fill: "drawers", drawers: 3, gap: 3, thickness: 18, handles: true },
      { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "td1#0", faces: [], thickness: 0, sides: "separate", joint: "miter" },
    ] as CadDocument["features"],
    removedBodies: ["ex8", "ex9", "td1#1"],
  };
}

describe("une Répartition vide", () => {
  it("ses panneaux tous retirés : vide", () => {
    const doc = kept();
    const sketch = doc.features.find((f): f is SketchFeature => f.id === "sk9")!;
    expect(isEmptyPartition(doc, sketch)).toBe(true);
    expect(isEmptyPartition({ ...doc, removedBodies: ["ex8"] }, sketch)).toBe(false);
  });

  it("la dernière pièce visible supprimée, elle part avec tout ce qui en dépend", () => {
    const doc = kept();
    const shown = ["sh1#0", "sh1#1", "sh1#2"];
    const deletion = deletionOf(doc, { bodies: shown }, shown);
    expect([...deletion.features].sort()).toEqual(["ex8", "ex9", "sh1", "sk9", "td1"]);
    expect(deletion.pieces).toEqual([]);
    // One piece of the frame only: the rest stays in view, the Répartition too.
    expect(deletionOf(doc, { bodies: ["sh1#0"] }, shown).features).toEqual([]);
    // Its panels still in view: not empty, it stays.
    expect(emptiedPartitions({ ...doc, removedBodies: [] }, ["sh1"], [], [...shown, "ex8"])).toEqual([]);
  });
});
