/** Cabinet-making machining: the numbers of each preset, then the exact cuts on the kernel's solids. */
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature, MachiningOp } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { confirmats, contactOf, dowels, drilling32, groove, halfLap, hinges, tenon, type Box } from "../../frontend/src/features/joinery";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A side panel (18 × 560 × 720) standing against the left end of a 600 × 560 × 18 shelf. */
const SIDE: Box = [[0, 0, 0], [18, 560, 720]];
const SHELF: Box = [[18, 0, 0], [618, 560, 18]];

const board = (id: string, box: Box): Feature[] => {
  const [lo, hi] = box;
  return [
    { id: `s${id}`, type: "sketch", name: id, plane: "XY", offset: 0, ...rectangleAt((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[0] - lo[0], hi[1] - lo[1]) },
    { id, type: "extrude", name: id, sketch: `s${id}`, distance: hi[2] - lo[2], operation: "new" },
  ] as Feature[];
};

const doc = (...more: Feature[]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [...board("a", SIDE), ...board("b", SHELF), ...more] });

const machining = (id: string, target: string, ops: MachiningOp[], kind: "dowel" | "tenon" | "custom" = "custom"): Feature => ({ id, type: "machining", name: id, target, kind, ops });

function solid(r: Recomputer, id: string): Shape3D {
  const out = r.output(id);
  if (out?.kind !== "solid") throw new Error(`solid expected for ${id}`);
  return out.shape;
}
const volume = (shape: Shape3D) => bodyMetrics(shape).volume;
const hole = (op: MachiningOp | undefined) => {
  if (op?.kind !== "hole") throw new Error("hole expected");
  return op;
};

describe("perçages du système 32", () => {
  it("21 trous de Ø5 tous les 32 mm, à 37 mm du bord, sur la face +X d'un côté de 720", () => {
    const ops = drilling32(SIDE, { axis: 0, sign: 1 });
    expect(ops).toHaveLength(21);
    expect(ops[0]).toMatchObject({ kind: "hole", at: [18, 37, 40], dir: [-1, 0, 0], diameter: 5, depth: 12 });
    expect(hole(ops[20]).at).toEqual([18, 37, 680]);
    expect(hole(ops[1]).at[2] - hole(ops[0]).at[2]).toBe(32);
  });

  it("deux files : la seconde à 37 mm du bord opposé", () => {
    const ops = drilling32(SIDE, { axis: 0, sign: 1 }, { side: "low", setback: 37, spacing: 32, start: 32, diameter: 5, depth: 12, rows: 2 });
    expect(ops).toHaveLength(42);
    expect(hole(ops[21]).at[1]).toBe(560 - 37);
  });
});

describe("charnières et rainure", () => {
  it("deux cuvettes Ø35 à 100 mm des bouts, à 22,5 mm du bord d'une porte", () => {
    const door: Box = [[0, 0, 0], [400, 18, 700]];
    const ops = hinges(door, { axis: 1, sign: -1 });
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ at: [22.5, 0, 100], dir: [0, 1, 0], diameter: 35, depth: 13 });
    expect(hole(ops[1]).at).toEqual([22.5, 0, 600]);
  });

  it("rainure de fond : 4 mm de large, 8 de profondeur, à 10 mm du bord, sur toute la longueur", () => {
    const [op] = groove(SIDE, { axis: 0, sign: 1 });
    expect(op).toEqual({ kind: "box", from: [10, 10, -1], to: [19, 14, 721], mode: "cut" });
  });
});

describe("assemblages : les nombres", () => {
  it("contact face à face entre le côté et la tablette", () => {
    const c = contactOf(SIDE, SHELF)!;
    expect(c).toMatchObject({ axis: 0, aFirst: true, plane: 18 });
    expect(c.overlap).toEqual([[18, 0, 0], [18, 560, 18]]);
    expect(contactOf(SIDE, [[100, 0, 0], [200, 50, 50]])).toBeNull();
  });

  it("tourillons : cinq Ø8 sur 560 mm (un tous les 96 mm), face à face, au milieu de l'épaisseur", () => {
    const joint = dowels(SIDE, SHELF, contactOf(SIDE, SHELF)!);
    expect(joint.a).toHaveLength(5);
    expect(joint.a[0]).toMatchObject({ at: [18, 50, 9], dir: [-1, 0, 0], diameter: 8, depth: 15 });
    expect(joint.b[0]).toMatchObject({ at: [18, 50, 9], dir: [1, 0, 0], depth: 15 });
  });

  it("confirmat : Ø7 depuis la face extérieure du côté, Ø5 en pilote dans la tablette", () => {
    const joint = confirmats(SIDE, SHELF, contactOf(SIDE, SHELF)!);
    expect(joint.a[0]).toMatchObject({ at: [0, 50, 9], dir: [1, 0, 0], diameter: 7, depth: 18 });
    expect(joint.b[0]).toMatchObject({ at: [18, 50, 9], dir: [1, 0, 0], diameter: 5, depth: 45 });
  });

  it("mi-bois : deux planches croisées perdent chacune la moitié de la hauteur commune", () => {
    const a: Box = [[0, 0, 0], [600, 18, 100]];
    const b: Box = [[290, -100, 0], [308, 200, 100]];
    const joint = halfLap(a, b)!;
    // Opened by 1 mm where the cut lies flush with a face of the board.
    expect(joint.a[0]).toEqual({ kind: "box", from: [290, -1, 50], to: [308, 19, 101], mode: "cut" });
    expect(joint.b[0]).toEqual({ kind: "box", from: [289, 0, -1], to: [309, 18, 50], mode: "cut" });
    expect(halfLap(a, [[0, 100, 0], [10, 110, 10]])).toBeNull();
  });

  it("tenon : 540 × 6 mm de section (tiers de l'épaisseur, épaulements de 10), 25 mm dans l'autre planche", () => {
    const joint = tenon(SIDE, SHELF, contactOf(SIDE, SHELF)!);
    expect(joint.a[0]).toEqual({ kind: "box", from: [17, 10, 6], to: [43, 550, 12], mode: "join" });
    expect(joint.b[0]).toEqual({ kind: "box", from: [17, 10, 6], to: [43, 550, 12], mode: "cut" });
  });
});

