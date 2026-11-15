/** Un calcul tapé dans un outil : (190+100)/2, 2*70 ; la touche 5 d'un clavier AZERTY, qui donne « ( ». */
import { describe, expect, it } from "vitest";
import { parseTyped as moveTyped } from "../../frontend/src/app/move-keys";
import { evaluateTyped, isCalculation, repairBrackets } from "../../frontend/src/measurements/typed-expression";
import { parseTyped as boxTyped } from "../../frontend/src/sketcher/face-draw";
import { expressionKey } from "../../frontend/src/ui/digit-keys";

const key = (key: string, code = "") => ({ key, code, ctrlKey: false, metaKey: false, altKey: false });

describe("un calcul tapé", () => {
  it("un nombre ou un calcul ; pas fini, il n'est pas pris", () => {
    expect(evaluateTyped("(190+100)/2")).toBe(145);
    expect(evaluateTyped("2*70")).toBe(140);
    expect(evaluateTyped("80-2,5")).toBe(77.5);
    expect(evaluateTyped("2×3÷4")).toBe(1.5);
    expect(evaluateTyped("-12,5")).toBe(-12.5);
    expect(evaluateTyped("(190+")).toBeNull();
    expect(isCalculation("-5")).toBe(false);
    expect(isCalculation("5-2")).toBe(true);
  });

  it("AZERTY : la touche 5 sans Maj donne un 5, qu'une « ) » refait parenthèse", () => {
    expect(expressionKey(key("(", "Digit5"))).toBe("5");
    expect(expressionKey(key("&", "Digit1"))).toBe("1");
    expect(expressionKey(key(")", "Minus"))).toBe(")");
    expect(expressionKey(key("(", "Digit9"))).toBe("(");
    expect(expressionKey(key("e", "KeyE"))).toBeNull();
    expect(repairBrackets("5190+100)/2")).toBe("(190+100)/2");
    expect(repairBrackets("2*5190+100)")).toBe("2*(190+100)");
    expect(repairBrackets("50")).toBe("50");
    expect(evaluateTyped("5190+100)/2")).toBe(145);
  });

  it("Déplacer et la case des mesures prennent un calcul ; les copies gardent leur écriture", () => {
    expect(moveTyped("(190+100)/2", "cm")).toEqual({ kind: "distance", value: 1450 });
    expect(moveTyped("2*70;0;10/2", "mm")).toEqual({ kind: "vector", value: [140, 0, 5] });
    expect(moveTyped("*5", "mm")).toEqual({ kind: "copies", count: 5 });
    expect(moveTyped("/4", "mm")).toEqual({ kind: "divide", count: 4 });
    expect(boxTyped("190 + 100; 20", evaluateTyped)).toEqual([290, 20]);
    expect(boxTyped("120 45", evaluateTyped)).toEqual([120, 45]);
  });
});
