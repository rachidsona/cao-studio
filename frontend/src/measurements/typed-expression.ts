/**
 * Un nombre tapé au clavier dans un outil — dans un champ, dans la case des mesures, ou sans rien cliquer — peut être un
 * calcul : (190+100)/2, 2*70, 80-2,5 (+ − × ÷ et parenthèses, measurements/expression.ts). Sur un clavier AZERTY, la
 * touche 5 sans Maj donne « ( » : elle compte pour un 5 tant qu'aucune « ) » ne vient la refermer. Pur.
 */
import { evaluateExpression, repairBrackets, type ExpressionUnit } from "./expression";
export { repairBrackets };
import { parseNumber } from "./units";

/** The signs of a calculation, as they may be typed. */
export const CALCULATION_SIGNS = /^[-+*/()×÷]$/;

/** Whether a text is a calculation (not a plain number, a negative one included). */
export const isCalculation = (text: string): boolean => /[+*/×÷()]/.test(text) || /[\d)]\s*-/.test(text);


/**
 * The value of a number or a calculation typed, in the field's own terms (`unit` "mm": the numbers as they are, in
 * whatever unit the field counts); null when it is not whole yet or not a value.
 */
export function evaluateTyped(text: string, unit: ExpressionUnit = "mm"): number | null {
  const t = text.trim();
  if (!t) return null;
  if (!isCalculation(t)) return parseNumber(t);
  try {
    const v = evaluateExpression(repairBrackets(t), unit);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
