/** Sketch section of the properties panel: state, dimensions (editable) and constraints. */
import { CONSTRAINT_GLYPHS, CONSTRAINT_LABELS } from "../constraints/catalog";
import { isDimension, type DimensionConstraint } from "../document/sketch";
import type { DisplayUnit, SketchFeature } from "../document/types";
import type { FeatureStatus } from "../history/recompute";
import { PLANE_LABELS } from "../sketcher/frame";
import { el } from "./dom";
import { iconButton, numberField, row, section } from "./fields";

export interface SketchPanelActions {
  editing: boolean;
  onEdit(): void;
  onDimension(id: string, value: number): boolean;
  onRemoveConstraint(id: string): void;
  onOffset(value: number): void;
}

function stateBadge(status: FeatureStatus | undefined): HTMLElement {
  const sketch = status?.sketch;
  let text = "Non calculée";
  let tone = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  if (status?.state === "error") {
    text = status.message ?? "Erreur";
    tone = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  } else if (sketch) {
    if (sketch.redundant.length) {
      text = `Contraintes redondantes : ${sketch.redundant.join(", ")}`;
      tone = "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    } else if (sketch.dof === 0) {
      text = "Entièrement contrainte";
      tone = "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
    } else {
      text = `À compléter : ${sketch.dof} cote(s) ou contrainte(s) manquante(s) pour figer la forme`;
      tone = "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200";
    }
  }
  const profile = sketch ? (sketch.closed ? "Profil fermé" : "Aucun profil fermé") : "";
  return el(
    "div",
    { class: "space-y-1" },
    el("p", { class: `rounded-md px-3 py-2 text-sm ${tone}`, "data-ref": "sketch-state" }, text),
    profile ? el("p", { class: "text-xs text-gray-500 dark:text-gray-400" }, profile) : null,
  );
}

function dimensionLabel(d: DimensionConstraint): string {
  return d.label ?? `${CONSTRAINT_LABELS[d.kind] ?? d.kind} ${d.id}`;
}

export function sketchSections(
  feature: SketchFeature,
  status: FeatureStatus | undefined,
  unit: DisplayUnit,
  actions: SketchPanelActions,
): HTMLElement[] {
  const dimensions = feature.constraints.filter(isDimension);
  const relations = feature.constraints.filter((c) => !isDimension(c));

  const editButton = actions.editing
    ? null
    : el("button", { type: "button", class: "tool-btn tool-btn-primary w-full", "data-action": "edit-sketch" }, "Modifier l'esquisse");
  editButton?.addEventListener("click", () => actions.onEdit());

  const general = section(
    "Esquisse",
    editButton,
    stateBadge(status),
    el("dl", {}, row("Plan", PLANE_LABELS[feature.plane])),
    numberField({ label: "Décalage du plan", value: feature.offset, unit, signed: true, onCommit: (v) => actions.onOffset(v) }),
  );

  const dimensionList = dimensions.length
    ? dimensions.map((d) =>
        numberField({
          label: dimensionLabel(d),
          value: d.value,
          unit: d.kind === "angle" ? "deg" : unit,
          signed: d.kind === "angle" || d.kind === "distanceX" || d.kind === "distanceY",
          onCommit: (v) => actions.onDimension(d.id, v),
          dataset: { dimension: d.id },
          trailing: actions.editing ? iconButton(`Supprimer la cote ${d.id}`, "✕", () => actions.onRemoveConstraint(d.id)) : null,
        }),
      )
    : [el("p", { class: "text-sm text-gray-500" }, "Aucune cote. Sélectionnez des éléments puis « Cote ».")];
  const sections = [general, section("Cotes", ...dimensionList)];

  if (actions.editing) {
    const items = relations.map((c) =>
      el(
        "li",
        { class: "flex min-h-9 items-center gap-2 text-sm" },
        el("span", { class: "w-6 text-center font-semibold text-sky-700 dark:text-sky-300", "aria-hidden": "true" }, CONSTRAINT_GLYPHS[c.kind] ?? "•"),
        el("span", { class: "flex-1" }, `${CONSTRAINT_LABELS[c.kind] ?? c.kind}`),
        el("span", { class: "font-mono text-xs text-gray-500" }, c.id),
        iconButton(`Supprimer la contrainte ${c.id}`, "✕", () => actions.onRemoveConstraint(c.id)),
      ),
    );
    sections.push(
      section(
        `Contraintes (${relations.length})`,
        items.length ? el("ul", { class: "space-y-0.5" }, ...items) : el("p", { class: "text-sm text-gray-500" }, "Aucune contrainte géométrique."),
      ),
    );
  }
  return sections;
}
