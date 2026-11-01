/**
 * La barre du caisson sélectionné, en bas de la vue juste au-dessus de l'historique : son nom, ses poignées (✥ et ↻,
 * app/cabinet-drag.ts) et ses cotes à cliquer (app/drivers-3d.ts). Elle ne cache plus le meuble ni ses voisins, et ne
 * s'affiche que lorsqu'elle a quelque chose à montrer.
 */
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";

export interface CabinetBar {
  name: HTMLElement;
  grips: HTMLElement;
  dims: HTMLElement;
  /** Shown when it holds grips or dimensions. */
  refresh: () => void;
}

const bars = new WeakMap<Viewport, CabinetBar>();

export function cabinetBar(viewport: Viewport): CabinetBar {
  const known = bars.get(viewport);
  if (known) return known;
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const name = el("span", { class: "max-w-56 shrink-0 truncate font-semibold text-white dark:text-gray-900" });
  const grips = el("span", { class: "flex items-center gap-1" });
  const dims = el("span", { class: "flex items-center gap-1" });
  const bar = el(
    "div",
    { class: "absolute right-2 bottom-2 left-2 z-20 mx-auto hidden w-fit max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap border border-white/10 bg-gray-900/85 px-2 py-1 text-xs shadow-lg backdrop-blur dark:bg-gray-100/90", "data-cabinet-bar": "", role: "toolbar", "aria-label": "Caisson sélectionné" },
    name,
    grips,
    dims,
  );
  bar.addEventListener("pointerdown", (event) => event.stopPropagation());
  container.append(bar);
  const refresh = () => {
    const on = grips.childElementCount + dims.childElementCount > 0;
    bar.classList.toggle("hidden", !on);
    bar.classList.toggle("flex", on);
  };
  const made: CabinetBar = { name, grips, dims, refresh };
  bars.set(viewport, made);
  return made;
}
