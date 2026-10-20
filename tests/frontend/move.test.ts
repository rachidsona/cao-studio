/** Move a body: the real solid is translated by the kernel; later operations, deletion, undo and save follow it. */
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { bodyLabel, bodyOrigin, deleteFeature } from "../../frontend/src/document/operations";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature, MoveFeature, Vec3 } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { GLOBAL_FRAME, faceFrame, toGlobal, toLocal } from "../../frontend/src/features/move";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { UndoStack } from "../../frontend/src/history/undo";
import { toolOptions } from "../../frontend/src/app/tool-launcher";
import { axisParameter, rayPlanePoint } from "../../frontend/src/viewport/axis-drag";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const doc = (...features: Feature[]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features });

/** Plate 40 × 20 × 10 mm (x ∈ [−20, 20], y ∈ [−10, 10], z ∈ [0, 10]): volume 8000. */
const plate = (): Feature[] => [
  { id: "sk", type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...rectangleAt(0, 0, 40, 20) },
  { id: "ex", type: "extrude", name: "Plaque", sketch: "sk", distance: 10, operation: "new" },
];

const move = (translate: Vec3, id = "mv", target = "ex"): MoveFeature => ({ id, type: "move", name: "Déplacement 1", target, translate });

function run(d: CadDocument) {
  const r = new Recomputer();
  const result = r.recompute(d);
  const metrics = (id: string) => {
    const out = r.output(id);
    if (out?.kind !== "solid") throw new Error(`corps « ${id} » attendu`);
    return bodyMetrics(out.shape);
  };
  return { r, result, metrics, status: (id: string) => result.statuses.find((s) => s.id === id) };
}

describe("déplacement d'un corps", () => {
  it("translate le solide réel : boîte englobante déplacée, volume intact, ancien corps remplacé", () => {
    const { r, result, metrics, status } = run(doc(...plate(), move([100, -5, 7])));
    expect(status("mv")).toMatchObject({ state: "ok" });
    expect(result.bodies).toEqual(["mv"]);
    const m = metrics("mv");
    expect(m.volume).toBeCloseTo(8000, 6);
    expect(m.bbox).toEqual([[80, -15, 7], [120, 5, 17]]);
    // The source solid was not touched (it stays valid and in place for the cache and the undo).
    expect(metrics("ex").bbox).toEqual([[-20, -10, 0], [20, 10, 10]]);
    r.dispose();
  });

  it("les opérations suivantes voient le corps à sa nouvelle place", () => {
    const hole = (x: number): Feature => ({ id: "h", type: "hole", name: "Perçage", target: "mv", x, y: 0, diameter: 6, depth: "through" });
    const inPlace = run(doc(...plate(), move([100, 0, 0]), hole(100)));
    expect(inPlace.status("h")).toMatchObject({ state: "ok" });
    expect(inPlace.metrics("h").volume).toBeLessThan(8000);
    inPlace.r.dispose();
    // At the old position there is no longer any material: the kernel refuses the hole.
    const miss = run(doc(...plate(), move([100, 0, 0]), hole(0)));
    expect(miss.status("h")).toMatchObject({ state: "error", message: expect.stringMatching(/ne traverse pas/) });
    miss.r.dispose();
  });

  it("se recalcule quand le déplacement change, sans changer le nom du corps", () => {
    const d = doc(...plate(), move([10, 0, 0]));
    expect(bodyOrigin(d, "mv")).toBe("ex");
    expect(bodyLabel(d, "mv")).toBe("Corps 1");
    const { r, metrics } = run(d);
    expect(metrics("mv").bbox[0][0]).toBe(-10);
    const again = r.recompute(doc(...plate(), move([30, 0, 0])));
    expect(again.statuses.find((s) => s.id === "mv")).toMatchObject({ state: "ok", reused: false });
    expect(bodyMetrics((r.output("mv") as unknown as { shape: Shape3D }).shape).bbox[0][0]).toBe(10);
    r.dispose();
  });

  it("refuse un déplacement nul avec un message clair", () => {
    const { r, status } = run(doc(...plate(), move([0, 0, 0])));
    expect(status("mv")).toMatchObject({ state: "error", message: expect.stringMatching(/déplacement est nul/) });
    r.dispose();
  });
});

