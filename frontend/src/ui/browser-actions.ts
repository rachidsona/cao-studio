/**
 * What the navigator does beyond a click (as in Fusion): the menu of a right click — show or hide, put in a folder,
 * rename, delete — on a body, on several selected bodies, on a folder or on a sketch; dragging bodies and folders into
 * a folder made by hand (or onto the « Corps » heading, to take them out); renaming such a folder in place.
 */
import type { BodyFolder, BodyRow, BrowserHandlers } from "./browser";
import { el } from "./dom";
import type { NavItem } from "./feature-meta";
import { openTreeMenu, type TreeMenuItem } from "./tree-menu";

export interface TreeContext {
  /** Each body of the tree by id, and each folder (of every level) by id. */
  rows: Map<string, BodyRow>;
  groups: Map<string, { group: BodyFolder; bodies: BodyRow[] }>;
  /** The folder made by hand that holds a body, by body id. */
  folderOf: Map<string, string>;
  folders: { id: string; name: string }[];
  /** Bodies and sketches of the multiple selection. */
  picked: string[];
  pickedSketches: string[];
  sketches: NavItem[];
  handlers: BrowserHandlers;
}

const origins = (rows: BodyRow[]) => [...new Set(rows.map((r) => r.item.body?.originId ?? r.item.id))];
const count = (n: number) => (n > 1 ? `ces ${n} corps` : "ce corps");

/** The bodies a head stands for: a folder's, or a body's — with the rest of the selection when it is in it. */
function bodiesOf(head: string, ctx: TreeContext): BodyRow[] {
  if (head.startsWith("group:")) return ctx.groups.get(head.slice(6))?.bodies ?? [];
  const id = head.slice(5);
  const row = ctx.rows.get(id);
  if (!row) return [];
  if (ctx.picked.length > 1 && ctx.picked.includes(id)) return ctx.picked.flatMap((p) => ctx.rows.get(p) ?? []);
  return [row];
}

function hideItem(rows: BodyRow[], ctx: TreeContext, what = ""): TreeMenuItem {
  const hidden = rows.length > 0 && rows.every((r) => r.item.hidden);
  return { label: `${hidden ? "Afficher" : "Masquer"}${what}`, run: () => ctx.handlers.onSetHidden(origins(rows), !hidden), disabled: rows.length === 0 };
}

/** « Nouveau dossier », « Ranger dans… », « Sortir du dossier » for these bodies. */
function folderItems(rows: BodyRow[], ctx: TreeContext): TreeMenuItem[] {
  const ids = origins(rows);
  const holders = new Set(rows.map((r) => ctx.folderOf.get(r.item.id) ?? ""));
  return [
    { label: `Nouveau dossier avec ${count(rows.length)}`, run: () => ctx.handlers.onNewFolder(ids) },
    ...ctx.folders
      .filter((f) => !(holders.size === 1 && holders.has(f.id)))
      .map((f): TreeMenuItem => ({ label: `Ranger dans « ${f.name} »`, run: () => ctx.handlers.onMoveToFolder(ids, f.id) })),
    ...(holders.size > 1 || !holders.has("") ? [{ label: "Sortir du dossier", run: () => ctx.handlers.onMoveToFolder(ids, null) }] : []),
  ];
}

