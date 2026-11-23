/**
 * La barre à sept colonnes, entre le Navigateur et la vue : sept colonnes d'icônes d'outils, chacune avec les outils
 * qu'on y met soi-même par son « + » (ui/tool-columns-picker.ts) ; un clic droit sur une icône l'en retire, ou la
 * glisser hors des colonnes. Une icône se glisse plus haut ou plus bas dans sa colonne, ou dans une autre ; Alt + ↑ / ↓
 * la monte ou la descend. Le « + » ajoute aussi des séparateurs, au bas de la colonne : une ligne, ou un espace vide de
 * la taille d'une icône ; ils se glissent et se retirent comme une icône.
 * Chaque icône lance l'outil du ruban (ou de la colonne Sélection et vue), le même, même caché ou replié, et en
 * reprend l'état (enfoncé, grisé). La flèche ‹ en haut d'une colonne la replie : elle disparaît sans laisser de bande,
 * et seul un petit onglet reste en bas du bord gauche de la vue, par-dessus, pour la rouvrir : son nom écrit debout
 * (sans nom, son numéro). Les colonnes sont vides
 * au départ et les mêmes dans les trois espaces (Conception 3D, Dressing, Cuisine), gardées dans ce navigateur, chacune
 * avec son nom, écrit en haut sous la flèche (un double-clic le change ; vide, son numéro) ; ses icônes se
 * tiennent au milieu de sa hauteur
 * (ui/tool-columns-store.ts). Cachées en esquisse, en rendu et sur les petits écrans ; la vue garde toujours au moins
 * 200 px : les colonnes qui n'y tiennent pas (fenêtre étroite, panneaux larges) passent pour l'instant à leur onglet.
 */
