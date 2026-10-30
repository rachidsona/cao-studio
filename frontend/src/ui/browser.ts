/**
 * Model browser (left panel), like the browser of desktop CAD tools: the
 * bodies and the sketches of the document, each with an eye icon to show or
 * hide it. A click selects; Ctrl, Cmd or Maj + clic adds bodies and sketches
 * to the selection (several at once); the "⋯" button opens the dialog to edit, rename
 * or delete. Operations (extrusion, hole…) are in the timeline instead.
 *
 * The bodies form a tree that unfolds: the bodies made together (pieces of a
 * split, panels, parts of a cabinet…) are in one folder, and each body opens
 * on the history that built it. What is open is remembered in this browser.
 */
import { el } from "./dom";
import { STATE_BADGES, TYPE_ICONS, type NavItem } from "./feature-meta";
import { dotsIcon, eyeIcon, trashIcon } from "./icons";

export interface BrowserHandlers {
  /** `adding`: Ctrl, Cmd or Maj was held (adds to, or removes from, a multiple selection). */
  onSelectBody(bodyId: string, adding: boolean): void;
  onSelectSketch(id: string, adding: boolean): void;
  /** A step of the history of a body. */
  onSelectFeature(id: string): void;
  onToggleHidden(id: string): void;
  /** The eye of the "Corps" heading: shows or hides every body (`ids`: what `onToggleHidden` takes). */
  onSetHidden(ids: string[], hidden: boolean): void;
  /** The bin of the "Corps" heading: deletes every body. */
  onRemoveBodies(bodyIds: string[]): void;
  /** The "⋯" button of a row (`body`: the row is a body, `id` its latest feature). */
  onMenu(id: string, anchor: DOMRect, body: boolean): void;
}

/** A body of the tree, with the features that built it. */
export interface BodyRow {
  item: NavItem;
  /** Name in the tree (shorter inside a folder). */
  label: string;
  history: NavItem[];
}

export type BodyEntry = { body: BodyRow } | { group: { id: string; name: string; bodies: BodyRow[] } };

const OPEN_KEY = "cao.browser.open";

/** Folders and bodies whose state differs from the default (folders open, bodies closed). */
function loadToggled(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveToggled(toggled: Set<string>): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...toggled]));
  } catch {
    // Storage unavailable: the tree simply forgets.
  }
}

const toggled = loadToggled();
// Folders of a cabinet open by default; the folders of the kinds of pieces (Étagères, Côtés… : body-kinds.ts) closed,
// so that a long cabinet fits; a click remembers the other state.
const isOpen = (key: string) => (key.startsWith("group:") && !key.startsWith("group:kind:") ? !toggled.has(key) : toggled.has(key));

function chevron(key: string, name: string): HTMLElement {
  const open = isOpen(key);
  return el(
    "button",
    {
      type: "button",
      class: "size-6 shrink-0 text-base leading-none text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700",
      title: open ? "Replier" : "Déplier",
      "aria-label": `${open ? "Replier" : "Déplier"} ${name}`,
      "aria-expanded": String(open),
      "data-toggle": key,
    },
    el("span", { class: `inline-block transition-transform ${open ? "rotate-90" : ""}`, "aria-hidden": "true" }, "▸"),
  );
}

/** The bodies, and the sketches, are each in one card with a strong shadow; the rows inside are flat. */
const CARD =
  "cad-card border border-gray-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.30)] " +
  "dark:border-gray-700 dark:bg-gray-800 dark:shadow-[0_6px_20px_rgba(0,0,0,0.75)]";
/** A row of a card: flat, blue when selected. */
const flat = (selected: boolean, idle = "hover:bg-gray-100 dark:hover:bg-gray-700/60") =>
  selected ? " bg-sky-100 text-sky-950 dark:bg-sky-900/60 dark:text-sky-50" : ` ${idle}`;

/** Rows under a folder or a body, shifted right with a guide line. */
const children = (key: string, rows: HTMLElement[]) =>
  el("ul", { class: "ml-4 space-y-0.5 border-l border-gray-200 pl-1 dark:border-gray-600", "data-children": key, ...(isOpen(key) ? {} : { hidden: "" }) }, ...rows);

