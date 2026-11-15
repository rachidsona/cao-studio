/**
 * Un module programmable : un module de dressing (dressing-modules.ts) dont les cotes se calculent sur la niche où on le
 * pose, par des formules (module-formula.ts). Elles lisent la largeur, la hauteur et la profondeur libres de la niche et
 * l'épaisseur des panneaux de la Répartition, avec les paramètres du module, et décident le nombre d'étagères ou de
 * tiroirs, l'espacement, le chapeau, la zone des tiroirs, la tringle sous le haut, l'épaisseur des étagères ; des
 * conditions choisissent un autre module selon la niche (« tiroirs si la niche fait plus de 45 cm de large »). Une cote
 * sans formule garde sa valeur. Le résultat est le même pour la même niche. Pur.
 */
import { MODULES, moduleHas, moduleSizes, ROD, type ModuleKind, type ModuleSizes } from "./dressing-modules";
import { evaluateFormula, FORMULA_FUNCTIONS, isFormulaName, normalName, parseFormula } from "./module-formula";

/** What the formulas may set. */
export type FormulaTarget = "shelves" | "spacing" | "hat" | "drawerZone" | "drawers" | "rodDrop" | "thickness";

interface TargetInfo {
  label: string;
  /** A number of pieces, between these (rounded to the nearest); else a length (mm, rounded to 0,1 mm). */
  count?: [number, number];
  /** A length that may be 0. */
  zero?: boolean;
  applies(kind: ModuleKind): boolean;
}

export const TARGETS: Record<FormulaTarget, TargetInfo> = {
  shelves: { label: "Nombre d'étagères", count: [0, 20], applies: (k) => moduleHas(k).spacing },
  spacing: { label: "Espacement des étagères", applies: (k) => moduleHas(k).spacing },
  hat: { label: "Hauteur du chapeau", applies: (k) => moduleHas(k).hat },
  drawerZone: { label: "Zone des tiroirs", applies: (k) => moduleHas(k).drawers },
  drawers: { label: "Nombre de tiroirs", count: [1, 8], applies: (k) => moduleHas(k).drawers },
  rodDrop: { label: "Tringle sous le haut", zero: true, applies: (k) => moduleHas(k).rod },
  thickness: { label: "Épaisseur des étagères", applies: () => true },
};

/** What a formula reads in the niche (mm). */
export interface NicheVariables {
  largeur: number;
  hauteur: number;
  profondeur: number;
  epaisseur: number;
}

export const VARIABLES: { name: keyof NicheVariables; label: string }[] = [
  { name: "largeur", label: "largeur libre de la niche" },
  { name: "hauteur", label: "hauteur libre de la niche" },
  { name: "profondeur", label: "profondeur des panneaux" },
  { name: "epaisseur", label: "épaisseur des panneaux" },
];

export interface ModuleParam {
  name: string;
  value: number;
}

/** Another module when this condition holds (not 0). */
export interface ModuleRule {
  when: string;
  kind: ModuleKind;
}

export interface ModuleProgram {
  /** The module when no condition holds, with its sizes and shelf thickness where there is no formula. */
  kind: ModuleKind;
  sizes: ModuleSizes;
  thickness: number;
  params: ModuleParam[];
  /** The first that holds gives the module. */
  rules: ModuleRule[];
  formulas: Partial<Record<FormulaTarget, string>>;
}

/** A module laid out by its program in one niche. */
export interface ResolvedModule {
  kind: ModuleKind;
  sizes: ModuleSizes;
  thickness: number;
  /** What each formula gave. */
  values: Partial<Record<FormulaTarget, number>>;
}

const LIMITS = { params: 20, rules: 10, text: 300 };

/** The names a formula of this program may use. */
export const programNames = (p: Pick<ModuleProgram, "params">): string[] => [...VARIABLES.map((v) => v.name), ...p.params.map((q) => q.name)];

/** The formulas set (not empty). */
export const formulasOf = (p: Pick<ModuleProgram, "formulas">): [FormulaTarget, string][] =>
  (Object.entries(p.formulas) as [FormulaTarget, string | undefined][]).filter((e): e is [FormulaTarget, string] => typeof e[1] === "string" && e[1].trim() !== "");

/** Something to compute: a formula, or a condition. */
export const isProgrammed = (p: Pick<ModuleProgram, "formulas" | "rules">): boolean => formulasOf(p).length > 0 || p.rules.length > 0;

/** What is wrong with a parameter's name, or null. */
export function paramProblem(p: Pick<ModuleProgram, "params">, index: number): string | null {
  const name = p.params[index]?.name ?? "";
  if (!isFormulaName(name)) return `Paramètre « ${name} » : un nom commence par une lettre, puis lettres, chiffres ou « _ », sans espace.`;
  const n = normalName(name);
  if (VARIABLES.some((v) => v.name === n)) return `Paramètre « ${name} » : c'est déjà une variable de la niche.`;
  if (FORMULA_FUNCTIONS.includes(n)) return `Paramètre « ${name} » : c'est le nom d'une fonction.`;
  if (p.params.some((q, i) => i < index && normalName(q.name) === n)) return `Paramètre « ${name} » : ce nom est déjà pris.`;
  return null;
}

