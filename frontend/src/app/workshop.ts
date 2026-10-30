/**
 * "Atelier" ribbon group: what each board is made of (material, grain, edge
 * bands), the cut list and the sheet layout. Buttons carry `data-workshop`
 * ("material", "cutlist", "nesting"); the first is a docked panel acting on
 * the selected bodies, the others open a large window with CSV / print.
 */
import { cutList, cutListCsv, edgeText, grainText, type CutRow, type PartInput } from "../document/cut-list";
import { bodyAppearance } from "../appearance/assign";
import { EDGE_BANDS, MATERIALS, bodyInfo, setBodyInfo } from "../document/materials";
import { layoutSheets, type Sheet } from "../document/nesting";
import { isHardwareBody } from "../document/hardware";
import type { BodyInfo, CadDocument, DisplayUnit } from "../document/types";
import { formatLength, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import type { BodyAppearance, Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { downloadText, escapeHtml, floatingPanel, openModal, printHtml } from "./workshop-ui";

type Edges = NonNullable<BodyInfo["edges"]>;
const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const EDGE_NAMES: [keyof Edges, string][] = [["length1", "L1"], ["length2", "L2"], ["width1", "l1"], ["width2", "l2"]];

/** Every displayed body as a part of the cut list. */
/** The displayed bodies that are parts of the furniture (not walls of the room). */
export function partsOf(viewport: Viewport, doc: CadDocument): PartInput[] {
  const parts: PartInput[] = [];
  for (const id of viewport.displayedBodies) {
    if (bodyInfo(doc, id).room || isHardwareBody(doc, id)) continue;
    const metrics = viewport.bodyMesh(id)?.metrics;
    if (metrics) parts.push({ id, bbox: metrics.bbox, volume: metrics.volume });
  }
  return parts;
}

/** A length in the user's unit, without the unit (the table's header carries it). */
const num = (mm: number, unit: DisplayUnit) => trim(toDisplay(mm, unit), unit === "mm" ? 1 : 2);

const tableHtml = (rows: CutRow[], unit: DisplayUnit) =>
  `<table><thead><tr>${["Pièce", "Qté", "L", "l", "Ép.", "Matière", "Fil", "Chants", "Coupe L", "Coupe l"].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.names.join(", "))}${r.approximate ? " (≈)" : ""}</td><td>${r.quantity}</td><td>${num(r.length, unit)}</td><td>${num(r.width, unit)}</td><td>${num(r.thickness, unit)}</td><td>${escapeHtml(r.material)}</td><td>${grainText(r.grain)}</td><td>${edgeText(r.edges)}${r.band ? ` (${r.band} mm)` : ""}</td><td>${num(r.cutLength, unit)}</td><td>${num(r.cutWidth, unit)}</td></tr>`,
    )
    .join("")}</tbody></table><p>Dimensions en ${UNIT_LABELS[unit]}. L = longueur, l = largeur ; chants L1/L2 sur les grands côtés, l1/l2 sur les petits.</p>`;

function totalsHtml(totals: ReturnType<typeof cutList>["totals"], unit: DisplayUnit): string {
  return `<ul>${totals.map((t) => `<li>${escapeHtml(t.material)} ${formatLength(t.thickness, unit)} : ${t.parts} pièces, ${t.area.toFixed(2)} m², chant ${t.bandLength.toFixed(1)} m</li>`).join("")}</ul>`;
}

function sheetSvg(sheet: Sheet, index: number, unit: DisplayUnit): string {
  const [W, H] = sheet.size;
  const rects = sheet.placements
    .map((p) => {
      const label = `${num(p.w, unit)}×${num(p.h, unit)}`;
      const size = Math.max(14, Math.min(p.w, p.h) / 6);
      return `<g><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#fde68a" stroke="#92400e" stroke-width="2"/><text x="${p.x + p.w / 2}" y="${p.y + p.h / 2}" font-size="${size}" text-anchor="middle" dominant-baseline="middle" fill="#111">${label}</text></g>`;
    })
    .join("");
  return `<div class="sheet"><h3>Panneau ${index + 1} — ${escapeHtml(sheet.material)} ${formatLength(sheet.thickness, unit)} (${num(W, unit)}×${num(H, unit)} ${UNIT_LABELS[unit]}), chutes ${Math.round((1 - sheet.usage) * 100)} %</h3><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#fff" stroke="#111" stroke-width="4"/>${rects}</svg></div>`;
}

const RENDER_KEY = "cao.render-materials";

