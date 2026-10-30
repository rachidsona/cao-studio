/**
 * Timeline (bottom strip), like the history bar of desktop CAD tools: the
 * operations of the document in order (extrusion, hole, revolution…), each as the
 * icon of its tool (the name is its tooltip). A click on one opens the dialog to
 * edit, rename or delete it.
 */
import { el } from "./dom";
import { STATE_BADGES, TYPE_LABELS, TYPE_SPRITES, type NavItem } from "./feature-meta";
import { toolIcon } from "./icons";

export function renderTimeline(
  container: HTMLElement,
  items: NavItem[],
  selectedId: string | null,
  onOpen: (id: string, anchor: DOMRect) => void,
): void {
  const chips = items.map((item) => {
    const badge = STATE_BADGES[item.state];
    const selected = item.id === selectedId;
    return el(
      "button",
      {
        type: "button",
        class:
          "relative flex size-8 shrink-0 items-center justify-center border " +
          (selected
            ? "border-sky-500 bg-sky-100 text-sky-950 dark:bg-sky-900/60 dark:text-sky-50"
            : "border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"),
        title: item.message ?? `${item.name} (${TYPE_LABELS[item.type]}) — ${badge.label}`,
        "aria-label": item.name,
        "aria-pressed": String(selected),
        "data-op": item.id,
      },
      toolIcon(TYPE_SPRITES[item.type], `tool-icon size-5 ${item.suppressed ? "opacity-40 grayscale" : ""}`),
      // A problem or a disabled operation shows as a dot on the corner of its icon.
      item.state === "ok" ? null : el("span", { class: `absolute top-0.5 right-0.5 size-2.5 rounded-full ring-2 ring-white dark:ring-gray-800 ${badge.dot}`, "aria-label": badge.label }),
    );
  });
  const strip = el(
    "div",
    { class: "flex items-center gap-1 overflow-x-auto px-2 py-0.5", role: "toolbar", "aria-label": "Historique des opérations" },
    el("span", { class: "shrink-0 pr-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, "Historique"),
    ...(chips.length ? chips : [el("span", { class: "text-xs text-gray-500 dark:text-gray-400" }, "Aucune opération : extrudez une esquisse pour commencer.")]),
  );
  strip.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-op]");
    if (target?.dataset.op) onOpen(target.dataset.op, target.getBoundingClientRect());
  });
  container.replaceChildren(strip);
  strip.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
