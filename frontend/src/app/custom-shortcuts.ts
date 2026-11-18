/**
 * Les raccourcis clavier de chacun : une touche (avec Ctrl ou ⌘, ⌥, Maj si l'on veut) pour lancer un outil, choisie
 * dans la palette de commandes (command-palette.ts) et gardée dans ce navigateur. Elle lance l'outil quand son bouton
 * est là (le mode en cours : une touche donnée à un outil du modèle laisse ses lettres à l'esquisse) ; jamais pendant
 * qu'on tape dans un champ. Les raccourcis de l'éditeur (enregistrer, annuler, Échap…) restent les siens.
 */
const KEY = "cao.shortcuts";

/** By combination (« Ctrl+Maj+D », « M »): the command's key (ui/ribbon-layout.ts, `keyOf`) and its name. */
export type Shortcuts = Record<string, { command: string; label: string }>;

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = MAC ? "⌘" : "Ctrl";

/** What the editor keeps for itself (keyboard.ts, the palette): never given to a tool. */
const RESERVED = new Set([`${MOD}+S`, `${MOD}+Z`, `${MOD}+Maj+Z`, `${MOD}+Y`, `${MOD}+K`, "Échap", "Suppr", "Retour", "Entrée", "Tab", "?", "Maj+?"]);

export function readShortcuts(): Shortcuts {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!kept || typeof kept !== "object" || Array.isArray(kept)) return {};
    return Object.fromEntries(Object.entries(kept as Record<string, unknown>).filter((e): e is [string, { command: string; label: string }] => {
      const v = e[1] as { command?: unknown; label?: unknown } | null;
      return typeof v?.command === "string" && typeof v.label === "string";
    }));
  } catch {
    return {};
  }
}

function write(shortcuts: Shortcuts): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(shortcuts));
  } catch {
    // Not kept: it works until the page is closed.
  }
}

/** The combination of a key pressed (« Ctrl+Maj+D »), null for a modifier alone. Letters and digits by their place on the keyboard (⌥ changes the character). */
export function comboOf(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string | null {
  if (["Control", "Meta", "Alt", "Shift", "CapsLock", "Dead"].includes(event.key)) return null;
  const named: Record<string, string> = { Escape: "Échap", Delete: "Suppr", Backspace: "Retour", Enter: "Entrée", " ": "Espace" };
  const letter = /^Key([A-Z])$/.exec(event.code)?.[1] ?? /^Digit(\d)$/.exec(event.code)?.[1];
  const key = letter ?? named[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [event.metaKey || event.ctrlKey ? MOD : "", event.altKey ? "⌥" : "", event.shiftKey && key !== "?" ? "Maj" : "", key].filter(Boolean).join("+");
}

/** The combination given to `command` (none: null). */
export function shortcutOf(shortcuts: Shortcuts, command: string): string | null {
  return Object.entries(shortcuts).find(([, v]) => v.command === command)?.[0] ?? null;
}

/**
 * `combo` given to `command` (null: its shortcut taken away), the one it had and any other command it was given to
 * let go; or why not.
 */
export function assign(command: { key: string; label: string }, combo: string | null): string | null {
  if (combo && RESERVED.has(combo)) return `${combo} est un raccourci de l'éditeur.`;
  const kept = Object.fromEntries(Object.entries(readShortcuts()).filter(([c, v]) => v.command !== command.key && c !== combo));
  write(combo ? { ...kept, [combo]: { command: command.key, label: command.label } } : kept);
  return null;
}

/** The tools' own shortcuts on the keyboard: `button(key)` finds the tool's button when it is at hand. */
export function bindCustomShortcuts(button: (command: string) => HTMLElement | null): void {
  window.addEventListener("keydown", (event) => {
    if (event.repeat || document.querySelector("[data-palette-window]")) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    const combo = comboOf(event);
    const shortcut = combo ? readShortcuts()[combo] : undefined;
    const found = shortcut ? button(shortcut.command) : null;
    if (!found) return;
    event.preventDefault();
    event.stopPropagation();
    found.click();
  }, true);
}
