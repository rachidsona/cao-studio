/**
 * L'aide outil par outil : un sommaire par familles, une recherche sans accents ni majuscules, et la fiche de l'outil
 * choisi, avec l'icône de son vrai bouton. Les fiches sont dans help-content/ ; un test vérifie que chaque bouton a la sienne.
 */
import { searchCommands, type Command } from "../ui/command-search";
import { el } from "../ui/dom";
import { keyOf } from "../ui/ribbon-layout";
import { HELP_FAMILIES } from "./help-content";
import type { HelpFamily, ToolHelp } from "./help-content/types";

interface Entry {
  tool: ToolHelp;
  family: HelpFamily;
  command: Command;
}

const ENTRIES: Entry[] = HELP_FAMILIES.flatMap((family) =>
  family.tools.map((tool, i) => ({ tool, family, command: { key: `${family.title}/${i}`, label: tool.name, group: family.title, hint: [tool.what, ...tool.steps, tool.tip ?? ""].join(" ") } })),
);

/** The icon of the tool's own button, so that the sheet shows what to look for on screen. */
function iconOf(root: HTMLElement, tool: ToolHelp): Node | null {
  const buttons = tool.selector
    ? [...root.querySelectorAll<HTMLElement>(tool.selector)]
    : [...root.querySelectorAll<HTMLElement>("button")].filter((button) => tool.keys.includes(keyOf(button) ?? ""));
  return buttons.flatMap((button) => [...button.querySelectorAll("svg")])[0]?.cloneNode(true) ?? null;
}

function sheet(root: HTMLElement, { tool, family }: Entry): HTMLElement {
  return el(
    "article",
    { class: "space-y-3 text-sm", "data-help-sheet": "" },
    el(
      "header",
      { class: "flex items-center gap-3" },
      el("span", { class: "flex size-10 shrink-0 items-center justify-center text-sky-600 [&>svg]:size-8 dark:text-sky-400", "aria-hidden": "true" }, iconOf(root, tool)),
      el("div", { class: "min-w-0" }, el("h3", { class: "text-base font-semibold" }, tool.name), el("p", { class: "text-xs text-gray-500 dark:text-gray-400" }, family.title)),
    ),
    el("p", {}, tool.what),
    el("ol", { class: "list-decimal space-y-1.5 pl-5" }, ...tool.steps.map((step) => el("li", {}, step))),
    tool.tip ? el("p", { class: "border-l-2 border-sky-500 pl-3 text-gray-700 dark:text-gray-300" }, el("span", { class: "font-semibold" }, "À savoir : "), tool.tip) : null,
    el("p", { class: "text-xs text-gray-500 dark:text-gray-400" }, el("span", { class: "font-semibold" }, "Où le trouver : "), family.where),
  );
}

/** The whole of the help; `intro` is the first page, shown until a tool is chosen. */
export function helpBrowser(root: HTMLElement, intro: HTMLElement): HTMLElement {
  const input = el("input", { type: "search", placeholder: "Chercher un outil : étagère, chant, cote…", "aria-label": "Chercher un outil", class: "h-9 w-full border border-gray-300 bg-transparent px-2 text-sm outline-none focus:border-sky-500 dark:border-gray-600" });
  const list = el("nav", { class: "max-h-44 min-h-0 overflow-y-auto border-b border-gray-200 pb-2 md:max-h-none md:border-r md:border-b-0 md:pr-2 md:pb-0 dark:border-gray-700", "aria-label": "Sommaire de l'aide" });
  const page = el("div", { class: "min-h-0 overflow-y-auto md:pl-4" }, intro);
  const rows = new Map<Entry | null, HTMLElement>();
  const choose = (entry: Entry | null) => {
    page.replaceChildren(entry ? sheet(root, entry) : intro);
    page.scrollTop = 0;
    for (const [of, row] of rows) row.dataset.current = String(of === entry);
  };
  const row = (entry: Entry | null, label: string) => {
    const button = el("button", { type: "button", class: "block w-full px-2 py-1 text-left text-sm hover:bg-gray-100 data-[current=true]:bg-sky-100 dark:hover:bg-gray-800 dark:data-[current=true]:bg-sky-900" }, label);
    button.addEventListener("click", () => choose(entry));
    rows.set(entry, button);
    return button;
  };
  const summary = () => [
    row(null, "Prise en main et raccourcis"),
    ...HELP_FAMILIES.map((family) =>
      el("details", {}, el("summary", { class: "cursor-pointer px-2 py-1 text-sm font-semibold" }, `${family.title} (${family.tools.length})`), ...ENTRIES.filter((entry) => entry.family === family).map((entry) => row(entry, entry.tool.name))),
    ),
  ];
  const search = () => {
    rows.clear();
    if (!input.value.trim()) {
      list.replaceChildren(...summary());
      return;
    }
    const found = searchCommands(ENTRIES.map((entry) => entry.command), input.value).flatMap((command) => ENTRIES.filter((entry) => entry.command === command));
    list.replaceChildren(...found.map((entry) => row(entry, entry.tool.name)), ...(found.length ? [] : [el("p", { class: "px-2 py-1 text-sm text-gray-500" }, "Aucun outil de ce nom.")]));
    if (found[0]) choose(found[0]);
  };
  input.addEventListener("input", search);
  list.replaceChildren(...summary());
  rows.get(null)?.setAttribute("data-current", "true");
  queueMicrotask(() => input.focus());
  return el("div", { class: "flex h-[calc(100dvh-8rem)] flex-col gap-3", "data-help-window": "" }, input, el("div", { class: "grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 md:grid-cols-[17rem_1fr] md:grid-rows-1 md:gap-0" }, list, page));
}
