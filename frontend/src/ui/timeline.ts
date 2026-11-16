/**
 * Timeline (bottom strip), like the history bar of desktop CAD tools: the
 * operations of the document in order (sketch, extrusion, hole, revolution…), each as the
 * icon of its tool (the name is its tooltip). A click on one selects what it made in the view and opens the dialog to
 * edit, rename or delete it. Ctrl/⌘ + click marks one step (again: unmarks it), Maj + click every step from the last
 * one marked; the marked steps are deleted together (one undo step) by the bar that appears, or the Suppr key.
 */
import { el } from "./dom";
import { STATE_BADGES, TYPE_LABELS, TYPE_SPRITES, type NavItem } from "./feature-meta";
import { toolIcon } from "./icons";

export function renderTimeline(
  container: HTMLElement,
  items: NavItem[],
  selectedId: string | null,
  /** The steps that made what is selected: their frame is lit. */
  lit: ReadonlySet<string>,
  onOpen: (id: string, anchor: DOMRect) => void,
  marks?: {
    marked: ReadonlySet<string>;
    /** Ctrl/⌘ + click: this one in or out; Maj + click: every step from the last marked to this one. */
    onMark: (id: string, range: boolean) => void;
    onRemove: () => void;
    onClear: () => void;
  },
): void {
  const marked = marks?.marked ?? new Set<string>();
  const chips = items.map((item) => {
    const badge = STATE_BADGES[item.state];
    const selected = item.id === selectedId;
    const framed = lit.size ? lit.has(item.id) : selected;
    const isMarked = marked.has(item.id);
    return el(
      "button",
      {
        type: "button",
        class:
          `relative flex size-8 shrink-0 items-center justify-center ${isMarked ? "border-2 border-red-500 " : framed ? "border-2 border-[#63df0f] " : "border border-gray-300 dark:border-gray-600 "}` +
          (isMarked ? "bg-red-50 dark:bg-red-950/60" : selected ? "bg-sky-100 text-sky-950 dark:bg-sky-900/60 dark:text-sky-50" : "bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"),
        title: item.message ?? `${item.name} (${TYPE_LABELS[item.type]}) — ${badge.label}`,
        "aria-label": item.name,
        "aria-pressed": String(selected),
        ...(framed ? { "data-lit": "" } : {}),
        ...(isMarked ? { "data-marked": "" } : {}),
        "data-op": item.id,
      },
      toolIcon(TYPE_SPRITES[item.type], `tool-icon size-5 ${item.suppressed ? "opacity-40 grayscale" : ""}`),
      // A problem or a disabled operation shows as a dot on the corner of its icon.
      item.state === "ok" ? null : el("span", { class: `absolute top-0.5 right-0.5 size-2.5 rounded-full ring-2 ring-white dark:ring-gray-800 ${badge.dot}`, "aria-label": badge.label }),
    );
  });
  // The marked steps: how many, and what to do with them.
  const bar = marks && marked.size
    ? el(
        "span",
        { class: "flex shrink-0 items-center gap-1 pr-1", "data-marked-bar": "" },
        el("span", { class: "text-xs font-medium text-red-700 dark:text-red-300" }, `${marked.size} choisie${marked.size > 1 ? "s" : ""}`),
        el("button", { type: "button", class: "h-7 bg-red-600 px-2 text-xs font-medium text-white hover:bg-red-700", "data-remove-marked": "" }, "Supprimer"),
        el("button", { type: "button", class: "h-7 border border-gray-300 px-2 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700", "data-clear-marked": "", title: "Ne plus rien choisir (Échap)" }, "✕"),
      )
    : null;
  const strip = el(
    "div",
    { class: "flex items-center gap-1 overflow-x-auto px-2 py-0.5", role: "toolbar", "aria-label": "Historique des opérations", tabindex: "-1" },
    el("span", { class: "shrink-0 pr-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400", title: "Ctrl ou ⌘ + clic : choisir plusieurs étapes ; Maj + clic : toutes celles entre deux" }, "Historique"),
    bar,
    ...(chips.length ? chips : [el("span", { class: "text-xs text-gray-500 dark:text-gray-400" }, "Aucune opération : dessinez une esquisse pour commencer.")]),
  );
  strip.addEventListener("click", (event) => {
    const element = event.target as HTMLElement;
    if (element.closest("[data-remove-marked]")) return marks?.onRemove();
    if (element.closest("[data-clear-marked]")) return marks?.onClear();
    const target = element.closest<HTMLElement>("[data-op]");
    if (!target?.dataset.op) return;
    if (marks && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      strip.focus();
      return marks.onMark(target.dataset.op, event.shiftKey);
    }
    if (marked.size) marks?.onClear();
    onOpen(target.dataset.op, target.getBoundingClientRect());
  });
  strip.addEventListener("keydown", (event) => {
    if (!marks || !marked.size) return;
    if (event.key === "Delete" || event.key === "Backspace") (event.preventDefault(), marks.onRemove());
    else if (event.key === "Escape") marks.onClear();
  });
  container.replaceChildren(strip);
  strip.querySelector("[data-lit]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
