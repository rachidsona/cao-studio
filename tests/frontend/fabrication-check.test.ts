/** Contrôle avant fabrication : chevauchements, panneau brut, matière, perçages. */
import { describe, expect, it } from "vitest";
import type { CutRow } from "../../frontend/src/document/cut-list";
import { fitsSheet, holeProblems, overlapProblems, rowProblems, type CheckedPart } from "../../frontend/src/document/fabrication-check";
import type { FlatPart } from "../../frontend/src/io/dxf";

const part = (id: string, from: [number, number, number], to: [number, number, number], boxLike = true): CheckedPart => ({ id, name: id, box: [from, to], boxLike });

describe("contrôle avant fabrication", () => {
  it("trouve les pièces qui se chevauchent, pas celles qui se touchent", () => {
    const side = part("Côté", [0, 0, 0], [18, 560, 720]);
    const shelf = part("Étagère", [18, 0, 300], [582, 540, 318]);
    const touching = part("Dessus", [0, 0, 720], [600, 560, 738]);
    // The shelf runs 5 mm into the side.
    const tooLong = part("Étagère longue", [13, 0, 400], [582, 540, 418]);
    const problems = overlapProblems([side, shelf, touching, tooLong]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: "overlap", severity: "error", bodies: ["Côté", "Étagère longue"] });
    expect(problems[0]!.message).toContain("5 × 540 × 18");
    // A shaped part: only possible.
    expect(overlapProblems([side, { ...tooLong, boxLike: false }])[0]!.severity).toBe("warning");
  });

  it("vérifie qu'une pièce tient sur le panneau brut, le fil respecté", () => {
    const sheet: [number, number] = [2800, 2070];
    expect(fitsSheet({ cutLength: 2500, cutWidth: 600, grain: "length" }, sheet)).toBe(true);
    // 2500 long with the grain across: it would have to lie across the 2070 width.
    expect(fitsSheet({ cutLength: 2500, cutWidth: 600, grain: "width" }, sheet)).toBe(false);
    expect(fitsSheet({ cutLength: 2900, cutWidth: 600, grain: "none" }, sheet)).toBe(false);
    expect(fitsSheet({ cutLength: 2060, cutWidth: 2060, grain: "none" }, sheet)).toBe(true);
    const row = (material: string, cutLength: number): CutRow & { ids: string[] } =>
      ({ names: ["Joue"], ids: ["b1"], quantity: 1, length: cutLength, width: 600, thickness: 19, material, grain: "length", edges: { length1: false, length2: false, width1: false, width2: false }, band: 0, cutLength, cutWidth: 600, approximate: false });
    const problems = rowProblems([row("Mélaminé blanc", 2900), row("Non défini", 500), row("Mélaminé blanc", 700)], (m) => (m === "Mélaminé blanc" ? sheet : null));
    expect(problems.map((p) => [p.kind, p.severity])).toEqual([["sheet", "error"], ["material", "warning"]]);
  });

  it("trouve les perçages qui débordent, frôlent le bord ou se mordent", () => {
    const board: FlatPart = {
      name: "Côté",
      thickness: 18,
      width: 500,
      height: 300,
      edges: [
        { kind: "line", a: [0, 0], b: [500, 0] },
        { kind: "line", a: [500, 0], b: [500, 300] },
        { kind: "line", a: [500, 300], b: [0, 300] },
        { kind: "line", a: [0, 300], b: [0, 0] },
        { kind: "circle", center: [100, 37], radius: 2.5 },
        { kind: "circle", center: [16, 150], radius: 17.5 }, // breaks out of the left edge
        { kind: "circle", center: [250, 2.9], radius: 2.5 }, // 0.4 mm to the bottom edge
        { kind: "circle", center: [400, 150], radius: 4 },
        { kind: "circle", center: [405, 150], radius: 4 }, // runs into the previous one
        { kind: "circle", center: [100, 37], radius: 5 }, // same centre: a counterbore, fine
      ],
    };
    const problems = holeProblems(board, "b1");
    expect(problems.map((p) => p.severity)).toEqual(["error", "warning", "error"]);
    expect(problems[0]!.message).toContain("déborde");
    expect(problems[2]!.message).toContain("se mordent");
  });
});
