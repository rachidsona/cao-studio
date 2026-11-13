/**
 * Les réglages d'un module de dressing, en lignes d'un panneau : ses étagères et leur espacement, la hauteur de chaque
 * niche, son chapeau, ses tiroirs et leurs jeux, sa tringle, l'épaisseur de ses étagères — ceux que le module a
 * (document/dressing-modules.ts, moduleHas). Les mêmes dans l'outil Module (module-tool.ts) et au bas de « Modules à
 * glisser » (module-palette.ts). Les cotes se changent sur place dans `sizes` ; `changed` dit qu'une a changé.
 */
import { DRAWERS, moduleHas, ROD, type ModuleKind, type ModuleLayout, type ModuleSizes } from "../../document/dressing-modules";
import type { DisplayUnit } from "../../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";

export const FIELD =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
export const ROW = "grid grid-cols-[7rem_1fr] items-center gap-1.5";
export const SMALL = "h-8 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

export interface ModuleOptions {
  kind: ModuleKind;
  /** Its sizes (mm), changed in place. */
  sizes: ModuleSizes;
  unit: DisplayUnit;
  /** The module laid in its niche, when a niche is chosen: how many shelves it has, its niches from the bottom. */
  layout: ModuleLayout | null;
  /** The height of each of its niches too (one niche chosen). */
  levels: boolean;
  /** The thickness of its shelves (mm) and how it is set; none: not offered (it is the Répartition's). */
  thickness?: { value: number; set(mm: number): void };
  /** A setting changed. */
  changed(): void;
  /** A field left: the panel drawn again, the value as it is kept. */
  redraw(): void;
}

export function moduleOptionRows(o: ModuleOptions): (HTMLElement | null)[] {
  const { sizes, unit } = o;
  const number = (label: string, mm: number, set: (mm: number) => void, allowZero = false): HTMLElement => {
    const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(mm, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
    const apply = () => {
      const parsed = parseNumber(input.value);
      const ok = parsed !== null && (allowZero ? parsed >= 0 : parsed > 0);
      input.setAttribute("aria-invalid", String(!ok));
      if (ok) {
        set(fromDisplay(parsed, unit));
        o.changed();
      }
    };
    input.addEventListener("change", apply);
    input.addEventListener("blur", () => o.redraw());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        apply();
        input.blur();
      }
    });
    return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
  };
  const has = moduleHas(o.kind);
  const drawers = el("select", { class: FIELD, "aria-label": "Tiroirs" }, ...Array.from({ length: 8 }, (_, i) => el("option", { value: String(i + 1), selected: i + 1 === sizes.drawers }, String(i + 1))));
  drawers.addEventListener("change", () => {
    sizes.drawers = Number(drawers.value);
    o.changed();
  });
  const column = o.layout?.steps.divisions.at(-1);
  // No niche yet and no number set: as many as the spacing gives.
  const bySpacing = sizes.shelves === undefined && !column;
  const count = el(
    "select",
    { class: FIELD, "aria-label": "Étagères" },
    bySpacing ? el("option", { value: "", selected: true }, "Selon l'espacement") : null,
    ...Array.from({ length: 21 }, (_, i) => el("option", { value: String(i), selected: !bySpacing && i === (sizes.shelves ?? column?.input.count ?? 0) }, String(i))),
  );
  count.addEventListener("change", () => {
    if (count.value === "") delete sizes.shelves;
    else sizes.shelves = Number(count.value);
    delete sizes.heights;
    o.changed();
  });
  const rod = { ...ROD, ...sizes.rod };
  const front = { gap: DRAWERS.gap, bottomGap: DRAWERS.gap, betweenGap: DRAWERS.gap, sideGap: DRAWERS.sideGap, thickness: DRAWERS.thickness, handles: DRAWERS.handles, ...sizes.front };
  const handles = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: front.handles });
  handles.addEventListener("change", () => {
    sizes.front = { ...front, handles: handles.checked };
    o.changed();
  });
  const level = (key: string, mm: number) => (sizes.heights = { ...sizes.heights, [key]: mm });
  const leaves = o.levels ? (o.layout?.leaves ?? []) : [];
  const equal = el("button", { type: "button", class: `${SMALL} w-full` }, "Égaliser les niches");
  equal.addEventListener("click", () => {
    delete sizes.heights;
    o.changed();
  });
  const thickness = o.thickness;
  return [
    has.spacing ? el("label", { class: ROW }, "Étagères", count) : null,
    has.spacing
      ? number("Espacement des étagères", sizes.spacing, (v) => {
          sizes.spacing = v;
          delete sizes.shelves;
          delete sizes.heights;
        })
      : null,
    leaves.length > 1 ? el("p", { class: "font-semibold text-gray-700 dark:text-gray-200" }, "Niches, du bas vers le haut") : null,
    ...(leaves.length > 1 ? leaves.map((leaf, i) => number(`${leaf.fill === "drawers" ? "Tiroirs" : leaf.fill === "rod" ? "Penderie" : "Niche"} ${i + 1}`, leaf.box.y1 - leaf.box.y0, (v) => level(leaf.key, v))) : []),
    sizes.heights ? equal : null,
    has.hat ? number("Hauteur du chapeau", sizes.hat, (v) => (sizes.hat = v)) : null,
    has.drawers ? number("Zone des tiroirs", sizes.drawerZone, (v) => (sizes.drawerZone = v)) : null,
    has.drawers ? el("label", { class: ROW }, "Tiroirs", drawers) : null,
    has.drawers ? number("Jeu en haut", front.gap, (v) => (sizes.front = { ...front, gap: v }), true) : null,
    has.drawers && sizes.drawers > 1 ? number("Jeu entre façades", front.betweenGap, (v) => (sizes.front = { ...front, betweenGap: v }), true) : null,
    has.drawers ? number("Jeu en bas", front.bottomGap, (v) => (sizes.front = { ...front, bottomGap: v }), true) : null,
    has.drawers ? number("Jeu de côté", front.sideGap, (v) => (sizes.front = { ...front, sideGap: v }), true) : null,
    has.drawers ? number("Épaisseur façades", front.thickness, (v) => (sizes.front = { ...front, thickness: v })) : null,
    has.drawers ? el("label", { class: "flex min-h-8 items-center gap-2" }, handles, "Trous de poignée") : null,
    has.rod ? number("Diamètre tringle", rod.diameter, (v) => (sizes.rod = { ...rod, diameter: v })) : null,
    has.rod ? number("Tringle sous le haut", rod.drop, (v) => (sizes.rod = { ...rod, drop: v })) : null,
    thickness ? number("Épaisseur des étagères", thickness.value, (v) => thickness.set(v)) : null,
  ];
}
