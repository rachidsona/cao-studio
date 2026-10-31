/** Porte à cadre : un cadre autour d'un panneau en retrait, usinée dans la masse ; cadre trop large refusé. */
import { measureVolume } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { emptySketchGeometry, type DoorSettings, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { buildNiche } from "../../frontend/src/features/niche";
import { nicheGeometry, nicheProblem } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function doorsOf(settings: DoorSettings): { doors: NicheFeature; sketch: SketchFeature } {
  const record = partitionRecord("of1", "R", INPUT, [0, 0], 400);
  const step = record.step!.kind === "partition" ? { ...record.step!, doors: settings } : record.step!;
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "E", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base = createReferencePlate();
  const doc = syncPartitionDoors({ ...base, features: [...base.features, sketch] }, "sk9");
  return { doors: doc.features.find((f): f is NicheFeature => f.type === "niche")!, sketch };
}

describe("porte à cadre", () => {
  beforeAll(() => setupKernel(), 120_000);

  it("creuse le panneau dans la porte, en laissant le cadre", () => {
    const flat = doorsOf({ gap: 3, thickness: 22, handles: false });
    const frame = doorsOf({ gap: 3, thickness: 22, handles: false, style: "frame", frameWidth: 70, frameDepth: 6 });
    expect(frame.doors).toMatchObject({ style: "frame", frameWidth: 70, frameDepth: 6 });
    const [a, b] = [buildNiche(flat.doors, flat.sketch), buildNiche(frame.doors, frame.sketch)];
    const volume = (s: (typeof a.shapes)[number]) => measureVolume(s);
    // Door 1: 1000/2 wide less the gaps, 2000 high less the gaps: the pocket is (w − 140) × (h − 140) × 6.
    const n = nicheGeometry(flat.doors, flat.sketch);
    if (typeof n === "string") throw new Error(n);
    const lost = volume(a.shapes[0]!) - volume(b.shapes[0]!);
    expect(lost).toBeGreaterThan(0);
    const width = (volume(a.shapes[0]!) / 22) / (2000 - 3);
    expect(lost).toBeCloseTo((width - 140) * (2000 - 3 - 140) * 6, -2);
    for (const s of [...a.shapes, ...b.shapes]) s.delete();
  }, 60_000);

  it("refuse un cadre trop large ou un panneau trop mince", () => {
    const wide = doorsOf({ gap: 3, thickness: 22, handles: false, style: "frame", frameWidth: 240, frameDepth: 6 });
    const n = nicheGeometry(wide.doors, wide.sketch);
    if (typeof n === "string") throw new Error(n);
    expect(nicheProblem(wide.doors, n)).toContain("cadre");
    expect(nicheProblem({ ...wide.doors, frameWidth: 70, frameDepth: 20 }, n)).toContain("3 mm");
  });
});
