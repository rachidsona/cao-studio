/** Drawing directly on a face (as Curic DIO): the distances to the nearest edges and the snapping. */
import { describe, expect, it } from "vitest";
import { coordinateAt, pointAtLength, snapDims, snapOnFace, withTypedDistances } from "../../frontend/src/sketcher/face-draw";

/** A face 400 × 300. */
const FACE: [number, number][] = [[0, 0], [400, 0], [400, 300], [0, 300]];

describe("cotes d'accrochage (distances aux bords les plus proches)", () => {
  it("à gauche et en bas : les deux mesures vont vers les bords les plus proches", () => {
    const [x, y] = snapDims(FACE, [100, 70]);
    expect(x).toMatchObject({ axis: 0, distance: 100, side: -1, to: [0, 70] });
    expect(y).toMatchObject({ axis: 1, distance: 70, side: -1, to: [100, 0] });
  });

  it("à droite et en haut : les bords les plus proches sont de l'autre côté", () => {
    const [x, y] = snapDims(FACE, [350, 280]);
    expect(x).toMatchObject({ distance: 50, side: 1, to: [400, 280] });
    expect(y).toMatchObject({ distance: 20, side: 1, to: [350, 300] });
  });

  it("une face en L : les mesures s'arrêtent au vrai bord, pas à la boîte englobante", () => {
    const L: [number, number][] = [[0, 0], [400, 0], [400, 100], [200, 100], [200, 300], [0, 300]];
    const dims = snapDims(L, [100, 200]);
    expect(dims[0]).toMatchObject({ distance: 100, side: -1 });
    expect(dims[1]).toMatchObject({ distance: 100, side: 1, to: [100, 300] });
  });

  it("la coordonnée d'un point à une distance donnée du bord", () => {
    const [x, y] = snapDims(FACE, [100, 70]) as [ReturnType<typeof snapDims>[0], ReturnType<typeof snapDims>[0]];
    expect(coordinateAt(x, 40)).toBe(40);
    expect(coordinateAt(y, 25)).toBe(25);
    const [right] = snapDims(FACE, [350, 150]);
    expect(coordinateAt(right!, 30)).toBe(370);
  });
});

describe("accrochage sur la face", () => {
  it("un coin proche attire le point, puis le milieu d'une arête", () => {
    expect(snapOnFace(FACE, [3, 4], 10, 8)).toEqual({ point: [0, 0], kind: "corner" });
    expect(snapOnFace(FACE, [203, 5], 10, 8)).toEqual({ point: [200, 0], kind: "middle" });
  });

  it("sinon les distances aux bords sont arrondies au pas", () => {
    expect(snapOnFace(FACE, [103, 68], 10, 4)).toEqual({ point: [100, 70], kind: "free" });
    // From the right edge: 47 mm → 50.
    expect(snapOnFace(FACE, [353, 150], 10, 4).point[0]).toBe(350);
    expect(snapOnFace(FACE, [103.4, 68.6], 1, 0.5).point).toEqual([103, 69]);
  });

  it("des distances saisies placent le point exactement, mesurées depuis les bords les plus proches", () => {
    expect(withTypedDistances(FACE, [103, 68], { x: 120, y: null })).toEqual([120, 68]);
    expect(withTypedDistances(FACE, [350, 280], { x: 45, y: 12.5 })).toEqual([355, 287.5]);
    expect(withTypedDistances(FACE, [10, 10], {})).toEqual([10, 10]);
  });

  it("un point à une longueur donnée, dans la direction du pointeur ou à un angle", () => {
    const [x, y] = pointAtLength([10, 10], [20, 10], 50);
    expect([x, y]).toEqual([60, 10]);
    const [u, v] = pointAtLength([0, 0], [1, 1], 100, 90);
    expect(u).toBeCloseTo(0, 9);
    expect(v).toBeCloseTo(100, 9);
  });
});
