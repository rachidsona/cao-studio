/** L'historique paramétrique de la répartition : les étapes sont refaites dans l'ordre quand l'une change. */
import { describe, expect, it } from "vitest";
import type { OffsetRecord, SketchGeometry } from "../../frontend/src/document/sketch";
import type { SketchFeature } from "../../frontend/src/document/types";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { defaultDividers, type PartitionInput } from "../../frontend/src/sketcher/partition";
import { idsFrom, leafNiches, nicheAt, partitionRecord, rebuildChain, shelvesRecord, stepName, type Rebuilt } from "../../frontend/src/sketcher/partition-history";
import { nicheBox } from "../../frontend/src/sketcher/shelves";
import { regionAt } from "../../frontend/src/sketcher/region-pick";
import { removeOffsetFrom } from "../../frontend/src/sketcher/offset";

const input = (cases = 3): PartitionInput => ({ length: 1800, height: 2500, thickness: 18, cases, dividers: defaultDividers(cases), boards: true, plinth: 0, outer: "board", single: "board", double: "side" });
const SHELVES = { count: 1, thickness: 18, mode: "equal" as const, fixed: 300 };
const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });

const rebuilt = (g: SketchGeometry, id = "of1"): Rebuilt => {
  const r = rebuildChain(g, id);
  if (typeof r === "string") throw new Error(r);
  return r;
};
const faces = (g: SketchGeometry) => sketchFaces(extractLoops(g)).length;
/** A sketch holding the partition and one division per niche given. */
const chain = (cases: number, niches: number[][] = []): SketchGeometry => {
  const records: OffsetRecord[] = [partitionRecord("of1", "Répartition", input(cases), [0, 0]), ...niches.map((n, i) => shelvesRecord(`of${i + 2}`, `Étagères ${i + 1}`, "of1", n, SHELVES))];
  return rebuilt({ ...empty(), offsets: records }).geometry;
};

