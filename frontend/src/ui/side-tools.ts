/**
 * La colonne Sélection et vue, à droite de la vue, faite comme on la veut : une de ses icônes glissée hors des barres
 * y est cachée ; une icône d'une autre barre (le ruban, Mes outils, les sept colonnes) glissée sur elle s'y ajoute, en
 * bas, à la place marquée, et lance l'outil d'origine en reprenant son état (enfoncé, grisé). Son « + », tout en bas,
 * ouvre la liste de tous les outils : un clic montre ou cache une des siennes, ajoute ou retire une des autres. Gardé
 * dans ce navigateur (ui/tool-drag.ts pour le glisser). Une de ses icônes glissée sur une autre s'y range, avant ou
 * après elle, dans sa carte ou dans une autre ; l'ordre et la carte sont gardés aussi. Ses icônes sont rangées par
 * tâche, chaque carte une tâche : filtre, sélection, vue, affichage, voir dedans, puis les outils ajoutés.
 */
import { el } from "./dom";
import { catalogue, toolKey } from "./tool-catalogue";
import { iconOf, openPicker, type Tool } from "./tool-columns-picker";
import { draggableTool, registerBar } from "./tool-drag";

const STORAGE = "cao.side-tools";

interface SideState {
  /** Its own tools put away. */
  hidden: string[];
  /** Tools of other bars put at its bottom, in their order. */
  extra: string[];
  /** Its own tools in the order chosen. */
  order: string[];
  /** Its own tools moved to another card: the number of that card (the others stay in theirs). */
  box: Record<string, number>;
}

function read(): SideState {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
    const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof SideState, unknown>>;
    const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === "string"))] : []);
    const box = r.box && typeof r.box === "object" ? Object.fromEntries(Object.entries(r.box).filter(([, v]) => Number.isInteger(v))) : {};
    return { hidden: list(r.hidden), extra: list(r.extra), order: list(r.order), box };
  } catch {
    return { hidden: [], extra: [], order: [], box: {} };
  }
}

function write(state: SideState): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(state));
  } catch {
    // Not remembered: only this visit.
  }
}

/** Puts `key` at `index` of `list` (not doubled). */
export function placed(list: readonly string[], key: string, index: number): string[] {
  const out = list.filter((k) => k !== key);
  out.splice(Math.max(0, Math.min(index, out.length)), 0, key);
  return out;
}

