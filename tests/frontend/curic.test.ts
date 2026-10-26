/** Curic tools on the exact solids: mirror copies, alignment on a reference body, stretch across a plane. */
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { bodyLabel } from "../../frontend/src/document/operations";
import { rectangleAt } from "../../frontend/src/document/sketch";
import { arrayOffsets, type CadDocument, type Feature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import * as THREE from "three";
import { selectionLevels } from "../../frontend/src/app/select-plus";
import { alignDelta, stretchSide, type Box } from "../../frontend/src/features/curic";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** Two boards: A 0..100 × 0..50 × 0..18, B 200..260 × 0..40 × 0..30. */
const boards = (...more: Feature[]): CadDocument => ({
  format: "cao-studio",
  schemaVersion: 2,
  units: "mm",
  parameters: {},
  features: [
    { id: "sa", type: "sketch", name: "A", plane: "XY", offset: 0, ...rectangleAt(50, 25, 100, 50) },
    { id: "a", type: "extrude", name: "A", sketch: "sa", distance: 18, operation: "new" },
    { id: "sb", type: "sketch", name: "B", plane: "XY", offset: 0, ...rectangleAt(230, 20, 60, 40) },
    { id: "b", type: "extrude", name: "B", sketch: "sb", distance: 30, operation: "new" },
    ...more,
  ],
});

function solidOf(r: Recomputer, id: string): Shape3D {
  const out = r.output(id);
  if (out?.kind !== "solid") throw new Error(`solid expected for ${id}`);
  return out.shape;
}

const round = (v: number[]) => v.map((x) => Number(x.toFixed(6)) + 0);
const bbox = (shape: Shape3D) => {
  const [min, max] = bodyMetrics(shape).bbox;
  return [round(min), round(max)];
};

describe("symétrie", () => {
  it("copie miroir de plusieurs corps ; les originaux restent", () => {
    const doc = boards({ id: "mi1", type: "mirror", name: "Symétrie 1", targets: ["a", "b"], axis: 0, position: 300 });
    expect(parseDocument(JSON.parse(JSON.stringify(doc))).features.at(-1)?.type).toBe("mirror");
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    expect(result.bodies).toEqual(["a", "b", "mi1#0", "mi1#1"]);
    const out = r.output("mi1");
    if (out?.kind !== "solids") throw new Error("solids expected");
    expect(bbox(out.shapes[0]!)).toEqual([[500, 0, 0], [600, 50, 18]]);
    expect(bbox(out.shapes[1]!)).toEqual([[340, 0, 0], [400, 40, 30]]);
    expect(bodyLabel(doc, "mi1#0")).toBe("Corps 1 — symétrie");
    r.dispose();
  });
});

describe("aligner", () => {
  it("déplacement calculé axe par axe", () => {
    const t: Box = [[200, 0, 0], [260, 40, 30]];
    const ref: Box = [[0, 0, 0], [100, 50, 18]];
    expect(alignDelta(t, ref, ["min", "none", "none"])).toEqual([-200, 0, 0]);
    expect(alignDelta(t, ref, ["after", "center", "max"])).toEqual([-100, 5, -12]);
    expect(alignDelta(t, ref, ["before", "none", "none"])).toEqual([-260, 0, 0]);
  });

  it("le corps B se place contre A (côté +X) et à la même face avant", () => {
    const doc = boards({ id: "al1", type: "align", name: "Alignement 1", target: "b", reference: "a", modes: ["after", "min", "none"] });
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    expect(result.bodies).toEqual(["a", "al1"]);
    expect(bbox(solidOf(r, "al1"))).toEqual([[100, 0, 0], [160, 40, 30]]);
    expect(bodyLabel(doc, "al1")).toBe("Corps 2");
    r.dispose();
  });
});

describe("étirer", () => {
  it("position par rapport au plan", () => {
    const box: Box = [[0, 0, 0], [100, 50, 18]];
    expect(stretchSide(box, 0, 50)).toBe("across");
    expect(stretchSide(box, 0, 100)).toBe("before");
    expect(stretchSide(box, 0, 0)).toBe("beyond");
  });

  it("allonger un panneau traversé par le plan : 100 → 300 mm, volume exact, une seule boîte", () => {
    const doc = boards({ id: "st1", type: "stretch", name: "Étirement 1", target: "a", axis: 0, position: 40, distance: 200 });
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    const shape = solidOf(r, "st1");
    expect(bbox(shape)).toEqual([[0, 0, 0], [300, 50, 18]]);
    expect(bodyMetrics(shape).volume).toBeCloseTo(300 * 50 * 18, 3);
    expect(bodyMetrics(shape).faceCount).toBe(6); // merged into a plain board
    r.dispose();
  });

  it("raccourcir : la tranche est retirée ; un corps au-delà du plan se déplace seulement", () => {
    const doc = boards(
      { id: "st1", type: "stretch", name: "Étirement 1", target: "a", axis: 0, position: 80, distance: -30 },
      { id: "st2", type: "stretch", name: "Étirement 2", target: "b", axis: 0, position: 80, distance: -30 },
    );
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    expect(bbox(solidOf(r, "st1"))).toEqual([[0, 0, 0], [70, 50, 18]]);
    expect(bodyMetrics(solidOf(r, "st1")).volume).toBeCloseTo(70 * 50 * 18, 3);
    expect(bbox(solidOf(r, "st2"))).toEqual([[170, 0, 0], [230, 40, 30]]);
    r.dispose();
  });

  it("refuse de raccourcir plus que ce qui est avant le plan", () => {
    const doc = boards({ id: "st1", type: "stretch", name: "Étirement 1", target: "a", axis: 0, position: 20, distance: -50 });
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.find((s) => s.id === "st1")?.state).toBe("error");
    r.dispose();
  });
});

