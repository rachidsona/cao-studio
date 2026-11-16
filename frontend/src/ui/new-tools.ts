/**
 * Les outils nouveaux portent un petit point orange — sur leur bouton, où qu'il soit (le ruban, la colonne Sélection
 * et vue, les sept colonnes, Mes outils), dans le menu de leur groupe, et sur le nom du groupe quand l'outil y est
 * rangé —, jusqu'à ce qu'on s'en serve une fois : le navigateur retient ceux qu'on a utilisés. NEW_TOOLS dit lesquels
 * (par leur clé, ui/tool-catalogue.ts toolKey) ; un outil qu'on ajoute à l'application s'y inscrit.
 */
import { toolKey } from "./tool-catalogue";

/** The tools added lately, by key: the newest first. */
export const NEW_TOOLS: readonly string[] = [
  "data-sketch-command:skselectall",
  "data-select-sketches:",
  "data-action:bend-onto",
  "data-sketch-command:centerin",
  "data-sketch-bodies:",
  "data-action:copy-ops",
  "data-action:split-sides",
  "data-open-all:",
  "data-select-all:",
];

const SEEN = "cao.seen-tools";

function seen(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SEEN) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

/** Whether this tool is new to this browser (not used yet). */
export const isNewTool = (key: string | null | undefined): boolean => !!key && NEW_TOOLS.includes(key) && !seen().has(key);

/** The tool used once: its dot goes. */
export function markToolSeen(key: string): void {
  const now = seen();
  if (now.has(key)) return;
  now.add(key);
  try {
    localStorage.setItem(SEEN, JSON.stringify([...now]));
  } catch {
    // Not remembered: the dot comes back at the next visit.
  }
}

/** The key of a tool's button, or of a copy of it in a bar (`data-tool-column-tool`, `data-favorite-tool`, `data-side-extra-tool`). */
function keyOfButton(button: HTMLElement): string | null {
  return button.dataset.toolColumnTool ?? button.dataset.favoriteTool ?? button.dataset.sideExtraTool ?? button.dataset.newTool ?? toolKey(button);
}

/** Every button of a new tool marked, and the name of a group whose menu holds one out of sight. */
function mark(root: HTMLElement, fresh: ReadonlySet<string>): void {
  const isFresh = (key: string | null) => !!key && fresh.has(key);
  for (const button of root.querySelectorAll<HTMLElement>("button")) {
    const on = isFresh(keyOfButton(button));
    if (on !== button.hasAttribute("data-new")) button.toggleAttribute("data-new", on);
  }
  for (const group of root.querySelectorAll<HTMLElement>(".ribbon-group")) {
    const caption = group.querySelector<HTMLElement>(".ribbon-caption-menu");
    if (!caption) continue;
    const hidden = [...group.querySelectorAll<HTMLElement>(".ribbon-row > button")].some((b) => b.hidden && isFresh(toolKey(b)));
    if (hidden !== caption.hasAttribute("data-new-inside")) caption.toggleAttribute("data-new-inside", hidden);
  }
}

/** The new tools not used yet in this browser. */
const unseen = (): Set<string> => {
  const used = seen();
  return new Set(NEW_TOOLS.filter((k) => !used.has(k)));
};

export function bindNewTools(root: HTMLElement): void {
  let queued = false;
  let fresh = unseen();
  const again = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      mark(document.body, fresh);
      // Every new tool used: nothing more to watch.
      if (!fresh.size) watcher.disconnect();
    });
  };
  // A tool used — by its button, a copy of it, or its line in a group's menu —: no longer new.
  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest?.<HTMLElement>("button");
    const key = button && keyOfButton(button);
    if (!key || !fresh.has(key)) return;
    markToolSeen(key);
    fresh = unseen();
    again();
  }, true);
  // The bars are drawn again (columns, favourites, menus): their buttons marked once more.
  const watcher = new MutationObserver(again);
  if (fresh.size) watcher.observe(document.body, { childList: true, subtree: true });
  mark(root, fresh);
}
