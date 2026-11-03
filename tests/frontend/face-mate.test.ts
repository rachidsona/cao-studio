/** Face sur face (Aligner) : une face plaquée sur une autre, même inclinée. */
import { describe, expect, it } from "vitest";
import { faceOnFace, turn } from "../../frontend/src/features/face-mate";
import type { Vec3 } from "../../frontend/src/document/types";

/** Where a point of the moving body goes. */
function place(p: Vec3, mate: ReturnType<typeof faceOnFace>): Vec3 {
  let q = p;
  if (mate.rotation) {
    const { dir, angle, center } = mate.rotation;
    const h = (angle * Math.PI) / 360;
    const rel = q.map((c, i) => c - center[i]!) as Vec3;
    const t = turn([Math.cos(h), dir[0] * Math.sin(h), dir[1] * Math.sin(h), dir[2] * Math.sin(h)], rel);
    q = t.map((c, i) => c + center[i]!) as Vec3;
  }
  return q.map((c, i) => c + mate.translate[i]!) as Vec3;
}
const near = (a: Vec3, b: Vec3) => a.forEach((c, i) => expect(c).toBeCloseTo(b[i]!, 6));

describe("face sur face", () => {
  it("des faces déjà en vis-à-vis : un simple déplacement, le centre sur le point visé", () => {
    const mate = faceOnFace({ point: [100, 0, 50], normal: [1, 0, 0] }, { point: [300, 20, 60], normal: [-1, 0, 0] });
    expect(mate.rotation).toBeNull();
    expect(mate.translate).toEqual([200, 20, 10]);
  });

  it("le dessous d'un bloc sur un pan de toit à 45° : la face se retourne contre le pan et s'y pose", () => {
    const s = Math.SQRT1_2;
    const roof = { point: [0, 0, 500] as Vec3, normal: [s, 0, s] as Vec3 };
    const mate = faceOnFace({ point: [1000, 0, 0], normal: [0, 0, -1] }, roof);
    expect(mate.rotation?.angle).toBeCloseTo(45, 6);
    // The face's centre lands on the point; a point of the block 100 above it ends 100 out of the slope.
    near(place([1000, 0, 0], mate), [0, 0, 500]);
    near(place([1000, 0, 100], mate), [100 * s, 0, 500 + 100 * s]);
  });

  it("deux faces de même sens : un demi-tour autour de la verticale, puis le jeu le long de la normale", () => {
    const mate = faceOnFace({ point: [0, 0, 0], normal: [1, 0, 0] }, { point: [500, 0, 0], normal: [1, 0, 0] }, 2);
    expect(mate.rotation?.angle).toBeCloseTo(180, 6);
    near(mate.rotation!.dir.map(Math.abs) as Vec3, [0, 0, 1]);
    near(place([-100, 0, 0], mate), [602, 0, 0]);
  });

  it("un quart de tour sur la face, autour de sa normale", () => {
    const mate = faceOnFace({ point: [0, 0, 0], normal: [0, 0, -1] }, { point: [0, 0, 100], normal: [0, 0, 1] }, 0, 90);
    near(place([50, 0, 0], mate), [0, 50, 100]);
  });
});
