/** Ma bibliothèque : un module garde les pièces choisies et ce dont elles dépendent ; inséré, il prend des ids neufs. */
import { describe, expect, it } from "vitest";
import { dependencies, insertModule, moduleOf } from "../../frontend/src/document/library";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function furniture(): CadDocument {
  const record = partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], 400);
  const step = { ...record.step!, doors: { gap: 3, thickness: 18, handles: true } };
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "Esquisse 9", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base = createReferencePlate();
  const doc = syncPartitionDoors({ ...base, features: [...base.features, sketch] }, "sk9");
  const doors = doc.features.find((f) => f.type === "niche")!;
  return {
    ...doc,
    parameters: { ep: { value: 18, unit: "mm" }, jeu: { value: 3, unit: "mm", expression: "ep / 6" }, autre: { value: 1, unit: "" } },
    features: doc.features.map((f) => (f.id === doors.id ? { ...f, expressions: { gap: "jeu" } } : f)),
    bodyInfo: { [`${doors.id}#0`]: { material: "mdf" }, ex1: { material: "oak" } },
    bodyNames: { [`${doors.id}#1`]: "Porte droite" },
  };
}

describe("ma bibliothèque", () => {
  it("garde les pièces choisies, ce dont elles dépendent, leurs matières et les paramètres de leurs formules", () => {
    const doc = furniture();
    const doors = doc.features.find((f): f is NicheFeature => f.type === "niche")!;
    expect(dependencies(doc, doors)).toEqual(["sk9"]);
    const module = moduleOf(doc, [`${doors.id}#0`]);
    if (typeof module === "string") throw new Error(module);
    expect(module.features.map((f) => f.id)).toEqual(["sk9", doors.id]);
    expect(Object.keys(module.parameters).sort()).toEqual(["ep", "jeu"]);
    expect(module.bodyInfo).toEqual({ [`${doors.id}#0`]: { material: "mdf" } });
    expect(module.bodyNames).toEqual({ [`${doors.id}#1`]: "Porte droite" });
    expect(() => parseDocument(JSON.parse(JSON.stringify(module)))).not.toThrow();
    expect(typeof moduleOf(doc, [])).toBe("string");
  });

  it("s'insère sous des ids neufs, les références, noms et matières suivant ; les paramètres du projet gardent leur valeur", () => {
    const doc = furniture();
    const doors = doc.features.find((f): f is NicheFeature => f.type === "niche")!;
    const module = moduleOf(doc, [`${doors.id}#0`]) as CadDocument;
    const target: CadDocument = { ...doc, parameters: { ...doc.parameters, ep: { value: 19, unit: "mm" } } };
    const { doc: next, features } = insertModule(target, module);
    expect(features).toHaveLength(2);
    const [sketchId, doorsId] = features as [string, string];
    expect(sketchId).not.toBe("sk9");
    expect(doorsId).not.toBe(doors.id);
    const copy = next.features.find((f) => f.id === doorsId) as NicheFeature;
    expect(copy.sketch).toBe(sketchId);
    expect(copy.partition).toBe(doors.partition);
    expect(copy.name).not.toBe(doors.name);
    expect(next.features.find((f) => f.id === sketchId)!.name).toBe("Esquisse 2");
    expect(next.bodyInfo?.[`${doorsId}#0`]).toEqual({ material: "mdf" });
    expect(next.bodyNames?.[`${doorsId}#1`]).toBe("Porte droite");
    expect(next.parameters.ep!.value).toBe(19);
    expect(next.features).toHaveLength(doc.features.length + 2);
    expect(() => parseDocument(JSON.parse(JSON.stringify(next)))).not.toThrow();
  });
});
