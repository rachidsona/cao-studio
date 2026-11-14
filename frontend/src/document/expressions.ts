/**
 * Named parameters (largeur, épaisseur…) and the formulas that link the
 * numbers of features to them ("largeur - 2 * ep"). A formula is stored on the
 * feature (`expressions`, by field path) and its result is written into the
 * feature's number every time the parameters change (`applyExpressions`), so
 * the document stays plain numbers for the kernel, the server and the
 * caches. The parser is a small safe one (no eval): numbers (12 or 12,5),
 * names, + - * / ^, parentheses, pi and min, max, abs, round, floor, ceil,
 * sqrt with arguments separated by « ; ».
 */
import { solveSketch } from "../constraints/solver";
import { isDimension, type SketchConstraint } from "./sketch";
import type { CadDocument, Feature, Parameter, SketchFeature } from "./types";

export class ExpressionError extends Error {}

type Scope = Record<string, number>;
interface Token {
  kind: "num" | "id" | "op";
  value: string;
}

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
};
const CONSTANTS: Scope = { pi: Math.PI };
export const NAME_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const TOKEN = /\s*(?:(\d+(?:[.,]\d+)?)|([\p{L}_][\p{L}\p{N}_]*)|([-+*/^();]))/uy;

/** Why a parameter name cannot be used, or null. */
export function nameProblem(name: string): string | null {
  if (!NAME_PATTERN.test(name)) return "Le nom commence par une lettre et ne contient que des lettres, chiffres et _.";
  if (name in FUNCTIONS || name in CONSTANTS) return `« ${name} » est réservé (fonction ou constante).`;
  return null;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let pos = 0;
  while (text.slice(pos).trim() !== "") {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) throw new ExpressionError(`Caractère inattendu : « ${text.slice(pos).trim()[0]} ».`);
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ kind: "num", value: m[1].replace(",", ".") });
    else if (m[2] !== undefined) out.push({ kind: "id", value: m[2] });
    else out.push({ kind: "op", value: m[3] as string });
  }
  return out;
}

/** Value of a formula; the names it uses are looked up in `scope`. */
export function evaluate(text: string, scope: Scope): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) throw new ExpressionError("Formule vide.");
  let i = 0;
  const peekOp = (op: string) => tokens[i]?.kind === "op" && tokens[i]?.value === op;
  const eat = (op: string) => (peekOp(op) ? (i++, true) : false);
  const expect = (op: string) => {
    if (!eat(op)) throw new ExpressionError(`« ${op} » attendu.`);
  };
  const sum = (): number => {
    let v = product();
    for (;;) {
      if (eat("+")) v += product();
      else if (eat("-")) v -= product();
      else return v;
    }
  };
  const product = (): number => {
    let v = unary();
    for (;;) {
      if (eat("*")) v *= unary();
      else if (eat("/")) {
        const d = unary();
        if (d === 0) throw new ExpressionError("Division par zéro.");
        v /= d;
      } else return v;
    }
  };
  const unary = (): number => (eat("-") ? -unary() : eat("+") ? unary() : power());
  const power = (): number => {
    const base = atom();
    return eat("^") ? base ** unary() : base;
  };
  const atom = (): number => {
    const t = tokens[i++];
    if (!t) throw new ExpressionError("Formule incomplète.");
    if (t.kind === "num") return Number(t.value);
    if (t.kind === "op") {
      if (t.value !== "(") throw new ExpressionError(`« ${t.value} » inattendu.`);
      const v = sum();
      expect(")");
      return v;
    }
    if (peekOp("(") && Object.hasOwn(FUNCTIONS, t.value)) {
      i++;
      const args = [sum()];
      while (eat(";")) args.push(sum());
      expect(")");
      return (FUNCTIONS[t.value] as (...a: number[]) => number)(...args);
    }
    // Own names only: « constructor », « toString »… are not parameters.
    if (Object.hasOwn(scope, t.value)) return scope[t.value] as number;
    if (Object.hasOwn(CONSTANTS, t.value)) return CONSTANTS[t.value] as number;
    throw new ExpressionError(`« ${t.value} » n'est pas un paramètre connu.`);
  };
  const value = sum();
  if (i < tokens.length) throw new ExpressionError(`« ${tokens[i]!.value} » inattendu.`);
  if (!Number.isFinite(value)) throw new ExpressionError("Le résultat n'est pas un nombre.");
  return value;
}