describe("enregistrement, suppression et annulation", () => {
  it("se relit à l'identique ; un déplacement mal formé est refusé à l'ouverture", () => {
    const d = doc(...plate(), move([1.5, -2, 3]));
    expect(parseDocument(JSON.parse(JSON.stringify(d))).features.at(-1)).toEqual(d.features.at(-1));
    const bad = (translate: unknown) => JSON.parse(JSON.stringify({ ...d, features: [...plate(), { ...move([1, 0, 0]), translate }] }));
    expect(() => parseDocument(bad([1, 2]))).toThrow(/déplacement invalide/);
    expect(() => parseDocument(bad([1, "2", 3]))).toThrow(/déplacement invalide/);
    expect(() => parseDocument({ ...bad([1, 0, 0]), features: [...plate(), { ...move([1, 0, 0]), target: 3 }] })).toThrow(/corps à déplacer/);
  });

  it("supprimer le déplacement ramène le corps en place et garde les opérations suivantes", () => {
    const d = doc(...plate(), move([50, 0, 0]), { id: "h", type: "hole", name: "Perçage", target: "mv", x: 50, y: 0, diameter: 6, depth: "through" });
    const without = deleteFeature(d, "mv");
    expect(without.features.map((f) => f.id)).toEqual(["sk", "ex", "h"]);
    expect(without.features.at(-1)).toMatchObject({ target: "ex" });
  });

  it("annuler et rétablir restituent l'état exact", () => {
    const before = doc(...plate());
    const after = doc(...plate(), move([5, 5, 5]));
    const stack = new UndoStack();
    stack.push(before);
    const undone = stack.undo(after)!;
    expect(undone).toEqual(before);
    expect(stack.redo(undone)).toEqual(after);
  });
});

describe("repères global et local", () => {
  const near = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i] as number, 9));

  it("le repère d'une face parallèle à un plan principal a des axes principaux", () => {
    expect(faceFrame([0, 0, 1])).toEqual({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
    const front = faceFrame([0, -1, 0]); // face of the XZ plane
    near(front.x, [1, 0, 0]);
    near(front.y, [0, 0, 1]);
    near(front.z, [0, -1, 0]);
  });

  it("le repère d'une face inclinée est orthonormé, direct, et sa normale est l'axe z", () => {
    const n: Vec3 = [0, -Math.SQRT1_2, Math.SQRT1_2];
    const f = faceFrame(n);
    near(f.z, n);
    const d = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(d(f.x, f.y)).toBeCloseTo(0, 9);
    expect(d(f.x, f.z)).toBeCloseTo(0, 9);
    expect(Math.hypot(...f.x)).toBeCloseTo(1, 9);
    // right-handed: x × y = z
    near([f.x[1] * f.y[2] - f.x[2] * f.y[1], f.x[2] * f.y[0] - f.x[0] * f.y[2], f.x[0] * f.y[1] - f.x[1] * f.y[0]], f.z);
  });

  it("local → global → local est l'identité ; le repère global ne change rien", () => {
    const f = faceFrame([0.3, -0.5, 0.8]);
    const v: Vec3 = [12, -4, 7];
    near(toLocal(f, toGlobal(f, v)), v);
    expect(toGlobal(GLOBAL_FRAME, v)).toEqual(v);
    // One unit along the local z is one unit along the face normal.
    near(toGlobal(f, [0, 0, 1]), f.z);
  });
});

describe("manipulateur : glisser le long d'un axe ou dans un plan", () => {
  it("le long d'un axe : le paramètre suit le rayon de la souris", () => {
    // Axis X through the origin; a ray looking down −Z from (5, 3, 10) meets it at x = 5.
    expect(axisParameter([0, 0, 0], [1, 0, 0], [5, 3, 10], [0, 0, -1])).toBeCloseTo(5, 9);
    // A ray parallel to the axis gives nothing: dragging along it is meaningless.
    expect(axisParameter([0, 0, 0], [1, 0, 0], [0, 3, 10], [1, 0, 0])).toBeNull();
  });

  it("dans un plan : le rayon coupe le plan en un point, pas derrière l'œil ni en parallèle", () => {
    const p = rayPlanePoint([0, 0, 2], [0, 0, 1], [4, -1, 10], [0, 0, -1]);
    expect(p).toEqual([4, -1, 2]);
    expect(rayPlanePoint([0, 0, 2], [0, 0, 1], [4, -1, 10], [1, 0, 0])).toBeNull();
    expect(rayPlanePoint([0, 0, 2], [0, 0, 1], [4, -1, 10], [0, 0, 1])).toBeNull(); // plane is behind the eye
  });
});

describe("ce que Déplacer prend selon la sélection", () => {
  const none = { lastFace: undefined, selection: { faces: [], edges: [], vertices: [], bodies: [] } };
  const sketch: Feature = { id: "sk", type: "sketch", name: "E", plane: "XY", offset: 0, points: [], curves: [], constraints: [] };

  it("un corps, une face ou un point désignent le corps ; une esquisse du navigateur sert sinon", () => {
    expect(toolOptions("move", undefined, { ...none, selection: { ...none.selection, bodies: ["ex"] } })).toEqual({ bodies: ["ex"] });
    expect(toolOptions("move", sketch, none)).toEqual({ sketchId: "sk" });
    const vertex = { bodyId: "ex", point: [0, 0, 0] as Vec3 };
    expect(toolOptions("move", undefined, { ...none, selection: { ...none.selection, vertices: [vertex] } })).toEqual({ vertices: [vertex] });
    // The other tools are unchanged by the new kind.
    expect(toolOptions("fillet", sketch, none)).toEqual({});
  });
});