describe("usinages sur le noyau", () => {
  it("la validation lit un usinage et refuse un trou sans diamètre", () => {
    const d = doc(machining("m1", "a", drilling32(SIDE, { axis: 0, sign: 1 })));
    expect(parseDocument(JSON.parse(JSON.stringify(d))).features.at(-1)?.type).toBe("machining");
    const bad = JSON.parse(JSON.stringify(d));
    bad.features.at(-1).ops[0].diameter = 0;
    expect(() => parseDocument(bad)).toThrow();
  });

  it("perçages 32 : le volume diminue de 21 trous Ø5 × 12 ; le corps usiné remplace l'original", () => {
    const r = new Recomputer();
    const result = r.recompute(doc(machining("m1", "a", drilling32(SIDE, { axis: 0, sign: 1 }))));
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    expect(result.bodies).toEqual(["b", "m1"]);
    expect(volume(solid(r, "m1"))).toBeCloseTo(18 * 560 * 720 - 21 * Math.PI * 2.5 ** 2 * 12, 0);
    r.dispose();
  });

  it("tourillons : 5 trous Ø8 × 15 dans chaque planche", () => {
    const joint = dowels(SIDE, SHELF, contactOf(SIDE, SHELF)!);
    const r = new Recomputer();
    expect(r.recompute(doc(machining("m1", "a", joint.a, "dowel"), machining("m2", "b", joint.b, "dowel"))).statuses.every((s) => s.state === "ok")).toBe(true);
    const holes = 5 * Math.PI * 4 ** 2 * 15;
    expect(volume(solid(r, "m1"))).toBeCloseTo(18 * 560 * 720 - holes, 0);
    expect(volume(solid(r, "m2"))).toBeCloseTo(600 * 560 * 18 - holes, 0);
    r.dispose();
  });

  it("tenon et mortaise : ce que gagne le côté, la tablette le perd (25 × 540 × 6)", () => {
    const joint = tenon(SIDE, SHELF, contactOf(SIDE, SHELF)!);
    const r = new Recomputer();
    expect(r.recompute(doc(machining("m1", "a", joint.a, "tenon"), machining("m2", "b", joint.b, "tenon"))).statuses.every((s) => s.state === "ok")).toBe(true);
    const tenonVolume = 25 * 540 * 6;
    expect(volume(solid(r, "m1"))).toBeCloseTo(18 * 560 * 720 + tenonVolume, 0);
    expect(volume(solid(r, "m2"))).toBeCloseTo(600 * 560 * 18 - tenonVolume, 0);
    r.dispose();
  });

  it("un usinage qui rate le corps est une erreur, pas un silence", () => {
    const miss: MachiningOp = { kind: "hole", at: [500, 500, 500], dir: [0, 0, 1], diameter: 5, depth: 10 };
    const r = new Recomputer();
    expect(r.recompute(doc(machining("m1", "a", [miss]))).statuses.find((s) => s.id === "m1")?.state).toBe("error");
    r.dispose();
  });
});

describe("usinages qui suivent la planche", () => {
  it("la planche usinée se déplace : les trous se déplacent avec elle (même volume retiré)", () => {
    const ops = drilling32(SIDE, { axis: 0, sign: 1 });
    const feature: Feature = { ...machining("m1", "a", ops), anchor: [0, 0, 0] } as Feature;
    const base = doc(feature);
    // The side's sketch is moved by (+300, +20): its low corner follows, so do the holes.
    const moved: CadDocument = { ...base, features: base.features.map((f) => (f.id === "sa" ? ({ ...f, ...rectangleAt(309, 300, 18, 560) } as Feature) : f)) };
    const r = new Recomputer();
    expect(r.recompute(base).statuses.every((s) => s.state === "ok")).toBe(true);
    const before = volume(solid(r, "m1"));
    const result = r.recompute(moved);
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    expect(volume(solid(r, "m1"))).toBeCloseTo(before, 3);
    r.dispose();
  });
});
