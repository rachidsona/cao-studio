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
 * Folders made by hand (Fusion's) come first; a right click, dragging and
 * renaming in place are in browser-actions.ts.
 */
import { el } from "./dom";
import { STATE_BADGES, TYPE_ICONS, type NavItem } from "./feature-meta";
import { renameFolder, treeMenu, wireDrag, type TreeContext } from "./browser-actions";
import { dotsIcon, eyeIcon, fine, folderIcon, trashIcon } from "./icons";

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
  /** Deletes sketches (its right click, the bin of the « Esquisses » heading): asked first when there are several. */
  onRemoveSketches(ids: string[]): void;
  /** Folders made by hand; bodies go by origin (what `onToggleHidden` takes). */
  onNewFolder(bodies: string[]): void;
  onRenameFolder(folder: string, name: string): void;
  /** Puts these bodies in a folder (null: out of their folder). */
  onMoveToFolder(bodies: string[], folder: string | null): void;
  /** Removes a folder, with these bodies (none: they stay, out of any folder). */
  onRemoveFolder(folder: string, bodyIds: string[]): void;
}

/** A body of the tree, with the features that built it. */
export interface BodyRow {
  item: NavItem;
  /** Name in the tree (shorter inside a folder). */
  label: string;
  history: NavItem[];
}

/** A folder of the tree: a corps (a Répartition and what equips it), the bodies made together, a kind of pieces. */
export interface BodyFolder {
  id: string;
  name: string;
  entries: BodyEntry[];
  /** A folder made by hand (document/folders.ts): it can be renamed, removed, and bodies dropped in it. */
  folder?: string;
}

export type BodyEntry = { body: BodyRow } | { group: BodyFolder };

/** Every body of an entry, in the folders inside it too. */
export function entryBodies(entry: BodyEntry): BodyRow[] {
  return "group" in entry ? entry.group.entries.flatMap(entryBodies) : [entry.body];
}

function entryNode(entry: BodyEntry, s: Selection): HTMLElement {
  return "group" in entry ? groupNode(entry.group, s) : bodyNode(entry.body, s);
}

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
      class: "size-5 shrink-0 text-xs leading-none text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700",
      title: open ? "Replier" : "Déplier",
      "aria-label": `${open ? "Replier" : "Déplier"} ${name}`,
      "aria-expanded": String(open),
      "data-toggle": key,
    },
    el("span", { class: `inline-block transition-transform ${open ? "rotate-90" : ""}`, "aria-hidden": "true" }, "▸"),
  );
}

/** The bodies, and the sketches, are each in one card with a strong shadow; the rows inside are flat. */
export const CARD =
  "cad-card border border-gray-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.30)] " +
  "dark:border-gray-700 dark:bg-gray-800 dark:shadow-[0_6px_20px_rgba(0,0,0,0.75)]";
/** A row of a card: flat; the selected one lit in #F8F8F8 with dark ink and a blue edge, to be seen at once. */
const flat = (selected: boolean, idle = "hover:bg-gray-100 dark:hover:bg-gray-700/60") =>
  selected ? " bg-[#F8F8F8] text-[#111827] shadow-[inset_3px_0_0_#0284c7]" : ` ${idle}`;

/** Rows under a folder or a body, shifted right with a guide line. */
const children = (key: string, rows: HTMLElement[]) =>
  el("ul", { class: "ml-4 space-y-0.5 border-l border-gray-200 pl-1 dark:border-gray-600", "data-children": key, ...(isOpen(key) ? {} : { hidden: "" }) }, ...rows);

