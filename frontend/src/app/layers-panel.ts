/**
 * Panneau « Calques » (comme les étiquettes de SketchUp) : créer un calque, le renommer, le montrer ou le cacher
 * (l'œil), y mettre les corps sélectionnés, le supprimer (ses corps reviennent sans calque).
 */
import { addLayer, assignLayer, bodiesOnLayer, layersOf, removeLayer, renameLayer, setLayerVisible } from "../document/layers";
import { bodyInfo } from "../document/materials";
import { el } from "../ui/dom";
import { eyeIcon } from "../ui/icons";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { floatingPanel } from "./workshop-ui";

const SMALL = "h-7 shrink-0 border border-gray-300 px-1.5 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const INPUT = "h-7 min-w-0 flex-1 border border-gray-300 bg-white px-1.5 text-xs dark:border-gray-600 dark:bg-gray-900";

export function bindLayers(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="layers"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;

  /** Bodies chosen whole, or carrying the chosen faces. */
  const picked = (): string[] => {
    const { bodies, faces } = editor.picked.selection;
    return [...new Set([...bodies, ...faces.map((f) => f.bodyId)])];
  };
  /** Every body of the model, shown or not (the hidden layers' bodies too). */
  const allBodies = (): string[] => (editor.result?.bodies ?? []).map((b) => b.bodyId);

  const render = (): void => {
    if (!panel) return;
    const doc = editor.doc;
    const chosen = picked();
    const bodies = allBodies();
    const rows = layersOf(doc).map((layer) => {
      const eye = el("button", { type: "button", class: `size-7 shrink-0 ${layer.visible ? "text-sky-700 dark:text-sky-300" : "text-gray-400"}`, title: layer.visible ? "Cacher le calque" : "Montrer le calque", "aria-pressed": String(layer.visible) }, eyeIcon(layer.visible));
      eye.addEventListener("click", () => void editor.change(setLayerVisible(editor.doc, layer.id, !layer.visible)));
      const name = el("input", { type: "text", class: INPUT, value: layer.name, "aria-label": `Nom du calque ${layer.name}` });
      name.addEventListener("change", () => void editor.change(renameLayer(editor.doc, layer.id, name.value)));
      const count = bodiesOnLayer(doc, bodies, layer.id).length;
      const put = el("button", { type: "button", class: SMALL, title: "Mettre les corps sélectionnés sur ce calque", disabled: !chosen.length }, "＋");
      put.addEventListener("click", () => void editor.change(assignLayer(editor.doc, picked(), layer.id)));
      const remove = el("button", { type: "button", class: SMALL, title: "Supprimer le calque (ses corps reviennent sans calque)", "aria-label": `Supprimer ${layer.name}` }, "✕");
      remove.addEventListener("click", () => void editor.change(removeLayer(editor.doc, layer.id)));
      return el("div", { class: "flex items-center gap-1" }, eye, name, el("span", { class: "w-6 text-right text-gray-500", title: "Corps sur ce calque" }, String(count)), put, remove);
    });
    const none = bodies.filter((b) => !bodyInfo(doc, b).layer).length;
    const release = el("button", { type: "button", class: `${SMALL} w-full`, disabled: !chosen.length }, "Retirer la sélection de son calque");
    release.addEventListener("click", () => void editor.change(assignLayer(editor.doc, picked(), undefined)));
    const create = el("button", { type: "button", class: "h-8 w-full btn-accent font-medium" }, chosen.length ? `Nouveau calque avec la sélection (${chosen.length})` : "Nouveau calque");
    create.addEventListener("click", () => {
      const added = addLayer(editor.doc, "Calque");
      void editor.change(chosen.length ? assignLayer(added.doc, picked(), added.id) : added.doc);
    });
    panel.body.replaceChildren(
      ...(rows.length ? rows : [el("p", { class: "text-gray-500" }, "Aucun calque. Rangez les corps par familles : caisson, façades, quincaillerie…")]),
      el("p", { class: "text-[11px] text-gray-500" }, `Sans calque : ${none} corps. Sélection : ${chosen.length} corps.`),
      release,
      create,
    );
  };

  const toggle = (): void => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Calques", () => {
      panel = null;
      button?.setAttribute("aria-pressed", "false");
    });
    button?.setAttribute("aria-pressed", "true");
    render();
  };
  button?.addEventListener("click", toggle);
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    render();
  };
}
