/** La face d'une Répartition dans son panneau : à l'échelle, ses cases, ses étagères, ce qui équipe ses niches, et ses largeurs tirées. */
import { describe, expect, it } from "vitest";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import type { NicheFeature, SketchFeature } from "../../frontend/src/document/types";
import { partitionFace, pulledWidths } from "../../frontend/src/sketcher/partition-face";
import { partitionFaceSvg } from "../../frontend/src/sketcher/partition-face-svg";
import { partitionRecord, rebuildChain, shelvesRecord } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1500, height: 2500, thickness: 30, cases: 2, dividers: ["single"], boards: true, plinth: 50, outer: "side", single: "board", double: "side" };
const SHELVES = { count: 3, thickness: 18, mode: "equal" as const, fixed: 300 };
const count = (svg: string, what: string) => svg.split(what).length - 1;

/** A wall of the dressing: its Répartition (depth 600), three shelves in its first case. */
function wall(): SketchFeature {
  const offsets = [partitionRecord("of1", "Répartition — mur a", INPUT, [100, 0], 600), shelvesRecord("of2", "Étagères 1", "of1", [0], SHELVES, 600)];
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Plan — mur a", plane: "XZ", offset: 0, ...rebuilt.geometry };
}

const niche = (fill: NicheFeature["fill"], path: number[]): NicheFeature => ({ id: `n-${fill}`, type: "niche", name: fill, sketch: "sk1", partition: "of1", niche: path, fill, diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true });