/** Names a formula uses (parameters, not functions or constants). */
export function namesIn(text: string): string[] {
  try {
    const tokens = tokenize(text);
    return tokens.flatMap((t, k) => (t.kind === "id" && !(t.value in CONSTANTS) && !(t.value in FUNCTIONS && tokens[k + 1]?.value === "(") ? [t.value] : []));
  } catch {
    return [];
  }
}

/** Value of every parameter (those with a formula are computed from the others), and what could not be. */
export function resolveParameters(params: Record<string, Parameter>): { values: Scope; errors: Record<string, string> } {
  const values: Scope = {};
  const errors: Record<string, string> = {};
  const state = new Map<string, "busy" | "done">();
  const visit = (name: string): void => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "busy") throw new ExpressionError(`« ${name} » dépend de lui-même.`);
    state.set(name, "busy");
    const p = params[name] as Parameter;
    if (p.expression === undefined || p.expression === "") values[name] = p.value;
    else {
      for (const dep of namesIn(p.expression)) if (dep in params) visit(dep);
      values[name] = evaluate(p.expression, values);
    }
    state.set(name, "done");
  };
  for (const name of Object.keys(params)) {
    try {
      visit(name);
    } catch (error) {
      errors[name] = error instanceof ExpressionError ? error.message : String(error);
      state.set(name, "done");
    }
  }
  return { values, errors };
}

// ---- links between features and parameters ---------------------------------------------------

/** Numbers that are whole counts, rounded after a formula. */
const INTEGER_PATHS = new Set(["shelves", "count"]);

/**
 * A path a formula may drive: own fields of the feature, never through « __proto__ », « prototype » or « constructor »
 * (a document's formulas come from a file: « __proto__.x » would set x on every object of the page — audit of
 * 10/11/2026, M3).
 */
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
export const drivablePath = (path: string) => path.split(".").every((k) => k !== "" && !FORBIDDEN_KEYS.has(k));

/** A sketch's dimension driven by a formula: « cote:<id of the dimension> ». */
export const DIMENSION_PATH = "cote:";

/** The driving dimension of a sketch a path names. */
function dimensionAt(feature: Feature, path: string): (SketchConstraint & { value: number }) | undefined {
  if (feature.type !== "sketch" || !path.startsWith(DIMENSION_PATH)) return undefined;
  const id = path.slice(DIMENSION_PATH.length);
  return feature.constraints.find((c): c is SketchConstraint & { value: number } => c.id === id && isDimension(c));
}

function getAt(feature: Feature, path: string): unknown {
  if (path.startsWith(DIMENSION_PATH)) return dimensionAt(feature, path)?.value;
  return path.split(".").reduce<unknown>((o, k) => (o !== null && typeof o === "object" && Object.hasOwn(o, k) ? (o as Record<string, unknown>)[k] : undefined), feature);
}

function setAt<T extends Feature>(feature: T, path: string, value: number): T {
  if (path.startsWith(DIMENSION_PATH)) {
    const dim = dimensionAt(feature, path);
    if (!dim) throw new ExpressionError("Cette cote n'est plus dans l'esquisse.");
    const sketch = feature as unknown as SketchFeature;
    return { ...sketch, constraints: sketch.constraints.map((c) => (c.id === dim.id ? ({ ...c, value } as SketchConstraint) : c)) } as unknown as T;
  }
  const copy = structuredClone(feature) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let node = copy;
  for (const k of keys.slice(0, -1)) {
    const next = Object.hasOwn(node, k) ? node[k] : undefined;
    if (next === null || typeof next !== "object") throw new ExpressionError(`« ${path} » ne désigne pas une cote de l'opération.`);
    node = next as Record<string, unknown>;
  }
  node[keys.at(-1) as string] = value;
  return copy as unknown as T;
}

