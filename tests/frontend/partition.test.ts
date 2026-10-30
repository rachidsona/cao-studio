/** « Répartition »: cases of the same width, simple and double dividers, boards cut or not, and closed areas. */
import { describe, expect, it } from "vitest";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { regionAt } from "../../frontend/src/sketcher/region-pick";
import { addPartition, defaultDividers, partitionElements, partitionGeometry, partitionLayout, type PartitionInput } from "../../frontend/src/sketcher/partition";

const input = (patch: Partial<PartitionInput> = {}): PartitionInput => {
  const cases = patch.cases ?? 3;
  return { length: 1500, height: 2380, thickness: 18, cases, dividers: defaultDividers(cases), boards: true, plinth: 0, outer: "board", single: "board", double: "side", ...patch };
};
const layoutOf = (patch: Partial<PartitionInput> = {}) => {
  const layout = partitionLayout(input(patch));
  if (typeof layout === "string") throw new Error(layout);
  return layout;
};
const faces = (patch: Partial<PartitionInput> = {}) => sketchFaces(extractLoops(partitionGeometry(input(patch), layoutOf(patch)))).length;

describe("côtés simples et doubles par défaut", () => {
  it("3 cases : un côté simple et un double, le double à droite ou à gauche", () => {
    expect(defaultDividers(3)).toEqual(["single", "double"]);
    expect(defaultDividers(3, "left")).toEqual(["double", "single"]);
  });

  it("4 cases : le double au milieu", () => {
    expect(defaultDividers(4)).toEqual(["single", "double", "single"]);
  });

  it("5 cases : les deux doubles au milieu, un simple à chaque bout", () => {
    expect(defaultDividers(5)).toEqual(["single", "double", "double", "single"]);
  });

  it("2 cases : un seul côté, simple", () => {
    expect(defaultDividers(2)).toEqual(["single"]);
  });
});

describe("largeur des cases", () => {
  it("retrouve l'esquisse de lit : 1500 mm, 18 mm, 3 cases (double à gauche) → 470 mm", () => {
    const layout = layoutOf({ dividers: defaultDividers(3, "left") });
    expect(layout.caseWidth).toBe(470);
    expect(layout.caseSpans).toEqual([[18, 488], [524, 994], [1012, 1482]]);
  });

  it("250 × 180 cm en 4 cases", () => {
    const layout = layoutOf({ length: 1800, height: 2500, cases: 4 });
    // 1800 − 2×18 (sides) − 18 − 36 − 18 (dividers) = 1692 → 423 each.
    expect(layout.caseWidth).toBe(423);
  });

  it("250 × 180 cm en 5 cases : 2 côtés simples et 2 doubles font 108 mm de côtés", () => {
    // 1800 − 36 − (18 + 36 + 36 + 18) = 1656 → 331,2 each.
    expect(layoutOf({ length: 1800, height: 2500, cases: 5 }).caseWidth).toBeCloseTo(331.2, 6);
  });

  it("refuse ce qui est impossible, en le disant", () => {
    expect(partitionLayout(input({ length: 100, cases: 5 }))).toMatch(/trop petite/);
    expect(partitionLayout(input({ cases: 1, dividers: [] }))).toMatch(/2 à/);
    expect(partitionLayout(input({ height: 30 }))).toMatch(/hauteur/);
    expect(partitionLayout(input({ thickness: 0 }))).toMatch(/positives/);
    expect(partitionLayout(input({ dividers: ["single"] }))).toMatch(/entre chaque case/);
    expect(partitionLayout(input({ plinth: -5 }))).toMatch(/socle/);
  });
});

