/**
 * La barre contextuelle, en haut de la vue : selon ce qu'on vient de cliquer, seuls les outils utiles
 * (document/context-tools.ts). Un clic dans une niche propose ses outils, la niche déjà choisie ; une pièce, un caisson,
 * une répartition ou le plan proposent les boutons du ruban qui leur servent, même rangés. Elle s'efface quand un outil
 * travaille, quand on clique dans le vide et à l'annulation.
 */
import { contextTools } from "../document/context-tools";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import { toolIcon } from "../ui/icons";
import type { Viewport } from "../viewport/viewport";
import { openNicheFront } from "./dressing/door-fronts-tool";
import type { Editor } from "./editor";
import { NICHE_ACTIONS, runNiche } from "./dressing/niche-menu";
import { nicheUnderPointer, type PickedNiche } from "./dressing/niche-pick";

const BUTTON = "tool-btn icon-btn";

export function bindContextBar(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const canvas = viewport.renderer.domElement;
  const bar = el("div", {
    role: "toolbar",
    "aria-label": "Outils de la sélection",
    "data-context-bar": "",
    class: "absolute top-2 left-1/2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 border border-gray-200 bg-white/95 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-gray-800 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-100",
  });
  bar.hidden = true;
  bar.addEventListener("pointerdown", (event) => event.stopPropagation());
  container.append(bar);

  let niche: PickedNiche | null = null;
  const free = () => root.dataset.mode === "model" && !viewport.inSketch && !root.dataset.tool;
  const hide = () => {
    niche = null;
    bar.hidden = true;
  };
  const show = (title: string, buttons: HTMLElement[]) => {
    bar.replaceChildren(el("span", { class: "px-1" }, title), ...buttons);
    bar.hidden = buttons.length === 0;
  };
  const button = (label: string, icon: SVGElement | Node, go: () => void) => {
    const made = el("button", { type: "button", class: BUTTON, title: label, "aria-label": label }, icon);
    made.addEventListener("click", () => {
      hide();
      go();
    });
    return made;
  };

  const draw = () => {
    if (!free()) return hide();
    if (niche) {
      const picked = niche;
      const size = (v: number) => formatLength(v, editor.unit);
      return show(`Niche ${size(picked.box.x1 - picked.box.x0)} × ${size(picked.box.y1 - picked.box.y0)}`, [...NICHE_ACTIONS.map(({ action, label, icon }) => button(label, toolIcon(icon, "tool-icon"), () => runNiche(editor, action, picked))), button("Façade de cette case", toolIcon("i-fronts", "tool-icon"), () => openNicheFront(viewport, editor, picked))]);
    }
    const { sketches, sketch, bodies } = editor.picked.selection;
    const chosen = contextTools(editor.doc, sketches.length ? sketches : sketch.slice(0, 1).map((s) => s.sketchId), bodies.length || !editor.picked.bodyId ? bodies : [editor.picked.bodyId]);
    if (!chosen) return void (bar.hidden = true);
    show(chosen.title, chosen.tools.flatMap((selector) => {
      const tool = root.querySelector<HTMLElement>(`[data-ribbon="model"] ${selector}`);
      const icon = tool?.querySelector("svg")?.cloneNode(true);
      return tool && icon ? [button(tool.getAttribute("aria-label") ?? "", icon, () => tool.click())] : [];
    }));
  };
  const later = () => setTimeout(draw, 0);

  let pressed: [number, number] | null = null;
  canvas.addEventListener("pointerdown", (event) => {
    pressed = event.button === 0 ? [event.clientX, event.clientY] : null;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pressed || Math.hypot(event.clientX - pressed[0], event.clientY - pressed[1]) > 5 || !free()) return;
    niche = nicheUnderPointer(viewport, editor.doc, event);
    later();
  });
  const selected = viewport.onSelectionChange;
  viewport.onSelectionChange = (selection) => {
    selected(selection);
    later();
  };
  const rendered = editor.onRender;
  editor.onRender = () => {
    rendered();
    niche = null;
    later();
  };
  new MutationObserver(later).observe(root, { attributes: true, attributeFilter: ["data-tool", "data-mode"] });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
}
