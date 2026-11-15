/**
 * Les formules d'un module programmable (module-program.ts) : de l'arithmétique sur des longueurs en mm, lue et calculée
 * ici sans rien exécuter d'autre — pas d'`eval`, pas de code arbitraire. Des nombres, avec une virgule ou un point et
 * une unité si l'on veut (« 35 cm », « 0,6 m », « 350 mm ») ; des noms (les variables de la niche, les paramètres du
 * module) ; + − × ÷ ^ et des parenthèses ; les comparaisons < > <= >= = <> qui valent 1 ou 0 ; les fonctions min, max,
 * arrondi, plancher, plafond (un pas en second, « plancher(x; 32) »), si(condition; alors; sinon), abs, et, ou, non.
 * Les arguments se séparent par « ; » (une virgule entre deux chiffres est décimale). Le même texte donne toujours le
 * même nombre. Une erreur se dit en français, la formule citée. Pur.
 */

type Node =
  | { t: "num"; v: number }
  | { t: "name"; name: string; shown: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] };

/** A formula read: evaluate it with `evaluateFormula`. */
export interface Formula {
  text: string;
  node: Node;
}

/** The functions, and how many values each takes: [least, most]. */
const FUNCTIONS: Record<string, [number, number]> = {
  min: [2, Infinity],
  max: [2, Infinity],
  arrondi: [1, 2],
  plancher: [1, 2],
  plafond: [1, 2],
  si: [3, 3],
  abs: [1, 1],
  et: [2, Infinity],
  ou: [2, Infinity],
  non: [1, 1],
};

export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);

const USAGE: Record<string, string> = {
  min: "au moins deux valeurs, séparées par « ; » : min(a; b)",
  max: "au moins deux valeurs, séparées par « ; » : max(a; b)",
  arrondi: "une valeur, et un pas si l'on veut : arrondi(x; 32)",
  plancher: "une valeur, et un pas si l'on veut : plancher(x; 32)",
  plafond: "une valeur, et un pas si l'on veut : plafond(x; 32)",
  si: "trois valeurs : si(condition; alors; sinon)",
  abs: "une valeur : abs(x)",
  et: "au moins deux conditions : et(a; b)",
  ou: "au moins deux conditions : ou(a; b)",
  non: "une condition : non(a)",
};

const UNITS: Record<string, number> = { mm: 1, cm: 10, m: 1000 };

/** A name as it is compared: without accents or capitals (« Épaisseur » is « epaisseur »). */
export const normalName = (name: string): string => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A name of a parameter or variable: a letter first, then letters, digits or « _ ». */
export const isFormulaName = (name: string): boolean => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name);

/** Rounding that a division just under a whole number does not spoil (2100 / 350 is 6, never 5,999…). */
const EPSILON = 1e-9;

class FormulaError extends Error {}

type Token = { k: "num"; v: number } | { k: "name"; v: string } | { k: "op"; v: string };

const OPERATORS = ["<=", ">=", "<>", "!=", "==", "+", "-", "−", "*", "×", "/", "÷", "^", "(", ")", ";", "<", ">", "="];
const CANONICAL: Record<string, string> = { "−": "-", "×": "*", "÷": "/", "!=": "<>", "==": "=" };

function tokens(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const digit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
  while (i < text.length) {
    const c = text[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (digit(c) || ((c === "." || c === ",") && digit(text[i + 1]))) {
      let j = i;
      while (digit(text[j])) j++;
      if ((text[j] === "." || text[j] === ",") && digit(text[j + 1])) {
        j++;
        while (digit(text[j])) j++;
      }
      let v = Number(text.slice(i, j).replace(",", "."));
      // A unit right after it: « 35 cm ».
      const unit = /^\s*(mm|cm|m)(?![\p{L}\p{N}_])/u.exec(text.slice(j));
      if (unit) {
        v *= UNITS[unit[1] as string] as number;
        j += unit[0].length;
      }
      out.push({ k: "num", v });
      i = j;
      continue;
    }
    const name = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(text.slice(i));
    if (name) {
      out.push({ k: "name", v: name[0] });
      i += name[0].length;
      continue;
    }
    // A comma that is not between two digits separates values, like « ; ».
    if (c === ",") {
      out.push({ k: "op", v: ";" });
      i++;
      continue;
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i));
    if (!op) throw new FormulaError(`le caractère « ${c} » n'a pas de sens ici`);
    out.push({ k: "op", v: CANONICAL[op] ?? op });
    i += op.length;
  }
  return out;
}

const shownToken = (t: Token | undefined) => (t === undefined ? "la fin" : t.k === "num" ? `« ${String(t.v).replace(".", ",")} »` : `« ${t.v} »`);

