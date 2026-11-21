/** « Copier les opérations » : ce qu'on a fait sur un corps refait sur un autre, à la même place par rapport à lui. */
import { measureVolume, type Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { comesFrom, operationsOf, placing, turnsBetween, withOperationsCopied, type Box } from "../../frontend/src/document/copy-operations";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

/** A frame 600 × 400 × 720 split into its sides; a pocket cut in the top of side 1, then that pocket split into its sides. */
const frame = (): CadDocument => ({
  ...createReferencePlate(),
  features: [
    { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
    { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 720, operation: "new" },
    { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "butt", frame: true },
  ],
} as unknown as CadDocument);

const box = (s: Shape3D): Box => s.boundingBox.bounds as unknown as Box;

describe("les opérations d'un corps", () => {
  it("le corps d'avant elles, celles qui l'ont fait et celles faites ensuite sur ses autres pièces", () => {
    const doc = frame();
    doc.features.push(
      { id: "sk2", type: "sketch", name: "Tracé 1", plane: "XY", offset: 720, ...centeredRectangle(100, 10), support: "sh1#1" } as never,
      { id: "ex2", type: "extrude", name: "Extrusion 2", sketch: "sk2", distance: -50, operation: "cut", target: "sh1#1" } as never,
      { id: "sh2", type: "shell", name: "Côtés séparés 2", target: "ex2", faces: [], thickness: 3, sides: "separate", joint: "miter", frame: true } as never,
      { id: "h1", type: "hole", name: "Perçage 1", target: "sh2#2", x: 0, y: 0, diameter: 5, depth: 10 } as never,
      { id: "mv1", type: "move", name: "Déplacement 1", target: "h1", translate: [0, 0, 5] } as never,
    );
    const ops = operationsOf(doc, "sh2#0");
    expect(ops.base).toBe("sh1#1");
    expect(ops.ops.map((o) => [o.id, o.chain, o.copyable])).toEqual([["ex2", true, true], ["sh2", true, true], ["h1", false, true], ["mv1", false, true]]);
    // A board with nothing done on it: the whole frame's making is offered, none chosen by default but its split.
    expect(operationsOf(doc, "sh1#0")).toEqual({ base: "ex1", ops: [{ id: "sh1", name: "Côtés séparés 1", chain: true, copyable: true }, { id: "ex2", name: "Extrusion 2", chain: false, copyable: true }, { id: "sh2", name: "Côtés séparés 2", chain: false, copyable: true }, { id: "h1", name: "Perçage 1", chain: false, copyable: true }, { id: "mv1", name: "Déplacement 1", chain: false, copyable: true }] });
    expect(comesFrom(doc, "sh2#3", "sh1#1")).toBe(true);
    expect(comesFrom(doc, "sh1#3", "sh1#1")).toBe(false);
  });

  it("le même côté : rien ne tourne ; un côté en travers : un quart de tour", () => {
    const along: Box = [[-300, -200, 0], [300, -182, 720]];
    expect(turnsBetween(along, [[-300, 182, 0], [300, 200, 720]])[0]).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    const across = turnsBetween(along, [[-300, -182, 0], [-282, 182, 720]])[0]!;
    const at = placing(along, [[-300, -182, 0], [-282, 182, 720]], across);
    // The middle of the long side's top lands on the middle of the short side's top.
    expect(at.point([0, -191, 720])).toEqual([-291, 0, 720]);
  });
});

describe("recopier les déplacements", () => {
  /** A board 100 wide at x 0, a hole 10 from its left, the board moved 100 to the right — or moved first, then drilled. */
  const drilled = (movedFirst: boolean): CadDocument => {
    const hole = { id: "m1", type: "machining", name: "Usinage 1", target: movedFirst ? "mv1" : "ex1", ops: [{ kind: "hole", at: [movedFirst ? 110 : 10, 0, 10], dir: [0, 0, -1], diameter: 5, depth: 5 }] };
    const move = { id: "mv1", type: "move", name: "Déplacement 1", target: movedFirst ? "ex1" : "m1", translate: [100, 0, 0] };
    return { ...createReferencePlate(), features: [{ id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(100, 100) }, { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 10, operation: "new" }, ...(movedFirst ? [move, hole] : [hole, move])] } as unknown as CadDocument;
  };
  // Seen now: the board at x 100..200; the target at x 500..600.
  const [from, to]: [Box, Box] = [[[100, -50, 0], [200, 50, 10]], [[500, -50, 0], [600, 50, 10]]];
  const at = placing(from, to, turnsBetween(from, to)[0]!);
  const holeOf = (doc: CadDocument, ids: string[]) => {
    const made = withOperationsCopied(doc, "ex1", ids, "tg", at, false).made;
    const m = made.find((f) => f.type === "machining") as { ops: { at: number[] }[] } | undefined;
    return { hole: m?.ops[0]!.at[0], moves: made.filter((f) => f.type === "move").map((f) => (f as { translate: number[] }).translate) };
  };

  it("le déplacement se refait, et chaque opération est placée où étaient alors les deux corps", () => {
    expect(operationsOf(drilled(false), "mv1").ops.map((o) => [o.id, o.chain, o.copyable])).toEqual([["m1", true, true], ["mv1", true, true]]);
    // Drilled then moved: the hole 10 from the target's left as it is now, then the target moved.
    expect(holeOf(drilled(false), ["m1", "mv1"])).toEqual({ hole: 510, moves: [[100, 0, 0]] });
    // Its move left out: the target stays, the hole is still 10 from its left.
    expect(holeOf(drilled(false), ["m1"])).toEqual({ hole: 510, moves: [] });
    // Moved then drilled: the target moved first, the hole 10 from its left where it is then.
    expect(holeOf(drilled(true), ["mv1", "m1"])).toEqual({ hole: 610, moves: [[100, 0, 0]] });
    expect(holeOf(drilled(true), ["m1"])).toEqual({ hole: 510, moves: [] });
  });
});

describe("recopier une découpe", () => {
  it("la poche d'un côté refaite sur le côté d'en face et sur un côté en travers, à la même place", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const r = new Recomputer();
    const doc = frame();
    r.recompute(doc);
    const sides = r.output("sh1");
    const boxes = sides?.kind === "solids" ? sides.shapes.map(box) : [];
    expect(boxes).toHaveLength(4);
    // The long sides (600 along X), then one short one.
    const longs = boxes.map((b, i) => ({ b, i })).filter(({ b }) => b[1][0] - b[0][0] > 500);
    const short = boxes.findIndex((b) => b[1][0] - b[0][0] < 100);
    const [from, facing] = [longs[0]!, longs[1]!];
    const cy = (from.b[0][1] + from.b[1][1]) / 2;
    // A pocket 200 × 8, 40 deep, in the middle of the top of the first long side.
    const pocket = centeredRectangle(200, 8);
    pocket.points.forEach((p) => (p.y += cy));
    // Placed by its points, not held at the origin.
    pocket.constraints = [];
    doc.features.push(
      { id: "sk2", type: "sketch", name: "Tracé 1", plane: "XY", offset: 720, ...pocket, support: `sh1#${from.i}` } as never,
      { id: "ex2", type: "extrude", name: "Extrusion 2", sketch: "sk2", distance: -40, operation: "cut", target: `sh1#${from.i}` } as never,
    );
    const ops = operationsOf(doc, "ex2");
    let next = doc;
    for (const to of [facing.i, short]) {
      const target = boxes[to]!;
      const t = turnsBetween(from.b, target)[0]!;
      const copied = withOperationsCopied(next, ops.base, ["ex2"], `sh1#${to}`, placing(from.b, target, t), t !== turnsBetween(from.b, from.b)[0]);
      expect(copied.notes).toEqual([]);
      expect(copied.made.map((f) => f.type)).toEqual(["sketch", "extrude"]);
      next = copied.doc;
    }
    const result = r.recompute(next);
    expect(result.statuses.filter((s) => s.state !== "ok")).toEqual([]);
    const cuts = next.features.filter((f) => f.type === "extrude" && f.operation === "cut");
    expect(cuts.map((f) => (f as { target?: string }).target)).toEqual([`sh1#${from.i}`, `sh1#${facing.i}`, `sh1#${short}`]);
    // Each side lost the same pocket: 200 × 8 × 40.
    const whole = (i: number) => (boxes[i]![1][0] - boxes[i]![0][0]) * (boxes[i]![1][1] - boxes[i]![0][1]) * 720;
    for (const [k, f] of cuts.entries()) {
      const out = r.output(f.id);
      const v = out?.kind === "solid" ? measureVolume(out.shape) : 0;
      expect(whole([from.i, facing.i, short][k]!) - v).toBeCloseTo(200 * 8 * 40, -1);
    }
    r.dispose();
  }, 120_000);
});
