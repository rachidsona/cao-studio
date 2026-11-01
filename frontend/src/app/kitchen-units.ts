/**
 * « Meubles de cuisine » (groupe Menuiserie) : la liste des meubles du commerce — bas à portes, à tiroirs, évier,
 * four, hauts, colonnes — chacun à ses largeurs. Un clic en ajoute un, avec ses façades, à côté du caisson sélectionné
 * (sinon du dernier), construit comme lui (document/kitchen-catalog.ts) ; il arrive sélectionné, prêt à être glissé
 * par sa poignée « ✥ » (app/cabinet-drag.ts). Une annulation par meuble.
 */
import * as THREE from "three";
import { CATALOG, KINDS, addKitchenUnit, type CatalogEntry, type UnitKind } from "../document/kitchen-catalog";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import { cabinetBodies } from "./cabinet-drag";
import { selectedCabinet } from "./drivers-3d";
import type { Editor } from "./editor";
import { floatingPanel } from "./workshop-ui";

const WIDTH = "h-7 min-w-11 border border-gray-300 px-1.5 text-xs hover:border-orange-400 hover:bg-orange-50 dark:border-gray-600 dark:hover:bg-gray-800";

export function bindKitchenUnits(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="kitchen-units"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;

  const add = async (entry: CatalogEntry) => {
    const anchor = selectedCabinet(editor);
    const { doc, cabinet, fronts } = addKitchenUnit(editor.doc, entry, anchor?.id);
    await editor.change(doc);
    // When it stands out of the view: all the model in view, from the same side.
    const box = (ids: readonly string[]) => {
      const b = new THREE.Box3();
      for (const id of ids) {
        const m = viewport.bodyMesh(id)?.metrics.bbox;
        if (m) b.expandByPoint(new THREE.Vector3(...m[0])).expandByPoint(new THREE.Vector3(...m[1]));
      }
      return b;
    };
    const added = box(cabinetBodies(editor.doc, viewport.displayedBodies, cabinet.id));
    if (!added.isEmpty() && !viewport.boxVisible(added, 0.8)) viewport.fitBox(box(viewport.displayedBodies), 1.35);
    viewport.clearSelection();
    for (const id of cabinetBodies(editor.doc, viewport.displayedBodies, cabinet.id)) viewport.toggleInSelection("body", id);
    editor.notify(`${cabinet.name} ajouté${anchor ? ` à côté de ${anchor.name}` : ""}${fronts ? " avec ses façades" : ""} ; tirez ✥ pour le placer.`, "success");
  };

  const render = () => {
    if (!panel) return;
    const anchor = selectedCabinet(editor);
    const names = (kind: UnitKind) => [...new Set(CATALOG.filter((e) => e.kind === kind).map((e) => e.name))];
    const row = (name: string) => {
      const widths = CATALOG.filter((e) => e.name === name).map((e) => {
        const b = el("button", { type: "button", class: WIDTH, title: `Ajouter « ${name} » de ${formatLength(e.width, editor.unit)}`, "data-unit": e.id }, formatLength(e.width, editor.unit).replace(/\s?(mm|cm|m)$/, ""));
        b.addEventListener("click", () => void add(e));
        return b;
      });
      return el("div", { class: "grid gap-0.5" }, el("span", { class: "text-gray-700 dark:text-gray-200" }, name), el("div", { class: "flex flex-wrap gap-1" }, ...widths));
    };
    panel.body.replaceChildren(
      el("p", { class: "text-gray-600 dark:text-gray-300" }, anchor ? `Le meuble choisi se pose à côté de « ${anchor.name} », construit comme lui.` : "Sélectionnez un caisson pour poser le meuble à côté de lui ; sinon il suit le dernier."),
      ...(["base", "wall", "tall"] as const).map((kind) => el("section", { class: "space-y-1.5" }, el("h3", { class: "font-semibold text-gray-500 uppercase" }, KINDS[kind].label), ...names(kind).map(row))),
      el("p", { class: "text-[11px] text-gray-500" }, `Largeurs en ${editor.unit}. Pour déplacer un caisson : sélectionnez-le et tirez sa poignée ✥ (le long du mur ; Maj : librement), ↻ le tourne.`),
    );
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Meubles de cuisine", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
  });
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    render();
  };
}
