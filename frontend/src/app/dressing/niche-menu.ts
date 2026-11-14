/**
 * Le menu d'une niche : un clic droit sur une niche, sans outil en cours, propose ce qu'on peut y faire (sur une porte :
 * le menu de la porte, app/door-menu.ts ; sur un caisson de cuisine : l'isoler et l'aménager, app/cabinet-furnish.ts). Sur l'aperçu d'un linéaire de cuisine pas encore gardé, il propose de le
 * garder (OK) ou de l'annuler : ses pièces ne sont pas encore dans le projet. L'outil choisi
 * s'ouvre sur cette niche, déjà choisie. Répéter (touche R) relance le dernier outil du ruban avec ses réglages, sur la
 * niche sous le pointeur quand c'est un outil de niche.
 */
import { isolateMenuItem } from "../isolate-selection";
import { keyOf } from "../../ui/ribbon-layout";
import { openNicheFront } from "./door-fronts-tool";
import { openDoorMenu } from "../door-menu";
import { cabinetOfBody } from "../../document/cabinet-furnish";
import { findFeature } from "../../document/operations";
import { furnishCabinet, keepCaisson, openInCabinet, putCaisson, STRAIGHT_TOOLS } from "../cabinet-furnish";
import { myUnits } from "../kitchen/my-units";
import { isolatedSketch, isolateSketch } from "../zone-view";
import { shownDoc } from "../kitchen/kitchen-run-preview";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { Joinery3D } from "../joinery-3d";
import { openNicheCopy } from "./niche-copy-tool";
import { nicheUnderPointer, type PickedNiche } from "./niche-pick";

type NicheAction = "shelves" | "cloisons" | "niche" | "rod" | "drawers" | "door" | "module" | "accessory";

/** What can be done in a niche, with the icon of the tool. */
export const NICHE_ACTIONS: { action: NicheAction; label: string; icon: string }[] = [
  { action: "shelves", label: "Étagères", icon: "i-shelves" },
  { action: "cloisons", label: "Cloisons", icon: "i-cloisons" },
  { action: "niche", label: "Hauteur de la niche", icon: "i-niche" },
  { action: "rod", label: "Penderie", icon: "i-rod" },
  { action: "drawers", label: "Tiroirs", icon: "i-drawers" },
  { action: "door", label: "Porte sur niches", icon: "i-door-fronts" },
  { action: "module", label: "Module", icon: "i-module" },
  { action: "accessory", label: "Accessoire intérieur", icon: "i-accessory" },
];
const BUTTON_ACTION: Record<string, NicheAction> = { "data-action:shelves": "shelves", "data-action:cloisons": "cloisons", "data-action:niche": "niche", "data-action:penderie": "rod", "data-action:tiroirs": "drawers", "data-action:module": "module", "data-action:accessory": "accessory" };

/** The tool opened on this niche, already chosen. */
export function runNiche(editor: Editor, action: NicheAction, niche: PickedNiche): void {
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
    const face = viewport.pickFace(event as PointerEvent);
    // The kitchen shown is a preview of a run, not kept yet: keep it, or not.
    if (face && shownDoc(editor) !== editor.doc) {
      const press = (selector: string) => document.querySelector<HTMLElement>(selector)?.click();
      menu = popup(event, "Menu de l'aperçu", "Linéaire en train d'être enregistré : un instant, puis réglez ses meubles.", [
        ["Fermer le linéaire (il est enregistré)", () => document.querySelector("[data-run-strip]")?.parentElement?.querySelector<HTMLElement>("[data-panel-close]")?.click()],
      ]);
      return;
    }
    // A door (or its handle) under the pointer: its own menu.
    if (face && openDoorMenu(event, viewport, editor, face.bodyId)) return;
    const niche = nicheUnderPointer(viewport, editor.doc, event);
    // A kitchen cabinet: made a caisson of the dressing, alone in the view, to furnish.
    const cabinet = !niche && face ? cabinetOfBody(editor.doc, face.bodyId) : null;
    // The elements selected: alone in the view, to work on them (app/isolate-selection.ts).
    const alone = isolateMenuItem(editor);
    if (cabinet && face) {
      // Straight to a tool: the cabinet isolated and furnished, the tool opened on the niche clicked.
      const at = face.point.toArray() as [number, number, number];
      menu = popup(event, "Menu du caisson", cabinet.name, [
        ["Isoler et aménager ce caisson", () => void furnishCabinet(editor, cabinet.id)],
        ...STRAIGHT_TOOLS.map(([tool, label]): [string, () => void] => [label, () => void openInCabinet(editor, cabinet.id, at, tool)]),
        ...(alone ? [alone] : []),
      ]);
      return;
    }
    if (!niche) {
      if (alone) menu = popup(event, "Menu de la sélection", null, [alone]);
      return;
    }
    const sketchName = findFeature(editor.doc, niche.sketch)?.name ?? "Caisson";
    const items: [string, () => void][] = [
      ...NICHE_ACTIONS.map(({ action, label }): [string, () => void] => [label, () => runNiche(editor, action, niche)]),
      ["Façade de cette case", () => openNicheFront(viewport, editor, niche)],
      ["Copier cette niche", () => openNicheCopy(viewport, editor, "all", niche)],
      ["Aligner sur cette niche", () => openNicheCopy(viewport, editor, "heights", niche)],
      ...(isolatedSketch() === niche.sketch ? [] : [[`Isoler « ${sketchName} »`, () => isolateSketch(niche.sketch, sketchName)] as [string, () => void]]),
      ...(alone ? [alone] : []),
      ["Garder ce caisson dans Mes caissons…", () => keepCaisson(event, editor, niche, sketchName)],
      ...(myUnits().some((e) => e.caisson) ? [["Poser un de Mes caissons ici…", () => (menu = popup(event, "Mes caissons", "Son intérieur et ses portes vont dans cette case et les suivantes.", myUnits().filter((e) => e.caisson).map((e): [string, () => void] => [e.name, () => putCaisson(editor, niche, e)])))] as [string, () => void]] : []),
    ];
    menu = popup(event, "Menu de la niche", null, items);
  });
  /** A menu at the pointer: its items, a line above them if any. */
  const popup = (event: MouseEvent, name: string, note: string | null, items: [string, () => void][]): HTMLElement => {
    const box = el("div", { class: "fixed z-50 min-w-44 max-w-72 border border-gray-200 bg-white py-1 text-sm text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100", role: "menu", "aria-label": name, style: `left:${event.clientX}px;top:${event.clientY}px` }, note ? el("p", { class: "px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400" }, note) : null, ...items.map(([label, go]) => {
      const item = el("button", { type: "button", role: "menuitem", class: "block w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800" }, label);
      item.addEventListener("click", () => {
        closeMenu();
        go();
      });
      return item;
    }));
    document.body.append(box);
    // Whole in the window: moved up or left when it would go past its edge.
    const { width, height } = box.getBoundingClientRect();
    box.style.left = `${Math.max(4, Math.min(event.clientX, innerWidth - width - 4))}px`;
    box.style.top = `${Math.max(4, Math.min(event.clientY, innerHeight - height - 4))}px`;
    return box;
  };
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  // A tool clicked in a niche of another wall than its own.
  document.addEventListener("cad:niche-elsewhere", (event) => {
    const { action, niche } = (event as CustomEvent<{ action: NicheAction; niche: PickedNiche }>).detail;
    runNiche(editor, action, niche);
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
    if (action && niche) runNiche(editor, action, niche);
    else last.click();
  });
}