function row(item: NavItem, selected: boolean, onSelectKey: string, menuId = item.id, toggle: HTMLElement | null = null, menuKind = ""): HTMLElement {
  const badge = STATE_BADGES[item.state];
  const eye = el(
    "button",
    {
      type: "button",
      class: `size-8 shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700 ${item.hidden ? "text-gray-400 dark:text-gray-500" : "text-sky-700 dark:text-sky-300"}`,
      title: item.hidden ? "Afficher" : "Masquer",
      "aria-label": `${item.hidden ? "Afficher" : "Masquer"} ${item.name}`,
      "aria-pressed": String(!item.hidden),
      "data-hide": item.body?.originId ?? item.id,
    },
    eyeIcon(!item.hidden),
  );
  const select = el(
    "button",
    {
      type: "button",
      class: "flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left",
      "aria-pressed": String(selected),
      title: item.message ?? `${item.name} — ${badge.label}`,
      "data-select": onSelectKey,
    },
    el("span", { class: `flex-1 truncate ${item.hidden ? "opacity-60" : ""}` }, item.name),
    item.state === "ok" ? null : el("span", { class: `size-2.5 shrink-0 rounded-full ${badge.dot}`, "aria-label": badge.label }),
  );
  const menu = el(
    "button",
    {
      type: "button",
      class: "size-8 shrink-0 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700",
      title: "Modifier, renommer, supprimer",
      "aria-label": `Options de ${item.name}`,
      "data-menu": menuId,
      ...(menuKind ? { "data-menu-kind": menuKind } : {}),
    },
    dotsIcon(),
  );
  return el(
    "div",
    {
      class: `flex items-center gap-1 px-1 text-sm ${flat(selected)}`,
    },
    toggle ?? el("span", { class: "w-6 shrink-0", "aria-hidden": "true" }),
    eye,
    select,
    menu,
  );
}

/** A step of the history of a body: selects the feature, "⋯" opens its window. */
function historyRow(item: NavItem, selected: boolean): HTMLElement {
  const badge = STATE_BADGES[item.state];
  return el(
    "li",
    {
      class: `flex items-center gap-1 px-1 text-xs ${flat(selected, "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/60")}`,
    },
    el(
      "button",
      { type: "button", class: "flex min-h-7 min-w-0 flex-1 items-center gap-2 text-left", "aria-pressed": String(selected), title: item.message ?? `${item.name} — ${badge.label}`, "data-select": `feature:${item.id}` },
      el("span", { class: "w-4 shrink-0 text-center text-gray-500 dark:text-gray-400", "aria-hidden": "true" }, TYPE_ICONS[item.type]),
      el("span", { class: `flex-1 truncate ${item.suppressed ? "line-through opacity-60" : ""}` }, item.name),
      item.state === "ok" ? null : el("span", { class: `size-2 shrink-0 rounded-full ${badge.dot}`, "aria-label": badge.label }),
    ),
    el(
      "button",
      { type: "button", class: "size-7 shrink-0 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700", title: "Modifier, renommer, supprimer", "aria-label": `Options de ${item.name}`, "data-menu": item.id },
      dotsIcon(),
    ),
  );
}

interface Selection {
  selectedId: string | null;
  selectedBodyId: string | null;
  picked: { bodies: string[]; sketches: string[] };
}

function bodyNode(body: BodyRow, s: Selection): HTMLElement {
  const key = `body:${body.item.body?.originId ?? body.item.id}`;
  const selected = body.item.id === s.selectedBodyId || s.picked.bodies.includes(body.item.id);
  const head = row({ ...body.item, name: body.label }, selected, `body:${body.item.id}`, body.item.id, body.history.length ? chevron(key, body.label) : null, "body");
  return el("li", {}, head, body.history.length ? children(key, body.history.map((h) => historyRow(h, h.id === s.selectedId))) : null);
}

