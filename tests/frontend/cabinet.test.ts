/** Parametric cabinet: every part is a board of its own, the parts never overlap, and they follow the dimensions. */
import { beforeAll, describe, expect, it } from "vitest";
import { bodyLabel } from "../../frontend/src/document/operations";
import type { CabinetFeature, CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { cabinetParts, cabinetProblem, type CabinetPart } from "../../frontend/src/features/cabinet-parts";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** Kitchen base unit 600 × 720 × 560, 18 mm boards, 3 mm back screwed on, one shelf, 100 mm plinth. */
const base = (over: Partial<CabinetFeature> = {}): CabinetFeature => ({
  id: "cb",
  type: "cabinet",
  name: "Caisson 1",
  origin: [0, 0, 0],
  width: 600,
  height: 720,
  depth: 560,
  thickness: 18,
  back: "applied",
  backThickness: 3,
  shelves: 1,
  plinth: 100,
  construction: "sides-through",
  ...over,
});

const volume = (p: CabinetPart) => (p.to[0] - p.from[0]) * (p.to[1] - p.from[1]) * (p.to[2] - p.from[2]);
const overlapVolume = (a: CabinetPart, b: CabinetPart) =>
  [0, 1, 2].reduce((v, i) => v * Math.max(0, Math.min(a.to[i]!, b.to[i]!) - Math.max(a.from[i]!, b.from[i]!)), 1);
const part = (parts: CabinetPart[], name: string) => parts.find((p) => p.name === name)!;

describe("pièces d'un caisson", () => {
  it("côtés pleine hauteur jusqu'au sol, dessous sur le socle, fond vissé, étagère au milieu", () => {
    const parts = cabinetParts(base());
    expect(parts.map((p) => p.name)).toEqual(["Côté gauche", "Côté droit", "Dessous", "Dessus", "Fond", "Étagère 1"]);
    expect(part(parts, "Côté gauche")).toEqual({ name: "Côté gauche", from: [0, 0, 0], to: [18, 557, 720] });
    expect(part(parts, "Dessous")).toEqual({ name: "Dessous", from: [18, 0, 100], to: [582, 557, 118] });
    expect(part(parts, "Fond")).toEqual({ name: "Fond", from: [0, 557, 100], to: [600, 560, 720] });
    const shelf = part(parts, "Étagère 1");
    expect((shelf.from[2] + shelf.to[2]) / 2).toBeCloseTo((118 + 702) / 2, 9); // centred between bottom and top
  });

  it("aucune matière partagée entre deux pièces, quelle que soit la construction", () => {
    for (const over of [{}, { construction: "top-bottom-through" as const }, { back: "inset" as const, shelves: 3 }, { plinth: 0, back: "none" as const }]) {
      const parts = cabinetParts(base(over));
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) expect(overlapVolume(parts[i]!, parts[j]!)).toBe(0);
    }
  });

  it("dessus et dessous passants : pleine largeur, les côtés entre eux", () => {
    const parts = cabinetParts(base({ construction: "top-bottom-through", plinth: 0 }));
    expect(part(parts, "Dessus").from[0]).toBe(0);
    expect(part(parts, "Dessus").to[0]).toBe(600);
    expect(part(parts, "Côté gauche").from[2]).toBe(18);
    expect(part(parts, "Côté gauche").to[2]).toBe(702);
  });

  it("refuse des cotes impossibles avec une explication", () => {
    expect(cabinetProblem(base({ width: 30 }))).toMatch(/largeur/);
    expect(cabinetProblem(base({ shelves: 1.5 }))).toMatch(/entier/);
    expect(cabinetProblem(base({ height: 150 }))).toMatch(/hauteur/);
    expect(cabinetParts(base({ width: 30 }))).toEqual([]);
  });
});

describe("caisson dans le modèle", () => {
  const doc = (over: Partial<CabinetFeature> = {}): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [base(over)] });

  it("un corps par pièce, de volume exact, nommés par pièce", () => {
    const r = new Recomputer();
    const result = r.recompute(doc());
    expect(result.statuses[0]).toMatchObject({ state: "ok" });
    expect(result.bodies).toHaveLength(6);
    const parts = cabinetParts(base());
    result.bodies.forEach((id, i) => {
      const out = r.output(id);
      if (out?.kind !== "solid") throw new Error("solid expected");
      expect(bodyMetrics(out.shape).volume).toBeCloseTo(volume(parts[i]!), 3);
    });
    expect(bodyLabel(doc(), "cb#0")).toBe("Caisson 1 — Côté gauche");
    expect(bodyLabel(doc(), "cb#5")).toBe("Caisson 1 — Étagère 1");
    r.dispose();
  });

  it("des cotes impossibles donnent une erreur claire ; le document se relit", () => {
    const r = new Recomputer();
    expect(r.recompute(doc({ width: 20 })).statuses[0]).toMatchObject({ state: "error", message: expect.stringMatching(/largeur/) });
    r.dispose();
    const d = doc();
    expect(parseDocument(JSON.parse(JSON.stringify(d))).features[0]).toEqual(d.features[0]);
    const bad = JSON.parse(JSON.stringify(d));
    bad.features[0].back = "colle";
    expect(() => parseDocument(bad)).toThrow(/type de fond/);
  });
});