function parse(list: Token[], known: ReadonlySet<string>): Node {
  let at = 0;
  const peek = () => list[at];
  const isOp = (v: string) => peek()?.k === "op" && peek()?.v === v;
  const take = () => list[at++];
  const comparison = (): Node => {
    const a = additive();
    const t = peek();
    if (t?.k === "op" && ["<", ">", "<=", ">=", "=", "<>"].includes(t.v)) {
      take();
      return { t: "bin", op: t.v, a, b: additive() };
    }
    return a;
  };
  const additive = (): Node => {
    let a = term();
    while (isOp("+") || isOp("-")) a = { t: "bin", op: (take() as Token).v as string, a, b: term() };
    return a;
  };
  const term = (): Node => {
    let a = unary();
    while (isOp("*") || isOp("/")) a = { t: "bin", op: (take() as Token).v as string, a, b: unary() };
    return a;
  };
  const unary = (): Node => {
    if (isOp("-") || isOp("+")) {
      const sign = (take() as Token).v;
      const a = unary();
      return sign === "-" ? { t: "neg", a } : a;
    }
    const a = primary();
    if (!isOp("^")) return a;
    take();
    return { t: "bin", op: "^", a, b: unary() };
  };
  const primary = (): Node => {
    const t = take();
    if (t === undefined) throw new FormulaError(at <= 1 ? "la formule est vide" : "une valeur manque à la fin");
    if (t.k === "num") return { t: "num", v: t.v };
    if (t.k === "name") {
      const name = normalName(t.v);
      if (isOp("(")) {
        take();
        const usage = FUNCTIONS[name];
        if (!usage) throw new FormulaError(`« ${t.v} » n'est pas une fonction connue (${FORMULA_FUNCTIONS.join(", ")})`);
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(comparison());
          while (isOp(";")) take() && args.push(comparison());
        }
        if (!isOp(")")) throw new FormulaError(`une parenthèse fermante manque pour « ${t.v}( »`);
        take();
        if (args.length < usage[0] || args.length > usage[1]) throw new FormulaError(`${name} demande ${USAGE[name]}`);
        return { t: "call", fn: name, args };
      }
      if (FUNCTIONS[name]) throw new FormulaError(`${name} est une fonction : ${USAGE[name]}`);
      if (!known.has(name)) throw new FormulaError(`« ${t.v} » n'est ni une variable de la niche ni un paramètre du module`);
      return { t: "name", name, shown: t.v };
    }
    if (t.v === "(") {
      const inner = comparison();
      if (!isOp(")")) throw new FormulaError("une parenthèse fermante manque");
      take();
      return inner;
    }
    throw new FormulaError(`une valeur manque avant ${shownToken(t)}`);
  };
  const node = comparison();
  const rest = peek();
  if (rest !== undefined) throw new FormulaError(rest.k === "op" && rest.v === ")" ? "une parenthèse fermante est en trop" : `${shownToken(rest)} est de trop : un opérateur manque avant`);
  return node;
}

const quoted = (text: string) => `formule « ${text.trim()} »`;

/** This text read as a formula, the names it may use being `known`; a string: what is wrong, in French. */
export function parseFormula(text: string, known: readonly string[]): Formula | string {
  try {
    return { text, node: parse(tokens(text), new Set(known.map(normalName))) };
  } catch (error) {
    if (error instanceof FormulaError) return `${quoted(text)} : ${error.message}.`;
    throw error;
  }
}

const step = (args: number[], fn: string) => {
  const by = args[1] ?? 1;
  if (!(by > 0)) throw new FormulaError(`le pas de ${fn} doit être positif`);
  return by;
};

function value(node: Node, env: ReadonlyMap<string, number>): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "name": {
      const v = env.get(node.name);
      if (v === undefined) throw new FormulaError(`« ${node.shown} » n'a pas de valeur`);
      return v;
    }
    case "neg":
      return -value(node.a, env);
    case "bin": {
      const a = value(node.a, env);
      const b = value(node.b, env);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          if (b === 0) throw new FormulaError("division par zéro");
          return a / b;
        case "^":
          return a ** b;
        case "<":
          return Number(a < b - EPSILON);
        case ">":
          return Number(a > b + EPSILON);
        case "<=":
          return Number(a <= b + EPSILON);
        case ">=":
          return Number(a >= b - EPSILON);
        case "=":
          return Number(Math.abs(a - b) <= EPSILON);
        default:
          return Number(Math.abs(a - b) > EPSILON);
      }
    }
    case "call": {
      // « si » only works out the branch it takes.
      if (node.fn === "si") return value(node.args[value(node.args[0] as Node, env) !== 0 ? 1 : 2] as Node, env);
      const args = node.args.map((a) => value(a, env));
      const x = args[0] as number;
      switch (node.fn) {
        case "min":
          return Math.min(...args);
        case "max":
          return Math.max(...args);
        case "arrondi": {
          const by = step(args, "arrondi");
          return Math.round(x / by + EPSILON) * by;
        }
        case "plancher": {
          const by = step(args, "plancher");
          return Math.floor(x / by + EPSILON) * by;
        }
        case "plafond": {
          const by = step(args, "plafond");
          return Math.ceil(x / by - EPSILON) * by;
        }
        case "abs":
          return Math.abs(x);
        case "et":
          return Number(args.every((a) => a !== 0));
        case "ou":
          return Number(args.some((a) => a !== 0));
        default:
          return Number(x === 0);
      }
    }
  }
}

/** The number this formula gives with these values (names as written or not: accents and capitals do not count); a string: why it cannot. */
export function evaluateFormula(formula: Formula, values: Readonly<Record<string, number>>): number | string {
  const env = new Map(Object.entries(values).map(([k, v]) => [normalName(k), v]));
  try {
    const v = value(formula.node, env);
    if (!Number.isFinite(v)) throw new FormulaError("le résultat n'est pas un nombre fini");
    return v;
  } catch (error) {
    if (error instanceof FormulaError) return `${quoted(formula.text)} : ${error.message}.`;
    throw error;
  }
}
