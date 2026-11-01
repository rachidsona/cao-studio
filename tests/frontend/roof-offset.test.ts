/** Décalage sur tout un toit à deux pans, par-dessus le faîtage. */
import { describe, expect, it } from "vitest";
import { roofOf, roofOutline, roofPointerOffset, roofPoint, roofRecess } from "../../frontend/src/features/roof-offset";

// A block 1000 (X) × 800 (Y) × 600 with a roof along X: eaves at y = ±400, z 600; ridge at y = 0, z 900.
const body: [[number, number, number], [number, number, number]] = [[-500, -400, 0], [500, 400, 900]];
// The slope towards −Y: its four edges.
const slope = [
  { a: [-500, -400, 600] as [number, number, number], b: [500, -400, 600] as [number, number, number] },
  { a: [-500, 0, 900] as [number, number, number], b: [500, 0, 900] as [number, number, number] },
  { a: [-500, -400, 600] as [number, number, number], b: [-500, 0, 900] as [number, number, number] },
  { a: [500, -400, 600] as [number, number, number], b: [500, 0, 900] as [number, number, number] },
];
const roof = roofOf(slope, body)!;

describe("tout le toit", () => {
  it("lu d'un pan : égout, faîtage, l'autre égout au bord du corps, longueur", () => {
    expect(roof).toEqual({ axis: 0, profile: [[-400, 600], [0, 900], [400, 600]], s0: -500, s1: 500 });
  });

  it("la distance au bord se mesure le long des pans et jusqu'aux pignons", () => {
    // Half-way up a slope 500 long: 250.
    expect(roofPointerOffset(roof, roofPoint(roof, 0, [-200, 750]))).toBeCloseTo(250);
    expect(roofPointerOffset(roof, roofPoint(roof, 450, [-200, 750]))).toBeCloseTo(50);
  });

  it("le contour passe par-dessus le faîtage, à la même distance des deux égouts", () => {
    const outline = roofOutline(roof, 50)!;
    expect(outline).toHaveLength(6);
    // 50 up the 500-long slope: 40 across, 30 up.
    expect(outline[0]![0]).toEqual([-450, -360, 630]);
    expect(roofOutline(roof, 500)).toBeNull();
  });

  it("creusé : une coupe en V d'épaisseur constante, coupée le long du faîtage ; en relief : ajoutée", () => {
    const dug = roofRecess(roof, 50, 20);
    if (typeof dug === "string") throw new Error(dug);
    expect(dug).toMatchObject({ plane: "YZ", offset: -450, distance: 900, operation: "cut" });
    const pts = dug.geometry.points;
    expect(pts).toHaveLength(6);
    // The inner point under the ridge: 20 under each slope (normal), 25 under the ridge vertically (20 / cos).
    expect(pts[4]!.x).toBeCloseTo(0);
    expect(pts[4]!.y).toBeCloseTo(900 - 25);
    expect(roofRecess(roof, 50, -10)).toMatchObject({ operation: "join" });
    expect(roofRecess(roof, 50, 600)).toMatch(/profond/);
  });
});
