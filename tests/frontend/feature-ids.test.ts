/**
 * Dépendances complètes et restes nettoyés (audit d'architecture du 11/11/2026) : une coupe par la face
 * d'un autre corps dépend de ce corps ; une étape supprimée ne laisse pas son corps dans un dossier.
 */
import { describe, expect, it } from "vitest";
import { deleteFeature } from "../../frontend/src/document/operations";
import { featureInputs, type CadDocument, type SplitFeature } from "../../frontend/src/document/types";

const base: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [] };

describe("dépendances d'une coupe", () => {
  it("par une face d'un autre corps : ce corps en fait partie", () => {
    const split: SplitFeature = { id: "sp1", type: "split", name: "Scission 1", target: "ex1", tool: { kind: "face", body: "ex2", face: { type: "PLANE", center: [0, 0, 0], rel: [0, 0, 0], normal: [0, 0, 1], area: 0 } }, keep: "both" };
    expect(featureInputs(split)).toEqual(["ex1", "ex2"]);
    expect(featureInputs({ ...split, tool: { kind: "plane", plane: "XY", offset: 10 } })).toEqual(["ex1"]);
  });
});

describe("restes d'une étape supprimée", () => {
  it("son corps quitte aussi les dossiers du navigateur : un nouveau corps du même numéro n'y entre pas", () => {
    const doc = {
      ...base,
      features: [{ id: "ex1", type: "extrude", name: "Côté", sketch: "sk1", distance: 18, operation: "new" }],
      folders: [{ id: "d1", name: "Caisson", bodies: ["ex1", "ex9"] }],
    } as unknown as CadDocument;
    expect(deleteFeature(doc, "ex1").folders).toEqual([{ id: "d1", name: "Caisson", bodies: ["ex9"] }]);
  });
});
