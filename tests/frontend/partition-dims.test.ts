import { describe, expect, it } from "vitest";
import { partitionDims, ringGap, shortValue, type PartitionPlan } from "../../frontend/src/features/partition-dims";

/** The placard of the plan: 1800 × 2500, a low row of three niches (shelves left and right), a high row of two. */
const left = [0, 1, 2].map((i) => ({ x0: 18, x1: 588, y0: 18 + i * 330, y1: 330 + i * 330 }));
const right = [0, 1, 2].map((i) => ({ x0: 1212, x1: 1782, y0: 18 + i * 330, y1: 330 + i * 330 }));
const plan: PartitionPlan = {
  outer: { x0: 0, y0: 0, x1: 1800, y1: 2500 },
  niches: [
    ...left,
    ...right,
    { x0: 606, x1: 1194, y0: 18, y1: 1000 },
    { x0: 18, x1: 588, y0: 2000, y1: 2482 },
    { x0: 606, x1: 1782, y0: 2000, y1: 2482 },
  ],
  depth: 580,
  plinth: 0,
};

const lengths = (level: string) =>
  partitionDims(plan)
    .filter((d) => d.level === level)
    .map((d) => Math.round(d.length));

describe("the dimensions of a Répartition", () => {
  it("gives the totals and the depth once", () => {
    expect(lengths("total").sort((a, b) => a - b)).toEqual([1800, 2500]);
    expect(lengths("depth")).toEqual([580]);
  });

  it("chains the niches around the drawing, outside it", () => {
    const dims = partitionDims(plan);
    const below = dims.filter((d) => d.level === "chain" && d.from[1] < 0).map((d) => Math.round(d.length));
    const above = dims.filter((d) => d.level === "chain" && d.from[1] > 2500).map((d) => Math.round(d.length));
    expect(below).toEqual([570, 588, 570]);
    expect(above).toEqual([570, 1176]);
    const lefts = dims.filter((d) => d.level === "chain" && d.from[0] < 0).map((d) => Math.round(d.length));
    expect(lefts).toEqual([312, 312, 312, 482]);
    // Witness lines start on the drawing's edge.
    expect(dims.find((d) => d.level === "chain" && d.from[1] < 0)?.witnesses[0]?.[0]).toEqual([18, 0, 0]);
  });

  it("chains the right side of a divided column too, even with the same heights as the left", () => {
    const rights = partitionDims(plan).filter((d) => d.level === "chain" && d.from[0] > 1800).map((d) => Math.round(d.length));
    expect(rights).toEqual([312, 312, 312, 482]);
  });

  it("leaves out the side opposite when it says the same", () => {
    const dims = partitionDims({ outer: { x0: 0, y0: 0, x1: 1000, y1: 720 }, niches: [{ x0: 18, x1: 982, y0: 18, y1: 702 }], depth: 0, plinth: 0 });
    expect(dims.filter((d) => d.level === "chain")).toHaveLength(2);
    expect(dims.filter((d) => d.level === "inner")).toHaveLength(0);
    expect(dims.some((d) => d.level === "depth")).toBe(false);
  });

  it("writes inside only what no chain gives", () => {
    const inner = partitionDims(plan).filter((d) => d.level === "inner");
    // The middle niche's height (its width is in the chain below); 1000 − 18.
    expect(inner.map((d) => Math.round(d.length))).toEqual([982]);
    expect(inner[0]?.witnesses).toEqual([]);
  });

  it("gives once a span shared by several niches inside", () => {
    const shelves = [0, 1, 2].map((i) => ({ x0: 300, x1: 700, y0: 18 + i * 200, y1: 200 + i * 200 }));
    const dims = partitionDims({
      outer: { x0: 0, y0: 0, x1: 1000, y1: 700 },
      niches: [{ x0: 18, x1: 282, y0: 18, y1: 682 }, { x0: 718, x1: 982, y0: 18, y1: 682 }, ...shelves],
      depth: 0,
      plinth: 0,
    }).filter((d) => d.level === "inner");
    expect(dims.filter((d) => d.from[1] === d.to[1])).toHaveLength(0);
    expect(dims.filter((d) => d.from[0] === d.to[0]).map((d) => Math.round(d.length))).toEqual([182, 182, 182]);
  });

  it("gives each door its width and height, and writes nothing behind them", () => {
    const doors = [{ x0: 2, y0: 2, x1: 598, y1: 2498 }, { x0: 602, y0: 2, x1: 1198, y1: 2498 }];
    const dims = partitionDims({ ...plan, doors });
    expect(dims.filter((d) => d.level === "door").map((d) => Math.round(d.length))).toEqual([596, 2496, 596, 2496]);
    expect(dims.filter((d) => d.level === "door").every((d) => d.witnesses.length === 0)).toBe(true);
    expect(dims.some((d) => d.level === "inner")).toBe(false);
    // The chains around stay.
    expect(dims.some((d) => d.level === "chain")).toBe(true);
  });

  it("adds the plinth to the chain of the left side", () => {
    const dims = partitionDims({ outer: { x0: 0, y0: 0, x1: 600, y1: 800 }, niches: [{ x0: 18, x1: 582, y0: 118, y1: 782 }], depth: 0, plinth: 100 });
    expect(dims.filter((d) => d.level === "chain" && d.from[0] < 0).map((d) => Math.round(d.length))).toEqual([664, 100]);
  });

  it("keeps its distance from the drawing by its size", () => {
    expect(ringGap({ x0: 0, y0: 0, x1: 200, y1: 100 })).toBe(40);
    expect(ringGap({ x0: 0, y0: 0, x1: 1800, y1: 2500 })).toBe(125);
    expect(ringGap({ x0: 0, y0: 0, x1: 9000, y1: 2500 })).toBe(160);
  });

  it("writes short values", () => {
    expect(shortValue(31.26667, 1)).toBe("31,3");
    expect(shortValue(250, 1)).toBe("250");
  });
});