describe("qui passe aux angles : le dessus ou le côté", () => {
  it("par défaut les côtés doubles coupent le dessus et le dessous (3 cases : 2 modules)", () => {
    // Boards in 2 pieces each (4), sides 5 (outer 2, simple 1, double 2), cases 3.
    expect(faces()).toBe(4 + 5 + 3);
  });

  it("5 cases : trois modules (2 + 1 + 2 portes), le dessus et le dessous en trois morceaux", () => {
    // Boards 3 × 2, sides 8 (outer 2, simple 2, doubles 4), cases 5.
    expect(faces({ cases: 5 })).toBe(6 + 8 + 5);
  });

  it("tout dessus : le dessus et le dessous d'un seul tenant", () => {
    expect(faces({ double: "board" })).toBe(2 + 5 + 3);
  });

  it("tout côté : le dessus et le dessous coupés à chaque côté", () => {
    expect(faces({ outer: "side", single: "side", double: "side" })).toBe(6 + 5 + 3);
  });

  it("un côté qui passe monte jusqu'en haut, un autre s'arrête contre le dessus", () => {
    const layout = layoutOf({ double: "side", single: "board" });
    const heights = layout.panels.filter((p) => p[2] - p[0] < 100 && p[3] - p[1] > 100).map((p) => [p[1], p[3]]);
    expect(heights).toContainEqual([0, 2380]);
    expect(heights).toContainEqual([18, 2362]);
  });

  it("sans dessus ni dessous, tous les côtés vont de bout en bout", () => {
    expect(faces({ boards: false })).toBe(5 + 3);
  });
});

describe("socle : le dessous relevé", () => {
  it("sans socle, le dessous est au ras du bas", () => {
    const layout = layoutOf({ double: "board" });
    expect(layout.panels).toContainEqual([0, 0, 1500, 18]);
  });

  it("avec 4 cm de socle, le dessous est relevé et les côtés qui s'arrêtent dessus commencent au-dessus", () => {
    const layout = layoutOf({ plinth: 40, double: "board" });
    expect(layout.panels).toContainEqual([0, 40, 1500, 58]);
    expect(layout.panels).toContainEqual([0, 58, 18, 2362]);
  });

  it("un côté qui passe descend jusqu'en bas, au travers du socle", () => {
    const layout = layoutOf({ plinth: 40, double: "side" });
    const heights = layout.panels.filter((p) => p[2] - p[0] < 100 && p[3] - p[1] > 100).map((p) => [p[1], p[3]]);
    expect(heights).toContainEqual([0, 2380]);
    // The bottom boards stop against it, raised: the void of the plinth is a closed area under each.
    expect(layout.panels).toContainEqual([0, 40, expect.any(Number), 58]);
  });

  it("le socle ne change pas la largeur des cases, mais use de la hauteur", () => {
    expect(layoutOf({ plinth: 40 }).caseWidth).toBe(layoutOf({ plinth: 0 }).caseWidth);
    expect(partitionLayout(input({ height: 100, plinth: 100 }))).toMatch(/hauteur/);
  });

  it("le vide du socle est une zone fermée sous chaque morceau de dessous", () => {
    // 3 cases, doubles through: boards in 2 pieces ×2 = 4, sides 5, cases 3, plus 2 voids under the bottom pieces.
    expect(faces({ plinth: 40 })).toBe(4 + 5 + 3 + 2);
  });
});

describe("esquisse de la répartition", () => {
  it("les lignes se partagent leurs points, sans doublon", () => {
    const patch = { dividers: defaultDividers(3, "left") };
    const g = partitionGeometry(input(patch), layoutOf(patch));
    const keys = g.curves.map((c) => (c.kind === "line" ? [c.p1, c.p2].sort().join("|") : ""));
    expect(new Set(keys).size).toBe(keys.length);
    const positions = g.points.map((p) => `${p.x}|${p.y}`);
    expect(new Set(positions).size).toBe(positions.length);
    const x = new Set(g.points.map((p) => p.x));
    for (const v of [0, 18, 488, 506, 524, 994, 1012, 1482, 1500]) expect(x.has(v)).toBe(true);
  });
});