describe("Sélection++ : niveaux sous le pointeur", () => {
  it("une pièce de caisson : l'ensemble, la pièce, la face ; un corps seul : le corps, la face", () => {
    const cabinet: Feature = { id: "cb1", type: "cabinet", name: "Caisson 1", origin: [0, 0, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" };
    const doc = boards(cabinet, { id: "st1", type: "stretch", name: "Étirement 1", target: "cb1#3", axis: 0, position: 300, distance: 200 });
    const r = new Recomputer();
    const { bodies } = r.recompute(doc);
    const levels = selectionLevels(doc, bodies, { bodyId: "st1", faceIndex: 2, point: new THREE.Vector3() });
    expect(levels.map((l) => l.kind)).toEqual(["group", "body", "face"]);
    expect(levels[0]?.label).toBe("Caisson « Caisson 1 » — 6 pièces");
    expect(levels[0]?.target).toEqual({ bodies: ["cb1#0", "cb1#1", "cb1#2", "cb1#4", "cb1#5", "st1"].filter((id) => bodies.includes(id)) });
    expect((levels[0]?.target as { bodies: string[] }).bodies).toHaveLength(6);
    expect(levels[1]?.label).toBe("Caisson 1 — Dessus");
    expect(levels[2]?.label).toBe("Face 3");
    expect(selectionLevels(doc, bodies, { bodyId: "a", faceIndex: 0, point: new THREE.Vector3() }).map((l) => l.kind)).toEqual(["body", "face"]);
    r.dispose();
  });
});

describe("réseau et rotation", () => {
  it("réseau : 3 copies de A tous les 150 mm le long de X ; l'original reste", () => {
    const doc = boards({ id: "ar1", type: "array", name: "Réseau 1", targets: ["a"], step: [150, 0, 0], count: 3 });
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((st) => st.state === "ok")).toBe(true);
    expect(result.bodies).toEqual(["a", "b", "ar1#0", "ar1#1", "ar1#2"]);
    const out = r.output("ar1");
    if (out?.kind !== "solids") throw new Error("solids expected");
    expect(bbox(out.shapes[2]!)).toEqual([[450, 0, 0], [550, 50, 18]]);
    expect(bodyLabel(doc, "ar1#1")).toBe("Corps 1 — Réseau 1 (2)");
    r.dispose();
  });

  it("réseau circulaire : 3 copies de A tous les 90° autour de Z, centre (0, 0)", () => {
    const doc = boards({ id: "ar1", type: "array", name: "Réseau 1", targets: ["a"], step: [0, 0, 0], count: 3, around: { axis: 2, center: [0, 0, 0], angle: 90 } });
    expect(parseDocument(JSON.parse(JSON.stringify(doc))).features.at(-1)).toMatchObject({ around: { axis: 2, angle: 90 } });
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((st) => st.state === "ok")).toBe(true);
    const out = r.output("ar1");
    if (out?.kind !== "solids") throw new Error("solids expected");
    expect(bbox(out.shapes[0]!)).toEqual([[-50, 0, 0], [0, 100, 18]]);
    expect(bbox(out.shapes[1]!)).toEqual([[-100, -50, 0], [0, 0, 18]]);
    expect(bbox(out.shapes[2]!)).toEqual([[0, -100, 0], [50, 0, 18]]);
    r.dispose();
  });

  it("réseau circulaire : un angle nul est refusé ; un axe invalide aussi à la lecture", () => {
    const doc = boards({ id: "ar1", type: "array", name: "Réseau 1", targets: ["a"], step: [0, 0, 0], count: 2, around: { axis: 2, center: [0, 0, 0], angle: 0 } });
    const r = new Recomputer();
    expect(r.recompute(doc).statuses.find((st) => st.id === "ar1")?.state).not.toBe("ok");
    r.dispose();
    const bad = JSON.parse(JSON.stringify(doc));
    bad.features.at(-1).around.axis = 7;
    expect(() => parseDocument(bad)).toThrow();
  });

  it("composants liés : les copies d'un réseau suivent l'original quand on le modifie", () => {
    const doc = boards({ id: "ar1", type: "array", name: "Réseau 1", targets: ["a"], step: [150, 0, 0], count: 1 });
    const wider: CadDocument = {
      ...doc,
      features: doc.features.map((f) => (f.id === "sa" ? ({ ...f, ...rectangleAt(75, 25, 150, 50) } as Feature) : f)),
    };
    const r = new Recomputer();
    r.recompute(doc);
    const before = r.output("ar1");
    if (before?.kind !== "solids") throw new Error("solids expected");
    expect(bbox(before.shapes[0]!)).toEqual([[150, 0, 0], [250, 50, 18]]);
    r.recompute(wider);
    const after = r.output("ar1");
    if (after?.kind !== "solids") throw new Error("solids expected");
    expect(bbox(after.shapes[0]!)).toEqual([[150, 0, 0], [300, 50, 18]]);
    r.dispose();
  });

  it("réseau rectangulaire : une grille 3 × 2 de A (pas 150 en X, 100 en Y) = 5 copies, l'original reste", () => {
    const doc = boards({ id: "ar1", type: "array", name: "Réseau 1", targets: ["a"], step: [150, 0, 0], count: 2, second: { step: [0, 100, 0], count: 1 } });
    expect(arrayOffsets({ step: [150, 0, 0], count: 2, second: { step: [0, 100, 0], count: 1 } })).toEqual([[150, 0, 0], [300, 0, 0], [0, 100, 0], [150, 100, 0], [300, 100, 0]]);
    expect(parseDocument(JSON.parse(JSON.stringify(doc))).features.at(-1)).toMatchObject({ second: { count: 1 } });
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((st) => st.state === "ok")).toBe(true);
    expect(result.bodies).toEqual(["a", "b", "ar1#0", "ar1#1", "ar1#2", "ar1#3", "ar1#4"]);
    const out = r.output("ar1");
    if (out?.kind !== "solids") throw new Error("solids expected");
    expect(bbox(out.shapes[0]!)).toEqual([[150, 0, 0], [250, 50, 18]]);
    expect(bbox(out.shapes[2]!)).toEqual([[0, 100, 0], [100, 150, 18]]);
    expect(bbox(out.shapes[4]!)).toEqual([[300, 100, 0], [400, 150, 18]]);
    expect(bodyLabel(doc, "ar1#4")).toBe("Corps 1 — Réseau 1 (5)");
    r.dispose();
  });

  it("réseau rectangulaire : deux corps copiés ensemble, chacun garde son rang ; validation de la seconde direction", () => {
    const doc = boards({ id: "ar1", type: "array", name: "Réseau 1", targets: ["a", "b"], step: [0, 0, 100], count: 1, second: { step: [0, 80, 0], count: 2 } });
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((st) => st.state === "ok")).toBe(true);
    expect(result.bodies).toHaveLength(2 + 2 * 5);
    expect(bodyLabel(doc, "ar1#5")).toBe("Corps 2 — Réseau 1 (1)");
    r.dispose();
    const bad = JSON.parse(JSON.stringify(doc));
    bad.features.at(-1).second.count = 0;
    expect(() => parseDocument(bad)).toThrow(/seconde direction/);
    const huge = JSON.parse(JSON.stringify(doc));
    huge.features.at(-1).count = 30;
    huge.features.at(-1).second.count = 30;
    expect(() => parseDocument(huge)).toThrow(/trop grand/);
  });

  it("réseau rectangulaire : un pas nul dans la seconde direction est refusé", () => {
    const doc = boards({ id: "ar1", type: "array", name: "Réseau 1", targets: ["a"], step: [150, 0, 0], count: 1, second: { step: [0, 0, 0], count: 1 } });
    const r = new Recomputer();
    expect(r.recompute(doc).statuses.find((st) => st.id === "ar1")?.state).toBe("error");
    r.dispose();
  });

  it("tourner : A d'un quart de tour autour de Z par son coin (0, 0)", () => {
    const doc = boards({ id: "ro1", type: "rotate", name: "Rotation 1", target: "a", axis: 2, angle: 90, center: [0, 0, 0] });
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((st) => st.state === "ok")).toBe(true);
    expect(bbox(solidOf(r, "ro1"))).toEqual([[-50, 0, 0], [0, 100, 18]]);
    r.dispose();
  });
});
