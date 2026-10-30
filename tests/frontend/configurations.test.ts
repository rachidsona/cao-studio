/** Configurations : variantes nommées des paramètres, appliquées et reconnues. */
import { describe, expect, it } from "vitest";
import { activeConfiguration, applyConfiguration, removeConfiguration, saveConfiguration, updateConfiguration } from "../../frontend/src/document/configurations";
import { applyExpressions } from "../../frontend/src/document/expressions";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

const withParams = (largeur: number): CadDocument => ({
  ...createReferencePlate(),
  parameters: { largeur: { value: largeur, unit: "mm" }, ep: { value: 18, unit: "mm" }, interieur: { value: 0, unit: "mm", expression: "largeur - 2 * ep" } },
});

describe("configurations", () => {
  it("enregistre, applique et reconnaît la variante active", () => {
    const small = saveConfiguration(withParams(600), "Petit");
    expect(small.doc.configurations![0]!.values).toEqual({ largeur: 600, ep: 18 });
    expect(activeConfiguration(small.doc)).toBe(small.id);
    const wide = { ...small.doc, parameters: { ...small.doc.parameters, largeur: { value: 900, unit: "mm" as const } } };
    expect(activeConfiguration(wide)).toBeUndefined();
    const big = saveConfiguration(wide, "Petit");
    expect(big.doc.configurations!.map((c) => c.name)).toEqual(["Petit", "Petit 2"]);
    const back = applyExpressions(applyConfiguration(big.doc, small.id)).doc;
    expect(back.parameters.largeur!.value).toBe(600);
    expect(back.parameters.interieur!.value).toBe(564);
    expect(activeConfiguration(back)).toBe(small.id);
    expect(() => parseDocument(JSON.parse(JSON.stringify(back)))).not.toThrow();
  });

  it("se met à jour et se supprime", () => {
    const saved = saveConfiguration(withParams(600), "A");
    const changed = { ...saved.doc, parameters: { ...saved.doc.parameters, ep: { value: 19, unit: "mm" as const } } };
    expect(updateConfiguration(changed, saved.id).configurations![0]!.values.ep).toBe(19);
    expect(removeConfiguration(changed, saved.id).configurations).toEqual([]);
  });

  it("refuse une configuration mal formée", () => {
    expect(() => parseDocument({ ...withParams(600), configurations: [{ id: "cf1", name: "x", values: { a: "1" } }] })).toThrow();
  });
});
