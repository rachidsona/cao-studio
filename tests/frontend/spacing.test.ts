/** « Espacement » : l'espace entre deux éléments devient une cote qu'on change (document/spacing.ts). */
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { axisGap, measureGap, movesNeeded, snapAxis, spacingFeatures, spacingShifts, type Box } from "../../frontend/src/document/spacing";
import type { CabinetFeature, CadDocument, Feature } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const cabinet = (id: string, x: number): CabinetFeature => ({ id, type: "cabinet", name: id, origin: [x, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" });
const doc = (features: Feature[]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features });
const A: Box = [[0, 0, 0], [600, 560, 720]];
const B: Box = [[650, 0, 0], [1250, 560, 720]];

describe("espacement", () => {
  it("l'écart le long d'un axe, la cote au milieu de ce qui se fait face", () => {
    const gap = axisGap(A, B, 0);
    expect(gap.distance).toBe(50);
    expect(gap.from).toEqual([600, 280, 360]);
    expect(gap.to).toEqual([650, 280, 360]);
    expect(gap.dir).toEqual([1, 0, 0]);
    // Seen from the second: the same space, the other way.
    expect(axisGap(B, A, 0)).toMatchObject({ distance: 50, dir: [-1, 0, 0] });
    // Boxes that overlap: a negative space.
    expect(axisGap(A, [[500, 0, 0], [900, 560, 720]], 0).distance).toBe(-100);
  });

  it("une direction presque sur un axe devient cet axe", () => {
    expect(snapAxis([50, 0.01, 0])).toEqual([1, 0, 0]);
    expect(snapAxis([0, 0, -3])).toEqual([0, 0, -1]);
    const diagonal = snapAxis([3, 4, 0]);
    expect(diagonal[0]).toBeCloseTo(0.6, 9);
    expect(diagonal[1]).toBeCloseTo(0.8, 9);
  });

  it("au contact, la cote part le long de l'axe qui sépare les centres", () => {
    const gap = measureGap({ distance: 0, from: [600, 0, 0], to: [600, 0, 0] }, A, [[600, 0, 0], [1200, 560, 720]]);
    expect(gap.distance).toBe(0);
    expect(gap.dir).toEqual([1, 0, 0]);
  });

  it("la nouvelle valeur pousse le second, tire le premier, ou les deux de moitié", () => {
    const gap = axisGap(A, B, 0);
    expect(spacingShifts(gap, 80, "second")).toEqual([[0, 0, 0], [30, 0, 0]]);
    expect(spacingShifts(gap, 80, "first")).toEqual([[-30, -0, -0], [0, 0, 0]]);
    expect(spacingShifts(gap, 0, "both")).toEqual([[25, 0, 0], [-25, -0, -0]]);
  });

  it("un caisson glisse par sa position ; un autre corps, par un déplacement", () => {
    const d = doc([cabinet("cb1", 0), cabinet("cb2", 650), { id: "e1", type: "extrude", name: "Planche", sketch: "s", distance: 18, operation: "new" } as Feature]);
    const moving = [
      { key: "cb2", bodies: ["cb2#0", "cb2#1"], whole: true, shift: [30, 0, 0] as [number, number, number] },
      { key: "e1", bodies: ["e1"], whole: true, shift: [0, 0, 12] as [number, number, number] },
      { key: "cb1", bodies: ["cb1#0"], whole: true, shift: [0, 0, 0] as [number, number, number] },
    ];
    expect(movesNeeded(d, moving)).toBe(1);
    const made = spacingFeatures(d, moving, [{ id: "mv9", name: "Espacement 1" }]);
    expect(made).toEqual([
      { ...cabinet("cb2", 650), origin: [680, 0, 0] },
      { id: "mv9", name: "Espacement 1", type: "move", target: "e1", translate: [0, 0, 12] },
    ]);
    // Two shelves of one cabinet: the bodies move one by one.
    const shelves = [{ key: "cb1#4", bodies: ["cb1#4"], whole: false, shift: [0, 0, 40] as [number, number, number] }];
    expect(movesNeeded(d, shelves)).toBe(1);
    expect(spacingFeatures(d, shelves, [{ id: "mv1", name: "E" }])).toEqual([{ id: "mv1", name: "E", type: "move", target: "cb1#4", translate: [0, 0, 40] }]);
  });

  it("un îlot de cuisine pris en entier : ses caissons glissent tous, aucun déplacement de corps (son plan refait le reste)", () => {
    const d = doc([cabinet("cb1", 0), cabinet("cb2", 650)]);
    const island = [{ key: "sk1:I", bodies: ["cb1#0", "cb2#0", "ex9"], whole: true, shift: [0, -120, 0] as [number, number, number], slide: ["cb1", "cb2"] }];
    expect(movesNeeded(d, island)).toBe(0);
    expect(spacingFeatures(d, island, []).map((f) => [f.id, (f as { origin: number[] }).origin])).toEqual([["cb1", [0, -120, 0]], ["cb2", [650, -120, 0]]]);
  });

  it("une esquisse glisse par son plan : décalée dans le plan, ou montée le long de sa normale", () => {
    const sketch = { id: "s1", type: "sketch", name: "Rect", plane: "XY", offset: 0, points: [], curves: [], constraints: [] } as Feature;
    const [moved] = spacingFeatures(doc([sketch]), [{ key: "s1", bodies: [], whole: true, shift: [-120, 0, 0] }], []);
    expect(moved).toMatchObject({ id: "s1", type: "sketch", shift: [-120, 0], offset: 0 });
    const [up] = spacingFeatures(doc([sketch]), [{ key: "s1", bodies: [], whole: true, shift: [0, 0, 30] }], []);
    expect(up).toMatchObject({ id: "s1", offset: 30 });
    expect(movesNeeded(doc([sketch]), [{ key: "s1", bodies: [], whole: true, shift: [5, 0, 0] }])).toBe(0);
  });

  it("une formule sur la position du caisson tombe seulement sur l'axe qu'il quitte", () => {
    const c = { ...cabinet("cb2", 650), expressions: { "origin.0": "a + 50", "origin.1": "b", width: "w" } };
    const [made] = spacingFeatures(doc([c]), [{ key: "cb2", bodies: ["cb2#0"], whole: true, shift: [30, 0, 0] }], []);
    expect(made).toMatchObject({ origin: [680, 0, 0], expressions: { "origin.1": "b", width: "w" } });
  });

  it("dans le noyau : deux caissons écartés de 50 mm passent à 120 mm", () => {
    const before = doc([cabinet("cb1", 0), cabinet("cb2", 650)]);
    const r = new Recomputer();
    const boxOf = (d: CadDocument, id: string): Box => {
      const { bodies } = r.recompute(d);
      const shapes = bodies.filter((b) => b.startsWith(`${id}#`)).map((b) => r.output(b)).filter((o) => o?.kind === "solid");
      const boxes = shapes.map((o) => bodyMetrics(o!.shape as Shape3D).bbox);
      return [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))), [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!)))] as Box;
    };
    const gap = axisGap(boxOf(before, "cb1"), boxOf(before, "cb2"), 0);
    expect(gap.distance).toBeCloseTo(50, 3);
    const [, shift] = spacingShifts(gap, 120, "second");
    const after = { ...before, features: before.features.map((f) => spacingFeatures(before, [{ key: "cb2", bodies: [], whole: true, shift }], []).find((g) => g.id === f.id) ?? f) };
    expect(validateDocument(after)).toEqual([]);
    expect(axisGap(boxOf(after, "cb1"), boxOf(after, "cb2"), 0).distance).toBeCloseTo(120, 3);
    r.dispose();
  });
});
