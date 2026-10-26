/** Named parameters: the formula parser, parameters built on other parameters, and the numbers formulas drive. */
import { describe, expect, it } from "vitest";
import { applyExpressions, evaluate, ExpressionError, namesIn, nameProblem, numericFields, parameterUsage, resolveParameters } from "../../frontend/src/document/expressions";
import type { CabinetFeature, CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

const cabinet = (extra: Partial<CabinetFeature> = {}): CabinetFeature => ({ id: "cb1", type: "cabinet", name: "Caisson 1", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 2, plinth: 0, construction: "sides-through", ...extra });
const doc = (parameters: CadDocument["parameters"], feature: CabinetFeature = cabinet()): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters, features: [feature] });

describe("formules", () => {
  it("opérations, priorités, parenthèses, puissance et signe", () => {
    expect(evaluate("2 + 3 * 4", {})).toBe(14);
    expect(evaluate("(2 + 3) * 4", {})).toBe(20);
    expect(evaluate("2 ^ 3 ^ 2", {})).toBe(512);
    expect(evaluate("-3 + 10 / 4", {})).toBe(-0.5);
    expect(evaluate("12,5 * 2", {})).toBe(25);
  });

  it("paramètres, constante pi et fonctions (arguments séparés par ;)", () => {
    const scope = { largeur: 600, ep: 18 };
    expect(evaluate("largeur - 2 * ep", scope)).toBe(564);
    expect(evaluate("max(ep; 20) + min(1; 2; 3)", scope)).toBe(21);
    expect(evaluate("round(largeur / 7)", scope)).toBe(86);
    expect(evaluate("pi * 2", scope)).toBeCloseTo(6.283185, 5);
  });

  it("des messages clairs pour les erreurs", () => {
    expect(() => evaluate("largeur * 2", {})).toThrow(/n'est pas un paramètre connu/);
    expect(() => evaluate("3 / 0", {})).toThrow(/Division par zéro/);
    expect(() => evaluate("3 +", {})).toThrow(ExpressionError);
    expect(() => evaluate("(3", {})).toThrow(/« \) » attendu/);
    expect(() => evaluate("3 $ 4", {})).toThrow(/Caractère inattendu/);
    expect(() => evaluate("   ", {})).toThrow(/vide/);
  });

  it("noms utilisés par une formule, et noms de paramètres permis", () => {
    expect(namesIn("largeur - max(ep; pi) * 2")).toEqual(["largeur", "ep"]);
    expect(nameProblem("épaisseur_1")).toBeNull();
    expect(nameProblem("1a")).not.toBeNull();
    expect(nameProblem("max")).toMatch(/réservé/);
  });
});

describe("paramètres", () => {
  it("un paramètre peut être une formule d'autres paramètres, dans n'importe quel ordre", () => {
    const { values, errors } = resolveParameters({ interieur: { value: 0, unit: "mm", expression: "largeur - 2 * ep" }, largeur: { value: 600, unit: "mm" }, ep: { value: 18, unit: "mm" } });
    expect(errors).toEqual({});
    expect(values.interieur).toBe(564);
  });

  it("un cycle est signalé, sans bloquer les autres", () => {
    const { values, errors } = resolveParameters({ a: { value: 0, unit: "mm", expression: "b + 1" }, b: { value: 0, unit: "mm", expression: "a + 1" }, c: { value: 5, unit: "mm" } });
    expect(Object.keys(errors).sort()).toEqual(["a", "b"]);
    expect(values.c).toBe(5);
  });
});

describe("liens avec les fonctions", () => {
  it("les champs numériques d'une fonction, vecteurs compris", () => {
    const fields = numericFields(cabinet()).map((f) => f.path);
    expect(fields).toEqual(expect.arrayContaining(["width", "height", "thickness", "shelves", "origin.0", "origin.2"]));
  });

  it("changer un paramètre met à jour les nombres liés ; le reste est intact", () => {
    const linked = cabinet({ expressions: { width: "largeur", thickness: "ep", shelves: "etageres", height: "hauteur - socle" } });
    const params = { largeur: { value: 800, unit: "mm" as const }, ep: { value: 19, unit: "mm" as const }, etageres: { value: 3.4, unit: "" as const }, hauteur: { value: 2100, unit: "mm" as const }, socle: { value: 100, unit: "mm" as const } };
    const { doc: next, errors } = applyExpressions(doc(params, linked));
    expect(errors).toEqual([]);
    const f = next.features[0] as CabinetFeature;
    expect([f.width, f.thickness, f.shelves, f.height, f.depth]).toEqual([800, 19, 3, 2000, 560]);
    expect(applyExpressions(next).doc).toBe(next);
  });

  it("une formule qui échoue est signalée et laisse son nombre", () => {
    const linked = cabinet({ expressions: { width: "inconnu * 2" } });
    const { doc: next, errors } = applyExpressions(doc({}, linked));
    expect(errors).toEqual([{ featureId: "cb1", path: "width", message: expect.stringContaining("inconnu") }]);
    expect((next.features[0] as CabinetFeature).width).toBe(600);
  });

  it("qui utilise un paramètre", () => {
    const linked = cabinet({ expressions: { width: "largeur", depth: "largeur / 2" } });
    const d = doc({ largeur: { value: 600, unit: "mm" }, moitie: { value: 0, unit: "mm", expression: "largeur / 2" } }, linked);
    expect(parameterUsage(d, "largeur")).toEqual(["Caisson 1 (width)", "Caisson 1 (depth)", "paramètre moitie"]);
    expect(parameterUsage(d, "moitie")).toEqual([]);
  });

  it("le document garde ses paramètres et formules à l'aller-retour ; un nom invalide est refusé", () => {
    const d = doc({ largeur: { value: 600, unit: "mm" } }, cabinet({ expressions: { width: "largeur" } }));
    expect(parseDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const bad = JSON.parse(JSON.stringify(d));
    bad.parameters["1x"] = { value: 1, unit: "mm" };
    expect(() => parseDocument(bad)).toThrow(/Paramètre/);
    const worse = JSON.parse(JSON.stringify(d));
    worse.features[0].expressions = { width: 5 };
    expect(() => parseDocument(worse)).toThrow(/formules invalides/);
  });
});
