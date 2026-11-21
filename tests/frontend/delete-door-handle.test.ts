/** Suppr sur une porte seule : sa poignée part avec elle (et sa vitre), pas les autres portes ni leurs poignées. */
import { describe, expect, it } from "vitest";
import { deletionOf } from "../../frontend/src/app/delete-selection";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { nichePartsIn } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function wardrobe(): CadDocument {
  const record = partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], 400);
  const step = { ...record.step!, doors: { gap: 3, thickness: 18, handles: true } };
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "Esquisse 9", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base = createReferencePlate();
  return syncPartitionDoors({ ...base, features: [...base.features, sketch] }, "sk9");
}

describe("supprimer une porte", () => {
  it("emporte sa poignée, pas celles des autres portes", () => {
    const doc = wardrobe();
    const doors = doc.features.find((f): f is NicheFeature => f.type === "niche")!;
    const parts = nichePartsIn(doc.features, doors);
    const handleOf = (n: number) => `${doors.id}#${parts.findIndex((p) => p.kind === "handle" && p.of === n)}`;
    expect(parts.filter((p) => p.kind === "handle")).toHaveLength(2);
    const shown = parts.map((_, i) => `${doors.id}#${i}`);
    expect(deletionOf(doc, { bodies: [`${doors.id}#0`] }, shown).pieces).toEqual([`${doors.id}#0`, handleOf(0)]);
    // Its handle alone: only it.
    expect(deletionOf(doc, { bodies: [handleOf(1)] }, shown).pieces).toEqual([handleOf(1)]);
    // Both doors: the whole doors go, handles and all.
    expect(deletionOf(doc, { bodies: [`${doors.id}#0`, `${doors.id}#1`] }, shown)).toMatchObject({ features: [doors.id], pieces: [] });
  });
});
