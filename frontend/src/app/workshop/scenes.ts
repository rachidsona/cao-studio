/**
 * "Scènes" (as SketchUp's): named camera positions saved in the document.
 * A panel lists them: a click flies the camera there, "Remplacer" stores the
 * current view over it, ✕ deletes it; a field and a button add the current
 * view under a name. Opening a scene never changes the model.
 */
import type { SavedView } from "../../document/types";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { floatingPanel } from "./workshop-ui";

const INPUT = "h-8 min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

const lerp = (a: number[], b: number[], t: number) => a.map((x, i) => x + ((b[i] as number) - x) * t) as [number, number, number];

/** Moves the camera to a saved view in a short glide (an instant jump when the user prefers less motion). */
export function flyTo(viewport: Viewport, view: SavedView, milliseconds = 450): void {
  const from = viewport.cameraState();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || milliseconds <= 0) return viewport.setCameraState(view);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / milliseconds);
    const eased = t * t * (3 - 2 * t);
    viewport.setCameraState({ position: lerp(from.position, view.position, eased), target: lerp(from.target, view.target, eased), up: lerp(from.up, view.up, eased) });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** A name for a new scene that no other scene has. */
export function freshSceneName(views: SavedView[]): string {
  for (let n = views.length + 1; ; n++) if (!views.some((v) => v.name === `Scène ${n}`)) return `Scène ${n}`;
}

export function bindScenes(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="scenes"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;

  const save = (views: SavedView[]) => void editor.change({ ...editor.doc, views });

  const render = (): void => {
    if (!panel) return;
    const views = editor.doc.views ?? [];
    const rows = views.map((view, index) => {
      const go = el("button", { type: "button", class: `${BUTTON} w-full truncate text-left`, title: "Aller à cette vue" }, view.name);
      go.addEventListener("click", () => flyTo(viewport, view));
      const replace = el("button", { type: "button", class: BUTTON, title: "Remplacer par la vue actuelle", "aria-label": `Remplacer ${view.name}` }, "⟳");
      replace.addEventListener("click", () => save(views.map((v, i) => (i === index ? { ...v, ...viewport.cameraState() } : v))));
      const remove = el("button", { type: "button", class: `${BUTTON} w-8`, "aria-label": `Supprimer ${view.name}` }, "✕");
      remove.addEventListener("click", () => save(views.filter((_, i) => i !== index)));
      return el("div", { class: "grid grid-cols-[1fr_auto_auto] gap-1" }, go, replace, remove);
    });
    const name = el("input", { type: "text", class: `${INPUT} w-full`, placeholder: freshSceneName(views), "aria-label": "Nom de la scène" });
    name.addEventListener("keydown", (event) => event.stopPropagation());
    const add = el("button", { type: "button", class: BUTTON }, "Enregistrer la vue");
    add.addEventListener("click", () => {
      const given = name.value.trim() || freshSceneName(views);
      if (views.some((v) => v.name === given)) return editor.notify(`Une scène s'appelle déjà « ${given} ».`, "error");
      save([...views, { name: given, ...viewport.cameraState() }]);
    });
    panel.body.replaceChildren(
      ...(rows.length ? rows : [el("p", { class: "text-gray-500" }, "Aucune scène. Placez la vue comme vous voulez, nommez-la, enregistrez.")]),
      el("div", { class: "grid grid-cols-[1fr_auto] gap-1 border-t border-gray-200 pt-2 dark:border-gray-700" }, name, add),
    );
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Scènes", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    });
    button.setAttribute("aria-pressed", "true");
    render();
  });
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    render();
  };
}