export function bindWorkshop(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let rendering = true;
  try {
    rendering = localStorage.getItem(RENDER_KEY) !== "off";
  } catch {
    // No storage (private window): the view shows the materials.
  }

  /** The look of a body: its appearance (library) or its material's, the grain along the board's length or width. */
  const appearance = (id: string): BodyAppearance | null => bodyAppearance(editor.doc, id, viewport.bodyMesh(id)?.metrics.bbox);
  const showMaterials = () => {
    viewport.setAppearance(rendering ? appearance : null);
    root.querySelector('[data-workshop="render"]')?.setAttribute("aria-pressed", String(rendering));
  };
  root.querySelector('[data-workshop="render"]')?.addEventListener("click", () => {
    rendering = !rendering;
    try {
      localStorage.setItem(RENDER_KEY, rendering ? "on" : "off");
    } catch {
      // Not remembered: only this session.
    }
    showMaterials();
  });
  showMaterials();
  const button = (name: string) => root.querySelector<HTMLButtonElement>(`[data-workshop="${name}"]`);
  let panel: { body: HTMLElement; close: () => void } | null = null;

  const closeMaterial = () => {
    panel?.close();
  };

  const renderMaterial = () => {
    if (!panel) return;
    // The bodies chosen whole, or those carrying the chosen faces.
    const { bodies, faces } = editor.picked.selection;
    const ids = [...new Set([...bodies, ...faces.map((f) => f.bodyId)])];
    panel.body.replaceChildren();
    if (!ids.length) {
      panel.body.append(el("p", { class: "text-gray-500" }, "Sélectionnez un ou plusieurs corps (ou une face), avec Sélection++, Maj + clic ou fenêtre."));
      return;
    }
    const first = bodyInfo(editor.doc, ids[0]!);
    const apply = (patch: Partial<BodyInfo>) => void editor.change(setBodyInfo(editor.doc, ids, patch));
    const material = el("select", { class: SELECT, "aria-label": "Matière" }, el("option", { value: "" }, "Non défini"), ...MATERIALS.map((m) => el("option", { value: m.id, selected: m.id === first.material }, m.name)));
    material.addEventListener("change", () => apply({ material: material.value || undefined }));
    const grain = el("select", { class: SELECT, "aria-label": "Sens du fil" }, ...([["length", "Fil en longueur"], ["width", "Fil en largeur"], ["none", "Sans fil"]] as const).map(([v, t]) => el("option", { value: v, selected: (first.grain ?? "length") === v }, t)));
    grain.addEventListener("change", () => apply({ grain: grain.value as NonNullable<BodyInfo["grain"]> }));
    const band = el("select", { class: SELECT, "aria-label": "Épaisseur du chant" }, ...EDGE_BANDS.map((b) => el("option", { value: String(b), selected: (first.band ?? 1) === b }, `Chant ${b} mm`)));
    band.addEventListener("change", () => apply({ band: Number(band.value) }));
    const edges = { ...({ length1: false, length2: false, width1: false, width2: false } as Edges), ...first.edges };
    const checks = EDGE_NAMES.map(([key, name]) => {
      const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: edges[key] });
      box.addEventListener("change", () => apply({ edges: { ...edges, [key]: box.checked } }));
      return el("label", { class: "flex items-center gap-1" }, box, name);
    });
    panel.body.append(
      el("p", { class: "text-gray-500" }, ids.length === 1 ? "1 corps" : `${ids.length} corps`),
      material,
      grain,
      el("div", { class: "grid grid-cols-4 gap-1" }, ...checks),
      band,
      el("p", { class: "text-[11px] text-gray-500" }, "L1/L2 : les deux grands côtés ; l1/l2 : les deux petits."),
    );
  };

  const toggleMaterial = () => {
    if (panel) return closeMaterial();
    panel = floatingPanel(container, "Matière et chants", () => {
      panel = null;
      button("material")?.setAttribute("aria-pressed", "false");
    });
    button("material")?.setAttribute("aria-pressed", "true");
    renderMaterial();
  };

  const showCutList = () => {
    const { rows, totals } = cutList(editor.doc, partsOf(viewport, editor.doc));
    if (!rows.length) return editor.notify("Aucun corps à lister.", "info");
    const holder = el("div", { class: "text-xs" });
    holder.innerHTML = tableHtml(rows, editor.unit) + totalsHtml(totals, editor.unit);
    const close = openModal("Liste de débit", holder, [
      { label: "Exporter en CSV", run: () => downloadText("liste-de-debit.csv", `﻿${cutListCsv(rows, editor.unit)}`, "text/csv") },
      { label: "Imprimer / PDF", run: () => printHtml("Liste de débit", `<h1>Liste de débit</h1>${tableHtml(rows, editor.unit)}${totalsHtml(totals, editor.unit)}`) },
      { label: "Fermer", run: () => close() },
    ]);
  };

  const showNesting = () => {
    const { rows } = cutList(editor.doc, partsOf(viewport, editor.doc));
    if (!rows.length) return editor.notify("Aucun corps à découper.", "info");
    const { sheets, tooBig } = layoutSheets(rows);
    const html = sheets.map((sheet, i) => sheetSvg(sheet, i, editor.unit)).join("") + (tooBig.length ? `<p>Trop grandes pour leur panneau : ${escapeHtml(tooBig.join(", "))}.</p>` : "");
    const holder = el("div", { class: "text-xs" });
    holder.innerHTML = html || "<p>Rien à placer.</p>";
    const close = openModal(`Optimisation de découpe — ${sheets.length} panneau${sheets.length > 1 ? "x" : ""}`, holder, [
      { label: "Exporter en SVG", run: () => downloadText("decoupe.svg", sheets.length ? sheetSvg(sheets[0]!, 0, editor.unit).replace(/^.*?(<svg)/s, "$1").replace(/<\/div>$/, "") : "", "image/svg+xml") },
      { label: "Imprimer / PDF", run: () => printHtml("Optimisation de découpe", `<h1>Optimisation de découpe</h1>${html}`) },
      { label: "Fermer", run: () => close() },
    ]);
  };

  button("material")?.addEventListener("click", toggleMaterial);
  button("cutlist")?.addEventListener("click", showCutList);
  button("nesting")?.addEventListener("click", showNesting);

  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    renderMaterial();
    if (rendering) viewport.setAppearance(appearance);
  };
}
