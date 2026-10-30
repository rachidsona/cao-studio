/** Règles d'assemblage : jonctions trouvées entre les planches d'un caisson, visserie comptée pour le devis. */
import { describe, expect, it } from "vitest";
import { modelHardware } from "../../frontend/src/document/hardware";
import { createReferencePlate, type MachiningFeature } from "../../frontend/src/document/types";
import { ASSEMBLY_RULE, applyRule, junctions, type Board } from "../../frontend/src/features/assembly-rules";

// A carcass 600 × 560 × 720: sides through, bottom and top between them, a fixed shelf, an applied 3 mm back.
const boards: Board[] = [
  { id: "left", box: [[0, 0, 0], [18, 560, 720]] },
  { id: "right", box: [[582, 0, 0], [600, 560, 720]] },
  { id: "bottom", box: [[18, 0, 0], [582, 560, 18]] },
  { id: "top", box: [[18, 0, 702], [582, 560, 720]] },
  { id: "shelf", box: [[18, 0, 351], [582, 540, 369]] },
  { id: "back", box: [[0, 560, 0], [600, 563, 720]] },
];

describe("règles d'assemblage", () => {
  it("trouve les jonctions chant contre face, sans le fond mince", () => {
    const found = junctions(boards).map((j) => `${j.edge}→${j.face}`).sort();
    expect(found).toEqual(["bottom→left", "bottom→right", "shelf→left", "shelf→right", "top→left", "top→right"]);
  });

  it("confirmat tous les 128 mm : les vis traversent les côtés et entrent dans les chants", () => {
    const { ops, junctions: n, fasteners } = applyRule(boards, ASSEMBLY_RULE);
    expect(n).toBe(6);
    // 560 mm deep, 50 mm from the ends: 1 + floor(460 / 128) = 4 screws; shelf 540 mm: 1 + floor(440 / 128) = 4.
    expect(fasteners).toBe(24);
    expect(ops.get("left")).toHaveLength(12);
    const head = ops.get("left")![0]!;
    expect(head.kind === "hole" && head.diameter).toBe(7);
    expect(head.kind === "hole" && head.at[0]).toBe(0); // from the outer face of the side
    expect(ops.has("back")).toBe(false);
  });

  it("la visserie des usinages et des façades va au devis", () => {
    const { ops } = applyRule(boards, { ...ASSEMBLY_RULE, joint: "dowel", spacing: 96 });
    const features: MachiningFeature[] = [...ops].map(([target, list], i) => ({ id: `mc${i + 1}`, type: "machining", name: `T${i}`, target, kind: "dowel", ops: list }));
    const doc = { ...createReferencePlate(), features: [...createReferencePlate().features, ...features] };
    const dowels = applyRule(boards, { ...ASSEMBLY_RULE, joint: "dowel", spacing: 96 }).fasteners;
    expect(modelHardware(doc)).toEqual([{ name: "Tourillon Ø8 × 30", quantity: dowels }]);
  });
});

describe("usinage qui suit la planche", () => {
  it("chaque trou suit le bout de la planche dont il était le plus près", async () => {
    const { followed } = await import("../../frontend/src/features/machining");
    const hole = (x: number) => ({ kind: "hole" as const, at: [x, 280, 0] as [number, number, number], dir: [0, 0, 1] as [number, number, number], diameter: 5, depth: 30 });
    const made: [[number, number, number], [number, number, number]] = [[18, 0, 0], [582, 560, 18]];
    const now: [[number, number, number], [number, number, number]] = [[18, 0, 0], [882, 560, 18]]; // 300 mm longer
    const left = followed(hole(27), made, now);
    expect(left.kind === "hole" && left.at[0]).toBe(27);
    const right = followed(hole(573), made, now);
    expect(right.kind === "hole" && right.at[0]).toBe(873);
    // Without the high corner (older documents), everything follows the low corner.
    const old = followed(hole(573), [made[0], undefined], [[118, 0, 0], [982, 560, 18]]);
    expect(old.kind === "hole" && old.at[0]).toBe(673);
  });
});
