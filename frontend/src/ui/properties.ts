/**
 * Properties panel: numeric editing of the selected feature (values typed in
 * the display unit, stored in mm) plus measurements of bodies and faces.
 */
import type { DisplayUnit, Feature, SketchEntity } from "../document/types";
import type { BodyMetrics } from "../geometry/kernel";
import type { FaceInfo } from "../geometry/protocol";
import { formatArea, formatLength, formatVolume, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "./dom";

export type FeaturePatch = (feature: Feature) => Feature;

export interface PropertiesContext {
  feature: Feature | null;
  unit: DisplayUnit;
  body: { name: string; metrics: BodyMetrics } | null;
  face: FaceInfo | null;
  onCommit(patch: FeaturePatch): void;
}

interface LengthField {
  label: string;
  value: number;
  /** Lengths must be strictly positive unless `signed` is set. */
  signed?: boolean;
  apply(feature: Feature, mm: number): Feature;
}

const SURFACE_LABELS: Record<string, string> = {
  PLANE: "Plane",
  CYLINDRE: "Cylindrique",
  CONE: "Conique",
  SPHERE: "Sphérique",
  TORUS: "Torique",
};

function entityFields(entity: SketchEntity, index: number): LengthField[] {
  const patchEntity = (feature: Feature, update: Partial<SketchEntity>): Feature => {
    if (feature.type !== "sketch") return feature;
    const entities = feature.entities.map((e, i) => (i === index ? ({ ...e, ...update } as SketchEntity) : e));
    return { ...feature, entities };
  };
  const centre: LengthField[] = [
    { label: "Centre X", value: entity.cx, signed: true, apply: (f, mm) => patchEntity(f, { cx: mm }) },
    { label: "Centre Y", value: entity.cy, signed: true, apply: (f, mm) => patchEntity(f, { cy: mm }) },
  ];
  if (entity.kind === "rectangle") {
    return [
      { label: "Longueur (X)", value: entity.width, apply: (f, mm) => patchEntity(f, { width: mm }) },
      { label: "Largeur (Y)", value: entity.height, apply: (f, mm) => patchEntity(f, { height: mm }) },
      ...centre,
    ];
  }
  return [{ label: "Diamètre", value: entity.diameter, apply: (f, mm) => patchEntity(f, { diameter: mm }) }, ...centre];
}

function lengthFields(feature: Feature): LengthField[] {
  switch (feature.type) {
    case "sketch":
      return feature.entities.flatMap(entityFields);
    case "extrude":
      return [
        {
          label: "Épaisseur",
          value: feature.distance,
          signed: true,
          apply: (f, mm) => (f.type === "extrude" ? { ...f, distance: mm } : f),
        },
      ];
    case "hole": {
      const fields: LengthField[] = [
        { label: "Diamètre", value: feature.diameter, apply: (f, mm) => (f.type === "hole" ? { ...f, diameter: mm } : f) },
        { label: "Position X", value: feature.x, signed: true, apply: (f, mm) => (f.type === "hole" ? { ...f, x: mm } : f) },
        { label: "Position Y", value: feature.y, signed: true, apply: (f, mm) => (f.type === "hole" ? { ...f, y: mm } : f) },
      ];
      if (feature.depth !== "through") {
        fields.push({ label: "Profondeur", value: feature.depth, apply: (f, mm) => (f.type === "hole" ? { ...f, depth: mm } : f) });
      }
      return fields;
    }
  }
}

const inputClass =
  "min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-right font-mono text-sm tabular-nums " +
  "focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 " +
  "dark:border-gray-600 dark:bg-gray-900";

function lengthInput(field: LengthField, unit: DisplayUnit, onCommit: (patch: FeaturePatch) => void): HTMLElement {
  const input = el("input", {
    type: "text",
    inputmode: "decimal",
    class: inputClass,
    value: trim(toDisplay(field.value, unit), 6),
    "aria-label": `${field.label} (${UNIT_LABELS[unit]})`,
  });
  const error = el("p", { class: "col-span-2 hidden text-xs text-red-600 dark:text-red-400", role: "alert" });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
  input.addEventListener("change", () => {
    const value = parseNumber(input.value);
    let message = "";
    if (value === null) message = "Saisissez un nombre.";
    else if (!field.signed && value <= 0) message = "La valeur doit être strictement positive.";
    input.setAttribute("aria-invalid", message ? "true" : "false");
    error.textContent = message;
    error.classList.toggle("hidden", !message);
    if (message || value === null) return;
    const mm = fromDisplay(value, unit);
    if (mm !== field.value) onCommit((f) => field.apply(f, mm));
  });
  return el(
    "label",
    { class: "grid grid-cols-[1fr_8rem] items-center gap-x-3 gap-y-1 text-sm" },
    el("span", { class: "text-gray-600 dark:text-gray-300" }, `${field.label} (${UNIT_LABELS[unit]})`),
    input,
    error,
  );
}

function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return el(
    "section",
    { class: "space-y-3 border-b border-gray-200 p-4 last:border-0 dark:border-gray-700" },
    el("h3", { class: "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" }, title),
    ...children,
  );
}

