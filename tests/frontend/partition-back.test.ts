/** « Fond » sous une zone : le fond de sa Répartition posé d'un clic (8 mm, un seul panneau), retiré d'un autre. */
import { describe, expect, it } from "vitest";
import { BACK, hasBack, withBack } from "../../frontend/src/document/partition-back";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function wall(depth = 400): CadDocument {
  const record = partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], depth);
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [record] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "Mur A", plane: "XZ", offset: 0, ...rebuilt.geometry };
  return { ...createReferencePlate(), features: [sketch] };
}
const backs = (d: CadDocument) => d.features.filter((f): f is NicheFeature => f.type === "niche" && f.fill === "back");

describe("le fond d'une zone d'un clic", () => {
  it("posé : la rubrique cochée et son équipement Fond fait ; retiré : les deux partent", () => {
    const on = withBack(wall(), "sk1", true);
    expect(hasBack(on, "sk1")).toBe(true);
    expect(backs(on)).toHaveLength(1);
    expect(backs(on)[0]).toMatchObject({ thickness: BACK.thickness, split: "whole" });
    const off = withBack(on, "sk1", false);
    expect(hasBack(off, "sk1")).toBe(false);
    expect(backs(off)).toHaveLength(0);
  });
});