describe("face d'une Répartition", () => {
  it("dessine ses cases à l'échelle, avec la hauteur, la longueur et la largeur de chacune", () => {
    const face = partitionFace({ input: INPUT, origin: [100, 0], depth: 600, id: "of1" }, wall())!;
    // 1500 − 3 × 30 = 1410 mm shared by two cases.
    expect(face.cases.map((c) => c.width)).toEqual([705, 705]);
    expect(face.cases[0]).toMatchObject({ x0: 30, x1: 735 });
    // The cases between the boards: from the underside of the top (30) to the top of the bottom (2500 − 50 − 30).
    expect(face.inner).toEqual([30, 2420]);
    const svg = partitionFaceSvg(face);
    expect(svg).toContain('data-dim="length">150<');
    expect(svg).toContain('data-dim="height">250<');
    expect(count(svg, 'data-width="')).toBe(2);
    expect(svg).toContain(">70,5<");
    expect(count(svg, 'data-case="')).toBe(2);
    expect(svg).not.toContain("data-chosen");
  });

  it("montre les étagères : la première case en quatre niches, l'autre entière", () => {
    const face = partitionFace({ input: INPUT, origin: [100, 0], depth: 600, id: "of1" }, wall())!;
    expect(face.niches).toHaveLength(5);
    const first = face.niches.filter((n) => n.x === 30).sort((a, b) => a.y - b.y);
    expect(first).toHaveLength(4);
    // Between two niches of the case, a shelf of 18 mm is left drawn as a panel.
    expect(first[1]!.y - (first[0]!.y + first[0]!.h)).toBeCloseTo(18, 6);
  });

  it("suit le panneau avant OK : 3 cases, et les étagères refaites avec elle", () => {
    const three = { ...INPUT, cases: 3, dividers: ["single", "double"] as const };
    const face = partitionFace({ input: { ...three, dividers: [...three.dividers] }, origin: [100, 0], depth: 600, id: "of1" }, wall())!;
    expect(face.cases).toHaveLength(3);
    expect(face.cases[0]!.width).toBeCloseTo((1500 - 5 * 30) / 3, 6);
    expect(face.niches).toHaveLength(6);
  });

  it("dessine les tiroirs, la tringle et les portes qui équipent ses niches", () => {
    const sketch = wall();
    const face = partitionFace({ input: INPUT, origin: [100, 0], depth: 600, id: "of1" }, sketch, { sketch, niches: [niche("drawers", [1]), niche("rod", [0, 3]), niche("back", [])] })!;
    expect(face.fronts).toHaveLength(3);
    expect(face.rods).toHaveLength(1);
    // The rod, 60 mm under the top of its niche, in the frame of the face (y down from the top).
    expect(face.rods[0]!.y).toBeCloseTo(30 + 60, 6);
    expect(face.handles).toHaveLength(3);
    const svg = partitionFaceSvg(face);
    expect(count(svg, "data-front=")).toBe(3);
    expect(count(svg, "data-rod=")).toBe(1);
    expect(count(svg, "data-handle=")).toBe(3);

    const doors = partitionFace({ input: INPUT, origin: [100, 0], depth: 600, id: "of1", doors: { gap: 3, thickness: 18, handles: true } }, sketch)!;
    expect(doors.doors.map((d) => d.hinge)).toEqual(["left", "right"]);
    expect(partitionFaceSvg(doors)).toContain('data-door="left"');
  });

  it("cote tout : l'épaisseur des panneaux et des étagères, la hauteur libre de chaque niche, chaque tiroir, la tringle, le socle", () => {
    const sketch = wall();
    const face = partitionFace({ input: INPUT, origin: [100, 0], depth: 600, id: "of1" }, sketch, { sketch, niches: [niche("drawers", [1]), niche("rod", [0, 3])] })!;
    const of = (kind: string) => face.labels.filter((l) => l.kind === kind).map((l) => l.text);
    expect(of("panel")).toEqual(["ép. 3"]);
    expect(of("plinth")).toEqual(["socle 5"]);
    expect(of("shelf")).toEqual(["1,8", "1,8", "1,8"]);
    // The first case: its four niches share 2390 mm less three shelves of 18 mm; the second is all drawers.
    const free = Number((((2390 - 3 * 18) / 4) / 10).toFixed(1)).toLocaleString("fr-FR");
    expect(of("niche")).toEqual([`↕ ${free}`, `↕ ${free}`, `↕ ${free}`, `↕ ${free}`]);
    // Three fronts sharing the niche's height, less the gaps (3 mm above, under and between): as the 3D builds them.
    const front = Number((((2390 - 4 * 3) / 3) / 10).toFixed(1)).toLocaleString("fr-FR");
    expect(of("front")).toEqual([front, front, front]);
    // The rod, from the floor: the top of the cases (2470) less its drop (60).
    expect(of("rod")).toEqual(["tringle 241"]);
    const svg = partitionFaceSvg(face);
    expect(count(svg, 'data-label="')).toBe(face.labels.length);
    expect(svg).toContain(`data-label="shelf">1,8<`);
  });

  it("cote une niche de cloison par sa largeur et sa hauteur, une case entière par sa hauteur", () => {
    const offsets = [partitionRecord("of1", "R", INPUT, [0, 0], 600), shelvesRecord("of2", "Cloisons 1", "of1", [0], { ...SHELVES, count: 1, vertical: true }, 600)];
    const face = partitionFace({ input: INPUT, origin: [0, 0], depth: 600, id: "of1" }, { ...emptySketchGeometry(), offsets })!;
    const niches = face.labels.filter((l) => l.kind === "niche").map((l) => l.text);
    expect(face.labels.filter((l) => l.kind === "cloison").map((l) => l.text)).toEqual(["1,8"]);
    expect(niches.sort()).toEqual(["34,4 × 239", "34,4 × 239", "↕ 239"]);
  });

  it("entoure la case choisie", () => {
    const face = partitionFace({ input: INPUT, origin: [0, 0] }, emptySketchGeometry())!;
    const svg = partitionFaceSvg(face, 1);
    expect(count(svg, "data-chosen")).toBe(1);
    expect(svg).toMatch(/data-chosen="" data-case="1"/);
  });

  it("tire le bord d'une case au centimètre, la voisine prend la différence", () => {
    const face = partitionFace({ input: { ...INPUT, cases: 3, dividers: ["single", "single"] }, origin: [0, 0] }, emptySketchGeometry())!;
    const w = face.cases[0]!.width;
    expect(pulledWidths(face, 0, "right", 604)).toEqual([600, Math.round((2 * w - 600) * 10) / 10, Math.round(w * 10) / 10]);
    expect(pulledWidths(face, 2, "left", 500)).toEqual([Math.round(w * 10) / 10, Math.round((2 * w - 500) * 10) / 10, 500]);
    // Nothing on the outer edges, nor narrower than 10 cm.
    expect(pulledWidths(face, 0, "left", 500)).toBeNull();
    expect(pulledWidths(face, 0, "right", 80)).toBeNull();
    expect(pulledWidths(face, 0, "right", 2 * w - 50)).toBeNull();
    // The shares give the widths asked for: the total stays.
    const shares = pulledWidths(face, 0, "right", 600)!;
    const again = partitionFace({ input: { ...INPUT, cases: 3, dividers: ["single", "single"], widths: shares }, origin: [0, 0] }, emptySketchGeometry())!;
    expect(again.cases[0]!.width).toBeCloseTo(600, 1);
    expect(again.length).toBe(1500);
  });

  it("ne dessine rien pour des mesures impossibles", () => {
    expect(partitionFace({ input: { ...INPUT, length: 50 }, origin: [0, 0] }, emptySketchGeometry())).toBeNull();
  });
});
