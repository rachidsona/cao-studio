import { beforeAll, describe, expect, it } from "vitest";
import { canonicalJson, sameDocument } from "../../frontend/src/document/canonical";
import { addHole, addPlate, deleteFeature, deleteFeatures, dependentsOf, featuresOfPick, isRemovedBody, latestBody, removePieces } from "../../frontend/src/document/operations";
import * as THREE from "three";
import { deletionOf, deletionQuestion } from "../../frontend/src/app/delete-selection";
import { parseDocument } from "../../frontend/src/document/validate";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument } from "../../frontend/src/document/types";
import { createReferencePlate } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { formatLength, fromDisplay, parseNumber, toDisplay } from "../../frontend/src/measurements/units";
import { gridStepFor } from "../../frontend/src/viewport/grid";
import { setupKernel } from "./kernel-setup";

describe("opérations sur l'historique", () => {
  beforeAll(setupKernel);

  it("ajoute un perçage enchaîné sur le dernier corps sans modifier l'original", () => {
    const doc = createReferencePlate();
    const next = addHole(doc, "h1", 20, 10, 6);
    expect(doc.features).toHaveLength(3);
    expect(next.features[3]).toMatchObject({ id: "h2", target: "h1", x: 20, y: 10, diameter: 6, name: "Perçage 2" });
    expect(latestBody(next, "ex1")).toBe("h2");
    expect(validateDocument(next)).toEqual([]);

    const recomputer = new Recomputer();
    const result = recomputer.recompute(next);
    expect(result.bodies).toEqual(["h2"]);
    const output = recomputer.output("h2");
    if (output?.kind !== "solid") throw new Error("solid expected");
    expect(bodyMetrics(output.shape).volume).toBeCloseTo(40000 - Math.PI * 250 - Math.PI * 90, 6);
    recomputer.dispose();
  });

  it("supprime un perçage intermédiaire en reliant les suivants au corps précédent", () => {
    const doc = addHole(createReferencePlate(), "h1", 20, 10);
    const next = deleteFeature(doc, "h1");
    expect(next.features.map((f) => f.id)).toEqual(["sk1", "ex1", "h2"]);
    expect(next.features[2]).toMatchObject({ target: "ex1" });
  });

  it("supprime en cascade les opérations qui dépendent d'une esquisse", () => {
    const doc = createReferencePlate();
    expect(dependentsOf(doc, "sk1")).toEqual(["ex1", "h1"]);
    expect(deleteFeature(doc, "sk1").features).toEqual([]);
  });

  it("ajoute une plaque comme nouveau corps indépendant", () => {
    const next = addPlate(createReferencePlate(), 30, 20, 5);
    expect(next.features.slice(3).map((f) => [f.id, f.type])).toEqual([
      ["sk2", "sketch"],
      ["ex2", "extrude"],
    ]);
    const recomputer = new Recomputer();
    expect(recomputer.recompute(next).bodies).toEqual(["h1", "ex2"]);
    recomputer.dispose();
  });
});

