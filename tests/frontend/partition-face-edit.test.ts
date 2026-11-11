/** Ce qu'on fait sur la face d'un mur avant OK : tirer, accrocher, aligner, dupliquer une étagère ; porter, copier des tiroirs ou une tringle ; une cote tapée. */
import { describe, expect, it } from "vitest";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { withSketchExtrusion } from "../../frontend/src/document/sketch-extrusion";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { caseAt, partitionFace } from "../../frontend/src/sketcher/partition-face";
import { alignPiece, alignRod, deleteEquip, deletePiece, drawerCount, dropRod, duplicateEquip, duplicatePiece, freeNicheNear, MAGNET, moveEquip, movePiece, PITCH, pieceThickness, resizeNiche, snapPiece, snapRod, toSketch, workProblem, type FaceWork } from "../../frontend/src/sketcher/partition-face-edit";
import { partitionFaceSvg } from "../../frontend/src/sketcher/partition-face-svg";
import { partitionRecord, rebuildChain, shelvesRecord } from "../../frontend/src/sketcher/partition-history";

// Two cases of 705 mm, 30 mm panels, a plinth of 50: the cases go from 80 to 2470 (2390 mm).
const INPUT: PartitionParams = { length: 1500, height: 2500, thickness: 30, cases: 2, dividers: ["single"], boards: true, plinth: 50, outer: "side", single: "board", double: "side" };
const DRAFT = { input: INPUT, origin: [100, 0] as [number, number], depth: 600, id: "of1" };

/** Three equal shelves in the first case (niches of 584 mm), one in the second 600 mm over its bottom. */
function wall(): SketchFeature {
  const offsets = [
    partitionRecord("of1", "Répartition — mur a", INPUT, [100, 0], 600),
    shelvesRecord("of2", "Étagères 1", "of1", [0], { count: 3, thickness: 18, mode: "equal", fixed: 300 }, 600),
    shelvesRecord("of3", "Étagères 2", "of1", [1], { count: 1, thickness: 18, mode: "bottom", fixed: 600 }, 600),
  ];
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Plan — mur a", plane: "XZ", offset: 0, ...rebuilt.geometry };
}

const equip = (id: string, fill: "rod" | "drawers", path: number[], drop = 60): NicheFeature => ({ id, type: "niche", name: fill === "rod" ? "Penderie 1" : "Tiroirs 1", sketch: "sk1", partition: "of1", niche: path, fill, diameter: 25, drop, drawers: 3, gap: 3, thickness: 18, handles: true });

function setUp(niches: NicheFeature[] = [equip("td1", "drawers", [0, 0]), equip("pd1", "rod", [1, 1])]) {
  const sketch = wall();
  const work: FaceWork = { offsets: sketch.offsets ?? [], niches };
  const face = (w: FaceWork = work) => partitionFace(DRAFT, { ...sketch, offsets: w.offsets }, { sketch, niches: w.niches })!;
  return { sketch, work, face };
}
const sizesOf = (w: FaceWork | string, id: string) => {
  if (typeof w === "string") throw new Error(w);
  const r = w.offsets.find((o) => o.id === id)!;
  return r.step?.kind === "shelves" ? r.step.input : null;
};
const must = (w: FaceWork | string): FaceWork => {
  if (typeof w === "string") throw new Error(w);
  return w;
};