describe("refaire la répartition à partir de ses étapes", () => {
  it("la répartition seule : ses lignes sont celles du record, les zones sont fermées", () => {
    const g = chain(3);
    expect(g.offsets).toHaveLength(1);
    expect(g.offsets![0]!.curves.length).toBe(g.curves.length);
    // 4 pieces of boards, 5 sides, 3 niches.
    expect(faces(g)).toBe(12);
  });

  it("une division par niche : chaque niche devient 3 zones de plus (2 niches + 1 étagère − 1)", () => {
    const g = chain(3, [[0], [1]]);
    expect(g.offsets).toHaveLength(3);
    expect(faces(g)).toBe(12 + 2 * 2);
    for (const r of g.offsets!.slice(1)) expect(r.curves).toHaveLength(2);
  });

  it("changer le nombre de cases refait tout : pas de lignes en double, les divisions suivent leur niche", () => {
    const g = chain(3, [[0], [1]]);
    const edited: SketchGeometry = {
      ...g,
      offsets: g.offsets!.map((r) => (r.step?.kind === "partition" ? { ...r, step: { ...r.step, input: input(4) } } : r)),
    };
    const next = rebuilt(edited);
    // 4 cases [S,D,S]: boards in 2 pieces ×2, sides 6 (outer 2, simple 2, double 2) → 4 + 6 + 4 niches, plus the 2 shelves.
    expect(faces(next.geometry)).toBe(4 + 6 + 4 + 2 * 2);
    const keys = next.geometry.curves.map((c) => (c.kind === "line" ? [c.p1, c.p2].sort().join("|") : c.id));
    expect(new Set(keys).size).toBe(keys.length);
    expect(next.dropped).toHaveLength(0);
    // The curves of the steps are the new ones: nothing is left of the old lines.
    const owned = next.geometry.offsets!.flatMap((r) => r.curves);
    expect(new Set(owned).size).toBe(owned.length);
    expect(owned.length).toBe(next.geometry.curves.length);
  });

  it("une division dont la niche n'existe plus est retirée, en le disant", () => {
    const g = chain(3, [[2]]);
    const edited: SketchGeometry = { ...g, offsets: g.offsets!.map((r) => (r.step?.kind === "partition" ? { ...r, step: { ...r.step, input: input(2) } } : r)) };
    const next = rebuilt(edited);
    expect(next.dropped.map((d) => d.name)).toEqual(["Étagères 1"]);
    expect(next.problems[0]).toMatch(/niche/);
    expect(next.geometry.offsets).toHaveLength(1);
  });

  it("une division dans une niche née d'une autre division (chemin [0, 1])", () => {
    let g = chain(3, [[0]]);
    const upper = nicheAt(g, nicheBox(regionAt(sketchFaces(extractLoops(g)), [200, 2000])!)!);
    expect(upper).toEqual({ partition: "of1", path: [0, 1] });
    g = { ...g, offsets: [...g.offsets!, shelvesRecord("of3", "Étagères 2", "of1", [0, 1], SHELVES)] };
    const next = rebuilt(g);
    expect(faces(next.geometry)).toBe(12 + 2 + 2);
    expect(next.niches.has("0.1.0") && next.niches.has("0.1.1")).toBe(true);
  });

  it("les corps à extruder : un par élément, en donnant leur nom", () => {
    const g = chain(3, [[0]]);
    const r = rebuilt(g);
    expect(r.elements.get("of1")?.map((e) => e.name).slice(0, 2)).toEqual(["Dessous 1", "Dessous 2"]);
    expect(r.elements.get("of2")).toEqual([expect.objectContaining({ name: "Étagère", numbered: true })]);
  });

  it("une répartition qui n'existe plus, ou impossible, est refusée avec la raison", () => {
    expect(rebuildChain(empty(), "of9")).toMatch(/n'existe plus/);
    const g = chain(3);
    const tooSmall: SketchGeometry = { ...g, offsets: g.offsets!.map((r) => (r.step?.kind === "partition" ? { ...r, step: { ...r.step, input: { ...input(3), length: 50 } } } : r)) };
    expect(rebuildChain(tooSmall, "of1")).toMatch(/trop petite/);
  });

  it("le reste de l'esquisse reste en place", () => {
    const base: SketchGeometry = { points: [{ id: "a", x: -50, y: -50 }, { id: "b", x: -10, y: -50 }], curves: [{ id: "keep", kind: "line", p1: "a", p2: "b" }], constraints: [] };
    const g = rebuilt({ ...base, offsets: [partitionRecord("of1", "Répartition", input(3), [0, 0])] }).geometry;
    expect(g.curves.some((c) => c.id === "keep")).toBe(true);
    const again = rebuilt({ ...g, offsets: g.offsets!.map((r): OffsetRecord => (r.step?.kind === "partition" ? { ...r, step: { ...r.step, input: input(4) } } : r)) }).geometry;
    expect(again.curves.some((c) => c.id === "keep")).toBe(true);
  });
});

describe("noms et identifiants des étapes", () => {
  it("un nom que l'esquisse n'a pas encore", () => {
    const g = chain(3);
    expect(stepName(g, "Répartition")).toBe("Répartition (2)");
    expect(stepName(g, "Étagères 1")).toBe("Étagères 1");
  });

  it("des identifiants qui se suivent", () => {
    expect(idsFrom("of4", 3)).toEqual(["of4", "of5", "of6"]);
  });
});

describe("supprimer une étape de l'historique", () => {
  const sketchOf = (g: SketchGeometry): SketchFeature => ({ id: "sk1", type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...g });

  it("supprimer une division retire ses étagères, pas la répartition", () => {
    const g = chain(3, [[0], [1]]);
    const next = removeOffsetFrom(sketchOf(g), "of2");
    expect(next.offsets?.map((o) => o.id)).toEqual(["of1", "of3"]);
    expect(faces(next)).toBe(12 + 2);
  });

  it("supprimer la répartition emporte les divisions de ses niches", () => {
    const g = chain(3, [[0], [1]]);
    const next = removeOffsetFrom(sketchOf({ ...g, curves: [...g.curves, { id: "keep", kind: "line", p1: g.points[0]!.id, p2: g.points[1]!.id }] }), "of1");
    expect(next.offsets ?? []).toHaveLength(0);
    expect(next.curves.map((c) => c.id)).toEqual(["keep"]);
  });
});

describe("les niches qu'on peut encore diviser (vue 3D)", () => {
  it("une niche divisée laisse la place aux niches qu'elle a données", () => {
    const g = chain(3, [[0]]);
    const leaves = leafNiches(g);
    expect(leaves.map((n) => n.path.join(".")).sort()).toEqual(["0.0", "0.1", "1", "2"]);
    expect(leaves.every((n) => n.partition === "of1" && n.depth === undefined)).toBe(true);
    // The two niches of the first case are stacked: same width, one above the other.
    const low = leaves.find((n) => n.path.join(".") === "0.0");
    const high = leaves.find((n) => n.path.join(".") === "0.1");
    expect(low!.box.x0).toBe(high!.box.x0);
    expect(low!.box.y1).toBeLessThan(high!.box.y0);
  });

  it("avec la profondeur des panneaux de leur répartition", () => {
    const g = rebuilt({ ...empty(), offsets: [partitionRecord("of1", "Répartition", input(2), [0, 0], 500)] }).geometry;
    expect(leafNiches(g).map((n) => n.depth)).toEqual([500, 500]);
  });
});
