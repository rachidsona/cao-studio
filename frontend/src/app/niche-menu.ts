/**
 * Le menu d'une niche : un clic droit sur une niche, sans outil en cours, propose ce qu'on peut y faire. L'outil choisi
 * s'ouvre sur cette niche, déjà choisie. Répéter (touche R) relance le dernier outil du ruban avec ses réglages, sur la
 * niche sous le pointeur quand c'est un outil de niche.
 */
import { keyOf } from "../ui/ribbon-layout";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { Joinery3D } from "./joinery-3d";
import { openNicheCopy } from "./niche-copy-tool";
import { nicheUnderPointer, type PickedNiche } from "./niche-pick";

type NicheAction = "shelves" | "cloisons" | "niche" | "rod" | "drawers" | "module";

const ACTIONS: [NicheAction, string][] = [["shelves", "Étagères"], ["cloisons", "Cloisons"], ["niche", "Hauteur de la niche"], ["rod", "Penderie"], ["drawers", "Tiroirs"], ["module", "Module"]];
const BUTTON_ACTION: Record<string, NicheAction> = { "data-action:shelves": "shelves", "data-action:cloisons": "cloisons", "data-action:niche": "niche", "data-action:penderie": "rod", "data-action:tiroirs": "drawers", "data-action:module": "module" };

function run(editor: Editor, action: NicheAction, niche: PickedNiche): void {
  Joinery3D.pick = niche.middle;
  if (action === "shelves" || action === "cloisons") editor.sketches.startJoinery(action, niche.sketch);
  else editor.sketches.startEquip(action, niche.sketch);
}

export function bindNicheMenu(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const canvas = viewport.renderer.domElement;
  const free = () => root.dataset.mode === "model" && !viewport.inSketch;
  let menu: HTMLElement | null = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };
  let pressed: [number, number] | null = null;
  canvas.addEventListener("pointerdown", (event) => {
    closeMenu();
    if (event.button === 2) pressed = [event.clientX, event.clientY];
  });
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!free() || !pressed || Math.hypot(event.clientX - pressed[0], event.clientY - pressed[1]) > 5) return;
    const niche = nicheUnderPointer(viewport, editor.doc, event);
    if (!niche) return;
    const items: [string, () => void][] = [
      ...ACTIONS.map(([action, label]): [string, () => void] => [label, () => run(editor, action, niche)]),
      ["Copier cette niche", () => openNicheCopy(viewport, editor, "all", niche)],
      ["Aligner sur cette niche", () => openNicheCopy(viewport, editor, "heights", niche)],
    ];
    menu = el("div", { class: "fixed z-50 min-w-44 border border-gray-200 bg-white py-1 text-sm text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100", role: "menu", "aria-label": "Menu de la niche", style: `left:${event.clientX}px;top:${event.clientY}px` }, ...items.map(([label, go]) => {
      const item = el("button", { type: "button", role: "menuitem", class: "block w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800" }, label);
      item.addEventListener("click", () => {
        closeMenu();
        go();
      });
      return item;
    }));
    document.body.append(menu);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  // A tool clicked in a niche of another wall than its own.
  document.addEventListener("cad:niche-elsewhere", (event) => {
    const { action, niche } = (event as CustomEvent<{ action: NicheAction; niche: PickedNiche }>).detail;
    run(editor, action, niche);
  });

  // ---- Répéter --------------------------------------------------------------------------
  let last: HTMLElement | null = null;
  let pointer: PointerEvent | null = null;
  canvas.addEventListener("pointermove", (event) => (pointer = event));
  root.querySelector('[data-ribbon="model"]')?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (button && keyOf(button)) last = button;
  });
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "r" || event.metaKey || event.ctrlKey || event.altKey || !last || !free()) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    const action = BUTTON_ACTION[keyOf(last) ?? ""];
    const niche = action && pointer ? nicheUnderPointer(viewport, editor.doc, pointer) : null;
    if (action && niche) run(editor, action, niche);
    else last.click();
  });
}
