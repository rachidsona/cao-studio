/** Les cotes tapées pendant le tracé d'une forme, comme dans Fusion 360. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry } from "../../frontend/src/document/sketch";
import { previewAnnotations } from "../../frontend/src/sketcher/annotations";
import { measure, type Vec2 } from "../../frontend/src/sketcher/edit";
import { DrawingTool } from "../../frontend/src/sketcher/tools";
import { constrained, TypedDims, typedFields, withTypedDimensions } from "../../frontend/src/sketcher/typed-dims";

const type = (typed: TypedDims, tool: string, text: string) => [...text].forEach((key) => typed.type(tool, key));
const near = (p: Vec2, q: Vec2) => {
  expect(p[0]).toBeCloseTo(q[0], 6);
  expect(p[1]).toBeCloseTo(q[1], 6);
};

describe("cotes tapées pendant le tracé", () => {
  beforeAll(() => initSolver());

  it("chaque outil a ses cotes : rectangle, ligne, cercle ; les autres n'en ont pas", () => {
    expect(typedFields("rectangle")).toEqual(["w", "h"]);
    expect(typedFields("line")).toEqual(["l", "a"]);
    expect(typedFields("circle")).toEqual(["c"]);
    expect(typedFields("polygon")).toEqual([]);
    expect(typedFields(undefined)).toEqual([]);
  });

  it("rectangle : la largeur tapée, Tab, la hauteur — le pointeur donne le côté", () => {
    const typed = new TypedDims();
    expect(typed.empty).toBe(true);
    type(typed, "rectangle", "30");
    // In cm: 300 mm wide at once, the height still the pointer's.
    expect(typed.values("rectangle", "cm")).toEqual({ w: 300 });
    near(typed.constrain("rectangle", "cm", [10, 10], [50, 90]), [310, 90]);
    expect(typed.next("rectangle", "cm")).toBe(true);
    type(typed, "rectangle", "20,5");
    expect(typed.values("rectangle", "cm")).toEqual({ w: 300, h: 205 });
    near(typed.constrain("rectangle", "cm", [10, 10], [50, 90]), [310, 215]);
    // To the left and down, when the pointer is there.
    near(typed.constrain("rectangle", "cm", [10, 10], [-5, -1]), [-290, -195]);
    typed.reset();
    expect(typed.empty).toBe(true);
    near(typed.constrain("rectangle", "cm", [10, 10], [50, 90]), [50, 90]);
  });

  it("Tab garde la valeur et revient à la première case ; Retour arrière efface, puis libère la valeur gardée", () => {
    const typed = new TypedDims();
    type(typed, "rectangle", "12");
    typed.next("rectangle", "mm");
    typed.next("rectangle", "mm");
    // Back on the width, kept: typed again, it is replaced.
    expect(typed.values("rectangle", "mm")).toEqual({ w: 12 });
    type(typed, "rectangle", "45");
    expect(typed.values("rectangle", "mm")).toEqual({ w: 45 });
    expect(typed.erase("rectangle")).toBe(true);
    expect(typed.erase("rectangle")).toBe(true);
    expect(typed.values("rectangle", "mm")).toEqual({ w: 12 });
    expect(typed.erase("rectangle")).toBe(true);
    expect(typed.values("rectangle", "mm")).toEqual({});
    expect(typed.erase("rectangle")).toBe(false);
    // Only keys of a number, one decimal sign; a zero is not a dimension.
    expect(typed.type("rectangle", "x")).toBe(false);
    expect(typed.type("polygon", "5")).toBe(false);
    type(typed, "rectangle", "1.5.2");
    expect(typed.values("rectangle", "mm")).toEqual({ w: 1.52 });
    typed.reset();
    type(typed, "rectangle", "0");
    expect(typed.values("rectangle", "mm")).toEqual({});
  });

  it("ligne : la longueur dans le sens du pointeur ; l'angle sur l'horizontale, du côté du pointeur", () => {
    near(constrained("line", { l: 100 }, [0, 0], [3, 4]), [60, 80]);
    near(constrained("line", { l: 100, a: 30 }, [0, 0], [50, 10]), [100 * Math.cos(Math.PI / 6), 50]);
    near(constrained("line", { l: 100, a: 30 }, [0, 0], [50, -10]), [100 * Math.cos(Math.PI / 6), -50]);
    near(constrained("line", { l: 100, a: 30 }, [0, 0], [-50, 10]), [-100 * Math.cos(Math.PI / 6), 50]);
    // The angle alone: as long as the pointer is far along it.
    near(constrained("line", { a: 90 }, [0, 0], [7, 40]), [0, 40]);
    near(constrained("line", {}, [0, 0], [7, 40]), [7, 40]);
  });

  it("cercle : le diamètre tapé", () => {
    near(constrained("circle", { c: 50 }, [10, 0], [10, 300]), [10, 25]);
    near(constrained("circle", { c: 50 }, [10, 0], [10, 0]), [35, 0]);
  });

  it("les mesures en direct deviennent des cases : celle qui prend les touches, celle qui est gardée", () => {
    const tool = new DrawingTool("rectangle");
    const g = emptySketchGeometry();
    tool.click(g, { pos: [0, 0] });
    expect(tool.anchor(g)).toEqual([0, 0]);
    const typed = new TypedDims();
    type(typed, "rectangle", "25");
    const preview = tool.move(g, { pos: typed.constrain("rectangle", "mm", [0, 0], [40, 30]) });
    let fields = typed.decorate("rectangle", "mm", previewAnnotations(preview, "mm"), null, 1);
    expect(fields.map((a) => [a.field?.id, a.field?.state, a.text])).toEqual([["w", "active", "25"], ["h", "idle", "30"]]);
    typed.next("rectangle", "mm");
    fields = typed.decorate("rectangle", "mm", previewAnnotations(preview, "mm"), null, 1);
    expect(fields.map((a) => [a.field?.id, a.field?.state, a.text])).toEqual([["w", "locked", "25"], ["h", "active", "30"]]);
    // A line has its angle too.
    const line: [Vec2, Vec2] = [[0, 0], [10, 10]];
    const angle = new TypedDims().decorate("line", "mm", previewAnnotations({ lines: [line], circles: [], arcs: [] }, "mm"), line, 1);
    expect(angle.map((a) => [a.field?.id, a.text])).toEqual([["l", "14,142"], ["a", "45°"]]);
  });

  it("la forme posée garde une cote pour chaque valeur tapée", () => {
    const rectangle = new DrawingTool("rectangle");
    const g = emptySketchGeometry();
    rectangle.click(g, { pos: [0, 0] });
    const made = rectangle.click(g, { pos: [300, 200] });
    if (made.kind !== "commit") throw new Error("pas de rectangle");
    const dims = (geometry: typeof g) => geometry.constraints.filter((c) => "value" in c).map((c) => [c.kind, (c as { value: number }).value]);
    expect(dims(withTypedDimensions(made.geometry, made.created, "rectangle", { w: 300, h: 200 }))).toEqual([["length", 300], ["length", 200]]);
    expect(dims(withTypedDimensions(made.geometry, made.created, "rectangle", { h: 200 }))).toEqual([["length", 200]]);
    expect(dims(withTypedDimensions(made.geometry, made.created, "rectangle", {}))).toEqual([]);
    // The width is on a horizontal side, the height on an upright one.
    const both = withTypedDimensions(made.geometry, made.created, "rectangle", { w: 300, h: 200 });
    for (const c of both.constraints) if ("value" in c) expect(measure(both, c)).toBeCloseTo(c.value, 6);

    const circle = new DrawingTool("circle");
    circle.click(g, { pos: [0, 0] });
    const round = circle.click(g, { pos: [25, 0] });
    if (round.kind !== "commit") throw new Error("pas de cercle");
    expect(dims(withTypedDimensions(round.geometry, round.created, "circle", { c: 50 }))).toEqual([["diameter", 50]]);

    const line = new DrawingTool("line");
    line.click(g, { pos: [0, 0] });
    const drawn = line.click(g, { pos: [60, 80] });
    if (drawn.kind !== "commit") throw new Error("pas de ligne");
    expect(dims(withTypedDimensions(drawn.geometry, drawn.created, "line", { l: 100, a: 53 }))).toEqual([["length", 100]]);
  });
});
