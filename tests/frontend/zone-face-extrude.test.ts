/** Une face d'étagère de coin de dressing extrudée : le noyau la tire, et la vue isolée de la zone garde l'étagère. */
import { beforeAll, describe, expect, it } from "vitest";
import { staysInView, type Keep } from "../../frontend/src/app/zone-members";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument, ExtrudeFeature, Feature, FaceRef } from "../../frontend/src/document/types";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeFace } from "../../frontend/src/geometry/references";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

const doc = (...features: Feature[]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features });

/** The corner of an L plan cut at an angle (as « Plan — angle droit » makes it), and a shelf of its Répartition. */
const corner: Feature = { id: "skC", type: "sketch", name: "Plan — angle droit", plane: "XZ", offset: 0, ...rectangleAt(2000, 2061, 940, 18) };
const shelf: ExtrudeFeature = { id: "ex1", type: "extrude", name: "Étagère 1", sketch: "skC", distance: 1000, operation: "new", clip: [[2500, 0], [1500, 0], [1500, -600], [1870, -970], [2500, -970]] };
const wall: Feature = { id: "skA", type: "sketch", name: "Plan — mur a", plane: "XZ", offset: 0, ...rectangleAt(500, 1000, 900, 18) };
const other: ExtrudeFeature = { id: "ex9", type: "extrude", name: "Étagère 9", sketch: "skA", distance: 600, operation: "new" };
const pulled = (id: string, target: string, operation: ExtrudeFeature["operation"], face: FaceRef): ExtrudeFeature => ({ id, type: "extrude", name: id, faces: [face], target, distance: 30, operation });
/** The zone's rule (app/zone-view.ts, isolateZone): what its Répartition extrudes. */
const zone: Keep = (f) => f.type === "extrude" && f.sketch === "skC";
const face: FaceRef = { type: "PLANE", center: [2170, -970, 2061], rel: [0.5, 0, 0.5], normal: [0, -1, 0], area: 0 };

describe("vue isolée d'une zone : un corps tiré d'une face d'étagère reste avec elle", () => {
  it("joindre : l'étagère extrudée reste ; nouveau corps : il reste aussi ; le corps d'un autre mur non", () => {
    const d = doc(corner, shelf, wall, other, pulled("ex2", "ex1", "join", face), pulled("ex3", "ex2", "new", face), pulled("ex4", "ex9", "new", face));
    expect(staysInView(d, "ex2", zone)).toBe(true);
    expect(staysInView(d, "ex3", zone)).toBe(true);
    expect(staysInView(d, "ex9", zone)).toBe(false);
    expect(staysInView(d, "ex4", zone)).toBe(false);
  });

  it("lu dans le document montré : le corps de l'aperçu n'existe pas encore dans le document enregistré", () => {
    const saved = doc(corner, shelf);
    const preview = doc(corner, shelf, pulled("ex2", "ex1", "join", face));
    expect(staysInView(saved, "ex2", zone)).toBe(false);
    expect(staysInView(preview, "ex2", zone)).toBe(true);
  });
});

describe("le noyau tire la face avant d'une étagère d'angle coupée en biais", () => {
  beforeAll(setupKernel);

  it("3 cm joints : l'étagère grandit de son chant × 3 cm et reste un seul corps", () => {
    const r = new Recomputer();
    try {
      r.recompute(doc(corner, shelf));
      const out = r.output("ex1");
      if (out?.kind !== "solid") throw new Error("étagère attendue");
      const before = bodyMetrics(out.shape).volume;
      const front = out.shape.faces.find((f) => f.geomType === "PLANE" && f.normalAt(f.center).y < -0.99);
      if (!front) throw new Error("face avant attendue");
      const ref = describeFace(out.shape, front);
      expect(ref.center[1]).toBeCloseTo(-970, 3);
      const result = r.recompute(doc(corner, shelf, { ...pulled("ex2", "ex1", "join", ref), distance: 30 }));
      expect(result.statuses.find((s) => s.id === "ex2")?.state).toBe("ok");
      expect(result.bodies).toEqual(["ex2"]);
      const after = r.output("ex2");
      if (after?.kind !== "solid") throw new Error("un seul corps attendu");
      // The front of the shelf, between the slanted cut and the right side: 600 mm long, 18 mm thick.
      expect(bodyMetrics(after.shape).volume - before).toBeCloseTo(600 * 18 * 30, 0);
    } finally {
      r.dispose();
    }
  });
});
