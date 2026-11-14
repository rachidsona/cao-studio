/** La saisie par coordonnées pendant le tracé : « @x;y », « #x;y », « distance<angle ». */
import { describe, expect, it } from "vitest";
import { CoordEntry, parseCoordinates } from "../../frontend/src/sketcher/coord-entry";

const near = (p: [number, number] | null, q: [number, number]) => {
  expect(p).not.toBeNull();
  expect(p![0]).toBeCloseTo(q[0], 9);
  expect(p![1]).toBeCloseTo(q[1], 9);
};

describe("coordonnées tapées", () => {
  it("relatives au dernier point, absolues depuis l'origine, en mm ou en cm", () => {
    near(parseCoordinates("600;0", true, [100, 50], "mm"), [700, 50]);
    near(parseCoordinates("600;0", false, [100, 50], "mm"), [600, 0]);
    near(parseCoordinates("60;-12,5", true, [100, 50], "cm"), [700, -75]);
    // A single comma separates: « 600,0 » is x = 600, y = 0.
    near(parseCoordinates("600,0", true, [0, 0], "mm"), [600, 0]);
    // The first point, relative: from the origin.
    near(parseCoordinates("10;20", true, null, "mm"), [10, 20]);
  });

  it("en polaire : une distance et un angle depuis l'horizontale", () => {
    near(parseCoordinates("100<90", true, [10, 10], "mm"), [10, 110]);
    near(parseCoordinates("200<45", true, [0, 0], "mm"), [200 * Math.SQRT1_2, 200 * Math.SQRT1_2]);
    near(parseCoordinates("50<180", true, [0, 0], "cm"), [-500, 0]);
  });

  it("incomplet : rien", () => {
    expect(parseCoordinates("600", true, [0, 0], "mm")).toBeNull();
    expect(parseCoordinates("600;", true, [0, 0], "mm")).toBeNull();
    expect(parseCoordinates("<45", true, [0, 0], "mm")).toBeNull();
  });

  it("« @ » ouvre la saisie, les touches s'y tapent, Entrée la pose, Échap l'annule", () => {
    const entry = new CoordEntry();
    expect(entry.key("6")).toBeNull();
    expect(entry.key("@")).toBe("typed");
    for (const k of "300;-40") entry.key(k);
    near(entry.target([0, 0], "mm"), [300, -40]);
    expect(entry.hint()).toContain("@300;-40");
    // « # » switches to absolute.
    entry.key("#");
    near(entry.target([10, 10], "mm"), [300, -40]);
    expect(entry.key("Enter")).toBe("enter");
    entry.key("Backspace");
    expect(entry.hint()).toContain("#300;-4");
    expect(entry.key("Escape")).toBe("cancel");
    expect(entry.active).toBe(false);
  });
});
