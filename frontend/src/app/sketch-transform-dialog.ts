/**
 * Les commandes « Symétrie », « Rotation » et « Échelle » de l'esquisse, sur les éléments sélectionnés : une petite
 * fenêtre demande l'axe (la dernière ligne sélectionnée, l'axe X ou Y), l'angle ou le facteur, le centre (l'origine,
 * le milieu de la sélection ou le point sélectionné seul) et s'il faut garder l'original ; une seule annulation
 * (sketcher/transform-selection.ts).
 */
import { AXIS_X, AXIS_Y } from "../document/sketch";
import { findCurve, pointPos, type Vec2 } from "../sketcher/edit";
import type { SketchMode } from "../sketcher/mode";
import { polarCopies, reflection, rotation, scaling, selectionCenter, transformSelection, type Affine } from "../sketcher/transform-selection";
import { el } from "../ui/dom";
import { openModal } from "./workshop-ui";

type Notify = (message: string, kind?: "info" | "success" | "error") => void;
const FIELD = "h-8 w-32 border border-gray-300 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-900";
const row = (label: string, input: HTMLElement) => el("label", { class: "flex items-center justify-between gap-3" }, el("span", {}, label), input);

function select(options: [string, string][]): HTMLSelectElement {
  return el("select", { class: FIELD }, ...options.map(([value, label]) => el("option", { value }, label)));
}

/** Runs the transform and reports it. */
function run(mode: SketchMode, notify: Notify, selection: Set<string>, f: Affine, copy: boolean, what: string, link?: string): void {
  const out = transformSelection(mode.geometry, selection, f, copy, link);
  if (!out.ok) return notify(out.reason, "error");
  mode.apply(out.geometry, `${what} : ${out.count} élément${out.count > 1 ? "s" : ""}${copy ? " copié" + (out.count > 1 ? "s" : "") : ""}.`);
}

export function openSketchTransform(kind: "mirror" | "rotate" | "scale" | "polar", mode: SketchMode, notify: Notify): void {
  const g = mode.geometry;
  const chosen = [...mode.selection];
  // A mirror across the last line selected (when it is not the only element).
  const last = chosen.at(-1);
  const axisLine = kind === "mirror" && chosen.length > 1 && last && findCurve(g, last)?.kind === "line" ? last : null;
  const selection = new Set(axisLine ? chosen.slice(0, -1) : chosen);
  if (!selection.size) return notify("Sélectionnez d'abord les traits à transformer (et, pour une symétrie, la ligne d'axe en dernier).", "info");
  const lone = chosen.length === 1 && g.points.some((p) => p.id === chosen[0]) ? chosen[0]! : null;
  const center = select([["selection", "Milieu de la sélection"], ["origin", "Origine de l'esquisse"], ...(lone ? [["point", "Le point sélectionné"] as [string, string]] : [])]);
  const centerOf = (): Vec2 => (center.value === "origin" ? [0, 0] : center.value === "point" && lone ? pointPos(g, lone) : (selectionCenter(g, selection) ?? [0, 0]));
  const copy = el("input", { type: "checkbox", checked: kind === "mirror" });
  const copyRow = el("label", { class: "flex items-center gap-2" }, copy, "Garder l'original (faire une copie)");
  let body: HTMLElement[];
  let make: () => { f: Affine; what: string; link?: string } | null;
  if (kind === "polar") {
    // Default centre: the origin (a rosette, holes round a centre); the selection's middle would turn it on itself.
    center.value = "origin";
    const count = el("input", { type: "number", min: "2", max: "200", step: "1", value: "6", class: FIELD, "aria-label": "Nombre" });
    const total = el("input", { type: "number", step: "any", value: "360", class: FIELD, "aria-label": "Angle total" });
    const close = openModal("Réseau circulaire", el("div", { class: "space-y-2 text-sm" },
      el("p", {}, `${selection.size} élément${selection.size > 1 ? "s" : ""} à répéter autour d'un centre.`),
      row("Nombre en tout (l'original compris)", count),
      row("Angle total (360 : un tour complet)", total),
      row("Centre", center),
      el("p", { class: "text-xs text-gray-500" }, "Les copies sont réparties régulièrement : sur un tour complet, ou de l'original à la dernière pour un angle plus petit."),
    ), [
      {
        label: "Appliquer",
        run: () => {
          const out = polarCopies(g, selection, centerOf(), Number(count.value), Number(total.value));
          if (!out.ok) return notify(out.reason, "error");
          close();
          mode.apply(out.geometry, `Réseau circulaire : ${out.count + 1} éléments.`);
        },
      },
      { label: "Annuler", run: () => close() },
    ]);
    return;
  }
  if (kind === "mirror") {
    const axis = select([...(axisLine ? [["line", `La ligne sélectionnée en dernier (${axisLine})`] as [string, string]] : []), ["x", "L'axe X (horizontal)"], ["y", "L'axe Y (vertical)"]]);
    body = [row("Axe", axis), copyRow, el("p", { class: "text-xs text-gray-500" }, "Une copie par symétrie autour d'une ligne de l'esquisse lui reste symétrique : elle suit quand on change l'original.")];
    make = () => {
      if (axis.value === "line" && axisLine) {
        const line = findCurve(g, axisLine);
        if (line?.kind !== "line") return null;
        const [a, b] = [pointPos(g, line.p1), pointPos(g, line.p2)];
        return { f: reflection(a, [b[0] - a[0], b[1] - a[1]]), what: "Symétrie", link: axisLine };
      }
      return { f: reflection([0, 0], axis.value === "x" ? [1, 0] : [0, 1]), what: "Symétrie", link: axis.value === "x" ? AXIS_X : AXIS_Y };
    };
  } else {
    const value = el("input", { type: "number", step: "any", value: kind === "rotate" ? "90" : "2", class: FIELD, "aria-label": kind === "rotate" ? "Angle" : "Facteur" });
    body = [row(kind === "rotate" ? "Angle (degrés, sens direct)" : "Facteur (2 : deux fois plus grand)", value), row("Centre", center), copyRow];
    make = () => {
      const v = Number(value.value);
      if (!Number.isFinite(v) || (kind === "scale" && v <= 0)) return null;
      return kind === "rotate" ? { f: rotation(centerOf(), v), what: `Rotation de ${v}°` } : { f: scaling(centerOf(), v), what: `Échelle × ${v}` };
    };
  }
  const title = kind === "mirror" ? "Symétrie" : kind === "rotate" ? "Rotation" : "Échelle";
  const close = openModal(title, el("div", { class: "space-y-2 text-sm" }, el("p", {}, `${selection.size} élément${selection.size > 1 ? "s" : ""} sélectionné${selection.size > 1 ? "s" : ""}.`), ...body), [
    {
      label: "Appliquer",
      run: () => {
        const made = make();
        if (!made) return notify("Valeur invalide.", "error");
        close();
        run(mode, notify, selection, made.f, copy.checked, made.what, made.link);
      },
    },
    { label: "Annuler", run: () => close() },
  ]);
}