/** What is wrong in this program before any niche (a name, a formula that cannot be read), or null. */
export function programProblem(p: ModuleProgram): string | null {
  for (let i = 0; i < p.params.length; i++) {
    const problem = paramProblem(p, i);
    if (problem) return problem;
  }
  const names = programNames(p);
  for (const [i, rule] of p.rules.entries()) {
    const read = parseFormula(rule.when, names);
    if (typeof read === "string") return `Condition ${i + 1} — ${read}`;
  }
  for (const [target, text] of formulasOf(p)) {
    const read = parseFormula(text, names);
    if (typeof read === "string") return `${TARGETS[target].label} — ${read}`;
  }
  return null;
}

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;
const number = (v: number) => Number(v.toFixed(2)).toLocaleString("fr-FR");

/** This program in a niche of these measures: the module, its sizes; a string: what is wrong, the formula quoted. */
export function resolveProgram(p: ModuleProgram, niche: NicheVariables): ResolvedModule | string {
  const wrong = programProblem(p);
  if (wrong) return wrong;
  const names = programNames(p);
  const env: Record<string, number> = { ...niche, ...Object.fromEntries(p.params.map((q) => [q.name, q.value])) };
  const run = (text: string) => evaluateFormula(parseFormula(text, names) as Exclude<ReturnType<typeof parseFormula>, string>, env);
  let kind = p.kind;
  for (const [i, rule] of p.rules.entries()) {
    const holds = run(rule.when);
    if (typeof holds === "string") return `Condition ${i + 1} — ${holds}`;
    if (holds !== 0) {
      kind = rule.kind;
      break;
    }
  }
  // The sizes of the module chosen: its own defaults when a condition changed it, with the rod and fronts of the program.
  const { rod, front } = p.sizes;
  const sizes: ModuleSizes = structuredClone(kind === p.kind ? p.sizes : { ...moduleSizes(kind), ...(rod ? { rod } : {}), ...(front ? { front } : {}) });
  let thickness = p.thickness;
  const values: ResolvedModule["values"] = {};
  for (const [target, text] of formulasOf(p)) {
    const info = TARGETS[target];
    if (!info.applies(kind)) continue;
    const raw = run(text);
    if (typeof raw === "string") return `${info.label} — ${raw}`;
    let v: number;
    if (info.count) {
      v = Math.round(raw);
      const [least, most] = info.count;
      if (v < least || v > most) return `${info.label} — formule « ${text.trim()} » : elle donne ${number(raw)}, il en faut de ${least} à ${most}.`;
    } else {
      v = Math.round(raw * 10) / 10;
      if (info.zero ? v < 0 : v <= 0) return `${info.label} — formule « ${text.trim()} » : elle donne ${number(raw)} mm, il faut une longueur ${info.zero ? "positive ou nulle" : "positive"}.`;
    }
    values[target] = v;
    if (target === "shelves") sizes.shelves = v;
    else if (target === "spacing") sizes.spacing = v;
    else if (target === "hat") sizes.hat = v;
    else if (target === "drawerZone") sizes.drawerZone = v;
    else if (target === "drawers") sizes.drawers = v;
    else if (target === "rodDrop") sizes.rod = { ...ROD, ...sizes.rod, drop: v };
    else thickness = v;
  }
  // The number of shelves follows the spacing, unless a formula sets it; heights set by hand do not survive a count that changes.
  if (values.spacing !== undefined && values.shelves === undefined) delete sizes.shelves;
  if (values.spacing !== undefined || values.shelves !== undefined) delete sizes.heights;
  return { kind, sizes, thickness, values };
}

/** The measures of a niche read by the formulas, for the panels and messages: « 90 × 238,4 × 60 cm ». */
export const nicheMeasures = (v: NicheVariables): string => `${cm(v.largeur).replace(" cm", "")} × ${cm(v.hauteur).replace(" cm", "")} × ${cm(v.profondeur)}`;

/** The same measures, to tell whether a niche changed (to 0,01 mm). */
export const sameNiche = (a: NicheVariables, b: NicheVariables): boolean => VARIABLES.every(({ name }) => Math.abs(a[name] - b[name]) < 0.01);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown) => typeof v === "string" && v.length <= LIMITS.text;

/** A program as read from a file or from this browser: well formed, and not too large. */
export function isModuleProgram(v: unknown): v is ModuleProgram {
  if (!isRecord(v) || typeof v.kind !== "string" || !(v.kind in MODULES) || !isRecord(v.sizes) || !(typeof v.thickness === "number" && v.thickness > 0)) return false;
  const { params, rules, formulas } = v;
  if (!Array.isArray(params) || params.length > LIMITS.params || !params.every((q) => isRecord(q) && isText(q.name) && typeof q.value === "number" && Number.isFinite(q.value))) return false;
  if (!Array.isArray(rules) || rules.length > LIMITS.rules || !rules.every((r) => isRecord(r) && isText(r.when) && typeof r.kind === "string" && r.kind in MODULES)) return false;
  return isRecord(formulas) && Object.entries(formulas).every(([k, t]) => k in TARGETS && isText(t));
}

/** Where a module programmed was laid: its program, and the measures of the niche it was worked out for. */
export interface ModuleFormula {
  program: ModuleProgram;
  at: NicheVariables;
}

export const isModuleFormula = (v: unknown): v is ModuleFormula =>
  isRecord(v) && isModuleProgram(v.program) && isRecord(v.at) && VARIABLES.every(({ name }) => typeof (v.at as Record<string, unknown>)[name] === "number");
