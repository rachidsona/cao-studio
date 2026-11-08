/**
 * « Meubles de cuisine » (groupe Cuisine) : le catalogue des meubles du commerce, en quatre familles — bas, hauts,
 * colonnes, et « Mes meubles », ses propres caissons (app/my-units.ts). Chaque modèle montre son dessin de face à
 * l'échelle (app/unit-elevation.ts), ce qu'il contient et ses cotes ; survoler une largeur redessine le meuble à cette
 * largeur, un clic l'ajoute, avec ses façades, à côté du caisson sélectionné (sinon du dernier), construit comme lui
 * (document/kitchen-catalog.ts). Il arrive sélectionné, prêt à être glissé par sa poignée « ✥ » (app/cabinet-drag.ts).
 * Une annulation par meuble.
 */
import * as THREE from "three";
import { CATALOG, KINDS, addKitchenUnit, type CatalogEntry, type UnitKind } from "../document/kitchen-catalog";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import { cabinetBodies } from "./cabinet-drag";
import { selectedCabinet } from "./drivers-3d";
import type { Editor } from "./editor";
import { myUnitsSection } from "./my-units";
import { BRASS, elevation, unitSummary } from "./unit-elevation";
import { floatingPanel } from "./workshop-ui";

type Family = UnitKind | "mine";
const FAMILIES: [Family, string][] = [["base", "Bas"], ["wall", "Hauts"], ["tall", "Colonnes"], ["mine", "Mes meubles"]];
const WIDTH = "h-6 min-w-7 border border-gray-200 px-1 font-mono text-[11px] text-gray-600 transition-colors hover:border-[var(--brass)] hover:text-gray-900 focus-visible:border-[var(--brass)] focus-visible:outline-none dark:border-gray-600 dark:text-gray-300 dark:hover:text-white";

/** The size of a unit in words: « L 80 · H 87 · P 56 cm ». */
function sizes(e: CatalogEntry, unit: Editor["unit"]): string {
  const number = (mm: number) => formatLength(mm, unit).replace(/\s?(mm|cm|m)$/, "");
  const kind = KINDS[e.kind];
  return `L ${number(e.width)} · H ${number(e.height ?? kind.height)} · P ${number(e.depth ?? kind.depth)} ${unit}`;
}

/** One model: its drawing and what it is, at the width under the pointer; a click on a width adds it. */
function modelRow(entries: CatalogEntry[], unit: Editor["unit"], add: (e: CatalogEntry) => void): HTMLElement {
  const usual = entries.find((e) => e.width === 600) ?? entries[Math.floor(entries.length / 2)]!;
  const art = el("div", { class: "flex h-[92px] items-end justify-center border-b border-gray-300 dark:border-gray-600" });
  const summary = el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" });
  const size = el("p", { class: "font-mono text-[10px] text-gray-500 dark:text-gray-400", "data-unit-size": "" });
  const show = (e: CatalogEntry) => {
    art.innerHTML = elevation(e);
    summary.textContent = unitSummary(e);
    size.textContent = sizes(e, unit);
  };
  show(usual);
  const widths = entries.map((e) => {
    const label = formatLength(e.width, unit);
    const b = el("button", { type: "button", class: WIDTH, title: `Ajouter « ${e.name} » de ${label}`, "aria-label": `Ajouter ${e.name} de ${label}`, "data-unit": e.id }, label.replace(/\s?(mm|cm|m)$/, ""));
    b.addEventListener("click", () => add(e));
    for (const event of ["pointerenter", "focus"]) b.addEventListener(event, () => show(e));
    for (const event of ["pointerleave", "blur"]) b.addEventListener(event, () => show(usual));
    return b;
  });
  return el(
    "article",
    { class: "grid grid-cols-[92px_1fr] gap-3 border-t border-gray-200 py-3 first:border-t-0 dark:border-gray-700", "data-model": usual.name },
    art,
    el("div", { class: "flex min-w-0 flex-col" }, el("h3", { class: "text-[13px] font-medium tracking-tight text-gray-900 dark:text-gray-50" }, usual.name), summary, size, el("div", { class: "mt-auto flex flex-wrap gap-1 pt-1.5" }, ...widths)),
  );
}

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

  let family: Family = "base";
  const render = () => {
    if (!panel) return;
    const anchor = selectedCabinet(editor);
    const tabs = el(
      "div",
      { role: "tablist", "aria-label": "Familles de meubles", class: "flex border-b border-gray-200 dark:border-gray-700" },
      ...FAMILIES.map(([key, label]) => {
        const chosen = key === family;
        const tab = el("button", { type: "button", role: "tab", "aria-selected": String(chosen), class: `-mb-px flex-1 border-b-2 px-1 py-2 text-xs whitespace-nowrap transition-colors ${chosen ? "border-[var(--brass)] font-medium text-gray-900 dark:text-gray-50" : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"}` }, label);
        tab.addEventListener("click", () => ((family = key), render()));
        return tab;
      }),
    );
    const content =
      family === "mine"
        ? [myUnitsSection({ doc: () => editor.doc, unit: () => editor.unit, selected: () => selectedCabinet(editor), add: (e) => void add(e), notify: (m, k) => editor.notify(m, k), refresh: render })]
        : [...new Set(CATALOG.filter((e) => e.kind === family).map((e) => e.name))].map((name) => modelRow(CATALOG.filter((e) => e.name === name), editor.unit, (e) => void add(e)));
    panel.body.style.setProperty("--brass", BRASS);
    panel.body.replaceChildren(
      tabs,
      el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, anchor ? `Se pose à côté de « ${anchor.name} », construit comme lui.` : "Choisissez une largeur : le meuble se pose après le dernier."),
      el("div", {}, ...content),
      el("p", { class: "border-t border-gray-200 pt-2 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400" }, "Poignée ✥ : déplacer. Maj : librement. ↻ : tourner."),
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
    // Not while a field of the panel is being typed in.
    const typing = document.activeElement?.matches("input, select, textarea");
    if (!(typing && panel?.body.contains(document.activeElement))) render();
  };
}