describe("répartition ajoutée à une esquisse", () => {
  it("garde ce que l'esquisse a, décale la répartition et ne mélange pas les identifiants", () => {
    const base = { points: [{ id: "p1", x: 5, y: 5 }, { id: "p2", x: 9, y: 5 }], curves: [{ id: "l1", kind: "line" as const, p1: "p1", p2: "p2" }], constraints: [] };
    const layout = layoutOf();
    const partition = partitionGeometry(input(), layout);
    const g = addPartition(base, partition, [100, 200]);
    expect(g.points).toHaveLength(2 + partition.points.length);
    expect(g.curves).toHaveLength(1 + partition.curves.length);
    expect(g.points.slice(0, 2)).toEqual(base.points);
    const ids = [...g.points, ...g.curves].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Moved by the origin, the shape is the same: the corner of the outline is at (100, 200).
    expect(g.points.some((p) => p.x === 100 && p.y === 200)).toBe(true);
    expect(g.points.some((p) => p.x === 100 + 1500 && p.y === 200 + 2380)).toBe(true);
    expect(sketchFaces(extractLoops(addPartition({ points: [], curves: [], constraints: [] }, partition, [100, 200]))).length).toBe(faces());
  });
});

describe("extruder les panneaux", () => {
  it("le centre de chaque panneau désigne sa zone, pas celle d'une case", () => {
    for (const patch of [{}, { cases: 5 }, { plinth: 40 }, { boards: false }]) {
      const layout = layoutOf(patch);
      const all = sketchFaces(extractLoops(partitionGeometry(input(patch), layout)));
      for (const [x0, y0, x1, y1] of layout.panels) {
        const region = regionAt(all, [(x0 + x1) / 2, (y0 + y1) / 2]);
        expect(region).not.toBeNull();
        const xs = region!.outer.map((p) => p[0]);
        const ys = region!.outer.map((p) => p[1]);
        expect([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]).toEqual([x0, y0, x1, y1]);
      }
    }
  });
});

describe("un corps par élément, nommé", () => {
  it("3 cases, les doubles coupent le dessus et le dessous : Dessous 1 et 2, Dessus 1 et 2, cinq côtés", () => {
    const names = partitionElements(layoutOf()).map((e) => e.name);
    expect(names).toEqual(["Dessous 1", "Dessous 2", "Dessus 1", "Dessus 2", "Côté", "Côté", "Côté", "Côté", "Côté"]);
  });

  it("dessus et dessous d'un seul tenant : simplement Dessous et Dessus", () => {
    const names = partitionElements(layoutOf({ double: "board" })).map((e) => e.name);
    expect(names.slice(0, 2)).toEqual(["Dessous", "Dessus"]);
    expect(names.filter((n) => n === "Côté")).toHaveLength(5);
  });

  it("les côtés se suivent de gauche à droite et sont numérotés à l'ajout", () => {
    const sides = partitionElements(layoutOf({ double: "board" })).filter((e) => e.name === "Côté");
    expect(sides.every((e) => e.numbered)).toBe(true);
    const xs = sides.map((e) => e.probe[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("sans dessus ni dessous : que des côtés", () => {
    expect(partitionElements(layoutOf({ boards: false })).every((e) => e.name === "Côté")).toBe(true);
  });

  it("le point de chaque élément est dans sa zone, décalé par l'origine", () => {
    const layout = layoutOf();
    const moved = partitionElements(layout, [100, 200]);
    const still = partitionElements(layout);
    moved.forEach((e, i) => expect(e.probe).toEqual([still[i]!.probe[0] + 100, still[i]!.probe[1] + 200]));
  });

  it("autant d'éléments que de panneaux", () => {
    for (const cases of [2, 3, 5]) {
      const layout = layoutOf({ cases });
      expect(partitionElements(layout)).toHaveLength(layout.panels.length);
      expect(layout.kinds).toHaveLength(layout.panels.length);
    }
  });
});