describe("supprimer la sélection (corps et esquisses)", () => {
  /** The reference plate (sk1 → ex1, drilled by h1, then h2), a free sketch sk9, and a cabinet cb1 of several parts. */
  const doc = (): CadDocument => {
    const base = addHole(createReferencePlate(), "ex1", 20, 10, 6);
    return {
      ...base,
      features: [
        ...base.features,
        { id: "sk9", type: "sketch", name: "Libre", plane: "XY", offset: 0, points: [], curves: [], constraints: [] },
        { id: "cb1", type: "cabinet", name: "Caisson 1", origin: [0, 0, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "none", backThickness: 3, shelves: 0, plinth: 0, construction: "sides-through" },
      ],
    };
  };

  it("un corps supprime l'opération qui l'a créé ; une pièce part seule, son opération reste", () => {
    expect(featuresOfPick(doc(), ["h2"], ["sk9"])).toEqual({ ids: ["ex1", "sk9"], pieces: [] });
    expect(featuresOfPick(doc(), ["cb1#1", "cb1#2"], [])).toEqual({ ids: [], pieces: ["cb1#1", "cb1#2"] });
    const without = removePieces(doc(), ["cb1#2"]);
    expect(without.features.map((f) => f.id)).toContain("cb1");
    expect(isRemovedBody(without, "cb1#2")).toBe(true);
    expect(isRemovedBody(without, "cb1#1")).toBe(false);
    expect(() => parseDocument(JSON.parse(JSON.stringify(without)))).not.toThrow();
    expect(deletionQuestion(doc(), deletionOf(doc(), { bodies: ["cb1#2"] }))).toBeNull();
  });

  it("plusieurs à la fois, en une seule fois ; les opérations qui en dépendent partent avec", () => {
    const { next, lost } = deleteFeatures(doc(), ["ex1", "sk9", "cb1"]);
    expect(next.features.map((f) => f.id)).toEqual(["sk1"]);
    expect(lost).toEqual(["h1", "h2"]); // the holes go with the plate (one confirmation lists them)
  });

  it("Suppr sur une face supprime son corps entier (en le demandant) ; sur des traits d'esquisse, les enlève de l'esquisse", () => {
    const base = doc();
    const withRect: CadDocument = { ...base, features: base.features.map((f) => (f.id === "sk9" ? { ...f, ...rectangleAt(50, 25, 100, 50) } : f)) };
    const face = deletionOf(withRect, { faces: [{ bodyId: "h2", faceIndex: 0, point: new THREE.Vector3() }] });
    expect(face.features).toEqual(["ex1"]);
    expect(face.implied).toEqual(["h2"]);
    expect(deletionQuestion(withRect, face)).toContain("le corps entier");
    const sketch = withRect.features.find((f) => f.id === "sk9");
    if (sketch?.type !== "sketch") throw new Error("sketch expected");
    const line = sketch.curves[0]!.id;
    const lines = deletionOf(withRect, { sketch: [{ sketchId: "sk9", kind: "curve", id: line, points: [] }, { sketchId: "sk9", kind: "region", id: "0", points: [] }] });
    expect(lines.features).toEqual([]);
    expect(lines.edits[0]?.curves.map((c) => c.id)).not.toContain(line);
    expect(lines.edits[0]?.curves).toHaveLength(sketch.curves.length - 1);
    expect(lines.skipped).toBe(1);
    expect(deletionQuestion(withRect, lines)).toBeNull();
  });
});

describe("unités et saisie", () => {
  it("convertit sans perte les unités d'affichage", () => {
    expect(fromDisplay(toDisplay(80, "in"), "in")).toBeCloseTo(80, 12);
    expect(toDisplay(25.4, "in")).toBe(1);
    expect(formatLength(1234.5, "m")).toBe("1,2345 m");
  });

  it("accepte la virgule décimale et refuse les saisies invalides", () => {
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber(" -3.25 ")).toBe(-3.25);
    expect(parseNumber("1e3")).toBe(1000);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("12mm")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});

describe("utilitaires", () => {
  it("compare les documents indépendamment de l'ordre des clés", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    const doc = createReferencePlate();
    const reordered = JSON.parse(canonicalJson(doc));
    expect(sameDocument(doc, reordered)).toBe(true);
  });

  it("adapte le pas de la grille au zoom", () => {
    expect(gridStepFor(200)).toBe(10);
    expect(gridStepFor(20)).toBe(1);
    expect(gridStepFor(2000)).toBe(100);
  });
});

describe("supprimer une seule pièce", () => {
  it("le dessus d'un caisson part seul : les autres pièces restent dans le modèle", async () => {
    const { setupKernel } = await import("./kernel-setup");
    await setupKernel();
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const cabinet = { id: "cb1", type: "cabinet" as const, name: "Caisson", origin: [0, 0, 0] as [number, number, number], width: 600, height: 720, depth: 560, thickness: 18, back: "applied" as const, backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" as const };
    const doc = { ...createReferencePlate(), features: [cabinet] };
    const all = new Recomputer().recompute(doc).bodies;
    const without = new Recomputer().recompute(removePieces(doc, ["cb1#3"])).bodies;
    expect(all).toContain("cb1#3");
    expect(without).not.toContain("cb1#3");
    expect(without).toHaveLength(all.length - 1);
  });
});