/** The menu of a right click at this point of the tree (false: nothing there to act on). */
export function treeMenu(event: MouseEvent, root: HTMLElement, ctx: TreeContext): boolean {
  const target = event.target as HTMLElement;
  const at = (items: TreeMenuItem[]) => (openTreeMenu(event.clientX, event.clientY, items), true);
  const sketchKey = target.closest<HTMLElement>("[data-select^='sketch:']")?.dataset.select;
  if (sketchKey) {
    const sketch = ctx.sketches.find((s) => s.id === sketchKey.slice(7));
    if (!sketch) return false;
    const rect = target.getBoundingClientRect();
    // On a sketch of the multiple selection: on every selected sketch.
    const several = ctx.pickedSketches.length > 1 && ctx.pickedSketches.includes(sketch.id) ? ctx.sketches.filter((s) => ctx.pickedSketches.includes(s.id)) : [];
    if (several.length > 1) {
      const hidden = several.every((s) => s.hidden);
      return at([
        { heading: `${several.length} esquisses sélectionnées` },
        { label: hidden ? "Afficher" : "Masquer", run: () => ctx.handlers.onSetHidden(several.map((s) => s.id), !hidden) },
        "separator",
        { label: `Supprimer ces ${several.length} esquisses`, danger: true, run: () => ctx.handlers.onRemoveSketches(several.map((s) => s.id)) },
      ]);
    }
    return at([
      { heading: sketch.name },
      { label: sketch.hidden ? "Afficher" : "Masquer", run: () => ctx.handlers.onToggleHidden(sketch.id) },
      { label: "Modifier, renommer…", run: () => ctx.handlers.onMenu(sketch.id, rect, false) },
      "separator",
      { label: "Supprimer l'esquisse", danger: true, run: () => ctx.handlers.onRemoveSketches([sketch.id]) },
    ]);
  }
  const head = target.closest<HTMLElement>("[data-head]")?.dataset.head ?? (target.closest<HTMLElement>("li[data-body]") ? `body:${target.closest<HTMLElement>("li[data-body]")?.dataset.body}` : null);
  if (!head) {
    // The « Corps » heading or the empty space under the bodies.
    if (!target.closest("[data-bodies]")) return false;
    const picked = ctx.picked.flatMap((p) => ctx.rows.get(p) ?? []);
    return at([{ label: picked.length ? `Nouveau dossier avec ${count(picked.length)}` : "Nouveau dossier", run: () => ctx.handlers.onNewFolder(origins(picked)) }]);
  }
  const rows = bodiesOf(head, ctx);
  const ids = rows.map((r) => r.item.id);
  const group = head.startsWith("group:") ? ctx.groups.get(head.slice(6))?.group : undefined;
  if (group?.folder) {
    const folder = group.folder;
    return at([
      { heading: group.name },
      hideItem(rows, ctx, " le dossier"),
      { label: "Renommer", run: () => renameFolder(root, folder, ctx.handlers) },
      { label: "Nouveau dossier", run: () => ctx.handlers.onNewFolder([]) },
      "separator",
      { label: "Défaire le dossier (garder ses corps)", run: () => ctx.handlers.onRemoveFolder(folder, []) },
      { label: rows.length ? `Supprimer le dossier et ses ${rows.length} corps` : "Supprimer le dossier", danger: true, run: () => ctx.handlers.onRemoveFolder(folder, ids) },
    ]);
  }
  if (rows.length === 0) return false;
  const single = rows.length === 1 && head.startsWith("body:") ? rows[0] : undefined;
  const rect = target.getBoundingClientRect();
  return at([
    { heading: group?.name ?? single?.label ?? `${rows.length} corps sélectionnés` },
    hideItem(rows, ctx),
    ...(single ? [{ label: "Modifier, renommer…", run: () => ctx.handlers.onMenu(single.item.id, rect, true) }] : []),
    "separator",
    ...folderItems(rows, ctx),
    "separator",
    { label: `Supprimer ${count(rows.length)}`, danger: true, run: () => ctx.handlers.onRemoveBodies(ids) },
  ]);
}

/** Renames a folder made by hand in place: Entrée or a click beside keeps the name, Échap gives up. */
export function renameFolder(root: HTMLElement, folder: string, handlers: BrowserHandlers): void {
  const label = root.querySelector<HTMLElement>(`[data-folder-name="${CSS.escape(folder)}"]`);
  if (!label) return;
  const before = label.textContent ?? "";
  const input = el("input", { type: "text", value: before, "aria-label": "Nom du dossier", class: "h-6 min-w-0 flex-1 border border-sky-500 bg-white px-1 text-xs text-gray-900 focus:outline-none dark:bg-gray-900 dark:text-gray-100" });
  let done = false;
  const end = (keep: boolean) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    input.replaceWith(label);
    if (keep && name && name !== before) handlers.onRenameFolder(folder, name);
  };
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") end(true);
    else if (event.key === "Escape") end(false);
  });
  input.addEventListener("blur", () => end(true));
  input.addEventListener("click", (event) => event.stopPropagation());
  label.replaceWith(input);
  input.focus();
  input.select();
}

/** Bodies and folders dragged by their head into a folder made by hand, or onto the « Corps » heading to take them out. */
export function wireDrag(root: HTMLElement, ctx: TreeContext): void {
  let dragged: string[] = [];
  const LIT = ["bg-sky-100", "outline", "outline-1", "outline-sky-500", "dark:bg-sky-900/60"];
  root.addEventListener("dragstart", (event) => {
    const head = (event.target as HTMLElement).closest<HTMLElement>("[data-head]")?.dataset.head;
    dragged = head ? origins(bodiesOf(head, ctx)) : [];
    if (!dragged.length || !event.dataTransfer) return event.preventDefault();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${dragged.length} corps`);
  });
  const dropOf = (event: DragEvent) => (dragged.length ? (event.target as HTMLElement).closest<HTMLElement>("[data-drop]") : null);
  root.addEventListener("dragover", (event) => {
    const drop = dropOf(event);
    if (!drop) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    drop.classList.add(...LIT);
  });
  root.addEventListener("dragleave", (event) => {
    const drop = dropOf(event);
    if (drop && !drop.contains(event.relatedTarget as Node)) drop.classList.remove(...LIT);
  });
  root.addEventListener("drop", (event) => {
    const drop = dropOf(event);
    if (!drop) return;
    event.preventDefault();
    drop.classList.remove(...LIT);
    ctx.handlers.onMoveToFolder(dragged, drop.dataset.drop || null);
    dragged = [];
  });
  root.addEventListener("dragend", () => (dragged = []));
}
