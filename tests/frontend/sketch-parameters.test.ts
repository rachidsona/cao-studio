/** Les paramètres nommés pilotent aussi les cotes d'une esquisse : « largeur / 2 » sur une cote, l'esquisse suit. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver } from "../../frontend/src/constraints/solver";
import { applyExpressions, numericFields, parameterUsage } from "../../frontend/src/document/expressions";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import type { CadDocument, SketchFeature } from "../../frontend/src/document/types";
import { fieldLabel } from "../../frontend/src/app/parameters";

beforeAll(() => initSolver());

const sketch = (expressions?: Record<string, string>): SketchFeature => ({ id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XY", offset: 0, ...centeredRectangle(800, 500), ...(expressions ? { expressions } : {}) }) as SketchFeature;
const doc = (feature: SketchFeature): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: { largeur: { value: 1200, unit: "mm" }, profondeur: { value: 600, unit: "mm" } }, features: [feature] }) as CadDocument;

describe("paramètres dans les cotes d'esquisse", () => {
  it("les cotes d'une esquisse se lient, avec leur nom", () => {
    const f = sketch();
    expect(numericFields(f)).toEqual([
      { path: "cote:d1", value: 800 },
      { path: "cote:d2", value: 500 },
    ]);
    expect(fieldLabel("cote:d1", f)).toBe("Longueur");
  });

  it("une formule fixe la cote, et l'esquisse est résolue à nouveau : ses points suivent", () => {
    const { doc: next, errors } = applyExpressions(doc(sketch({ "cote:d1": "largeur", "cote:d2": "profondeur / 2" })));
    expect(errors).toEqual([]);
    const f = next.features[0] as SketchFeature;
    expect(f.constraints.find((c) => c.id === "d1")).toMatchObject({ value: 1200 });
    expect(f.constraints.find((c) => c.id === "d2")).toMatchObject({ value: 300 });
    const xs = f.points.map((p) => p.x);
    const ys = f.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1200, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(300, 6);
    expect(parameterUsage(next, "largeur")).toEqual(["Esquisse 1 (cote:d1)"]);
  });

  it("une cote disparue de l'esquisse est signalée, rien ne change", () => {
    const { errors } = applyExpressions(doc(sketch({ "cote:d9": "largeur" })));
    expect(errors[0]?.message).toMatch(/plus dans l'esquisse/);
  });
});
