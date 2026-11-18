/**
 * La palette de commandes : ⌘K (Ctrl+K), on tape quelques lettres, Entrée lance l'outil. Elle lit les boutons de la page,
 * ceux rangés dans les menus compris : tout outil ajouté au ruban s'y trouve sans rien de plus, et seuls ceux du mode en
 * cours sont proposés (esquisse ou modèle). Les derniers utilisés reviennent en tête, gardés dans ce navigateur.
 */
import { buttonHint } from "../ui/icon-titles";
import { searchCommands, type Command } from "../ui/command-search";
import { el } from "../ui/dom";
import { keyOf } from "../ui/ribbon-layout";
import { assign, bindCustomShortcuts, comboOf, readShortcuts, shortcutOf } from "./custom-shortcuts";

const KEY = "cao.palette-recent";
const SHOWN = 12;

function readRecent(): string[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(kept) ? kept.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([key, ...readRecent().filter((k) => k !== key)].slice(0, 6)));
  } catch {
    // Not remembered: only the order of the list suffers.
  }
}

/** The tools at hand now: the ribbon of the mode, and the buttons of the bars and menus around it. */
function commands(root: HTMLElement): { command: Command; button: HTMLElement }[] {
  const mode = root.dataset.mode ?? "model";
  const seen = new Set<string>();
  return [...root.querySelectorAll<HTMLButtonElement>("button")].flatMap((button) => {
    const key = keyOf(button);
    if (!key || seen.has(key) || button.disabled) return [];
    const ribbon = button.closest<HTMLElement>("[data-ribbon]")?.dataset.ribbon;
    if (ribbon && ribbon !== mode) return [];
    // What its tooltip explained (the tooltip of an icon now says its name only: ui/icon-titles.ts).
    const title = buttonHint(button);
    const label = button.getAttribute("aria-label") ?? (button.textContent?.trim() || button.dataset.tip || title.split(" : ")[0] || "");
    if (!label) return [];
    seen.add(key);
    return [{ command: { key, label, group: button.closest(".ribbon-group")?.getAttribute("aria-label") ?? "", hint: title }, button }];
  });
}

function open(root: HTMLElement): void {
  if (document.querySelector("[data-palette-window]")) return;
  const all = commands(root);
  const list = el("ul", { class: "max-h-96 overflow-y-auto", role: "listbox", "aria-label": "Commandes" });
  const input = el("input", { type: "text", placeholder: "Rechercher un outil…", "aria-label": "Rechercher un outil", class: "h-11 w-full border-b border-gray-200 bg-transparent px-3 text-sm outline-none dark:border-gray-700" });
  const panel = el("div", { class: "mx-auto mt-[12vh] w-full max-w-lg border border-gray-200 bg-white text-gray-900 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" }, input, list);
  const overlay = el("div", { class: "fixed inset-0 z-50 bg-black/40 p-4", role: "dialog", "aria-label": "Palette de commandes", "data-palette-window": "" }, panel);
  let found: Command[] = [];
  let at = 0;
  // The tool whose shortcut is being chosen: the next key pressed is it.
  let choosing: Command | null = null;
  let warning = "";
  const close = () => overlay.remove();
  const run = (command: Command | undefined) => {
    if (!command) return;
    close();
    remember(command.key);
    all.find((c) => c.command === command)?.button.click();
  };
  const draw = () => {
    list.replaceChildren(
      ...found.slice(0, SHOWN).map((command, i) => {
        const combo = shortcutOf(readShortcuts(), command.key);
        const waiting = choosing === command;
        const chip = el("button", { type: "button", class: `shrink-0 border px-1.5 font-mono text-xs ${waiting ? "border-sky-500 text-sky-700 dark:text-sky-300" : combo ? "border-gray-300 dark:border-gray-600" : "border-dashed border-gray-300 text-gray-400 dark:border-gray-600"}`, title: "Choisir le raccourci de cet outil : cliquer, puis appuyer sur la touche (Retour l'enlève, Échap annule)", "data-shortcut-of": command.key }, waiting ? "Appuyez sur une touche…" : (combo ?? "+ touche"));
        chip.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          choosing = waiting ? null : command;
          warning = "";
          at = i;
          draw();
        });
        const row = el("li", { role: "option", "aria-selected": String(i === at), class: `flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${i === at ? "bg-sky-100 dark:bg-sky-900" : ""}` }, el("span", { class: "min-w-0 flex-1 truncate" }, command.label), el("span", { class: "shrink-0 text-xs text-gray-500" }, command.group), chip);
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          run(command);
        });
        return row;
      }),
      ...(found.length ? [] : [el("li", { class: "px-3 py-2 text-sm text-gray-500" }, "Aucun outil de ce nom.")]),
      ...(warning ? [el("li", { class: "px-3 py-2 text-xs text-amber-700 dark:text-amber-300", role: "status" }, warning)] : []),
    );
  };
  const search = () => {
    found = searchCommands(all.map((c) => c.command), input.value, readRecent());
    at = 0;
    draw();
  };
  input.addEventListener("input", search);
  input.addEventListener("blur", () => setTimeout(close, 0));
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (choosing) {
      event.preventDefault();
      const combo = event.key === "Escape" ? undefined : event.key === "Backspace" || event.key === "Delete" ? null : comboOf(event);
      if (combo === undefined) choosing = null;
      else if (combo === null && event.key !== "Backspace" && event.key !== "Delete") return;
      else {
        warning = assign(choosing, combo) ?? "";
        if (!warning) choosing = null;
      }
      return draw();
    }
    const last = Math.min(found.length, SHOWN) - 1;
    if (event.key === "Escape") close();
    else if (event.key === "Enter") run(found[at]);
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      at = event.key === "ArrowDown" ? (at >= last ? 0 : at + 1) : at <= 0 ? last : at - 1;
      draw();
    }
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  document.body.append(overlay);
  search();
  input.focus();
}

export function bindCommandPalette(root: HTMLElement): void {
  window.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
    event.preventDefault();
    event.stopPropagation();
    open(root);
  }, true);
  root.querySelector("[data-command-palette]")?.addEventListener("click", () => open(root));
  bindCustomShortcuts((key) => commands(root).find((c) => c.command.key === key)?.button ?? null);
}
