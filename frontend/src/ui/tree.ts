/** Model tree: the parametric history with each feature's regeneration state. */
import type { CadDocument, Feature } from "../document/types";
import type { FeatureState, FeatureStatus } from "../history/recompute";
import { el } from "./dom";

export interface TreeHandlers {
  onSelect(id: string): void;
  onToggleSuppress(id: string): void;
  /** Eye icon of a sketch: shows or hides it in the 3D view. */
  onToggleHidden(id: string): void;
  onDelete(id: string): void;
}

const TYPE_LABELS: Record<Feature["type"], string> = {
  sketch: "Esquisse",
  extrude: "Extrusion",
  hole: "Perçage",
  revolve: "Révolution",
  fillet: "Congé",
  chamfer: "Chanfrein",
  combine: "Combinaison",
};
const TYPE_ICONS: Record<Feature["type"], string> = {
  sketch: "✎",
  extrude: "▣",
  hole: "◎",
  revolve: "⟲",
  fillet: "◜",
  chamfer: "◸",
  combine: "⧉",
};

const STATE_BADGES: Record<FeatureState, { label: string; class: string }> = {
  ok: { label: "OK", class: "bg-emerald-500" },
  error: { label: "Erreur", class: "bg-red-500" },
  blocked: { label: "Bloquée", class: "bg-amber-500" },
  suppressed: { label: "Désactivée", class: "bg-gray-400" },
};

const SVG = "http://www.w3.org/2000/svg";

/** Open eye (visible) or crossed-out eye (hidden), drawn in the text colour. */
function eyeIcon(visible: boolean): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "mx-auto size-[18px]");
  svg.setAttribute("aria-hidden", "true");
  const draw = (tag: "path" | "circle", attrs: Record<string, string>) => {
    const node = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries({ fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", ...attrs })) node.setAttribute(name, value);
    svg.append(node);
  };
  draw("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" });
  draw("circle", { cx: "12", cy: "12", r: "3" });
  if (!visible) draw("path", { d: "M3 3l18 18" });
  return svg;
}

export function renderTree(
  container: HTMLElement,
  doc: CadDocument,
  statuses: Map<string, FeatureStatus>,
  selectedId: string | null,
  handlers: TreeHandlers,
): void {
  const items = doc.features.map((feature) => {
    const status = statuses.get(feature.id);
    const badge = STATE_BADGES[status?.state ?? "ok"];
    const selected = feature.id === selectedId;
    const row = el(
      "li",
      {
        class: `group flex min-h-11 items-center gap-2 rounded-md px-2 text-sm ${
          selected ? "bg-sky-100 text-sky-950 dark:bg-sky-900/60 dark:text-sky-50" : "hover:bg-gray-100 dark:hover:bg-gray-800"
        }`,
      },
      el(
        "button",
        {
          type: "button",
          class: "flex min-h-11 flex-1 items-center gap-2 text-left",
          "aria-pressed": selected ? "true" : "false",
          title: status?.message ?? `${TYPE_LABELS[feature.type]} — ${status?.detail ?? badge.label}`,
          "data-feature": feature.id,
        },
        el("span", { class: "w-5 text-center text-gray-500 dark:text-gray-400", "aria-hidden": "true" }, TYPE_ICONS[feature.type]),
        el("span", { class: `flex-1 truncate ${feature.suppressed ? "line-through opacity-60" : ""} ${feature.hidden ? "opacity-60" : ""}` }, feature.name),
        el("span", { class: `size-2.5 shrink-0 rounded-full ${badge.class}`, "aria-label": badge.label }),
      ),
      feature.type === "sketch"
        ? el(
            "button",
            {
              type: "button",
              class: `size-9 shrink-0 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${feature.hidden ? "text-gray-400 dark:text-gray-500" : "text-sky-700 dark:text-sky-300"}`,
              title: feature.hidden ? "Afficher l'esquisse" : "Masquer l'esquisse",
              "aria-label": `${feature.hidden ? "Afficher" : "Masquer"} ${feature.name}`,
              "aria-pressed": String(!feature.hidden),
              "data-hide": feature.id,
            },
            eyeIcon(!feature.hidden),
          )
        : el(
            "button",
            {
              type: "button",
              class: "size-9 rounded text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700",
              title: feature.suppressed ? "Réactiver" : "Désactiver",
              "aria-label": `${feature.suppressed ? "Réactiver" : "Désactiver"} ${feature.name}`,
              "data-suppress": feature.id,
            },
            feature.suppressed ? "◌" : "●",
          ),
      el(
        "button",
        {
          type: "button",
          class: "size-9 rounded text-gray-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950",
          title: "Supprimer",
          "aria-label": `Supprimer ${feature.name}`,
          "data-delete": feature.id,
        },
        "✕",
      ),
    );
    if (status?.message) {
      return el("div", {}, row, el("p", { class: "px-9 pb-2 text-xs text-red-700 dark:text-red-300" }, status.message));
    }
    return row;
  });

  const list = el("ul", { class: "space-y-0.5" }, ...items);
  if (doc.features.length === 0) {
    list.append(el("li", { class: "px-2 py-4 text-sm text-gray-500" }, "Aucune opération. Ajoutez une plaque pour commencer."));
  }
  list.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-feature],[data-suppress],[data-hide],[data-delete]");
    if (!target) return;
    if (target.dataset.feature) handlers.onSelect(target.dataset.feature);
    else if (target.dataset.suppress) handlers.onToggleSuppress(target.dataset.suppress);
    else if (target.dataset.hide) handlers.onToggleHidden(target.dataset.hide);
    else if (target.dataset.delete) handlers.onDelete(target.dataset.delete);
  });
  container.replaceChildren(list);
}
