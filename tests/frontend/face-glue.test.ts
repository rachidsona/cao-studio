/** « Coller par face » : contact des faces opposées, affleurement des faces de même sens, jeu, faces non parallèles. */
import { describe, expect, it } from "vitest";
import { glueShift } from "../../frontend/src/features/face-glue";

describe("coller une face sur une autre", () => {
  it("faces opposées : contact, le long de la normale seulement", () => {
    // The right side of a cabinet at x = 600 against the left side of another at x = 1000 (normal −X).
    expect(glueShift({ point: [600, 30, 400], normal: [1, 0, 0] }, { point: [1000, -200, 0], normal: [-1, 0, 0] })).toEqual({ shift: [400, 0, 0], meet: "contact" });
    // With a gap of 3 mm, it stops short.
    expect(glueShift({ point: [600, 0, 0], normal: [1, 0, 0] }, { point: [1000, 0, 0], normal: [-1, 0, 0] }, 3)).toEqual({ shift: [397, 0, 0], meet: "contact" });
    // Going back the other way works the same.
    expect(glueShift({ point: [1500, 0, 0], normal: [-1, 0, 0] }, { point: [1000, 0, 0], normal: [1, 0, 0] })).toEqual({ shift: [-500, 0, 0], meet: "contact" });
  });

  it("faces de même sens : affleurantes, un jeu les met en retrait", () => {
    expect(glueShift({ point: [0, -560, 0], normal: [0, -1, 0] }, { point: [900, -600, 300], normal: [0, -1, 0] })).toEqual({ shift: [0, -40, 0], meet: "flush" });
    expect(glueShift({ point: [0, -560, 0], normal: [0, -1, 0] }, { point: [0, -600, 0], normal: [0, -1, 0] }, 10)).toEqual({ shift: [0, -30, 0], meet: "flush" });
  });

  it("un bas posé sous un haut, une face presque droite redressée, des faces qui ne sont pas parallèles refusées", () => {
    expect(glueShift({ point: [0, 0, 870], normal: [0, 0, 1] }, { point: [0, 0, 1450], normal: [0, 0, -1] })).toEqual({ shift: [0, 0, 580], meet: "contact" });
    const tilted = glueShift({ point: [0, 0, 0], normal: [1, 0.00001, 0] }, { point: [100, 0, 0], normal: [-1, 0, 0] });
    expect(typeof tilted !== "string" && tilted.shift).toEqual([100, 0, 0]);
    expect(glueShift({ point: [0, 0, 0], normal: [1, 0, 0] }, { point: [0, 0, 0], normal: [0, 1, 0] })).toMatch(/pas parallèles/);
  });
});