function row(item: NavItem, selected: boolean, onSelectKey: string, menuId = item.id, toggle: HTMLElement | null = null, menuKind = ""): HTMLElement {
  const badge = STATE_BADGES[item.state];
  const eye = el(
    "button",
    {
      type: "button",
      class: `size-6 shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700 ${item.hidden ? "text-gray-400 dark:text-gray-500" : "text-sky-700 dark:text-sky-300"}`,
      title: item.hidden ? "Afficher" : "Masquer",
      "aria-label": `${item.hidden ? "Afficher" : "Masquer"} ${item.name}`,
      "aria-pressed": String(!item.hidden),
      "data-hide": item.body?.originId ?? item.id,
    },
    fine(eyeIcon(!item.hidden)),
  );
  const select = el(
    "button",
    {
      type: "button",
      class: "flex min-h-7 min-w-0 flex-1 items-center gap-2 text-left",
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
      class: "size-6 shrink-0 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700",
      title: "Modifier, renommer, supprimer",
      "aria-label": `Options de ${item.name}`,
      "data-menu": menuId,
      ...(menuKind ? { "data-menu-kind": menuKind } : {}),
    },
    fine(dotsIcon()),
  );
  return el(
    "div",
    {
      class: `flex items-center gap-1 px-1 text-xs ${flat(selected)}`,
      ...(selected ? { "data-selected": "" } : {}),
      ...(menuKind === "body" ? { "data-head": `body:${item.id}`, draggable: "true" } : {}),
    },
    toggle ?? el("span", { class: "w-5 shrink-0", "aria-hidden": "true" }),
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
      ...(selected ? { "data-selected": "" } : {}),
      class: `flex items-center gap-1 px-1 text-[11px] ${flat(selected, "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/60")}`,
    },
    el(
      "button",
      { type: "button", class: "flex min-h-6 min-w-0 flex-1 items-center gap-2 text-left", "aria-pressed": String(selected), title: item.message ?? `${item.name} — ${badge.label}`, "data-select": `feature:${item.id}` },
      el("span", { class: "w-4 shrink-0 text-center text-gray-500 dark:text-gray-400", "aria-hidden": "true" }, TYPE_ICONS[item.type]),
      el("span", { class: `flex-1 truncate ${item.suppressed ? "line-through opacity-60" : ""}` }, item.name),
      item.state === "ok" ? null : el("span", { class: `size-2 shrink-0 rounded-full ${badge.dot}`, "aria-label": badge.label }),
    ),
    el(
      "button",
      { type: "button", class: "size-6 shrink-0 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700", title: "Modifier, renommer, supprimer", "aria-label": `Options de ${item.name}`, "data-menu": item.id },
      fine(dotsIcon(), 12),
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
  return el("li", { "data-body": body.item.id }, head, body.history.length ? children(key, body.history.map((h) => historyRow(h, h.id === s.selectedId))) : null);
}

function groupNode(group: BodyFolder, s: Selection): HTMLElement {
  const key = `group:${group.id}`;
  const bodies = group.entries.flatMap(entryBodies);
  // The eye of a folder hides every body inside it (or shows them all again when they are all hidden).
  const hidden = bodies.every((b) => b.item.hidden);
  const eye = el(
    "button",
    {
      type: "button",
      class: `size-6 shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700 ${hidden ? "text-gray-400 dark:text-gray-500" : "text-sky-700 dark:text-sky-300"}`,
      title: hidden ? "Afficher le groupe" : "Masquer le groupe",
      "aria-label": `${hidden ? "Afficher" : "Masquer"} ${group.name}`,
      "aria-pressed": String(!hidden),
      "data-hide-group": group.id,
      "data-hide-mode": hidden ? "show" : "hide",
    },
    fine(eyeIcon(!hidden)),
  );
  // A folder made by hand: a folder icon, bodies dropped on it, its name renamed by a double click.
  const mark = group.folder
    ? el("span", { class: `w-5 shrink-0 text-amber-600 dark:text-amber-400 ${hidden ? "opacity-60" : ""}`, "aria-hidden": "true" }, fine(folderIcon()))
    : el("span", { class: `w-5 shrink-0 text-center text-amber-600 dark:text-amber-400 ${hidden ? "opacity-60" : ""}`, "aria-hidden": "true" }, "▰");
  const head = el(
    "div",
    {
      class: "flex min-h-7 items-center gap-1 px-1 text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-700/60",
      "data-head": `group:${group.id}`,
      draggable: "true",
      ...(group.folder ? { "data-drop": group.folder } : {}),
    },
    chevron(key, group.name),
    eye,
    mark,
    el("span", { class: `flex-1 truncate ${hidden ? "opacity-60" : ""}`, ...(group.folder ? { "data-folder-name": group.folder, title: "Double-cliquez pour renommer" } : {}) }, group.name),
    el("span", { class: "px-1.5 text-[10px] text-gray-500 dark:text-gray-400" }, String(bodies.length)),
  );
  return el("li", { "data-group": group.id }, head, children(key, group.entries.map((e) => entryNode(e, s))));
}

/** Buttons of the "Corps" heading, acting on every body: a new folder, the triangle that folds them, the eye, the bin. */
const HEAD_BUTTON = "flex size-7 items-center justify-center text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100";

/** The eye and the bin of a heading (`all`: « tous les corps », « toutes les esquisses »), tagged `data-hide-<kind>` and `data-remove-<kind>`. */
function eyeAndBin(all: string, allHidden: boolean, kind: string): HTMLElement[] {
  const hide = `${allHidden ? "Afficher" : "Masquer"} ${all}`;
  return [
    el(
      "button",
      { type: "button", class: `${HEAD_BUTTON} ${allHidden ? "" : "text-sky-700 dark:text-sky-300"}`, title: hide, "aria-label": hide, "aria-pressed": String(!allHidden), [`data-hide-${kind}`]: allHidden ? "show" : "hide" },
      fine(eyeIcon(!allHidden), 15),
    ),
    el(
      "button",
      { type: "button", class: `${HEAD_BUTTON} hover:text-red-600 dark:hover:text-red-400`, title: `Supprimer ${all}`, "aria-label": `Supprimer ${all}`, [`data-remove-${kind}`]: "" },
      fine(trashIcon(), 15),
    ),
  ];
}

function bodiesActions(rows: BodyRow[]): HTMLElement[] {
  return [
    el("button", { type: "button", class: HEAD_BUTTON, title: "Nouveau dossier (avec les corps sélectionnés)", "aria-label": "Nouveau dossier", "data-new-folder": "" }, fine(folderIcon(true), 15)),
    el("button", { type: "button", class: HEAD_BUTTON, "data-fold-all": "" }, "▾"),
    ...eyeAndBin("tous les corps", rows.every((r) => r.item.hidden), "all"),
  ];
}

function section(title: string, count: number, rows: HTMLElement[], empty: string, actions: HTMLElement[] = [], bodies = false): HTMLElement {
  return el(
    "details",
    { class: `group/section mx-1.5 mt-1 mb-4 p-1 ${CARD}`, open: true, ...(bodies ? { "data-bodies": "" } : {}) },
    el(
      "summary",
      // Bodies dropped on the « Corps » heading leave their folder.
      { ...(bodies ? { "data-drop": "" } : {}), class: "flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-semibold tracking-wider text-sky-700 uppercase select-none dark:text-sky-400" },
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
  const bodies = data.bodies.map((entry) => entryNode(entry, data));
  const all = data.bodies.flatMap(entryBodies);
  const sketches = data.sketches.map((s) => el("li", {}, row(s, s.id === data.selectedId || data.picked.sketches.includes(s.id), `sketch:${s.id}`)));
  const root = el(
    "div",
    {},
    section("Corps", all.length, bodies, "Aucun corps. Extrudez une esquisse.", all.length ? bodiesActions(all) : [], true),
    section("Esquisses", sketches.length, sketches, "Aucune esquisse.", sketches.length ? eyeAndBin("toutes les esquisses", data.sketches.every((s) => s.hidden), "sketches") : []),
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
  root.querySelector("[data-new-folder]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onNewFolder([...new Set(all.filter((r) => data.picked.bodies.includes(r.item.id)).map((r) => r.item.body?.originId ?? r.item.id))]);
  });
  root.querySelector("[data-remove-all]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onRemoveBodies(all.map((r) => r.item.id));
  });
  // The same for every sketch.
  root.querySelector("[data-hide-sketches]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onSetHidden(data.sketches.map((s) => s.id), (event.currentTarget as HTMLElement).dataset.hideSketches === "hide");
  });
  root.querySelector("[data-remove-sketches]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onRemoveSketches(data.sketches.map((s) => s.id));
  });
  // Every body and folder of the tree, for the eyes of the folders, the right click and dragging.
  const ctx: TreeContext = { rows: new Map(all.map((r) => [r.item.id, r])), groups: new Map(), folderOf: new Map(), folders: [], picked: data.picked.bodies, pickedSketches: data.picked.sketches, sketches: data.sketches, handlers };
  const index = (entry: BodyEntry): void => {
    if (!("group" in entry)) return;
    const inside = entryBodies(entry);
    ctx.groups.set(entry.group.id, { group: entry.group, bodies: inside });
    if (entry.group.folder) {
      ctx.folders.push({ id: entry.group.folder, name: entry.group.name });
      for (const r of inside) ctx.folderOf.set(r.item.id, entry.group.folder);
    }
    entry.group.entries.forEach(index);
  };
  data.bodies.forEach(index);
  wireDrag(root, ctx);
  root.addEventListener("dblclick", (event) => {
    const folder = (event.target as HTMLElement).closest<HTMLElement>("[data-folder-name]")?.dataset.folderName;
    if (folder) renameFolder(root, folder, handlers);
  });
  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-select],[data-hide],[data-hide-group],[data-menu],[data-toggle]");
    if (!target) return;
    const adding = event.shiftKey || event.ctrlKey || event.metaKey;
    if (target.dataset.hideGroup) {
      const rows = ctx.groups.get(target.dataset.hideGroup)?.bodies ?? [];
      handlers.onSetHidden([...new Set(rows.map((r) => r.item.body?.originId ?? r.item.id))], target.dataset.hideMode === "hide");
    }
    else if (target.dataset.toggle) {
      toggle(root, target.dataset.toggle);
      if (foldAll) syncFoldAll(root, foldAll);
    }
    else if (target.dataset.hide) handlers.onToggleHidden(target.dataset.hide);
    else if (target.dataset.menu) handlers.onMenu(target.dataset.menu, target.getBoundingClientRect(), target.dataset.menuKind === "body");
    else if (target.dataset.select?.startsWith("body:")) handlers.onSelectBody(target.dataset.select.slice(5), adding);
    else if (target.dataset.select?.startsWith("sketch:")) handlers.onSelectSketch(target.dataset.select.slice(7), adding);
    else if (target.dataset.select?.startsWith("feature:")) handlers.onSelectFeature(target.dataset.select.slice(8));
  });
  // A right click opens the menu of what is under it. On a Mac, Ctrl + clic opens the context menu instead of
  // clicking: there, it adds to the selection as elsewhere.
  root.addEventListener("contextmenu", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-select]");
    if (!event.ctrlKey || !target?.dataset.select) {
      if (treeMenu(event, root, ctx)) event.preventDefault();
      return;
    }
    event.preventDefault();
    const [kind, id] = [target.dataset.select.slice(0, target.dataset.select.indexOf(":")), target.dataset.select.slice(target.dataset.select.indexOf(":") + 1)];
    if (kind === "body") handlers.onSelectBody(id, true);
    else if (kind === "sketch") handlers.onSelectSketch(id, true);
  });
  container.replaceChildren(root);
  reveal(root, data);
}

/** The row last brought into view: a new selection (in the 3D view too) opens its folders and scrolls to it, once. */
let revealed = "";

function reveal(root: HTMLElement, data: { sketches: NavItem[]; selectedId: string | null; selectedBodyId: string | null }): void {
  const key = data.selectedBodyId ? `body:${data.selectedBodyId}` : data.sketches.some((s) => s.id === data.selectedId) ? `sketch:${data.selectedId}` : "";
  if (key === revealed) return;
  revealed = key;
  const target = key ? root.querySelector<HTMLElement>(`[data-select="${CSS.escape(key)}"]`) : null;
  if (!target) return;
  for (let list = target.closest<HTMLElement>("[data-children]"); list; list = list.parentElement?.closest<HTMLElement>("[data-children]") ?? null) {
    if (list.hidden && list.dataset.children) toggle(root, list.dataset.children);
  }
  const section = target.closest("details");
  if (section) section.open = true;
  target.scrollIntoView({ block: "nearest" });
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
