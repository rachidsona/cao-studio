/** Décalage sur une face courbe (le dessus d'une voûte) : contour sur la face, panneau creusé ou en relief. */
import { describe, expect, it } from "vitest";
import { curvedFaceOf, curvedOutline, curvedPointerOffset, curvedRecess, onFace } from "../../frontend/src/features/curved-offset";

// A vault along X from x = −500 to 500: a half-circle of radius 400 centred on (y 0, z 600), seen from +X.
const arcs = [-500, 500].map((x) => ({ center: [x, 0, 600] as [number, number, number], radius: 400, a: [x, 400, 600] as [number, number, number], b: [x, -400, 600] as [number, number, number], mid: [x, 0, 1000] as [number, number, number] }));
const face = curvedFaceOf(arcs)!;

describe("face courbe", () => {
  it("lue de ses deux arcs : axe X, rayon, angles du côté du sommet, longueur", () => {
    expect(face).toMatchObject({ axis: 0, center: [0, 600], radius: 400, s0: -500, s1: 500 });
    expect(face.a0).toBeCloseTo(0);
    expect(face.a1).toBeCloseTo(Math.PI);
    // Not a cylinder of a main axis: nothing.
    expect(curvedFaceOf([arcs[0]!])).toBeNull();
  });

  it("la distance du pointeur au bord se mesure sur la face", () => {
    expect(curvedPointerOffset(face, onFace(face, 0, Math.PI / 2))).toBeCloseTo(500);
    expect(curvedPointerOffset(face, onFace(face, 450, Math.PI / 2))).toBeCloseTo(50);
    expect(curvedPointerOffset(face, onFace(face, 0, 0.1))).toBeCloseTo(40);
  });

  it("le contour décalé reste sur la face ; trop grand, rien", () => {
    const outline = curvedOutline(face, 50)!;
    for (const [a] of outline) expect(Math.hypot(a[1], a[2] - 600)).toBeCloseTo(400);
    expect(Math.min(...outline.map(([a]) => a[0]))).toBeCloseTo(-450);
    expect(curvedOutline(face, 600)).toBeNull();
  });

  it("creusé : une couronne sur le pignon YZ, coupée le long de la voûte ; en relief : ajoutée", () => {
    const dug = curvedRecess(face, 50, 20);
    if (typeof dug === "string") throw new Error(dug);
    expect(dug).toMatchObject({ plane: "YZ", offset: -450, distance: 900, operation: "cut" });
    expect(dug.geometry.curves.filter((c) => c.kind === "arc").map((c) => (c.kind === "arc" ? c.radius : 0))).toEqual([400, 380]);
    const raised = curvedRecess(face, 50, -15);
    expect(raised).toMatchObject({ operation: "join" });
    if (typeof raised !== "string") expect(raised.geometry.curves.filter((c) => c.kind === "arc").map((c) => (c.kind === "arc" ? c.radius : 0))).toEqual([415, 400]);
    expect(curvedRecess(face, 50, 0)).toMatch(/profondeur/);
  });

  it("une voûte le long de Y : pignon XZ partant du bout haut", () => {
    const ys = [-300, 300].map((y) => ({ center: [0, y, 600] as [number, number, number], radius: 400, a: [400, y, 600] as [number, number, number], b: [-400, y, 600] as [number, number, number], mid: [0, y, 1000] as [number, number, number] }));
    const along = curvedRecess(curvedFaceOf(ys)!, 40, 10);
    expect(along).toMatchObject({ plane: "XZ", offset: -260, distance: 520 });
  });
});
