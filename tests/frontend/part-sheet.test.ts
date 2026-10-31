/** Fiche de fabrication : perçages regroupés et cotés depuis les bords, chants, fil, cotes hors tout. */
import { describe, expect, it } from "vitest";
import type { FlatPart } from "../../frontend/src/io/dxf";
import { holeGroups, holePositions, holeText, partSheetSvg } from "../../frontend/src/document/part-sheet";

// A 720 × 560 side, 18 thick: two rows of shelf-pin holes Ø5 × 12 at 37 mm from the front, and two Ø35 cups.
const SIDE: FlatPart = {
  name: "Côté gauche",
  thickness: 18,
  width: 720,
  height: 560,
  edges: [
    { kind: "line", a: [0, 0], b: [720, 0] },
    { kind: "line", a: [720, 0], b: [720, 560] },
    { kind: "line", a: [720, 560], b: [0, 560] },
    { kind: "line", a: [0, 560], b: [0, 0] },
    { kind: "circle", center: [200, 37], radius: 2.5, depth: 12 },
    { kind: "circle", center: [232, 37], radius: 2.5, depth: 12 },
    { kind: "circle", center: [200, 523], radius: 2.5, depth: 12 },
    { kind: "circle", center: [232, 523], radius: 2.5, depth: 12 },
    { kind: "circle", center: [100, 22.5], radius: 17.5, depth: 13 },
    { kind: "circle", center: [620, 22.5], radius: 17.5, depth: 13 },
    { kind: "circle", center: [360, 280], radius: 4, depth: 18 },
  ],
};

describe("fiche de fabrication d'une pièce", () => {
  it("regroupe les perçages par diamètre et profondeur, le plus gros d'abord", () => {
    const groups = holeGroups(SIDE);
    expect(groups.map((g) => holeText(g))).toEqual(["2 × Ø35 prof. 13", "1 × Ø8 traversant", "4 × Ø5 prof. 12"]);
    // A round part (its outline a single circle) has no holes.
    expect(holeGroups({ ...SIDE, edges: [{ kind: "circle", center: [50, 50], radius: 50 }] })).toEqual([]);
  });

  it("donne les positions distinctes des centres depuis le bord gauche et depuis le bas", () => {
    expect(holePositions(SIDE)).toEqual({ xs: [100, 200, 232, 360, 620], ys: [22.5, 37, 280, 523] });
  });

  it("dessine la pièce cotée, ses chants et son fil", () => {
    const svg = partSheetSvg(SIDE, { edges: { length1: true, length2: false, width1: true, width2: false }, grain: "length" });
    expect(svg.startsWith("<svg")).toBe(true);
    // Overall dimensions, and each hole position.
    for (const t of [">720<", ">560<", ">232<", ">22.5<", ">523<"]) expect(svg).toContain(t);
    // Two edge bands (L1, l1), not the others.
    expect(svg.match(/class="band"/g)).toHaveLength(2);
    expect(svg).toContain(">L1<");
    expect(svg).not.toContain(">L2<");
    expect(svg).toContain(">fil<");
    expect(svg.match(/class="hole"/g)).toHaveLength(7);
    // Without a cut-list row: no bands, no grain.
    const bare = partSheetSvg(SIDE, null);
    expect(bare).not.toContain('class="band"');
    expect(bare).not.toContain(">fil<");
  });
});
