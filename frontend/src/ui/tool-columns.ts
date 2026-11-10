/**
 * La barre à quatre colonnes, entre le Navigateur et la vue : quatre colonnes d'icônes d'outils, chacune avec les
 * outils qu'on y met soi-même par son « + » (ui/tool-columns-picker.ts) ; un clic droit sur une icône l'en retire.
 * Chaque icône lance l'outil du ruban (ou de la colonne Sélection et vue), le même, même caché ou replié, et en
 * reprend l'état (enfoncé, grisé). La flèche ‹ en haut d'une colonne la replie : elle disparaît sans laisser de bande,
 * et seul un petit onglet numéroté reste en bas du bord gauche de la vue, par-dessus, pour la rouvrir. Les colonnes sont vides
 * au départ et les mêmes dans les trois espaces (Conception 3D, Dressing, Cuisine), gardées dans ce navigateur
 * (ui/tool-columns-store.ts). Cachées en esquisse, en rendu et sur les petits écrans.
 */
import { el } from "./dom";
import { keyOf } from "./ribbon-layout";
import { iconOf, openPicker, type Tool } from "./tool-columns-picker";
import { COLUMN_COUNT, readColumns, toggleFold, toggleTool, writeColumns, type ColumnsState } from "./tool-columns-store";

/** The view tools beside the viewport have no ribbon key: their first data attribute names them. */
function toolKey(button: HTMLElement): string | null {
  const key = keyOf(button);
  if (key) return key;
  const attribute = [...button.attributes].find((a) => a.name.startsWith("data-") && a.name !== "data-ref");
  return attribute ? `${attribute.name}:${attribute.value}` : null;
}

/** Every tool one may put in a column: the model's ribbon, then the selection and view column; each once. */
function catalogue(root: HTMLElement): Tool[] {
  const seen = new Set<string>();
  const buttons = [
    ...root.querySelectorAll<HTMLElement>('[data-ribbon="model"] .ribbon-row > button'),
    ...[...root.querySelectorAll<HTMLElement>("[data-side-tools] button")].filter((b) => !b.closest("[data-orbit-options]")),
  ];
  return buttons.flatMap((button) => {
    const key = toolKey(button);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    const label = button.getAttribute("aria-label") ?? button.title.split(" : ")[0] ?? key;
    const group = button.closest(".ribbon-group")?.getAttribute("aria-label") ?? "Sélection et vue";
    return [{ key, label, group, button }];
  });
}

