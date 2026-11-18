/**
 * Properties panel: numeric editing of the selected feature (values typed in
 * the display unit, stored in mm) plus the faces and edges picked in the view.
 */
import type { CabinetFeature, ChamferFeature, CombineFeature, MoveFeature, PanelsFeature, SplitFeature, DisplayUnit, ExtrudeFeature, Feature, FilletFeature, HoleFeature, RevolveFeature } from "../document/types";
import type { SelectionSummary } from "../app/model-selection";
import { selectionSection, type SelectionActions } from "./selection-panel";
import type { FeatureStatus } from "../history/recompute";
import { formatLength } from "../measurements/units";
import { el } from "./dom";
import { OPERATION_LABELS, operationChoices } from "./feature-meta";
import { numberField, row, section, selectField, textInputClass } from "./fields";
import { sketchSections, type SketchPanelActions } from "./sketch-panel";

export type FeaturePatch = (feature: Feature) => Feature;

export interface PropertiesContext {
  feature: Feature | null;
  status: FeatureStatus | undefined;
  unit: DisplayUnit;
  /** Display name of a body ("Corps 1", "Corps 1 — pièce 2"). */
  bodyName(id: string): string;
  /** Faces and edges picked in the 3D view, with their measurements and actions. */
  selection: SelectionSummary;
  selectionActions: SelectionActions;
  /** Bodies an extrusion can join or cut (features before it). */
  targets: { id: string; name: string }[];
  sketch: SketchPanelActions;
  /** Reopens the interactive extrusion (arrow) on the selected extrusion. */
  onEditExtrude?: () => void;
  /** Reopens the tool of the selected revolution, fillet, chamfer, combination or hole. */
  onEditFeature?: () => void;
  onCommit(patch: FeaturePatch): void;
}


function nameField(feature: Feature, ctx: PropertiesContext): HTMLElement {
  const name = el("input", { type: "text", class: textInputClass, value: feature.name, maxlength: 80, "aria-label": "Nom" });
  name.addEventListener("change", () => {
    const value = name.value.trim();
    if (value && value !== feature.name) ctx.onCommit((f) => ({ ...f, name: value }));
  });
  return name;
}

function extrudeSection(feature: ExtrudeFeature, ctx: PropertiesContext): HTMLElement {
  const patch = (update: Partial<ExtrudeFeature>) => ctx.onCommit((f) => (f.type === "extrude" ? { ...f, ...update } : f));
  const operation = selectField(
    "Opération",
    feature.operation,
    operationChoices("new", "join", "cut"),
    (value) => {
      const op = value as ExtrudeFeature["operation"];
      // Faces pulled from a body: the body stays the one they are read on, whatever the operation (a new body too).
      if (op === "new" && !feature.faces) patch({ operation: op, target: undefined });
      else patch({ operation: op, target: feature.target ?? ctx.targets[ctx.targets.length - 1]?.id });
    },
  );
  const target =
    feature.operation === "new" && !feature.faces
      ? null
      : selectField(
          feature.faces ? "Corps des faces" : "Corps cible",
          feature.target ?? "",
          [["", "— choisir —"], ...ctx.targets.map((t): [string, string] => [t.id, t.name])],
          (value) => patch({ target: value || undefined }),
        );
  const edit = el("button", { type: "button", class: "tool-btn tool-btn-primary w-full", "data-action": "edit-extrude" }, "⇧ Modifier avec la flèche");
  edit.addEventListener("click", () => ctx.onEditExtrude?.());
  return section(
    "Extrusion",
    edit,
    nameField(feature, ctx),
    numberField({ label: "Distance", value: feature.distance, unit: ctx.unit, signed: true, onCommit: (v) => patch({ distance: v }) }),
    operation,
    target,
  );
}

function editButton(ctx: PropertiesContext): HTMLElement {
  const button = el("button", { type: "button", class: "tool-btn tool-btn-primary w-full", "data-action": "edit-feature" }, "✎ Modifier dans la vue");
  button.addEventListener("click", () => ctx.onEditFeature?.());
  return button;
}

const SPLIT_KEEP = { both: "Les deux parties", positive: "Côté positif (+)", negative: "Côté négatif (−)" };
const OPERATION_NAMES = OPERATION_LABELS;

