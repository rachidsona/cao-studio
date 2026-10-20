/**
 * Model browser (left panel), like the browser of desktop CAD tools: the
 * bodies and the sketches of the document, each with an eye icon to show or
 * hide it. A click selects; the "⋯" button opens the dialog to edit, rename
 * or delete. Operations (extrusion, hole…) are in the timeline instead.
 */
import { el } from "./dom";
import { STATE_BADGES, TYPE_ICONS, type NavItem } from "./feature-meta";
import { dotsIcon, eyeIcon } from "./icons";

export interface BrowserHandlers {
  onSelectBody(bodyId: string): void;
  onSelectSketch(id: string): void;
  onToggleHidden(id: string): void;
  /** The "⋯" button of a row (`body`: the row is a body, `id` its latest feature). */
  onMenu(id: string, anchor: DOMRect, body: boolean): void;
}

function row(item: NavItem, selected: boolean, onSelectKey: string, kindIcon: string, menuId = item.id): HTMLElement {
  const badge = STATE_BADGES[item.state];
  const eye = el(
    "button",
    {
      type: "button",
      class: `size-8 shrink-0 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${item.hidden ? "text-gray-400 dark:text-gray-500" : "text-sky-700 dark:text-sky-300"}`,
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
    el("span", { class: "w-4 shrink-0 text-center text-gray-500 dark:text-gray-400", "aria-hidden": "true" }, kindIcon),
    el("span", { class: `flex-1 truncate ${item.hidden ? "opacity-60" : ""}` }, item.name),
    item.state === "ok" ? null : el("span", { class: `size-2.5 shrink-0 rounded-full ${badge.dot}`, "aria-label": badge.label }),
  );
  const menu = el(
    "button",
    {
      type: "button",
      class: "size-8 shrink-0 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700",
      title: "Modifier, renommer, supprimer",
      "aria-label": `Options de ${item.name}`,
      "data-menu": menuId,
    },
    dotsIcon(),
  );
  return el(
    "li",
    {
      class: `flex items-center gap-1 rounded-md px-1 text-sm ${selected ? "bg-sky-100 text-sky-950 dark:bg-sky-900/60 dark:text-sky-50" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`,
    },
    eye,
    select,
    menu,
  );
}

function section(title: string, count: number, rows: HTMLElement[], empty: string, bodies = false): HTMLElement {
  return el(
    "details",
    { class: "group/section mb-1", open: true, ...(bodies ? { "data-bodies": "" } : {}) },
    el(
      "summary",
      { class: "flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-semibold tracking-wide text-gray-500 uppercase select-none dark:text-gray-400" },
      el("span", { class: "inline-block w-3 transition-transform group-open/section:rotate-90", "aria-hidden": "true" }, "▸"),
      `${title} (${count})`,
    ),
    rows.length ? el("ul", { class: "space-y-0.5" }, ...rows) : el("p", { class: "px-6 pb-1 text-xs text-gray-500 dark:text-gray-400" }, empty),
  );
}

export function renderBrowser(
  container: HTMLElement,
  data: { bodies: NavItem[]; sketches: NavItem[]; selectedId: string | null; selectedBodyId: string | null },
  handlers: BrowserHandlers,
): void {
  const bodies = data.bodies.map((b) => row(b, b.id === data.selectedBodyId, `body:${b.id}`, "◼", b.id));
  const sketches = data.sketches.map((s) => row(s, s.id === data.selectedId, `sketch:${s.id}`, TYPE_ICONS.sketch));
  const root = el(
    "div",
    {},
    section("Corps", bodies.length, bodies, "Aucun corps. Extrudez une esquisse.", true),
    section("Esquisses", sketches.length, sketches, "Aucune esquisse."),
  );
  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-select],[data-hide],[data-menu]");
    if (!target) return;
    if (target.dataset.hide) handlers.onToggleHidden(target.dataset.hide);
    else if (target.dataset.menu) handlers.onMenu(target.dataset.menu, target.getBoundingClientRect(), !!target.closest("[data-bodies]"));
    else if (target.dataset.select?.startsWith("body:")) handlers.onSelectBody(target.dataset.select.slice(5));
    else if (target.dataset.select?.startsWith("sketch:")) handlers.onSelectSketch(target.dataset.select.slice(7));
  });
  container.replaceChildren(root);
}
