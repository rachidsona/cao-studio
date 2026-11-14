/** Accessoires d'angle : plateaux tournants, demi-lunes, magic corner — dans leur niche, construits par le noyau, au devis. */
import { beforeAll, describe, expect, it } from "vitest";
import { accessoryHardware, accessoryModel, accessoryParts, accessoryProblem, partBounds, SET_BACK } from "../../frontend/src/features/accessory-parts";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import type { NicheFeature, SketchFeature } from "../../frontend/src/document/types";
import { buildNiche } from "../../frontend/src/features/niche";
import { nicheGeometry } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A corner base unit of 900 × 720, one niche (no side between its two cases), 560 deep. */
function sketch(length = 900): SketchFeature {
  const input: PartitionParams = { length, height: 720, thickness: 18, cases: 2, dividers: ["none"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Angle", input, [0, 0], 560)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Angle", plane: "XZ", offset: 0, ...rebuilt.geometry };
}
const accessory = (model: string): NicheFeature => ({ id: "ac1", type: "niche", name: "Accessoire 1", sketch: "sk1", partition: "of1", niche: [0], fill: "accessory", diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true, accessory: { model, lift: 0 } });

describe("accessoires d'angle", () => {
  it("les plateaux tournants : deux disques sur un axe, qui tournent dans la niche, construits par le noyau", () => {
    const sk = sketch();
    const f = accessory("carousel");
    const n = nicheGeometry(f, sk);
    if (typeof n === "string") throw new Error(n);
    expect(accessoryProblem(f, n)).toBeNull();
    const parts = accessoryParts(f, n);
    const trays = parts.filter((p) => p.name.startsWith("Plateau"));
    expect(trays).toHaveLength(2);
    for (const p of parts) {
      const { from, to } = partBounds(p);
      expect(from[0]).toBeGreaterThanOrEqual(n.box.x0 - 1e-6);
      expect(to[0]).toBeLessThanOrEqual(n.box.x1 + 1e-6);
      expect(to[2]).toBeLessThanOrEqual(n.depth - SET_BACK + 1e-6);
    }
    const out = buildNiche(f, sk);
    expect(out.shapes.length).toBe(parts.length);
    for (const s of out.shapes) s.delete();
    expect(accessoryHardware(f, parts)).toEqual([{ name: "Plateaux tournants d'angle (2 niveaux)", quantity: 1, price: expect.any(Number) }]);
  });

  it("la demi-lune et le magic corner demandent une niche étroite (la porte d'un meuble d'angle) ; trop large, refusé", () => {
    for (const model of ["halfmoon", "magic-corner"]) {
      const narrow = sketch(536);
      const f = accessory(model);
      const n = nicheGeometry(f, narrow);
      if (typeof n === "string") throw new Error(n);
      expect(accessoryProblem(f, n), model).toBeNull();
      expect(accessoryParts(f, n).length, model).toBeGreaterThan(4);
      const wide = nicheGeometry(f, sketch());
      if (typeof wide === "string") throw new Error(wide);
      expect(accessoryProblem(f, wide), model).toMatch(/trop large/);
    }
    expect(accessoryModel("magic-corner")?.room).toBe("kitchen");
  });
});
