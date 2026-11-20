/**
 * Les outils choisis pour la barre contextuelle (app/context-bar.ts), par sorte d'élément sélectionné — une pièce, un
 * caisson, une Répartition, un plan de dressing ou de cuisine —, gardés dans ce navigateur. Tant qu'on n'en a pas
 * choisi, ceux proposés d'office (document/context-tools.ts).
 */
const STORAGE = "cao.context-tools";

/** `[data-action="move"]` → `data-action:move`, the key of a tool in the bars (ui/tool-catalogue.ts). */
export const keyOfSelector = (selector: string): string | null => {
  const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector.trim());
  return m ? `${m[1]}:${m[2]}` : null;
};

function readAll(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter((x): x is string => typeof x === "string")]));
  } catch {
    return {};
  }
}

/** The tools of this sort of element, by key: those chosen, else those proposed (`defaults`, as selectors). */
export function contextKeys(kind: string, defaults: readonly string[]): string[] {
  return readAll()[kind] ?? defaults.map(keyOfSelector).filter((k): k is string => k !== null);
}

/** This tool added at the end of the bar of this sort of element, or taken out if it is there. */
export function toggleContextKey(kind: string, defaults: readonly string[], key: string): string[] {
  const now = contextKeys(kind, defaults);
  const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key];
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ ...readAll(), [kind]: next }));
  } catch {
    // Not remembered: only this visit.
  }
  return next;
}

/** Back to the tools proposed for this sort of element. */
export function resetContextKeys(kind: string): void {
  try {
    const { [kind]: _gone, ...rest } = readAll();
    localStorage.setItem(STORAGE, JSON.stringify(rest));
  } catch {
    // Nothing kept.
  }
}
