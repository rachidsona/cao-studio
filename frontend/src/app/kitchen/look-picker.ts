/**
 * Le choix d'un aspect dans la bibliothèque d'apparences, pour une pièce de la cuisine (le plan de travail, les
 * plinthes) : un menu qui se déplie, chaque matière sur sa vignette (la sphère de l'Apparence, appearance/swatches.ts),
 * rangées par famille — marbres et pierres, Dekton, bétons, bois —, « Celui de la matière » en tête. Fermé, il montre
 * le choix en cours avec sa sphère. Les sphères ne sont dessinées qu'à l'ouverture.
 */
import { APPEARANCES, CATEGORIES, type Appearance, type CategoryId } from "../../appearance/library";
import { swatch } from "../../appearance/swatches";
import { el } from "../../ui/dom";

/** The families offered, marbles and Dekton first. */
const LOOKS: CategoryId[] = ["stone", "sintered", "concrete", "wood"];

export interface LookHost {
  label: string;
  value: string | undefined;
  /** An appearance chosen (undefined: the material's own). */
  set(id: string | undefined): void;
  /** What it is the look of: « worktop », « kick » — its buttons are `data-<attr>-look`, its list `data-<attr>-looks`. */
  attr: string;
}

export function lookPicker({ label, value, set, attr }: LookHost): HTMLElement {
  const chosen = APPEARANCES.find((a) => a.id === value);
  const ball = (a: Appearance | undefined, size: string) => {
    const image = el("img", { alt: "", class: `${size} shrink-0 rounded-full bg-gray-100 dark:bg-gray-800`, draggable: "false" });
    if (a) image.style.background = a.color;
    return { image, draw: () => a && void swatch(a).then((url) => url && (image.src = url)) };
  };
  const pick = (a: Appearance | undefined, name: string) => {
    const b = ball(a, "aspect-square w-full");
    const on = (a?.id ?? undefined) === value;
    const button = el("button", { type: "button", class: `flex min-w-0 flex-col items-center gap-0.5 p-1 text-center hover:bg-sky-50 dark:hover:bg-sky-950 ${on ? "ring-2 ring-sky-500" : ""}`, title: name, "aria-pressed": String(on), [`data-${attr}-look`]: a?.id ?? "" }, b.image, el("span", { class: "line-clamp-2 w-full text-3xs leading-tight" }, name));
    button.addEventListener("click", () => set(a?.id));
    return { category: a?.category, button, draw: b.draw };
  };
  const tiles = [pick(undefined, "Celui de la matière"), ...APPEARANCES.filter((a) => LOOKS.includes(a.category)).map((a) => pick(a, a.name))];
  const grid = (category: CategoryId | undefined) => el("div", { class: "grid grid-cols-4 gap-1" }, ...tiles.filter((t) => t.category === category).map((t) => t.button));
  const families = [grid(undefined), ...LOOKS.map((id) => CATEGORIES.find((c) => c.id === id)!).flatMap((c) => [el("p", { class: "pt-1 text-2xs font-semibold text-gray-600 dark:text-gray-300" }, c.name), grid(c.id)])];
  const current = ball(chosen, "size-6");
  current.draw();
  const list = el("details", { class: "border border-gray-300 dark:border-gray-600", [`data-${attr}-looks`]: "" },
    el("summary", { class: "flex cursor-pointer items-center gap-2 px-2 py-1 text-xs", "aria-label": label }, current.image, chosen?.name ?? "Celui de la matière"),
    el("div", { class: "max-h-80 space-y-1 overflow-y-auto p-1" }, ...families));
  list.addEventListener("toggle", () => list.open && tiles.forEach((t) => t.draw()));
  return el("div", { class: "space-y-1" }, el("p", {}, label), list);
}
