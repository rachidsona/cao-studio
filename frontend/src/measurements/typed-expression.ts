/**
 * Un nombre tapé au clavier dans un outil — dans un champ, dans la case des mesures, ou sans rien cliquer — peut être un
 * calcul : (190+100)/2, 2*70, 80-2,5 (+ − × ÷ et parenthèses, measurements/expression.ts). Sur un clavier AZERTY, la
 * touche 5 sans Maj donne « ( » : elle compte pour un 5 tant qu'aucune « ) » ne vient la refermer. Pur.
 */
import { evaluateExpression, type ExpressionUnit } from "./expression";
import { parseNumber } from "./units";

/** The signs of a calculation, as they may be typed. */
export const CALCULATION_SIGNS = /^[-+*/()×÷]$/;

/** Whether a text is a calculation (not a plain number, a negative one included). */
export const isCalculation = (text: string): boolean => /[+*/×÷()]/.test(text) || /[\d)]\s*-/.test(text);

/**
 * A « ) » with no « ( » before it: the 5 typed where a bracket opens (at the start, after a sign or a bracket) was the
 * AZERTY « ( » key — it is one again, the nearest one before the « ) ».
 */
export function repairBrackets(text: string): string {
  let out = text;
  for (let guard = 0; guard < 20; guard++) {
    let depth = 0;
    let lonely = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === "(") depth++;
      else if (out[i] === ")") {
        if (depth === 0) {
          lonely = i;
          break;
        }
        depth--;
      }
    }
    if (lonely < 0) return out;
    const opener = [...out.slice(0, lonely)].map((c, i) => ({ c, i })).reverse().find(({ c, i }) => c === "5" && (i === 0 || /[-+*/×÷(;\s]/.test(out[i - 1]!)));
    if (!opener) return out;
    out = `${out.slice(0, opener.i)}(${out.slice(opener.i + 1)}`;
  }
  return out;
}

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
