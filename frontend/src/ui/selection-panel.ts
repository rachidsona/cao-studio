/** "Sélection" section of the properties panel: measurements and actions on picked faces/edges. */
import { edgeText, faceText, pointText, type SelectionSummary } from "../app/model-selection";
import { formatArea, formatLength } from "../measurements/units";
import type { DisplayUnit } from "../document/types";
import { el } from "./dom";
import { toolIcon } from "./icons";
import { section } from "./fields";

export interface SelectionActions {
  fillet(): void;
  chamfer(): void;
  extrude(): void;
  combine(): void;
  split(): void;
  move(): void;
  sketch(): void;
  clear(): void;
  /** Deletes what is picked (Suppr): bodies (also through a face, an edge or a corner), sketches, sketch lines and points. */
  remove(): void;
}

/**
 * An action button with the same icon as the tool in the ribbon: the icon alone while the panel is narrow (the name is
 * the tooltip), the name too once it is wide.
 */
function action(icon: string, label: string, run: () => void): HTMLElement {
  const button = el(
    "button",
    {
      type: "button",
      class: "tool-btn min-h-10 min-w-10 flex-auto gap-1.5 border border-gray-300 px-1.5 whitespace-nowrap dark:border-gray-600",
      title: label,
      "aria-label": label,
    },
    toolIcon(icon, "tool-icon size-7"),
    el("span", { class: "hidden @xs:inline", "aria-hidden": "true" }, label),
  );
  button.addEventListener("click", run);
  return button;
}

export function selectionSection(summary: SelectionSummary, unit: DisplayUnit, actions: SelectionActions): HTMLElement | null {
  const { faces, edges, vertices, sketch, bodies, sketches } = summary;
  if (faces.length === 0 && edges.length === 0 && vertices.length === 0 && sketch.length === 0 && bodies.length === 0 && sketches.length === 0) return null;
  const SKETCH_KINDS = { point: "Point", curve: "Trait", region: "Zone" } as const;
  const items = [
    ...bodies.map((b) =>
      el("li", { class: "flex justify-between gap-3" }, el("span", {}, "Corps"), el("span", { class: "font-medium" }, b.name)),
    ),
    ...sketches.map((s) =>
      el("li", { class: "flex justify-between gap-3" }, el("span", {}, "Esquisse"), el("span", { class: "font-medium" }, s.name)),
    ),
    ...sketch.map((p) =>
      el(
        "li",
        { class: "flex justify-between gap-3" },
        el("span", {}, `${SKETCH_KINDS[p.kind]} — ${p.sketchName}`),
        el(
          "span",
          { class: "text-right font-mono text-xs tabular-nums" },
          p.kind === "point" && p.points[0] ? pointText(p.points[0], unit) : p.kind === "curve" ? formatLength(p.measure ?? 0, unit) : formatArea(p.measure ?? 0, unit),
        ),
      ),
    ),
    ...vertices.map((v, i) =>
      el("li", { class: "flex justify-between gap-3" }, el("span", {}, `Point ${i + 1}`), el("span", { class: "text-right font-mono text-xs tabular-nums" }, pointText(v.point, unit))),
    ),
    ...edges.map(({ pick, info }) =>
      el(
        "li",
        { class: "flex justify-between gap-3" },
        el("span", {}, `Arête ${pick.edgeIndex + 1}${info?.curve === "LINE" ? "" : info ? " (courbe)" : ""}`),
        el("span", { class: "font-mono tabular-nums" }, info ? edgeText(info, unit) : "…"),
      ),
    ),
    ...(summary.gap !== undefined
      ? [
          el(
            "li",
            { class: "flex justify-between gap-3 bg-amber-50 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" },
            el("span", {}, "Écart entre les arêtes"),
            el("span", { class: "font-mono font-semibold tabular-nums" }, formatLength(summary.gap, unit)),
          ),
        ]
      : []),
    ...faces.map(({ pick, info }) =>
      el(
        "li",
        { class: "flex justify-between gap-3" },
        el("span", {}, `Face ${pick.faceIndex + 1}`),
        el("span", { class: "text-right font-mono tabular-nums" }, info ? faceText(info, unit) : "…"),
      ),
    ),
  ];
  const planarFaces = faces.length > 0 && faces.every((f) => f.info?.surface === "PLANE");
  const buttons: HTMLElement[] = [];
  if (edges.length) buttons.push(action("i-fillet", "Congé", actions.fillet), action("i-chamfer", "Chanfrein", actions.chamfer));
  if (planarFaces && edges.length === 0) buttons.push(action("i-extrude", "Extruder", actions.extrude));
  if (planarFaces && faces.length === 1 && edges.length === 0) buttons.push(action("i-sketch", "Esquisse sur la face", actions.sketch));
  if (bodies.length >= 2) buttons.push(action("i-combine", "Combiner", actions.combine));
  if (bodies.length === 1 || (planarFaces && edges.length === 0)) buttons.push(action("i-split", "Scinder le corps", actions.split));
  const deletable = bodies.length + sketches.length + faces.length + edges.length + vertices.length + sketch.filter((p) => p.kind !== "region").length;
  if (deletable) buttons.push(action("i-delete", `Supprimer${deletable > 1 ? ` (${deletable})` : ""}`, actions.remove));
  if (sketch.length === 0 && sketches.length === 0) buttons.push(action("i-move-3d", "Déplacer", actions.move));
  const clear = el("button", { type: "button", class: "text-xs text-gray-500 underline hover:text-gray-800 dark:hover:text-gray-200" }, "Tout désélectionner");
  clear.addEventListener("click", actions.clear);
  const parts = [
    bodies.length ? `${bodies.length} corps` : "",
    sketches.length ? `${sketches.length} esquisse${sketches.length > 1 ? "s" : ""}` : "",
    vertices.length ? `${vertices.length} point${vertices.length > 1 ? "s" : ""}` : "",
    sketch.length ? `${sketch.length} élément${sketch.length > 1 ? "s" : ""} d'esquisse` : "",
    edges.length ? `${edges.length} arête${edges.length > 1 ? "s" : ""}` : "",
    faces.length ? `${faces.length} face${faces.length > 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  return section(
    `Sélection (${parts.join(", ")})`,
    el("ul", { class: "space-y-1 text-sm" }, ...items),
    buttons.length ? el("div", { class: "@container" }, el("div", { class: "flex flex-wrap gap-1.5" }, ...buttons)) : null,
    el("p", { class: "text-xs text-gray-500 dark:text-gray-400" }, "Cliquez d'autres éléments pour les ajouter, recliquez pour les retirer. Le filtre de la barre d'outils choisit faces, arêtes, points ou corps. Ctrl/Maj + clic ajoute des corps et des esquisses entières ; Maj + glisser (ou « Fenêtre ») les prend par fenêtre. Un point de corps s'accroche dans une esquisse (contrainte Coïncidence)."),
    clear,
  );
}
