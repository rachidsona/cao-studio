/** Éclairage des meubles : rubans dedans, sous les meubles hauts (ou spots), corniche, plinthe ; posés puis remplacés. */
import { describe, expect, it } from "vitest";
import { LIGHTING, addLights, lightPieces, pieceLength, removeLights, type LightPiece, type LightingSettings, type LitElement } from "../../frontend/src/document/lighting";
import { partitionLights } from "../../frontend/src/document/niche-lights";
import { emptySketchGeometry, type PartitionParams, type SketchGeometry } from "../../frontend/src/document/sketch";
import { createReferencePlate, type NicheFeature, type SketchFeature, type SlopedCeiling } from "../../frontend/src/document/types";
import { leafNiches, partitionRecord, rebuildChain, shelvesRecord } from "../../frontend/src/sketcher/partition-history";

// A base unit (600 wide, its front towards −Y, on a 150 plinth) and a wall unit over it.
const base: LitElement = {
  name: "Bas 1", box: [[0, -560, 0], [600, 0, 870]], front: { axis: 1, sign: -1 },
  boards: [
    { name: "Dessous", box: [[18, -557, 150], [582, 0, 168]] },
    { name: "Étagère 1", box: [[18, -557, 501], [582, 0, 519]] },
    { name: "Dessus", box: [[18, -557, 852], [582, 0, 870]] },
  ],
};
const wall: LitElement = {
  name: "Haut 1", box: [[0, -350, 1450], [600, 0, 2150]], front: { axis: 1, sign: -1 },
  boards: [
    { name: "Dessous", box: [[18, -347, 1450], [582, 0, 1468]] },
    { name: "Dessus", box: [[18, -347, 2132], [582, 0, 2150]] },
  ],
};

describe("éclairage des meubles", () => {
  it("dedans : un ruban sous chaque planche sauf la plus basse, près de la façade", () => {
    const pieces = lightPieces([base], { ...LIGHTING, under: "none" });
    expect(pieces.map((p) => p.name)).toEqual(["Ruban LED Bas 1 — sous Étagère 1", "Ruban LED Bas 1 — sous Dessus"]);
    // 30 mm behind the front edge (−557), 12 wide, 8 thick, 20 mm off each side.
    expect(pieces[0]!.box).toEqual([[38, -527, 493], [562, -515, 501]]);
  });

  it("dehors : sous le meuble haut (ruban ou spots), corniche au-dessus, plinthe sous le bas sur socle", () => {
    const s = { ...LIGHTING, inside: false, cornice: true, plinth: true };
    const names = lightPieces([base, wall], s).map((p) => p.name);
    expect(names).toEqual(["Plinthe LED Bas 1", "Ruban LED sous Haut 1", "Corniche LED Haut 1"]);
    const plinth = lightPieces([base], s)[0]!;
    expect(plinth.box[1][2]).toBe(150);
    const spots = lightPieces([{ ...wall, box: [[0, -350, 1450], [1200, 0, 2150]] }], { ...s, under: "spots", cornice: false });
    expect(spots.map((p) => p.kind)).toEqual(["spot", "spot"]);
    expect(spots[0]!.box).toEqual([[270, -300, 1444], [330, -240, 1450]]);
  });

  it("pose les lumières sur le calque Éclairage, allumées et hors débit, puis les remplace", () => {
    const pieces = lightPieces([base, wall], LIGHTING);
    const { doc, bodies } = addLights(createReferencePlate(), pieces, "neutral");
    expect(bodies).toHaveLength(pieces.length);
    expect(doc.layers?.map((l) => l.name)).toContain("Éclairage");
    const info = doc.bodyInfo?.[bodies[0]!];
    expect(info).toMatchObject({ room: true, light: { kind: "strip", color: "neutral" }, appearance: "led-neutral" });
    expect(doc.features.length - createReferencePlate().features.length).toBe(2 * pieces.length);
    const cleared = removeLights(doc);
    expect(cleared.features.map((f) => f.id)).toEqual(createReferencePlate().features.map((f) => f.id));
    expect(Object.values(cleared.bodyInfo ?? {}).some((i) => i.light)).toBe(false);
  });
});

