import { describe, expect, it } from "vitest";
import { evaluateExpression } from "../../frontend/src/measurements/expression";

describe("expressions de cotes", () => {
  it("utilise l'unité par défaut pour les nombres seuls", () => {
    expect(evaluateExpression("240", "cm")).toBe(2400);
    expect(evaluateExpression("12,5", "mm")).toBe(12.5);
  });

  it("mélange les unités et les opérations", () => {
    expect(evaluateExpression("1 m + 20 cm", "mm")).toBe(1200);
    expect(evaluateExpression("2×120", "cm")).toBe(2400);
    expect(evaluateExpression("(80 − 2,5) ÷ 2", "mm")).toBe(38.75);
    expect(evaluateExpression("80 cm / 2", "mm")).toBe(400);
    expect(evaluateExpression("-(10 - 4)", "mm")).toBe(-6);
    expect(evaluateExpression('1"', "mm")).toBe(25.4);
  });

  it("évalue les angles en degrés", () => {
    expect(evaluateExpression("45", "deg")).toBe(45);
    expect(evaluateExpression("90 deg / 2", "deg")).toBe(45);
  });

  it("refuse les saisies invalides avec un message", () => {
    expect(() => evaluateExpression("", "mm")).toThrow(/valeur/);
    expect(() => evaluateExpression("12 km", "mm")).toThrow(/Unité inconnue/);
    expect(() => evaluateExpression("(3 + 2", "mm")).toThrow(/Parenthèse/);
    expect(() => evaluateExpression("4 / 0", "mm")).toThrow(/zéro/);
    expect(() => evaluateExpression("alert(1)", "mm")).toThrow();
  });
});