function revolveSection(feature: RevolveFeature, ctx: PropertiesContext): HTMLElement {
  return section(
    "Révolution",
    editButton(ctx),
    nameField(feature, ctx),
    numberField({
      label: "Angle",
      value: feature.angle,
      unit: "deg",
      onCommit: (v) => (v > 360 ? false : ctx.onCommit((f) => (f.type === "revolve" ? { ...f, angle: v } : f))),
    }),
    el("dl", { class: "space-y-1" }, row("Axe", feature.axis), row("Opération", OPERATION_NAMES[feature.operation])),
  );
}

function edgeSection(feature: FilletFeature | ChamferFeature, ctx: PropertiesContext): HTMLElement {
  const isFillet = feature.type === "fillet";
  return section(
    isFillet ? "Congé" : "Chanfrein",
    editButton(ctx),
    nameField(feature, ctx),
    numberField({
      label: isFillet ? "Rayon" : "Distance",
      value: isFillet ? feature.radius : feature.distance,
      unit: ctx.unit,
      onCommit: (v) =>
        ctx.onCommit((f) => (f.type === "fillet" ? { ...f, radius: v } : f.type === "chamfer" ? { ...f, distance: v } : f)),
    }),
    el("dl", {}, row("Arêtes", String(feature.edges.length))),
  );
}

function combineSection(feature: CombineFeature, ctx: PropertiesContext): HTMLElement {
  return section(
    "Combinaison",
    editButton(ctx),
    nameField(feature, ctx),
    el(
      "dl",
      { class: "space-y-1" },
      row("Opération", OPERATION_NAMES[feature.operation]),
      row("Cible", feature.target),
      row("Outils", feature.tools.join(", ")),
    ),
  );
}

function splitSection(feature: SplitFeature, ctx: PropertiesContext): HTMLElement {
  return section(
    "Scission",
    editButton(ctx),
    nameField(feature, ctx),
    el(
      "dl",
      { class: "space-y-1" },
      row("Corps scindé", ctx.bodyName(feature.target)),
      row("Outil de coupe", feature.tool.kind === "plane" ? `Plan ${feature.tool.plane}, décalage ${formatLength(feature.tool.offset, ctx.unit)}` : feature.tool.kind === "line" ? "Trait tracé sur une face" : `Face plane de ${ctx.bodyName(feature.tool.body)}`),
      row("Parties conservées", SPLIT_KEEP[feature.keep]),
    ),
  );
}

function cabinetSection(feature: CabinetFeature, ctx: PropertiesContext): HTMLElement {
  const patch = (update: Partial<CabinetFeature>) => ctx.onCommit((f) => (f.type === "cabinet" ? { ...f, ...update } : f));
  const length = (label: string, key: "width" | "height" | "depth" | "thickness") =>
    numberField({ label, value: feature[key], unit: ctx.unit, onCommit: (v) => patch({ [key]: v } as Partial<CabinetFeature>) });
  return section(
    "Caisson",
    editButton(ctx),
    nameField(feature, ctx),
    length("Largeur", "width"),
    length("Hauteur", "height"),
    length("Profondeur", "depth"),
    length("Épaisseur", "thickness"),
    selectField("Étagères", String(feature.shelves), Array.from({ length: 11 }, (_, n): [string, string] => [String(n), String(n)]), (v) => patch({ shelves: Number(v) })),
  );
}

function panelsSection(feature: PanelsFeature, ctx: PropertiesContext): HTMLElement {
  const patch = (update: Partial<PanelsFeature>) => ctx.onCommit((f) => (f.type === "panels" ? { ...f, ...update } : f));
  return section(
    "Panneaux",
    editButton(ctx),
    nameField(feature, ctx),
    numberField({ label: "Épaisseur", value: feature.thickness, unit: ctx.unit, onCommit: (v) => patch({ thickness: v }) }),
    numberField({ label: "Profondeur", value: feature.depth, unit: ctx.unit, signed: true, onCommit: (v) => patch({ depth: v }) }),
    selectField("Côté", feature.align, [["inside", "Vers l'intérieur"], ["center", "Centré"], ["outside", "Vers l'extérieur"]], (v) => patch({ align: v as PanelsFeature["align"] })),
    selectField("Aux coins", feature.through, [["vertical", "Les montants passent"], ["horizontal", "Dessus et dessous passent"]], (v) => patch({ through: v as PanelsFeature["through"] })),
  );
}

