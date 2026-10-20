/**
 * Safe evaluation of dimension expressions typed by the user, such as
 * "240", "1 m + 20 cm", "2×120", "(80 - 2,5) / 2" or "45 deg".
 * Numbers without a unit are in the default unit. No `eval`: a small
 * recursive-descent parser over + − × ÷ and parentheses.
 */
import type { DisplayUnit } from "../document/types";
import { MM_PER_UNIT } from "./units";

export type ExpressionUnit = DisplayUnit | "deg";

const LENGTH_UNITS: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, po: 25.4, '"': 25.4 };
const ANGLE_UNITS: Record<string, number> = { deg: 1, "°": 1 };

type Token = { kind: "num"; value: number } | { kind: "unit"; value: string } | { kind: "op"; value: string };

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const src = text.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.,]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.,]/.test(src[j] as string)) j++;
      const raw = src.slice(i, j).replace(",", ".");
      if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) throw new ExpressionError(`Nombre invalide « ${src.slice(i, j)} ».`);
      tokens.push({ kind: "num", value: Number(raw) });
      i = j;
    } else if (/[a-z°"]/i.test(ch)) {
      let j = i;
      while (j < src.length && /[a-z°"]/i.test(src[j] as string)) j++;
      tokens.push({ kind: "unit", value: src.slice(i, j).toLowerCase() });
      i = j;
    } else if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
    } else {
      throw new ExpressionError(`Caractère inattendu « ${ch} ».`);
    }
  }
  return tokens;
}

/** Evaluates `text`; the result is in mm (lengths) or degrees (angles). */
export function evaluateExpression(text: string, defaultUnit: ExpressionUnit): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) throw new ExpressionError("Saisissez une valeur.");
  const isAngle = defaultUnit === "deg";
  const units = isAngle ? ANGLE_UNITS : LENGTH_UNITS;
  const defaultFactor = isAngle ? 1 : MM_PER_UNIT[defaultUnit as DisplayUnit];
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  // expr := term (("+"|"-") term)* ; term := factor (("*"|"/") factor)* ; factor := "-" factor | primary
  function expr(): number {
    let value = term();
    for (let t = peek(); t?.kind === "op" && (t.value === "+" || t.value === "-"); t = peek()) {
      take();
      value = t.value === "+" ? value + term() : value - term();
    }
    return value;
  }
  function term(): number {
    let value = factor();
    for (let t = peek(); t?.kind === "op" && (t.value === "*" || t.value === "/"); t = peek()) {
      take();
      // Multipliers and divisors are plain numbers ("2 × 120 cm", "80 cm / 2").
      const rhs = factor(true);
      if (t.value === "/" && rhs === 0) throw new ExpressionError("Division par zéro.");
      value = t.value === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function factor(scalar = false): number {
    const t = take();
    if (!t) throw new ExpressionError("Expression incomplète.");
    if (t.kind === "op" && t.value === "-") return -factor(scalar);
    if (t.kind === "op" && t.value === "+") return factor(scalar);
    if (t.kind === "op" && t.value === "(") {
      const value = expr();
      const close = take();
      if (close?.kind !== "op" || close.value !== ")") throw new ExpressionError("Parenthèse fermante manquante.");
      return value;
    }
    if (t.kind === "num") {
      const unit = peek();
      if (unit?.kind === "unit") {
        take();
        const factor = units[unit.value];
        if (factor === undefined) throw new ExpressionError(`Unité inconnue « ${unit.value} ».`);
        return t.value * factor;
      }
      return scalar ? t.value : t.value * defaultFactor;
    }
    throw new ExpressionError("Expression invalide.");
  }

  const value = expr();
  if (pos < tokens.length) throw new ExpressionError("Expression invalide.");
  if (!Number.isFinite(value)) throw new ExpressionError("Résultat non fini.");
  return value;
}