function row(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "flex justify-between gap-4 text-sm" },
    el("dt", { class: "text-gray-600 dark:text-gray-300" }, label),
    el("dd", { class: "font-mono tabular-nums" }, value),
  );
}

function featureSection(feature: Feature, ctx: PropertiesContext): HTMLElement {
  const name = el("input", { type: "text", class: inputClass.replace("text-right font-mono", "text-left"), value: feature.name, maxlength: 80, "aria-label": "Nom" });
  name.addEventListener("change", () => {
    const value = name.value.trim();
    if (value && value !== feature.name) ctx.onCommit((f) => ({ ...f, name: value }));
  });
  const children: (Node | null)[] = [name, ...lengthFields(feature).map((field) => lengthInput(field, ctx.unit, ctx.onCommit))];

  if (feature.type === "hole") {
    const through = el("input", { type: "checkbox", class: "size-5 accent-sky-600", checked: feature.depth === "through" });
    through.addEventListener("change", () => {
      ctx.onCommit((f) => (f.type === "hole" ? { ...f, depth: through.checked ? "through" : 10 } : f));
    });
    children.push(el("label", { class: "flex min-h-11 items-center gap-3 text-sm" }, through, "Perçage traversant"));
  }
  if (feature.type === "extrude") {
    const labels = { new: "Nouveau corps", join: "Union", cut: "Soustraction" };
    children.push(el("dl", {}, row("Opération", labels[feature.operation])));
  }
  return section("Opération", ...children);
}

export function renderProperties(container: HTMLElement, ctx: PropertiesContext): void {
  const sections: HTMLElement[] = [];
  if (ctx.feature) sections.push(featureSection(ctx.feature, ctx));
  if (ctx.body) {
    const { metrics } = ctx.body;
    const [min, max] = metrics.bbox;
    const dims = [0, 1, 2].map((i) => formatLength((max[i] ?? 0) - (min[i] ?? 0), ctx.unit)).join(" × ");
    sections.push(
      section(
        `Mesures — ${ctx.body.name}`,
        el(
          "dl",
          { class: "space-y-1.5" },
          row("Volume", formatVolume(metrics.volume, ctx.unit)),
          row("Surface", formatArea(metrics.area, ctx.unit)),
          row("Encombrement", dims),
          row("Faces / arêtes", `${metrics.faceCount} / ${metrics.edgeCount}`),
        ),
      ),
    );
  }
  if (ctx.face) {
    sections.push(
      section(
        `Face n° ${ctx.face.faceIndex + 1}`,
        el(
          "dl",
          { class: "space-y-1.5" },
          row("Type", SURFACE_LABELS[ctx.face.surface] ?? ctx.face.surface),
          row("Aire", formatArea(ctx.face.area, ctx.unit)),
        ),
      ),
    );
  }
  if (sections.length === 0) {
    sections.push(section("Propriétés", el("p", { class: "text-sm text-gray-500" }, "Sélectionnez une opération dans l'arbre ou une face dans la vue.")));
  }
  container.replaceChildren(...sections);
}