function moveSection(feature: MoveFeature, ctx: PropertiesContext): HTMLElement {
  const patch = (i: number, value: number) =>
    ctx.onCommit((f) => (f.type === "move" ? { ...f, translate: f.translate.map((x, k) => (k === i ? value : x)) as MoveFeature["translate"] } : f));
  return section(
    "Déplacement",
    editButton(ctx),
    nameField(feature, ctx),
    el("dl", { class: "space-y-1" }, row("Corps déplacé", ctx.bodyName(feature.target)), row("Repère", "Global")),
    ...["ΔX", "ΔY", "ΔZ"].map((label, i) => numberField({ label, value: feature.translate[i] as number, unit: ctx.unit, signed: true, onCommit: (v) => patch(i, v) })),
  );
}

function holeSection(feature: HoleFeature, ctx: PropertiesContext): HTMLElement {
  const patch = (update: Partial<HoleFeature>) => ctx.onCommit((f) => (f.type === "hole" ? { ...f, ...update } : f));
  const through = el("input", { type: "checkbox", class: "size-5 accent-sky-600", checked: feature.depth === "through" });
  through.addEventListener("change", () => patch({ depth: through.checked ? "through" : 10 }));
  const onFace = feature.origin !== undefined;
  return section(
    "Perçage",
    editButton(ctx),
    nameField(feature, ctx),
    numberField({ label: "Diamètre", value: feature.diameter, unit: ctx.unit, onCommit: (v) => patch({ diameter: v }) }),
    onFace ? null : numberField({ label: "Position X", value: feature.x, unit: ctx.unit, signed: true, onCommit: (v) => patch({ x: v }) }),
    onFace ? null : numberField({ label: "Position Y", value: feature.y, unit: ctx.unit, signed: true, onCommit: (v) => patch({ y: v }) }),
    feature.depth === "through"
      ? null
      : numberField({ label: "Profondeur", value: feature.depth, unit: ctx.unit, onCommit: (v) => patch({ depth: v }) }),
    el("label", { class: "flex min-h-8 items-center gap-3 text-sm" }, through, "Perçage traversant"),
  );
}

export function renderProperties(container: HTMLElement, ctx: PropertiesContext): void {
  const sections: HTMLElement[] = [];
  const feature = ctx.feature;
  if (feature?.type === "sketch") {
    sections.push(section("Nom", nameField(feature, ctx)), ...sketchSections(feature, ctx.status, ctx.unit, ctx.sketch));
  } else if (feature?.type === "extrude") sections.push(extrudeSection(feature, ctx));
  else if (feature?.type === "hole") sections.push(holeSection(feature, ctx));
  else if (feature?.type === "revolve") sections.push(revolveSection(feature, ctx));
  else if (feature?.type === "fillet" || feature?.type === "chamfer") sections.push(edgeSection(feature, ctx));
  else if (feature?.type === "combine") sections.push(combineSection(feature, ctx));
  else if (feature?.type === "split") sections.push(splitSection(feature, ctx));
  else if (feature?.type === "move") sections.push(moveSection(feature, ctx));
  else if (feature?.type === "panels") sections.push(panelsSection(feature, ctx));
  else if (feature?.type === "cabinet") sections.push(cabinetSection(feature, ctx));

  if (ctx.status?.state === "error" || ctx.status?.state === "blocked") {
    sections.unshift(
      el("p", { class: "m-4 bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, ctx.status.message ?? "Erreur"),
    );
  }
  if (!ctx.sketch.editing) {
    const picked = selectionSection(ctx.selection, ctx.unit, ctx.selectionActions);
    if (picked) sections.unshift(picked);
  }
  if (sections.length === 0) {
    sections.push(section("Propriétés", el("p", { class: "text-sm text-gray-500" }, "Sélectionnez une opération dans l'arbre ou une face dans la vue.")));
  }
  container.replaceChildren(...sections);
}
