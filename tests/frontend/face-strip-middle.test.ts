/** Magie extrusion: laying the line, it snaps to the middle of an edge or the centre of the face under the pointer. */
import { describe, expect, it } from "vitest";
import { middleOnFace, type LoadedFace } from "../../frontend/src/app/face-strip-view";
import { edgeReference } from "../../frontend/src/sketcher/face-strip";
import type { Viewport } from "../../frontend/src/viewport/viewport";

// A 100 × 60 face in the XY plane; the "screen" is the plane itself, 1 mm a pixel.
const polygon: [number, number][] = [[0, 0], [100, 0], [100, 60], [0, 60]];
const face = { polygon, frame: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] } } as unknown as LoadedFace;
const at = (x: number, y: number) => ({ x, y }) as unknown as PointerEvent;
const viewport = { screenDistance: (e: { x: number; y: number }, p: number[]) => Math.hypot(e.x - p[0]!, e.y - p[1]!) } as unknown as Viewport;
const ref = edgeReference(polygon, { a: [0, 0], b: [100, 0] });

describe("middleOnFace", () => {
  it("takes the centre of the face, and the middle of a side edge", () => {
    expect(middleOnFace(viewport, face, ref, at(52, 31))).toEqual({ point: [50, 30], kind: "center" });
    expect(middleOnFace(viewport, face, ref, at(98, 28))).toEqual({ point: [100, 30], kind: "middle" });
  });
  it("skips the middle of the edge the line starts from, and points too far away", () => {
    expect(middleOnFace(viewport, face, ref, at(50, 2))).toBeNull();
    expect(middleOnFace(viewport, face, ref, at(20, 20))).toBeNull();
  });
});