/** The numbers of a feature a formula may drive: top-level numbers and the three coordinates of vectors ("translate.0"). */
export function numericFields(feature: Feature): { path: string; value: number }[] {
  const out: { path: string; value: number }[] = [];
  // A sketch: its driving dimensions.
  if (feature.type === "sketch") {
    for (const c of feature.constraints) if (isDimension(c) && c.driving !== false) out.push({ path: `${DIMENSION_PATH}${c.id}`, value: c.value });
    return out;
  }
  for (const [key, v] of Object.entries(feature)) {
    if (typeof v === "number") out.push({ path: key, value: v });
    else if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number")) v.forEach((x, k) => out.push({ path: `${key}.${k}`, value: x as number }));
  }
  return out;
}

export interface LinkError {
  featureId: string;
  path: string;
  message: string;
}

/** The document with every formula evaluated into the numbers it drives; formulas that fail are reported and leave their number alone. */
export function applyExpressions(doc: CadDocument): { doc: CadDocument; errors: LinkError[]; parameterErrors: Record<string, string> } {
  const { values, errors: parameterErrors } = resolveParameters(doc.parameters ?? {});
  const errors: LinkError[] = [];
  let changed = false;
  // The shown value of a parameter made of a formula follows the formula.
  let parameters = doc.parameters ?? {};
  for (const [name, p] of Object.entries(parameters)) {
    if (p.expression && name in values && values[name] !== p.value) {
      parameters = { ...parameters, [name]: { ...p, value: values[name] as number } };
      changed = true;
    }
  }
  const features = doc.features.map((feature) => {
    const links = feature.expressions;
    if (!links) return feature;
    let next = feature;
    for (const [path, text] of Object.entries(links)) {
      try {
        if (!drivablePath(path)) throw new ExpressionError(`« ${path} » ne désigne pas une cote de l'opération.`);
        const raw = evaluate(text, values);
        const value = INTEGER_PATHS.has(path) ? Math.round(raw) : Number(raw.toFixed(6));
        if (getAt(next, path) !== value) {
          next = setAt(next, path, value);
          changed = true;
        }
      } catch (error) {
        errors.push({ featureId: feature.id, path, message: error instanceof ExpressionError ? error.message : String(error) });
      }
    }
    // A sketch whose dimensions changed: solved again, its points where the dimensions put them.
    if (next !== feature && next.type === "sketch") {
      try {
        const solved = solveSketch(next);
        if (solved.state === "conflicting" || solved.state === "failed") errors.push({ featureId: feature.id, path: Object.keys(links)[0] ?? "", message: "L'esquisse ne peut pas prendre ces cotes : contraintes en conflit." });
        else next = { ...next, points: solved.geometry.points, curves: solved.geometry.curves };
      } catch {
        // The solver is not loaded: the build solves the sketch.
      }
    }
    return next;
  });
  return { doc: changed ? { ...doc, parameters, features } : doc, errors, parameterErrors };
}

/** What uses a parameter: features with a formula naming it, and other parameters. */
export function parameterUsage(doc: CadDocument, name: string): string[] {
  const uses: string[] = [];
  for (const f of doc.features) for (const [path, text] of Object.entries(f.expressions ?? {})) if (namesIn(text).includes(name)) uses.push(`${f.name} (${path})`);
  for (const [other, p] of Object.entries(doc.parameters ?? {})) if (p.expression && namesIn(p.expression).includes(name)) uses.push(`paramètre ${other}`);
  return uses;
}
