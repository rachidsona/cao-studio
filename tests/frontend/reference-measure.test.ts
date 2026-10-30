/** Taking a measure from the model: what a corner, an edge or a face gives as the distance of an extrusion. */
import { describe, expect, it } from "vitest";
import { planeOfFace, referenceDistance, ReferencePicker, type Reference } from "../../frontend/src/app/reference-measure";

const BASE: [number, number, number] = [100, 100, 0];
const UP: [number, number, number] = [0, 0, 1];

describe("distance donnée par une référence", () => {
  it("un coin donne son niveau le long de la flèche, depuis la base", () => {
    expect(referenceDistance({ kind: "point", point: [500, 40, 590] }, BASE, UP)).toEqual({ value: 590, what: "niveau du point" });
    expect(referenceDistance({ kind: "point", point: [0, 0, -30] }, BASE, UP)?.value).toBe(-30);
  });

  it("une arête : son niveau, ou sa longueur au choix", () => {
    const edge: Reference = { kind: "edge", a: [0, 0, 0], b: [0, 0, 720], point: [0, 0, 300] };
    expect(referenceDistance(edge, BASE, UP, "level")).toEqual({ value: 300, what: "niveau de l'arête" });
    expect(referenceDistance(edge, BASE, UP, "length")).toEqual({ value: 720, what: "longueur de l'arête" });
  });

  it("une face parallèle à la base : le niveau de son plan, pas du point cliqué", () => {
    const face: Reference = { kind: "face", point: [10, 20, 590.4], plane: { normal: [0, 0, 1], point: [0, 0, 590] } };
    expect(referenceDistance(face, BASE, UP)).toEqual({ value: 590, what: "niveau de la face" });
  });

  it("une face de côté ou courbe : le niveau du point cliqué", () => {
    const side: Reference = { kind: "face", point: [10, 20, 250], plane: { normal: [1, 0, 0], point: [0, 0, 0] } };
    expect(referenceDistance(side, BASE, UP)).toEqual({ value: 250, what: "niveau du point cliqué sur la face" });
    expect(referenceDistance({ kind: "face", point: [0, 0, 80], plane: null }, BASE, UP)?.value).toBe(80);
  });

  it("une référence au niveau de la base ne donne rien", () => {
    expect(referenceDistance({ kind: "point", point: [5, 5, 0.0004] }, BASE, UP)).toBeNull();
  });

  it("la flèche peut être oblique : la distance est projetée sur son axe", () => {
    expect(referenceDistance({ kind: "point", point: [100, 100 + 50, 0] }, BASE, [0, 1, 0])?.value).toBe(50);
  });
});

describe("plan d'une face", () => {
  // Two faces of a mesh: face 0 flat (four vertices facing +Z at z = 12), face 1 curved (normals differ).
  const mesh = {
    vertices: new Float32Array([0, 0, 12, 10, 0, 12, 10, 10, 12, 0, 10, 12, 0, 0, 0, 10, 0, 0, 10, 0, 5, 0, 0, 5]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, -1, 0, 0, -0.7, 0.7, 0, -0.7, 0.7, 0, -1, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
    faceGroups: [{ start: 0, count: 6, faceId: 0 }, { start: 6, count: 6, faceId: 1 }],
  };

  it("une face plane donne sa normale et un de ses points", () => {
    expect(planeOfFace(mesh, 0)).toEqual({ normal: [0, 0, 1], point: [0, 0, 12] });
  });

  it("une face dont les normales diffèrent n'a pas de plan ; une face inconnue non plus", () => {
    expect(planeOfFace(mesh, 1)).toBeNull();
    expect(planeOfFace(mesh, 7)).toBeNull();
  });
});

describe("choix d'un arrêt à proximité du pointeur", () => {
  // A viewport where the screen is the xy plane: the distance on screen is the distance in x, y.
  const viewport = {
    screenDistance: (event: { x: number; y: number }, p: [number, number, number]) => Math.hypot(event.x - p[0], event.y - p[1]),
    rayFromEvent: (event: { x: number; y: number }) => ({ origin: [event.x, event.y, 100] as [number, number, number], direction: [0, 0, -1] as [number, number, number] }),
    pickFace: () => null,
  };
  const picker = new ReferencePicker(viewport as never);
  (picker as unknown as { targets: unknown }).targets = { corners: [[0, 0, 0]], segments: [[[0, 0, 50], [200, 0, 50]]] };
  const at = (x: number, y: number) => ({ x, y }) as unknown as PointerEvent;

  it("prend un coin à une quinzaine de pixels, pas à vingt", () => {
    expect(picker.near(at(14, 0))).toMatchObject({ kind: "point" });
    expect(picker.near(at(0, 22))).toBeNull();
  });

  it("prend une arête à une dizaine de pixels de son tracé", () => {
    expect(picker.near(at(100, 10))).toMatchObject({ kind: "edge", point: [100, 0, 50] });
    expect(picker.near(at(100, 16))).toBeNull();
  });

  it("le coin passe avant l'arête, et near() ne donne jamais de face", () => {
    expect(picker.near(at(5, 4))).toMatchObject({ kind: "point" });
    expect(picker.find(at(100, 60))).toBeNull();
  });
});
