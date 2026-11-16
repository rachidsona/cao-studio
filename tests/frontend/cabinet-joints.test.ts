/** Assemblages percés tout seuls : un caisson qui suit un standard reçoit ses confirmats, tourillons ou excentriques à chaque jonction. */
import { beforeAll, describe, expect, it } from "vitest";
import { modelHardware, CONFIRMAT_SCREW, DOWEL } from "../../frontend/src/document/hardware";
import { jointProblems } from "../../frontend/src/document/hardware-rules";
import { createReferencePlate, type CabinetFeature, type CadDocument, type MachiningFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { autoJointsOf, cabinetJoints, stampCabinetJoints } from "../../frontend/src/features/cabinet-joints";
import { cabinetParts } from "../../frontend/src/features/cabinet-parts";
import { kernelDocument } from "../../frontend/src/geometry/client";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const CABINET: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 870, depth: 560, thickness: 19, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through", standard: "melamine-19" };
const doc = (...features: CadDocument["features"]): CadDocument => ({ ...createReferencePlate(), features });

describe("assemblages automatiques", () => {
  it("chaque jonction du caisson est percée : côtés contre dessous, dessus et étagère, pas le fond mince", () => {
    const joints = cabinetJoints(CABINET, { joint: "confirmat", jointSpacing: 128 });
    const names = cabinetParts(CABINET).map((p) => p.name);
    expect(joints.parts.map((p) => names[p.part])).toEqual(["Côté gauche", "Côté droit", "Dessous", "Dessus", "Étagère 1"]);
    // As many holes in the sides (through the face) as in the edges of the three boards.
    const holes = (name: string) => joints.parts.find((p) => names[p.part] === name)!.ops.length;
    expect(holes("Côté gauche") + holes("Côté droit")).toBe(holes("Dessous") + holes("Dessus") + holes("Étagère 1"));
  });

  it("seulement d'après un standard qui perce lui-même, et jamais en plus d'un assemblage fait à la main", () => {
    expect(autoJointsOf(doc(CABINET), CABINET)).not.toBeNull();
    expect(autoJointsOf(doc({ ...CABINET, standard: "none" }), { ...CABINET, standard: "none" })).toBeNull();
    const manual = { ...createReferencePlate(), standards: [{ ...STANDARD, autoJoints: false }], features: [{ ...CABINET, standard: "mine" }] } as CadDocument;
    expect(autoJointsOf(manual, manual.features[0] as CabinetFeature)).toBeNull();
    const hand: MachiningFeature = { id: "mc1", type: "machining", name: "Confirmat", target: "cb1#0", kind: "confirmat", ops: [{ kind: "hole", at: [9, 100, 300], dir: [1, 0, 0], diameter: 7, depth: 19 }] };
    expect(autoJointsOf(doc(CABINET, hand), CABINET)).toBeNull();
  });

  it("recopiés pour le noyau seulement, comptés au devis", () => {
    const made = doc(CABINET);
    expect(made.features[0]).not.toHaveProperty("joints");
    expect((stampCabinetJoints(made).features[0] as CabinetFeature).joints?.length).toBe(5);
    expect(() => parseDocument(made)).not.toThrow();
    const screws = modelHardware(made).find((h) => h.name === CONFIRMAT_SCREW)?.quantity ?? 0;
    expect(screws).toBeGreaterThan(8);
    const dowels = doc({ ...CABINET, standard: "melamine-16" });
    expect(modelHardware(dowels).find((h) => h.name === DOWEL)?.quantity ?? 0).toBeGreaterThan(8);
  });

  it("le contrôle avant fabrication les voit : plus de jonction « sans assemblage », caisson tourné compris", () => {
    for (const rotation of [0, 90] as const) {
      const cabinet = { ...CABINET, rotation };
      const a = (rotation * Math.PI) / 180;
      const turn = ([x, y, z]: number[]) => [x! * Math.cos(a) - y! * Math.sin(a), x! * Math.sin(a) + y! * Math.cos(a), z!];
      const boards = cabinetParts(cabinet).map((p, i) => {
        const [u, v] = [turn(p.from), turn(p.to)];
        return { id: `cb1#${i}`, box: [[0, 1, 2].map((k) => Math.min(u[k]!, v[k]!)), [0, 1, 2].map((k) => Math.max(u[k]!, v[k]!))] as [[number, number, number], [number, number, number]] };
      });
      expect(jointProblems(doc(cabinet), boards)).toEqual([]);
      expect(jointProblems(doc({ ...cabinet, standard: "none" }), boards).length).toBeGreaterThan(0);
    }
  });

  it("le noyau perce les planches, tournées avec leur caisson", () => {
    for (const rotation of [0, 90] as const) {
      const r = new Recomputer();
      const plain = r.recompute(doc({ ...CABINET, standard: "none", rotation }));
      expect(plain.statuses.every((s) => s.state === "ok")).toBe(true);
      const solid = (r.output("cb1#0") as { shape: Parameters<typeof bodyMetrics>[0] }).shape;
      const full = bodyMetrics(solid).volume;
      const r2 = new Recomputer();
      const drilled = r2.recompute(kernelDocument(doc({ ...CABINET, rotation })));
      expect(drilled.statuses.every((s) => s.state === "ok"), JSON.stringify(drilled.statuses)).toBe(true);
      const side = bodyMetrics((r2.output("cb1#0") as { shape: Parameters<typeof bodyMetrics>[0] }).shape);
      expect(side.volume).toBeLessThan(full - 1000);
      expect(side.bbox).toEqual(bodyMetrics(solid).bbox);
    }
  });
});

const STANDARD = { id: "mine", name: "À la main", thickness: 19, back: "applied" as const, backThickness: 3, construction: "sides-through" as const, frontMount: "overlay" as const, frontGap: 3, frontThickness: 19, band: 1, bandTrim: 1, joint: "confirmat" as const, jointSpacing: 128 };