import { el } from "./dom";
import { EDGE_TAB_CLASS, edgeTabs } from "./edge-tabs";
import { catalogue } from "./tool-catalogue";
import { iconOf, openPicker, type Tool } from "./tool-columns-picker";
import { addSeparator, COLUMN_COUNT, columnName, insertTool, isSeparator, moveTool, NAME_LENGTH, readColumns, renamed, separatorKind, toggleFold, toggleTool, writeColumns, type ColumnsState } from "./tool-columns-store";
import { draggableTool, draggedTool, registerBar } from "./tool-drag";

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
    "aria-label": "Barre d'outils en sept colonnes",
    "data-tool-columns": "",
  });
  tree.after(bar);
  // The tabs of the folded columns, over the left edge of the view: they take no room beside it.
  const tabs = el("div", {
    class: `flex flex-col gap-1 ${visibility}`,
    role: "group",
    "aria-label": "Colonnes d'outils repliées",
    "data-tool-column-tabs": "",
  });
  edgeTabs(root)?.append(tabs);
  const watchers: MutationObserver[] = [];
  // The view keeps room: beside it, as many open columns as fit (the others wait at their tab, not folded for good).
  const MIN_VIEW = 200;
  const COLUMN_WIDTH = 45;
  const row = bar.parentElement;
  const others = () => [...(row?.children ?? [])].filter((k) => k !== bar && !k.matches('[data-ref="workspace"]'));
  const fitting = () => {
    if (!row) return COLUMN_COUNT;
    const free = row.clientWidth - others().reduce((sum, k) => sum + k.getBoundingClientRect().width, 0);
    return Math.max(0, Math.floor((free - MIN_VIEW) / COLUMN_WIDTH));
  };
  let fits = fitting();
  /** Columns opened from their tab, the last first: they are the ones shown when not all fit. */
  const wanted: number[] = [];
  /** The icon being dragged to another place. */
  let dragging: { column: number; key: string } | null = null;

  const save = (next: ColumnsState) => {
    state = next;
    writeColumns(state);
    render();
  };
  const iconAt = (column: number, key: string) =>
    [...bar.querySelectorAll<HTMLElement>(`[data-tool-column="${column}"] [data-tool-column-tool]`)].find((b) => b.dataset.toolColumnTool === key);

  /** Right-click takes it out; it is dragged to another place (another bar, or out of the bars), Alt + ↑ / ↓ moves it. */
  const movable = (item: HTMLElement, column: number, key: string, label: string) => {
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      save(toggleTool(state, column, key));
    });
    draggableTool(item, () => ({ key, label, bar, remove: () => save(toggleTool(state, column, key)) }));
    item.addEventListener("dragstart", () => (dragging = { column, key }));
    item.addEventListener("dragend", () => (dragging = null));
    // Alt + ↑ / ↓: one place up or down in the column.
    item.addEventListener("keydown", (event) => {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      event.stopPropagation();
      const at = state.columns[column]?.indexOf(key) ?? -1;
      save(moveTool(state, column, key, column, at + (event.key === "ArrowUp" ? -1 : 1)));
      iconAt(column, key)?.focus();
    });
  };

  /** A separator: a thin line between two icons, or an empty place as big as an icon (its outline shows on hover). */
  const separator = (key: string, kind: "line" | "space", column: number): HTMLElement => {
    const label = kind === "line" ? "Ligne de séparation" : "Espace vide";
    const item = el(
      "div",
      {
        class: `flex w-10 shrink-0 cursor-grab items-center justify-center outline-offset-[-2px] hover:outline hover:outline-1 hover:outline-dashed hover:outline-gray-400 focus-visible:outline-2 focus-visible:outline-sky-600 ${kind === "line" ? "h-3" : "h-10"}`,
        role: "separator",
        tabindex: "0",
        "aria-label": label,
        title: `${label} — glisser pour changer sa place (Alt + ↑ / ↓) ; glisser hors des colonnes ou clic droit : retirer`,
        "data-tool-column-tool": key,
        "data-separator": kind,
        draggable: "true",
      },
      kind === "line" ? el("span", { class: "block h-px w-8 bg-gray-400 dark:bg-gray-500", "aria-hidden": "true" }) : null,
    );
    movable(item, column, key, label);
    return item;
  };

  /** A column's icon: runs the tool's own button and mirrors its state. */
  const iconButton = (tool: Tool, column: number): HTMLElement => {
    const button = el("button", { type: "button", class: "tool-btn icon-btn", "aria-label": tool.label, title: `${tool.button.title || tool.label} — glisser pour changer sa place (Alt + ↑ / ↓) ; glisser hors des colonnes ou clic droit : retirer`, "data-tool-column-tool": tool.key, draggable: "true" }, iconOf(tool.button));
    // Its own size here (the column's 28 px), whatever the size of the icon it was copied from.
    button.querySelector("svg")?.classList.remove("size-4", "size-5", "size-6", "size-8");
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
    movable(button, column, tool.key, tool.label);
    return button;
  };

  /** A folded column's tab at the edge of the view: a click opens the column again. */
  const tabOf = (index: number): HTMLElement => {
    const tab = el(
      "button",
      {
        type: "button",
        class: `${EDGE_TAB_CLASS} ${state.names[index] ? "" : "h-9"}`,
        "aria-expanded": "false",
        "aria-label": `Déplier la colonne ${index + 1}${state.names[index] ? ` (${state.names[index]})` : ""}`,
        title: `Déplier la colonne d'outils ${index + 1}${state.names[index] ? ` (${state.names[index]})` : ""}`,
        "data-tool-column-unfold": String(index),
      },
      el("span", { "aria-hidden": "true" }, "›"),
      // Its name written upright, as the Navigator's tab; unnamed, its number.
      state.names[index] ? el("span", { class: "edge-tab-vertical", "aria-hidden": "true", "data-tool-column-tab-name": "" }, state.names[index]) : el("span", { "aria-hidden": "true" }, String(index + 1)),
    );
    tab.addEventListener("click", () => {
      wanted.splice(0, wanted.length, index, ...wanted.filter((i) => i !== index));
      if (state.folded[index]) save(toggleFold(state, index));
      else render();
    });
    return tab;
  };

  /** A column's name at its top: its number until it is given one; a double-click changes it (Entrée keeps, Échap leaves). */
  const nameOf = (index: number): HTMLElement => {
    const label = el(
      "span",
      {
        class: "line-clamp-2 w-full cursor-text px-px text-center text-3xs leading-tight font-semibold tracking-tighter hyphens-auto text-gray-500 select-none dark:text-gray-400",
        title: `${columnName(state, index)} — double-clic pour changer son nom`,
        "data-tool-column-name": String(index),
      },
      state.names[index] || String(index + 1),
    );
    // A long word made a little smaller, so that it fits the column's width rather than being cut.
    const longest = Math.max(0, ...(state.names[index] ?? "").split(" ").map((w) => w.length));
    if (longest > 7) label.style.fontSize = longest > 9 ? "8px" : "9px";
    label.addEventListener("dblclick", () => {
      const field = el("input", { type: "text", class: "h-5 w-full min-w-0 border border-sky-500 bg-white px-0.5 text-3xs text-gray-900 focus:outline-none dark:bg-gray-950 dark:text-gray-100", value: state.names[index] ?? "", maxlength: String(NAME_LENGTH), "aria-label": `Nom de la colonne ${index + 1}`, placeholder: String(index + 1), "data-tool-column-rename": String(index) });
      let done = false;
      const keep = (yes: boolean) => {
        if (done) return;
        done = true;
        if (yes) save(renamed(state, index, field.value));
        else render();
      };
      field.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") keep(true);
        else if (event.key === "Escape") keep(false);
      });
      field.addEventListener("blur", () => keep(true));
      label.replaceWith(field);
      field.focus();
      field.select();
    });
    return label;
  };

  const columnOf = (index: number): HTMLElement => {
    const number = index + 1;
    const name = columnName(state, index);
    const fold = el(
      "button",
      {
        type: "button",
        class: "flex h-5 w-full shrink-0 items-center justify-center text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
        "aria-expanded": "true",
        "aria-label": `Replier la colonne ${number}`,
        title: `Replier « ${name} » : elle laisse sa place à la vue, un onglet au bord de la vue la rouvre`,
        "data-tool-column-fold": String(index),
      },
      "‹",
    );
    fold.addEventListener("click", () => save(toggleFold(state, index)));
    const head = el("div", { class: "flex w-full shrink-0 flex-col items-center border-b border-gray-100 pb-0.5 dark:border-gray-800" }, fold, nameOf(index));
    const section = el("section", {
      class: "flex w-12 shrink-0 flex-col items-center border-r border-gray-100 last:border-r-0 dark:border-gray-800",
      "aria-label": name,
      "data-tool-column": String(index),
    }, head);
    // Its icons in the middle of its height; scrolled when they are more than it holds.
    const list = el("div", { class: "cad-no-scrollbar flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto py-1" });
    const icons = el("div", { class: "my-auto flex flex-col items-center gap-0.5" });
    list.append(icons);
    icons.append(...(state.columns[index] ?? []).flatMap((key) => {
      const kind = separatorKind(key);
      if (kind) return [separator(key, kind, index)];
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
        separate: (kind) => save(addSeparator(state, index, kind)),
      }),
    );
    section.append(list, add);
    return section;
  };

  /**
   * Where a dragged icon lands in a column: before or after the icon under the pointer (by its half), or at the end.
   * Returns the place among the column's tools without the dragged one, and the icon to mark.
   */
  const dropPlace = (column: number, event: DragEvent): { index: number; over: HTMLElement | null; side: "before" | "after" } => {
    const moving = dragging?.key ?? draggedTool()?.key;
    const keys = (state.columns[column] ?? []).filter((k) => k !== moving);
    const over = (event.target as HTMLElement).closest<HTMLElement>("[data-tool-column-tool]");
    const key = over?.dataset.toolColumnTool;
    if (!over || !key || key === moving) return { index: keys.length, over: null, side: "after" };
    const box = over.getBoundingClientRect();
    const side = event.clientY < box.top + box.height / 2 ? "before" : "after";
    return { index: keys.indexOf(key) + (side === "after" ? 1 : 0), over, side };
  };
  // Dropped on a column: moved there from its own, or put there from another bar (ui/tool-drag.ts).
  const columnAt = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-tool-column]") : null);
  const unmarkAll = () => {
    for (const marked of bar.querySelectorAll<HTMLElement>("[data-drop]")) delete marked.dataset.drop;
  };
  registerBar({
    element: bar,
    accepts: (key) => known(key) || (isSeparator(key) && !!dragging),
    mark: (event) => {
      unmarkAll();
      const section = event && columnAt(event.target);
      if (!event || !section) return;
      const { over, side } = dropPlace(Number(section.dataset.toolColumn), event);
      if (over) over.dataset.drop = side;
      else section.dataset.drop = "end";
    },
    drop: (key, event) => {
      const section = columnAt(event.target);
      if (!section) return;
      const column = Number(section.dataset.toolColumn);
      const { index } = dropPlace(column, event);
      const moved = dragging;
      dragging = null;
      save(moved ? moveTool(state, moved.column, moved.key, column, index) : insertTool(state, column, key, index));
    },
  });

  const render = () => {
    for (const w of watchers.splice(0)) w.disconnect();
    const indexes = Array.from({ length: COLUMN_COUNT }, (_, i) => i);
    const rank = (i: number) => (wanted.includes(i) ? wanted.indexOf(i) - COLUMN_COUNT : i);
    const shown = new Set(indexes.filter((i) => !state.folded[i]).sort((a, b) => rank(a) - rank(b)).slice(0, fits));
    bar.replaceChildren(...indexes.filter((i) => shown.has(i)).map(columnOf));
    tabs.replaceChildren(...indexes.filter((i) => !shown.has(i)).map(tabOf));
  };
  render();
  // A narrower window, a panel opened or closed: the columns that fit again.
  const refit = () => {
    const next = fitting();
    if (next !== fits) {
      fits = next;
      render();
    }
  };
  const resized = new ResizeObserver(refit);
  if (row) {
    for (const k of [row, ...row.children]) resized.observe(k);
    // A panel put in the row later (the projects' column): watched too.
    new MutationObserver(() => {
      for (const k of row.children) resized.observe(k);
      refit();
    }).observe(row, { childList: true });
  }
}
