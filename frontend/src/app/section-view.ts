/**
 * "Coupe" (as Curic Section): a plane perpendicular to X, Y or Z hides what
 * lies beyond it, to see inside a cabinet or a room; a slider moves it, a box
 * keeps the other side instead. The view only: the model is not cut and
 * nothing is saved. The Curic group's button opens and closes it.
 */
import type { Axis, DisplayUnit } from "../document/types";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import { AXIS_OPTIONS } from "./curic-common";

/** Lowest and highest coordinate of the displayed bodies along an axis (mm). */
function extent(viewport: Viewport, axis: Axis): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const id of viewport.displayedBodies) {
    const box = viewport.bodyMesh(id)?.metrics.bbox;
    if (!box) continue;
    lo = Math.min(lo, box[0][axis] as number);
    hi = Math.max(hi, box[1][axis] as number);
  }
  return Number.isFinite(lo) ? [lo, hi] : [-500, 500];
}

export function bindSection(root: HTMLElement, viewport: Viewport, host: { unit(): DisplayUnit }): void {
  const button = root.querySelector<HTMLButtonElement>("[data-section]");
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const state = { axis: 0 as Axis, position: 0, flip: false };
  let panel: HTMLElement | null = null;

  const apply = () => viewport.setSection(state);

  const close = () => {
    viewport.setSection(null);
    panel?.remove();
    panel = null;
    button?.setAttribute("aria-pressed", "false");
  };

  const render = () => {
    if (!panel) return;
    const [lo, hi] = extent(viewport, state.axis);
    const slider = el("input", { type: "range", min: String(lo), max: String(hi), step: String(Math.max((hi - lo) / 200, 0.1)), value: String(state.position), class: "w-full accent-orange-500", "aria-label": "Position de la coupe" });
    const value = el("span", { class: "font-mono tabular-nums" }, formatLength(state.position, host.unit()));
    slider.addEventListener("input", () => {
      state.position = Number(slider.value);
      value.textContent = formatLength(state.position, host.unit());
      apply();
    });
    const axis = el("select", { class: "h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Axe de la coupe" }, ...AXIS_OPTIONS.map(([v, t]) => el("option", { value: v, selected: Number(v) === state.axis }, t)));
    axis.addEventListener("change", () => {
      state.axis = Number(axis.value) as Axis;
      const [a, b] = extent(viewport, state.axis);
      state.position = (a + b) / 2;
      apply();
      render();
    });
    const flip = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: state.flip });
    flip.addEventListener("change", () => {
      state.flip = flip.checked;
      apply();
    });
    const shut = el("button", { type: "button", class: "h-8 w-full rounded-md border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Fermer la coupe");
    shut.addEventListener("click", close);
    panel.replaceChildren(
      el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, "Coupe"),
      axis,
      el("div", { class: "flex justify-between gap-2" }, el("span", {}, "Position"), value),
      slider,
      el("label", { class: "flex min-h-8 items-center gap-2" }, flip, "Garder l'autre côté"),
      shut,
    );
  };

  const open = () => {
    const [lo, hi] = extent(viewport, state.axis);
    state.position = (lo + hi) / 2;
    panel = el("div", {
      class: "absolute top-2 left-2 z-30 w-56 space-y-2 rounded-lg border border-orange-300 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-orange-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Coupe",
    });
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    container.append(panel);
    button?.setAttribute("aria-pressed", "true");
    render();
    apply();
  };

  button?.addEventListener("click", () => (panel ? close() : open()));
}