function groupNode(group: { id: string; name: string; bodies: BodyRow[] }, s: Selection): HTMLElement {
  const key = `group:${group.id}`;
  const head = el(
    "div",
    { class: "flex min-h-9 items-center gap-1 px-1 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700/60" },
    chevron(key, group.name),
    el("span", { class: "w-8 shrink-0 text-center text-amber-600 dark:text-amber-400", "aria-hidden": "true" }, "▰"),
    el("span", { class: "flex-1 truncate" }, group.name),
    el("span", { class: "px-2 text-xs text-gray-500 dark:text-gray-400" }, String(group.bodies.length)),
  );
  return el("li", { "data-group": group.id }, head, children(key, group.bodies.map((b) => bodyNode(b, s))));
}

/** Buttons of the "Corps" heading, acting on every body: the triangle that folds them, the eye, the bin. */
const HEAD_BUTTON = "flex size-7 items-center justify-center text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100";

function bodiesActions(rows: BodyRow[]): HTMLElement[] {
  const allHidden = rows.every((r) => r.item.hidden);
  return [
    el("button", { type: "button", class: HEAD_BUTTON, "data-fold-all": "" }, "▾"),
    el(
      "button",
      {
        type: "button",
        class: `${HEAD_BUTTON} ${allHidden ? "" : "text-sky-700 dark:text-sky-300"}`,
        title: allHidden ? "Afficher tous les corps" : "Masquer tous les corps",
        "aria-label": allHidden ? "Afficher tous les corps" : "Masquer tous les corps",
        "aria-pressed": String(!allHidden),
        "data-hide-all": allHidden ? "show" : "hide",
      },
      eyeIcon(!allHidden),
    ),
    el(
      "button",
      { type: "button", class: `${HEAD_BUTTON} hover:text-red-600 dark:hover:text-red-400`, title: "Supprimer tous les corps", "aria-label": "Supprimer tous les corps", "data-remove-all": "" },
      trashIcon(),
    ),
  ];
}

function section(title: string, count: number, rows: HTMLElement[], empty: string, actions: HTMLElement[] = []): HTMLElement {
  const bodies = actions.length > 0;
  return el(
    "details",
    { class: `group/section mx-1.5 mt-1 mb-4 p-1 ${CARD}`, open: true, ...(bodies ? { "data-bodies": "" } : {}) },
    el(
      "summary",
      { class: "flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-semibold tracking-wider text-sky-700 uppercase select-none dark:text-sky-400" },
      el("span", { class: "inline-block w-3 transition-transform group-open/section:rotate-90", "aria-hidden": "true" }, "▸"),
      el("span", { class: "flex-1" }, `${title} (${count})`),
      ...actions,
    ),
    rows.length ? el("ul", { class: "space-y-0.5" }, ...rows) : el("p", { class: "px-6 pb-1 text-xs text-gray-500 dark:text-gray-400" }, empty),
  );
}