describe("face d'un mur : étagères et cloisons", () => {
  it("chaque étagère sait d'où elle vient et jusqu'où elle peut aller", () => {
    const face = setUp().face();
    expect(face.pieces.map((p) => [p.record, p.index])).toEqual([["of2", 0], ["of2", 1], ["of2", 2], ["of3", 0]]);
    const first = face.pieces[0]!;
    // Its middle: 80 + 584 + 9 = 673 from the floor, 1827 from the top; it goes from the niche above's top to the bottom.
    expect(first.centre).toBeCloseTo(2500 - 673, 6);
    expect(first.travel[1]).toBeCloseTo(2500 - 89, 6);
    expect(first.start).toBe(first.travel[1]);
  });

  it("tirée, elle s'accroche au pas de 32 mm, ou à l'étagère de la case voisine quand elle passe près ; Alt : librement", () => {
    const face = setUp().face();
    const first = face.pieces[0]!;
    expect(snapPiece(face, 0, first.start - 100)).toBeCloseTo(first.start - 3 * PITCH, 6);
    // Never closer than a step to the shelf under it, nor past the one over it.
    expect(snapPiece(face, 0, first.start + 50)).toBeCloseTo(first.start - PITCH, 6);
    const top = first.travel[0];
    expect(snapPiece(face, 0, top - 500)).toBeGreaterThan(top);
    expect(snapPiece(face, 0, top - 500)).toBeCloseTo(first.start - Math.floor((first.travel[1] - top - 1) / PITCH) * PITCH, 6);
    // The shelf of the second case is at 600 + 9 over 80: 689 from the floor, 16 mm over the first one.
    const other = face.pieces[3]!.centre;
    expect(snapPiece(face, 0, other + MAGNET - 1)).toBe(other);
    expect(snapPiece(face, 0, other + 5, true)).toBe(Math.round(other + 5));
    expect(alignPiece(face, 0)).toBe(other);
  });

  it("lâchée, ses deux niches se partagent le changement, les autres restent", () => {
    const { sketch, work } = setUp();
    const face = setUp().face();
    const at = snapPiece(face, 0, face.pieces[0]!.start - 100);
    const moved = movePiece(sketch, "of1", work, "of2", 0, toSketch(face, false, at));
    expect(sizesOf(moved, "of2")).toMatchObject({ mode: "set", heights: [96, 1072, 584, null] });
    expect(movePiece(sketch, "of1", work, "of2", 0, 80)).toMatch(/touche/);
  });

  it("dupliquée, une de plus au-dessus, au même écart ou au milieu de la niche ; ce qui était au-dessus monte d'un rang", () => {
    const { sketch, face } = setUp();
    const work: FaceWork = { offsets: sketch.offsets!, niches: [equip("td1", "drawers", [0, 3]), equip("pd1", "rod", [1, 1])] };
    const copy = must(duplicatePiece(sketch, "of1", work, "of2", 1));
    // The niche over the second shelf (584) cannot take another 584: the new shelf goes halfway.
    expect(sizesOf(copy, "of2")).toMatchObject({ count: 4, heights: [584, 584, 283, 283, null] });
    expect(copy.niches.map((n) => n.niche)).toEqual([[0, 4], [1, 1]]);
    expect(face({ ...copy, offsets: copy.offsets }).pieces).toHaveLength(5);
    const lowest = must(duplicatePiece(sketch, "of1", work, "of2", 0));
    expect(sizesOf(lowest, "of2")).toMatchObject({ count: 4, heights: [584, 283, 283, 584, null] });
  });

  it("une niche tapée à sa cote : sa voisine prend la différence ; l'épaisseur d'une étagère pour toute sa division", () => {
    const { sketch, work } = setUp();
    expect(sizesOf(resizeNiche(sketch, "of1", work, [0, 3], "y", 500), "of2")).toMatchObject({ heights: [584, 584, 668, null] });
    expect(sizesOf(resizeNiche(sketch, "of1", work, [0, 1], "y", 400), "of2")).toMatchObject({ heights: [584, 400, 768, null] });
    expect(resizeNiche(sketch, "of1", work, [0, 1], "x", 400)).toMatch(/largeur de la case/);
    expect(resizeNiche(sketch, "of1", work, [0, 1], "y", 2000)).toMatch(/pas la place/);
    expect(sizesOf(pieceThickness(work, "of2", 25), "of2")).toMatchObject({ thickness: 25, count: 3 });
  });

  it("supprimée, ses deux niches n'en font qu'une, les autres restent ; ce qui suit descend d'un rang", () => {
    const { sketch } = setUp();
    const work: FaceWork = { offsets: sketch.offsets!, niches: [equip("td1", "drawers", [0, 3]), equip("pd1", "rod", [1, 1])] };
    const gone = must(deletePiece(sketch, "of1", work, "of2", 1));
    expect(sizesOf(gone, "of2")).toMatchObject({ count: 2, heights: [584, 1186, null] });
    expect(gone.niches.map((n) => n.niche)).toEqual([[0, 2], [1, 1]]);
    // The last shelf of a division takes its step: the rod over it stays, in the whole case.
    const last = must(deletePiece(sketch, "of1", work, "of3", 0));
    expect(last.offsets.map((o) => o.id)).toEqual(["of1", "of2"]);
    expect(last.niches.map((n) => n.niche)).toEqual([[0, 3], [1]]);
    expect(workProblem(sketch, "of1", last, sketch)).toBeNull();
  });

  it("supprimée entre deux niches équipées : la niche du bas garde les siennes, celles du haut s'en vont", () => {
    const { sketch } = setUp();
    const work: FaceWork = { offsets: sketch.offsets!, niches: [equip("td1", "drawers", [0, 0]), equip("pd1", "rod", [0, 1])] };
    const gone = must(deletePiece(sketch, "of1", work, "of2", 0));
    expect(gone.niches.map((n) => [n.id, n.niche])).toEqual([["td1", [0, 0]]]);
    expect(must(deleteEquip(work, "pd1")).niches.map((n) => n.id)).toEqual(["td1"]);
    expect(deleteEquip(work, "zz")).toMatch(/n'existe plus/);
  });

  it("une case tapée à sa largeur : les autres se partagent le reste", () => {
    const face = setUp().face();
    expect(caseAt(face, 0, 900)).toEqual([900, 510]);
    expect(caseAt(face, 0, 1400)).toMatch(/place/);
  });

  it("chaque cote dit ce qu'elle règle et se tape sur place", () => {
    const face = setUp().face();
    expect(face.edits.slice(0, 4).map((e) => e.edit.what)).toEqual(["length", "height", "case", "case"]);
    const kinds = face.labels.filter((l) => l.edit !== undefined).map((l) => face.edits[l.edit!]!.edit.what);
    expect(kinds).toEqual(expect.arrayContaining(["thickness", "plinth", "division", "niche", "front", "rod"]));
    const svg = partitionFaceSvg(face, { kind: "piece", index: 0 });
    expect(svg.split("data-edit=").length - 1).toBe(face.edits.length);
    expect(svg.split("data-piece=").length - 1).toBe(4);
    expect(svg).toContain("data-picked");
  });
});

describe("face d'un mur : tiroirs et tringles", () => {
  it("des tiroirs portés dans une niche vide, pas dans une niche déjà équipée", () => {
    const { work } = setUp();
    expect(must(moveEquip(work, "td1", [0, 1])).niches[0]!.niche).toEqual([0, 1]);
    expect(moveEquip(work, "td1", [1, 1])).toMatch(/déjà équipée/);
  });

  it("dupliqués dans la niche vide la plus proche, sur la même rangée d'abord", () => {
    const { work, face } = setUp();
    const path = freeNicheNear(face(), work, "of1", "td1");
    expect(path).toEqual([1, 0]);
    const copy = must(duplicateEquip(work, "td1", path!, "face-new-1"));
    expect(copy.niches).toHaveLength(3);
    expect(copy.niches[2]).toMatchObject({ id: "face-new-1", fill: "drawers", niche: [1, 0], drawers: 3 });
  });

  it("un tiroir de plus ou de moins, de 1 à 8", () => {
    const { work } = setUp();
    expect(must(drawerCount(work, "td1", 4)).niches[0]!.drawers).toBe(4);
    expect(drawerCount(work, "td1", 9)).toMatch(/De 1 à 8/);
    expect(drawerCount(work, "pd1", 2)).toMatch(/n'existent plus/);
  });

  it("une tringle se tire au centimètre du sol ou sur une autre tringle, s'aligne, et ne sort pas de sa niche", () => {
    const { sketch, work, face } = setUp([equip("pd1", "rod", [1, 1]), equip("pd2", "rod", [0, 3], 100)]);
    const f = face();
    const [one, two] = [f.rods.find((r) => r.id === "pd1")!, f.rods.find((r) => r.id === "pd2")!];
    // 60 and 100 mm under the same top (2470): 90 and 130 from the top of the face.
    expect([one.y, two.y]).toEqual([90, 130]);
    // 113 from the top is 2387 from the floor: to the centimetre, 2390.
    expect(snapRod(f, "pd1", 90 + 23)).toBe(110);
    expect(snapRod(f, "pd1", 130 - MAGNET + 1)).toBe(130);
    expect(alignRod(f, "pd1")).toBe(130);
    expect(must(dropRod(work, "pd1", 40)).niches[0]!.drop).toBe(100);
    expect(workProblem(sketch, "of1", must(dropRod(work, "pd1", 5000)), sketch)).toMatch(/^Tringle/);
    expect(workProblem(sketch, "of1", work, sketch)).toBeNull();
  });

  it("OK enregistre les tiroirs changés, et donne à une copie un nom et un identifiant à elle", () => {
    const { sketch } = setUp();
    const doc: CadDocument = { ...createReferencePlate(), features: [sketch, equip("td1", "drawers", [0, 0])] };
    const moved = { ...equip("td1", "drawers", [0, 1]), drawers: 4 };
    const copy = { ...equip("td1", "drawers", [1, 0]), id: "face-new-1" };
    const next = withSketchExtrusion(doc, "sk1", sketch, { groups: [], niches: [moved, copy] });
    expect(withSketchExtrusion(next, "sk1", sketch, { groups: [], removeNiches: ["td1"] }).features.filter((f) => f.type === "niche").map((f) => f.id)).toEqual(["td2"]);
    const drawers = next.features.filter((f): f is NicheFeature => f.type === "niche");
    expect(drawers.map((d) => [d.id, d.name, d.niche, d.drawers])).toEqual([
      ["td1", "Tiroirs 1", [0, 1], 4],
      ["td2", "Tiroirs 2", [1, 0], 3],
    ]);
  });
});
