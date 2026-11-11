/**
 * Une zone d'esquisse extrudée suit ses points quand une cote change (audit d'architecture du 11/11/2026) : retrouvée
 * par les noms des points de son contour, elle n'est plus remplacée par sa voisine où tombe son ancien point.
 */
import { describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { extractLoops, loopKey } from "../../frontend/src/sketcher/loops";
import { chosenLoop } from "../../frontend/src/sketcher/profiles";

/** Two rectangles side by side, 0..split and split..200 wide, 100 high, sharing the edge at x = split. */
function twoAreas(split: number): SketchGeometry {
  const points = [
    { id: "a", x: 0, y: 0 }, { id: "b", x: split, y: 0 }, { id: "c", x: 200, y: 0 },
    { id: "d", x: 200, y: 100 }, { id: "e", x: split, y: 100 }, { id: "f", x: 0, y: 100 },
  ];
  const line = (id: string, p1: string, p2: string) => ({ id, kind: "line" as const, p1, p2 });
  const curves = [line("l1", "a", "b"), line("l2", "b", "c"), line("l3", "c", "d"), line("l4", "d", "e"), line("l5", "e", "f"), line("l6", "f", "a"), line("l7", "b", "e")];
  return { points, curves, constraints: [] } as unknown as SketchGeometry;
}

describe("zone retrouvée par ses points", () => {
  const before = twoAreas(120);
  const loopsBefore = extractLoops(before);
  const left = loopsBefore.findIndex((l) => l.probe[0] < 120);
  const key = loopKey(loopsBefore[left]!, before);
  const probe = loopsBefore[left]!.probe as [number, number];

  it("le nom d'une zone vient de ses coins", () => {
    expect(key).toBe("a|b|e|f");
  });

  it("la cote réduite, l'ancien point tombe dans la voisine, mais la zone reste la même", () => {
    const after = twoAreas(30);
    const loops = extractLoops(after);
    const found = chosenLoop(loops, after, probe, key);
    expect(loopKey(loops[found]!, after)).toBe("a|b|e|f");
    // Without the key, the point alone takes the other area.
    expect(loopKey(loops[chosenLoop(loops, after, probe, undefined)]!, after)).toBe("b|c|d|e");
  });

  it("une zone dont le contour a changé est à rechoisir, pas remplacée", () => {
    const after = twoAreas(120);
    // The shared edge taken away: one area remains, with other corners.
    const merged = { ...after, curves: after.curves.filter((c) => c.id !== "l7") } as SketchGeometry;
    expect(() => chosenLoop(extractLoops(merged), merged, probe, key)).toThrow(/a changé de forme/);
  });
});
