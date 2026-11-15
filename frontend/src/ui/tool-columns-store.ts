/**
 * Ce que retient la barre à sept colonnes (ui/tool-columns.ts) : les outils de chaque colonne, dans leur ordre, et les
 * colonnes repliées, gardés dans ce navigateur. Les colonnes sont vides au départ, et ce sont les mêmes dans les trois
 * espaces (Conception 3D, Dressing, Cuisine) : elles restent en place quand on change d'onglet. Entre les icônes, des
 * séparateurs : une ligne, ou un espace vide de la taille d'une icône (« sep:line:3 », « sep:space:4 »), chacun le sien.
 */

export const COLUMN_COUNT = 7;
const STORAGE = "cao.tool-columns";

export interface ColumnsState {
  /** The tools of each column, by key (ui/ribbon-layout.ts keyOf). */
  columns: string[][];
  /** Whether each column is folded away (only its tab at the edge of the view is left). */
  folded: boolean[];
}

/** A state made of four columns, whatever was read (missing columns empty, unknown tools dropped, no duplicates). */
export function normalize(raw: unknown, known: (key: string) => boolean): ColumnsState {
  const source = raw && typeof raw === "object" ? (raw as Partial<Record<keyof ColumnsState, unknown>>) : {};
  const columns = Array.isArray(source.columns) ? source.columns : [];
  const folded = Array.isArray(source.folded) ? source.folded : [];
  return {
    columns: Array.from({ length: COLUMN_COUNT }, (_, i) => {
      const keys = Array.isArray(columns[i]) ? (columns[i] as unknown[]) : [];
      return [...new Set(keys.filter((k): k is string => typeof k === "string" && (known(k) || isSeparator(k))))];
    }),
    folded: Array.from({ length: COLUMN_COUNT }, (_, i) => folded[i] === true),
  };
}

/** The kept columns, or four empty ones the first time. */
export function readColumns(known: (key: string) => boolean): ColumnsState {
  let kept: string | null = null;
  try {
    kept = localStorage.getItem(STORAGE);
  } catch {
    // Empty columns, for this visit.
  }
  try {
    return normalize(kept === null ? {} : JSON.parse(kept), known);
  } catch {
    return normalize({}, known);
  }
}

export function writeColumns(state: ColumnsState): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(state));
  } catch {
    // Not remembered: only this visit.
  }
}

/** Adds the tool to the column, or takes it out if it is there. */
export function toggleTool(state: ColumnsState, column: number, key: string): ColumnsState {
  const columns = state.columns.map((keys, i) => (i !== column ? keys : keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
  return { ...state, columns };
}

/** A separator between the icons: a line, or an empty place as big as an icon. */
export type SeparatorKind = "line" | "space";

export function isSeparator(key: string): boolean {
  return /^sep:(line|space):\d+$/.test(key);
}

export function separatorKind(key: string): SeparatorKind | null {
  return isSeparator(key) ? (key.split(":")[1] as SeparatorKind) : null;
}

/** Adds a line or an empty place at the end of the column, with a number no other separator has. */
export function addSeparator(state: ColumnsState, column: number, kind: SeparatorKind): ColumnsState {
  const used = state.columns.flat().filter(isSeparator).map((k) => Number(k.split(":")[2]));
  const key = `sep:${kind}:${Math.max(0, ...used) + 1}`;
  return { ...state, columns: state.columns.map((keys, i) => (i === column ? [...keys, key] : keys)) };
}

export function toggleFold(state: ColumnsState, column: number): ColumnsState {
  return { ...state, folded: state.folded.map((f, i) => (i === column ? !f : f)) };
}

/**
 * Moves a tool to `index` of a column (its own or another): `index` counts the tools of that column without it. A tool
 * already in the target column is not doubled.
 */
export function moveTool(state: ColumnsState, from: number, key: string, to: number, index: number): ColumnsState {
  if (!state.columns[from]?.includes(key) || !state.columns[to]) return state;
  const columns = state.columns.map((keys, i) => (i === from || i === to ? keys.filter((k) => k !== key) : keys));
  const target = columns[to] as string[];
  target.splice(Math.max(0, Math.min(index, target.length)), 0, key);
  return { ...state, columns };
}

/** Puts a tool from another bar at `index` of a column (not doubled if it is there). */
export function insertTool(state: ColumnsState, column: number, key: string, index: number): ColumnsState {
  if (!state.columns[column]) return state;
  const columns = state.columns.map((keys) => [...keys]);
  const target = (columns[column] as string[]).filter((k) => k !== key);
  target.splice(Math.max(0, Math.min(index, target.length)), 0, key);
  columns[column] = target;
  return { ...state, columns };
}