export function bindToolColumns(root: HTMLElement): void {
  const tree = root.querySelector<HTMLElement>('[data-ref="panel-tree"]');
  if (!tree) return;
  // « cao.tool-columns-off »: no columns, the view where it was before them (the older browser tests, which click
  // the view by its coordinates).
  try {
    if (localStorage.getItem("cao.tool-columns-off") === "1") return;
  } catch {
    // The columns.
  }
  const tools = catalogue(root);
  const byKey = new Map(tools.map((t) => [t.key, t]));
  const known = (key: string) => byKey.has(key);
  let state: ColumnsState = readColumns(known);
  const visibility = "max-md:hidden group-data-[mode=sketch]/editor:hidden group-data-[render=on]/editor:hidden";

  const bar = el("aside", {
    class: `flex shrink-0 border-r border-gray-200 bg-white empty:hidden dark:border-gray-800 dark:bg-gray-900 ${visibility}`,
    "aria-label": "Barre d'outils en quatre colonnes",
    "data-tool-columns": "",
  });
  tree.after(bar);
  // The tabs of the folded columns, over the left edge of the view: they take no room beside it.
  const tabs = el("div", {
    class: `pointer-events-none absolute bottom-4 left-0 z-30 flex flex-col gap-1 ${visibility}`,
    role: "group",
    "aria-label": "Colonnes d'outils repliées",
    "data-tool-column-tabs": "",
  });
  root.querySelector("#main")?.append(tabs);
  const watchers: MutationObserver[] = [];

  const save = (next: ColumnsState) => {
    state = next;
    writeColumns(state);
    render();
  };

  /** A column's icon: runs the tool's own button and mirrors its state. */
  const iconButton = (tool: Tool, column: number): HTMLElement => {
    const button = el("button", { type: "button", class: "tool-btn icon-btn", "aria-label": tool.label, title: `${tool.button.title || tool.label} — clic droit : retirer de la colonne`, "data-tool-column-tool": tool.key }, iconOf(tool.button));
    const sync = () => {
      button.disabled = (tool.button as HTMLButtonElement).disabled === true;
      const pressed = tool.button.getAttribute("aria-pressed");
      if (pressed === null) button.removeAttribute("aria-pressed");
      else button.setAttribute("aria-pressed", pressed);
    };
    sync();
    const watcher = new MutationObserver(sync);
    watcher.observe(tool.button, { attributes: true, attributeFilter: ["aria-pressed", "disabled"] });
    watchers.push(watcher);
    button.addEventListener("click", () => tool.button.click());
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      save(toggleTool(state, column, tool.key));
    });
    return button;
  };

  /** A folded column's tab at the edge of the view: a click opens the column again. */
  const tabOf = (index: number): HTMLElement => {
    const tab = el(
      "button",
      {
        type: "button",
        class: "pointer-events-auto flex h-11 w-5 flex-col items-center justify-center border border-l-0 border-gray-200 bg-white/95 text-[10px] leading-none text-gray-500 shadow-md hover:bg-gray-100 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
        "aria-expanded": "false",
        "aria-label": `Déplier la colonne ${index + 1}`,
        title: `Déplier la colonne d'outils ${index + 1}`,
        "data-tool-column-unfold": String(index),
      },
      el("span", { "aria-hidden": "true" }, "›"),
      el("span", { "aria-hidden": "true" }, String(index + 1)),
    );
    tab.addEventListener("click", () => save(toggleFold(state, index)));
    return tab;
  };

  const columnOf = (index: number): HTMLElement => {
    const number = index + 1;
    const fold = el(
      "button",
      {
        type: "button",
        class: "flex h-6 w-full shrink-0 items-center justify-center text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
        "aria-expanded": "true",
        "aria-label": `Replier la colonne ${number}`,
        title: `Replier la colonne ${number} : elle laisse sa place à la vue, un onglet au bord de la vue la rouvre`,
        "data-tool-column-fold": String(index),
      },
      "‹",
    );
    fold.addEventListener("click", () => save(toggleFold(state, index)));
    const section = el("section", {
      class: "flex w-11 shrink-0 flex-col items-center border-r border-gray-100 last:border-r-0 dark:border-gray-800",
      "aria-label": `Colonne ${number}`,
      "data-tool-column": String(index),
    }, fold);
    const list = el("div", { class: "cad-no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto py-1" });
    list.append(...(state.columns[index] ?? []).flatMap((key) => {
      const tool = byKey.get(key);
      return tool ? [iconButton(tool, index)] : [];
    }));
    const add = el(
      "button",
      { type: "button", class: "tool-btn mb-1 min-h-8 min-w-8 shrink-0 px-1 text-lg leading-none text-gray-500 dark:text-gray-400", "aria-label": `Choisir les outils de la colonne ${number}`, title: `Choisir les outils de la colonne ${number}`, "aria-haspopup": "dialog", "aria-expanded": "false", "data-tool-column-add": String(index) },
      "+",
    );
    add.addEventListener("click", () =>
      openPicker(add, {
        column: number,
        tools,
        chosen: (key) => state.columns[index]?.includes(key) ?? false,
        toggle: (key) => save(toggleTool(state, index, key)),
      }),
    );
    section.append(list, add);
    return section;
  };

  const render = () => {
    for (const w of watchers.splice(0)) w.disconnect();
    const indexes = Array.from({ length: COLUMN_COUNT }, (_, i) => i);
    bar.replaceChildren(...indexes.filter((i) => !state.folded[i]).map(columnOf));
    tabs.replaceChildren(...indexes.filter((i) => state.folded[i]).map(tabOf));
  };
  render();
}