describe("éclairage d'une Répartition", () => {
  const INPUT: PartitionParams = { length: 3000, height: 2500, thickness: 18, cases: 4, dividers: ["single", "double", "none"], boards: true, plinth: 80, outer: "board", single: "board", double: "side" } as unknown as PartitionParams;
  const wall = (over: Partial<SketchFeature> = {}, input = INPUT, more: (g: SketchGeometry) => SketchGeometry = (g) => g): SketchFeature => {
    const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition", input, [0, 0], 600)] }, "of1");
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    return { id: "sk1", type: "sketch", name: "Mur", plane: "XZ", offset: 0, ...more(rebuilt.geometry), ...over };
  };
  const only = { ...LIGHTING, under: "none" as const };
  const lit = (s: SketchFeature, settings: LightingSettings = only, equipment: NicheFeature[] = []) => partitionLights(s, equipment, "Mur", settings) as LightPiece[];

  it("un ruban par niche : chacun reste entre ses côtés, aucun ne traverse", () => {
    const sketch = wall();
    const niches = leafNiches(sketch);
    const pieces = lit(sketch);
    expect(pieces).toHaveLength(niches.length);
    expect(niches.length).toBeGreaterThan(1);
    pieces.forEach((p, i) => {
      expect(p.box[0][0]).toBeCloseTo(niches[i]!.box.x0 + 20);
      expect(p.box[1][0]).toBeCloseTo(niches[i]!.box.x1 - 20);
      // Under the top board, near the front: the panels go 600 mm towards −Y.
      expect(p.box[1][2]).toBeCloseTo(niches[i]!.box.y1);
      expect(p.box[0][1]).toBeCloseTo(-570);
      expect(p.box[1][1]).toBeCloseTo(-558);
    });
  });

  it("les étagères d'une niche ont chacune leur ruban", () => {
    const shelves = shelvesRecord("of2", "Étagères", "of1", [0], { count: 3, thickness: 18, mode: "equal", fixed: 0 }, 600);
    const sketch = wall({}, INPUT, (g) => {
      const rebuilt = rebuildChain({ ...g, offsets: [...(g.offsets ?? []), shelves] }, "of1");
      if (typeof rebuilt === "string") throw new Error(rebuilt);
      return rebuilt.geometry;
    });
    expect(lit(sketch)).toHaveLength(leafNiches(sketch).length);
    expect(lit(sketch).filter((p) => p.name.includes("niche 1."))).toHaveLength(4);
  });

  it("une niche à tiroirs n'en a pas", () => {
    const sketch = wall();
    const drawers = { type: "niche", sketch: "sk1", partition: "of1", niche: [1], fill: "drawers" } as NicheFeature;
    expect(lit(sketch, only, [drawers])).toHaveLength(lit(sketch).length - 1);
  });

  it("une plinthe par case, une corniche sur toute la longueur", () => {
    const pieces = lit(wall(), { ...only, inside: false, plinth: true, cornice: true });
    expect(pieces.filter((p) => p.name.startsWith("Plinthe")).length).toBeGreaterThan(1);
    const cornice = pieces.find((p) => p.name.startsWith("Corniche"));
    expect(cornice?.up).toBe(true);
    expect(cornice?.box[0][2]).toBeCloseTo(2500);
  });

  it("un mur de biais : le ruban suit le mur, à sa vraie longueur", () => {
    const k = Math.SQRT1_2;
    const sketch = wall({ frame: { origin: [0, 0, 0], xDir: [k, k, 0], normal: [k, -k, 0] }, plane: "XZ" });
    const [first] = lit(sketch);
    const niche = leafNiches(sketch)[0]!;
    expect(first?.outline).toHaveLength(4);
    expect(pieceLength(first!)).toBeCloseTo(niche.box.x1 - niche.box.x0 - 40);
    const made = addLights(createReferencePlate(), [first!], "warm");
    const drawn = made.doc.features.find((f) => f.type === "sketch" && f.name.includes("Ruban")) as SketchFeature;
    expect(drawn.curves).toHaveLength(4);
  });

  it("un angle coupé et un rampant gardent ce qui est dedans", () => {
    const [first] = lit(wall());
    const narrow = lit(wall({ clip: [[0, -600], [700, -600], [700, 0], [0, 0]] }));
    expect(narrow.length).toBeLessThan(lit(wall()).length);
    expect(narrow[0]?.clip).toHaveLength(4);
    expect(lit(wall({ ceiling: { axis: "x", at: 0, height: 1000, rise: 0, cap: 1000 } as SlopedCeiling })).length).toBe(0);
    const made = addLights(createReferencePlate(), [{ ...first!, clip: [[0, 0], [1, 0], [1, 1]] }], "warm");
    expect(made.doc.features.some((f) => f.type === "extrude" && f.clip)).toBe(true);
  });

  it("une esquisse sans répartition reste un meuble ordinaire", () => {
    expect(partitionLights({ id: "s", type: "sketch", name: "E", plane: "XZ", offset: 0, ...emptySketchGeometry() }, [], "E", only)).toBeNull();
  });
});
