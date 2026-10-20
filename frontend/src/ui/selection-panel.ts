/** "Sélection" section of the properties panel: measurements and actions on picked faces/edges. */
import { edgeText, faceText, type SelectionSummary } from "../app/model-selection";
import type { DisplayUnit } from "../document/types";
import { el } from "./dom";
import { section } from "./fields";

export interface SelectionActions {
  fillet(): void;
  chamfer(): void;
  extrude(): void;
  hole(): void;
  clear(): void;
}

function action(label: string, run: () => void, primary = false): HTMLElement {
  const button = el("button", { type: "button", class: `tool-btn ${primary ? "tool-btn-primary" : "border border-gray-300 dark:border-gray-600"} min-h-9 flex-1` }, label);
  button.addEventListener("click", run);
  return button;
}

export function selectionSection(summary: SelectionSummary, unit: DisplayUnit, actions: SelectionActions): HTMLElement | null {
  const { faces, edges } = summary;
  if (faces.length === 0 && edges.length === 0) return null;
  const items = [
    ...edges.map(({ pick, info }) =>
      el(
        "li",
        { class: "flex justify-between gap-3" },
        el("span", {}, `Arête ${pick.edgeIndex + 1}${info?.curve === "LINE" ? "" : info ? " (courbe)" : ""}`),
        el("span", { class: "font-mono tabular-nums" }, info ? edgeText(info, unit) : "…"),
      ),
    ),
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
  if (edges.length) buttons.push(action("◜ Congé", actions.fillet, true), action("◸ Chanfrein", actions.chamfer));
  if (planarFaces && edges.length === 0) buttons.push(action("⇧ Extruder", actions.extrude, true));
  if (planarFaces && faces.length === 1 && edges.length === 0) buttons.push(action("◎ Perçage", actions.hole));
  const clear = el("button", { type: "button", class: "text-xs text-gray-500 underline hover:text-gray-800 dark:hover:text-gray-200" }, "Tout désélectionner");
  clear.addEventListener("click", actions.clear);
  return section(
    `Sélection (${edges.length} arête${edges.length > 1 ? "s" : ""}, ${faces.length} face${faces.length > 1 ? "s" : ""})`,
    el("ul", { class: "space-y-1 text-sm" }, ...items),
    buttons.length ? el("div", { class: "flex flex-wrap gap-1.5" }, ...buttons) : null,
    el("p", { class: "text-xs text-gray-500 dark:text-gray-400" }, "Cliquez d'autres arêtes ou faces pour les ajouter, recliquez pour les retirer."),
    clear,
  );
}
