/** Plans de construction : décalé, incliné, par trois points ; une esquisse dessus s'extrude au bon endroit. */
import { beforeAll, describe, expect, it } from "vitest";
import type { Shape3D } from "replicad";
import { createReferencePlate, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { frameOf, nearestPlane, planeThrough, tiltedPlane, toWorld } from "../../frontend/src/sketcher/frame";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i] as number, 6));

describe("plans de construction", () => {
  it("un plan XY incliné de 90° autour de son axe x devient vertical, face à −Y", () => {
    const frame = frameOf({ plane: "XY", offset: 0, frame: tiltedPlane("XY", 0, 90, "u") });
    close(frame.normal, [0, -1, 0]);
    close(frame.u, [1, 0, 0]);
    close(frame.v, [0, 0, 1]);
    expect(nearestPlane(frame.normal)).toBe("XZ");
  });

  it("un plan décalé et incliné de 30° garde son origine et une normale tournée", () => {
    const frame = frameOf({ plane: "XY", offset: 0, frame: tiltedPlane("XY", 50, 30, "v") });
    close(frame.origin, [0, 0, 50]);
    close(frame.normal, [0.5, 0, Math.cos(Math.PI / 6)]);
    // The frame stays orthonormal.
    expect(frame.u[0] * frame.normal[0] + frame.u[1] * frame.normal[1] + frame.u[2] * frame.normal[2]).toBeCloseTo(0, 9);
  });

  it("le plan par trois points passe par eux, axe x du premier vers le second ; trois points alignés n'en donnent pas", () => {
    const plane = planeThrough([0, 0, 10], [10, 0, 10], [0, 10, 20])!;
    const frame = frameOf({ plane: "XY", offset: 0, frame: plane });
    close(frame.u, [1, 0, 0]);
    close(toWorld(frame, 10, 0), [10, 0, 10]);
    expect(planeThrough([0, 0, 0], [1, 1, 1], [2, 2, 2])).toBeNull();
  });

  it("une esquisse sur un plan de construction s'extrude à la position et dans l'orientation dessinées", () => {
    const doc = createReferencePlate();
    // The 80 × 50 plate drawn on a plane at z = 100 whose x axis is +Y (so y is −X), moved by 10 along x and 5 along y.
    const sk1 = doc.features[0] as SketchFeature;
    doc.features[0] = { ...sk1, frame: { origin: [0, 0, 100], xDir: [0, 1, 0], normal: [0, 0, 1] }, shift: [10, 5] };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    const recomputer = new Recomputer();
    recomputer.recompute(doc);
    const output = recomputer.output("ex1");
    expect(output?.kind).toBe("solid");
    const box = bodyMetrics((output as { shape: Shape3D }).shape).bbox;
    close(box[0], [-30, -30, 100]);
    close(box[1], [20, 50, 110]);
  });

  it("un plan de construction sans normale est refusé", () => {
    const doc = createReferencePlate();
    doc.features[0] = { ...(doc.features[0] as SketchFeature), frame: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 0] } };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).toThrow(/plan de construction/);
  });
});