export function renderBrowser(
  container: HTMLElement,
  data: { bodies: BodyEntry[]; sketches: NavItem[]; selectedId: string | null; selectedBodyId: string | null; picked: { bodies: string[]; sketches: string[] } },
  handlers: BrowserHandlers,
): void {
  const bodies = data.bodies.map((entry) => ("group" in entry ? groupNode(entry.group, data) : bodyNode(entry.body, data)));
  const all = data.bodies.flatMap((entry) => ("group" in entry ? entry.group.bodies : [entry.body]));
  const sketches = data.sketches.map((s) => el("li", {}, row(s, s.id === data.selectedId || data.picked.sketches.includes(s.id), `sketch:${s.id}`)));
  const root = el(
    "div",
    {},
    section("Corps", all.length, bodies, "Aucun corps. Extrudez une esquisse.", all.length ? bodiesActions(all) : []),
    section("Esquisses", sketches.length, sketches, "Aucune esquisse."),
  );
  const foldAll = root.querySelector<HTMLElement>("[data-fold-all]");
  if (foldAll) {
    syncFoldAll(root, foldAll);
    foldAll.addEventListener("click", (event) => {
      // In the section's summary: fold or unfold the bodies, not the section.
      event.preventDefault();
      event.stopPropagation();
      const keys = [...new Set([...root.querySelectorAll<HTMLElement>("[data-bodies] [data-toggle]")].map((b) => b.dataset.toggle as string))];
      const open = !keys.some(isOpen);
      for (const key of keys) if (isOpen(key) !== open) toggle(root, key);
      syncFoldAll(root, foldAll);
    });
  }
  // The eye and the bin of the heading: on every body, without folding the section.
  root.querySelector("[data-hide-all]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const hide = (event.currentTarget as HTMLElement).dataset.hideAll === "hide";
    handlers.onSetHidden([...new Set(all.map((r) => r.item.body?.originId ?? r.item.id))], hide);
  });
  root.querySelector("[data-remove-all]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onRemoveBodies(all.map((r) => r.item.id));
  });
  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-select],[data-hide],[data-menu],[data-toggle]");
    if (!target) return;
    const adding = event.shiftKey || event.ctrlKey || event.metaKey;
    if (target.dataset.toggle) {
      toggle(root, target.dataset.toggle);
      if (foldAll) syncFoldAll(root, foldAll);
    }
    else if (target.dataset.hide) handlers.onToggleHidden(target.dataset.hide);
    else if (target.dataset.menu) handlers.onMenu(target.dataset.menu, target.getBoundingClientRect(), target.dataset.menuKind === "body");
    else if (target.dataset.select?.startsWith("body:")) handlers.onSelectBody(target.dataset.select.slice(5), adding);
    else if (target.dataset.select?.startsWith("sketch:")) handlers.onSelectSketch(target.dataset.select.slice(7), adding);
    else if (target.dataset.select?.startsWith("feature:")) handlers.onSelectFeature(target.dataset.select.slice(8));
  });
  // On a Mac, Ctrl + clic opens the context menu instead of clicking: it adds to the selection too.
  root.addEventListener("contextmenu", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-select]");
    if (!event.ctrlKey || !target?.dataset.select) return;
    event.preventDefault();
    const [kind, id] = [target.dataset.select.slice(0, target.dataset.select.indexOf(":")), target.dataset.select.slice(target.dataset.select.indexOf(":") + 1)];
    if (kind === "body") handlers.onSelectBody(id, true);
    else if (kind === "sketch") handlers.onSelectSketch(id, true);
  });
  container.replaceChildren(root);
}

/** The triangle of the "Corps" heading: ▾ folds everything open, ▸ unfolds every assembly and body. */
function syncFoldAll(root: HTMLElement, button: HTMLElement): void {
  const anyOpen = [...root.querySelectorAll<HTMLElement>("[data-bodies] [data-toggle]")].some((b) => isOpen(b.dataset.toggle as string));
  button.textContent = anyOpen ? "▾" : "▸";
  button.title = anyOpen ? "Tout replier" : "Tout déplier";
  button.setAttribute("aria-label", anyOpen ? "Replier tous les corps" : "Déplier tous les corps");
}

/** Folds or unfolds a folder or a body in place (no new render) and remembers it. */
function toggle(root: HTMLElement, key: string): void {
  if (!toggled.delete(key)) toggled.add(key);
  saveToggled(toggled);
  const open = isOpen(key);
  for (const list of root.querySelectorAll<HTMLElement>(`[data-children="${CSS.escape(key)}"]`)) list.hidden = !open;
  for (const button of root.querySelectorAll<HTMLElement>(`[data-toggle="${CSS.escape(key)}"]`)) {
    const name = (button.getAttribute("aria-label") ?? "").replace(/^(Replier|Déplier) /, "");
    button.setAttribute("aria-expanded", String(open));
    button.title = open ? "Replier" : "Déplier";
    button.setAttribute("aria-label", `${open ? "Replier" : "Déplier"} ${name}`);
    button.firstElementChild?.classList.toggle("rotate-90", open);
  }
}