export function bindSideTools(root: HTMLElement): void {
  const nav = root.querySelector<HTMLElement>("[data-side-tools]");
  if (!nav) return;
  const own = new Map<string, HTMLElement>();
  for (const button of nav.querySelectorAll<HTMLElement>("button")) {
    if (button.closest("[data-orbit-options]")) continue;
    const key = toolKey(button);
    if (key && !own.has(key)) own.set(key, button);
  }
  let state = read();
  state.hidden = state.hidden.filter((k) => own.has(k));
  const tools = () => new Map<string, Tool>(catalogue(root).map((t) => [t.key, t]));

  const extras = el("div", { class: "flex flex-col items-center gap-1 border border-gray-200 p-0.5 empty:hidden dark:border-gray-700", role: "group", "aria-label": "Outils ajoutés", "data-side-extra": "" });
  const add = el("button", { type: "button", class: "tool-btn mt-1 min-h-8 min-w-8 shrink-0 px-1 text-lg leading-none text-gray-500 dark:text-gray-400", "aria-label": "Choisir les outils de la colonne Sélection et vue", title: "Choisir les outils de cette colonne : montrer ou cacher les siens, en ajouter d'autres barres (ou les y glisser)", "aria-haspopup": "dialog", "aria-expanded": "false", "data-bar-control": "", "data-side-add": "" }, "+");
  nav.append(extras, add);
  const watchers: MutationObserver[] = [];

  const save = (next: SideState) => {
    state = next;
    write(state);
    render();
  };
  const hide = (key: string, on: boolean) => save({ ...state, hidden: on ? [...new Set([...state.hidden, key])] : state.hidden.filter((k) => k !== key) });
  const drop = (key: string) => save({ ...state, extra: state.extra.filter((k) => k !== key) });

  /** A tool of another bar: runs its own button and mirrors its state. */
  const proxy = (tool: Tool): HTMLElement => {
    const button = el("button", { type: "button", class: "tool-btn icon-btn", "aria-label": tool.label, title: `${tool.button.title || tool.label} — glisser hors des barres ou clic droit : retirer de cette colonne`, "data-tool-proxy": "", "data-side-extra-tool": tool.key }, iconOf(tool.button));
    const sync = () => {
      button.toggleAttribute("disabled", (tool.button as HTMLButtonElement).disabled === true);
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
      drop(tool.key);
    });
    draggableTool(button, () => ({ key: tool.key, label: tool.label, bar: nav, remove: () => drop(tool.key) }));
    return button;
  };

  const boxes = [...nav.querySelectorAll<HTMLElement>("[data-side-box]")];
  const home = new Map([...own].map(([key, button]) => [key, button.parentElement]));
  /** Its own tools in the order chosen, each in its card (its own, or the one it was moved to); the orbit's options follow the orbit. */
  const arrange = () => {
    for (const key of [...state.order.filter((k) => own.has(k)), ...[...own.keys()].filter((k) => !state.order.includes(k))]) {
      const button = own.get(key) as HTMLElement;
      const options = button.nextElementSibling?.matches("[data-orbit-options]") ? [button.nextElementSibling] : [];
      (boxes[state.box[key] ?? -1] ?? home.get(key))?.append(button, ...options);
    }
  };
  /** One of its own tools under the pointer, in any card: the dragged one goes before or after it, into its card. */
  const spot = (event: DragEvent, key: string) => {
    const over = (event.target as Element).closest<HTMLElement>("button");
    const at = over && [...own].find(([, b]) => b === over)?.[0];
    if (!over || !at || at === key) return null;
    const box = over.getBoundingClientRect();
    return { over, at, first: event.clientY < box.top + box.height / 2 };
  };

  const render = () => {
    arrange();
    // Only the ones put away here are touched (others are shown or hidden by their own tool).
    for (const [key, button] of own) {
      if (state.hidden.includes(key)) {
        button.hidden = true;
        button.dataset.sideHidden = "";
      } else if (button.dataset.sideHidden !== undefined) {
        button.hidden = false;
        delete button.dataset.sideHidden;
      }
    }
    // A box whose buttons are all put away goes too (the orbit's options are not counted).
    for (const box of nav.querySelectorAll<HTMLElement>("[data-side-box]")) box.hidden = [...box.querySelectorAll(":scope > button")].every((b) => (b as HTMLElement).hidden);
    for (const w of watchers.splice(0)) w.disconnect();
    const byKey = tools();
    extras.replaceChildren(...state.extra.flatMap((key) => {
      const tool = byKey.get(key);
      return tool && !own.has(key) ? [proxy(tool)] : [];
    }));
  };

  for (const [key, button] of own) draggableTool(button, () => ({ key, label: button.getAttribute("aria-label") ?? key, bar: nav, remove: () => hide(key, true) }));

  /** Where a tool dropped on the column goes among the added ones: before or after the one under the pointer, or last. */
  const place = (event: DragEvent, key: string): { index: number; over: HTMLElement | null; side: "before" | "after" } => {
    const others = state.extra.filter((k) => k !== key);
    const over = (event.target as Element).closest<HTMLElement>("[data-side-extra-tool]");
    const at = over?.dataset.sideExtraTool;
    if (!over || !at || at === key) return { index: others.length, over: null, side: "after" };
    const box = over.getBoundingClientRect();
    const first = event.clientY < box.top + box.height / 2;
    return { index: others.indexOf(at) + (first ? 0 : 1), over, side: first ? "before" : "after" };
  };
  registerBar({
    element: nav,
    accepts: (key) => own.has(key) || tools().has(key),
    mark: (event, key) => {
      for (const marked of nav.querySelectorAll<HTMLElement>("[data-drop]")) delete marked.dataset.drop;
      delete nav.dataset.drop;
      if (!event) return;
      const at = own.has(key) ? spot(event, key) : null;
      const { over, side } = at ? { over: at.over, side: at.first ? ("before" as const) : ("after" as const) } : own.has(key) ? { over: null, side: "after" as const } : place(event, key);
      if (over) over.dataset.drop = side;
      else nav.dataset.drop = "end";
    },
    drop: (key, event) => {
      const at = own.has(key) ? spot(event, key) : null;
      if (at) {
        const shown = [...own].sort(([, a], [, b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map(([k]) => k).filter((k) => k !== key);
        return save({ ...state, hidden: state.hidden.filter((k) => k !== key), order: placed(shown, key, shown.indexOf(at.at) + (at.first ? 0 : 1)), box: { ...state.box, [key]: boxes.indexOf(at.over.parentElement as HTMLElement) } });
      }
      if (own.has(key)) return hide(key, false);
      save({ ...state, extra: placed(state.extra, key, place(event, key).index) });
    },
  });

  add.addEventListener("click", () =>
    openPicker(add, {
      column: 0,
      title: "Sélection et vue : choisir les outils",
      tools: [...tools().values()],
      chosen: (key) => (own.has(key) ? !state.hidden.includes(key) : state.extra.includes(key)),
      toggle: (key) => {
        if (own.has(key)) return hide(key, !state.hidden.includes(key));
        if (state.extra.includes(key)) return drop(key);
        save({ ...state, extra: [...state.extra, key] });
      },
    }),
  );
  render();
}
