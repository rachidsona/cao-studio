/** La liste des modules de dressing, à choisir d'un clic : dans l'outil Module et le programme de l'assistant Dressing. */
import { MODULES, type ModuleKind } from "../document/dressing-modules";
import { el } from "../ui/dom";
import { toolIcon } from "../ui/icons";

/** The toolbar icon of each module. */
export const MODULE_ICONS: Record<ModuleKind, string> = { long: "i-rod", double: "i-rod", shelves: "i-shelves", drawers: "i-drawers", "rod-drawers": "i-drawers", shoes: "i-shelves", trousers: "i-rod" };

/** A row of the list: a module, with its icon. */
export function moduleChoice(label: string, kind: ModuleKind, pressed: boolean, pick: () => void, hint = ""): HTMLElement {
  const button = el(
    "button",
    {
      type: "button",
      class: `flex min-h-8 w-full min-w-0 items-center gap-1.5 px-1.5 py-1 text-left text-xs hover:bg-sky-50 dark:hover:bg-sky-950 ${pressed ? "bg-sky-100 font-semibold dark:bg-sky-900" : ""}`,
      "aria-pressed": String(pressed),
      "data-module": kind,
      ...(hint ? { title: hint } : {}),
    },
    toolIcon(MODULE_ICONS[kind], "size-5 shrink-0"),
    el("span", { class: "min-w-0 flex-1" }, label),
  );
  button.addEventListener("click", pick);
  return el("li", {}, button);
}

/** Every module of the catalogue, the one in use marked. */
export function moduleList(selected: ModuleKind | null, pick: (kind: ModuleKind) => void): HTMLElement {
  return el(
    "ul",
    { class: "divide-y divide-gray-200 border border-gray-200 dark:divide-gray-700 dark:border-gray-700", "aria-label": "Modules" },
    ...(Object.keys(MODULES) as ModuleKind[]).map((kind) => moduleChoice(MODULES[kind].label, kind, kind === selected, () => pick(kind))),
  );
}
