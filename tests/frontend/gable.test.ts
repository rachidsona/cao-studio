/** Toit à deux pans tiré d'une ligne sur le dessus d'un bloc (comme SketchUp). */
import { describe, expect, it } from "vitest";
import { gablePlan, sectionGeometry, topUnder, type Box } from "../../frontend/src/features/gable";

// A block 1000 × 800, 600 high.
const block: Box = [[0, 0, 0], [1000, 800, 600]];

describe("toit à deux pans", () => {
  it("trouve le bloc sous la ligne : le plus petit dont le dessus la porte", () => {
    const floor: Box = [[-2000, -2000, -10], [3000, 3000, 0]];
    const line: [[number, number, number], [number, number, number]] = [[0, 400, 600], [1000, 400, 600]];
    expect(topUnder(line, [{ id: "sol", box: floor }, { id: "bloc", box: block }])?.id).toBe("bloc");
    expect(topUnder([[0, 400, 300], [1000, 400, 300]], [{ id: "bloc", box: block }])).toBeNull();
  });

  it("une ligne le long de X : la coupe sur le pignon YZ, le toit sur toute la longueur", () => {
    const plan = gablePlan([[0, 400, 600], [1000, 400, 600]], block, 300);
    expect(plan).toEqual({
      plane: "YZ", offset: 0, distance: 1000,
      triangle: [[0, 600], [800, 600], [400, 900]],
      ridge: [[0, 400, 900], [1000, 400, 900]],
    });
  });

  it("une ligne le long de Y, hors du milieu : pignon XZ (vers −Y), deux pans inégaux", () => {
    const plan = gablePlan([[300, 0, 600], [300, 800, 600]], block, 250);
    expect(plan).toMatchObject({ plane: "XZ", offset: -800, distance: 800, triangle: [[0, 600], [1000, 600], [300, 850]] });
  });

  it("refuse une ligne de travers, hors du dessus, ou une hauteur nulle", () => {
    expect(gablePlan([[0, 0, 600], [1000, 800, 600]], block, 300)).toMatch(/parallèle/);
    expect(gablePlan([[0, 0, 600], [1000, 0, 600]], block, 300)).toMatch(/sur le dessus/);
    expect(gablePlan([[0, 400, 600], [1000, 400, 600]], block, 0)).toMatch(/positive/);
  });
});

describe("toit arrondi", () => {
  it("la voûte passe par les deux bords et par le faîtage : un demi-cercle à la moitié de la largeur", () => {
    const g = sectionGeometry([[0, 600], [800, 600], [400, 1000]], "arch");
    const arc = g.curves.find((c) => c.kind === "arc");
    expect(arc).toMatchObject({ kind: "arc", start: "p2", end: "p1", radius: 400 });
    expect(g.points.find((p) => p.id === "pc")).toEqual({ id: "pc", x: 400, y: 600 });
    if (arc?.kind !== "arc") throw new Error("pas d'arc");
    expect(arc.startAngle).toBeCloseTo(0);
    expect(arc.endAngle).toBeCloseTo(Math.PI);
  });

  it("plus basse, une voûte surbaissée : le centre sous les bords, l'arc passe par le sommet", () => {
    const g = sectionGeometry([[0, 600], [800, 600], [400, 800]], "arch");
    const c = g.points.find((p) => p.id === "pc")!;
    const arc = g.curves.find((x) => x.kind === "arc")!;
    if (arc.kind !== "arc") throw new Error("pas d'arc");
    expect(c.y).toBeLessThan(600);
    // The top of the arc is the ridge.
    expect(c.y + arc.radius).toBeCloseTo(800);
    expect(arc.endAngle - arc.startAngle).toBeLessThan(Math.PI);
  });

  it("deux pans : le triangle fermé de trois lignes", () => {
    expect(sectionGeometry([[0, 600], [800, 600], [400, 900]], "gable").curves.map((c) => c.kind)).toEqual(["line", "line", "line"]);
  });
});
