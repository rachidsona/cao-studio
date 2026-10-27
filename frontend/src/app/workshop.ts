/**
 * "Atelier" ribbon group: what each board is made of (material, grain, edge
 * bands), the cut list and the sheet layout. Buttons carry `data-workshop`
 * ("material", "cutlist", "nesting"); the first is a docked panel acting on
 * the selected bodies, the others open a large window with CSV / print.
 */
import { cutList, cutListCsv, edgeText, grainText, type CutRow, type PartInput } from "../document/cut-list";
import { EDGE_BANDS, MATERIALS, bodyInfo, materialById, setBodyInfo } from "../document/materials";
import { layoutSheets, type Sheet } from "../document/nesting";
import type { BodyInfo } from "../document/types";
import { el } from "../ui/dom";
import type { BodyAppearance, Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { downloadText, escapeHtml, floatingPanel, openModal, printHtml } from "./workshop-ui";

type Edges = NonNullable<BodyInfo["edges"]>;
const SELECT = "h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const EDGE_NAMES: [keyof Edges, string][] = [["length1", "L1"], ["length2", "L2"], ["width1", "l1"], ["width2", "l2"]];

/** Every displayed body as a part of the cut list. */
export function partsOf(viewport: Viewport): PartInput[] {
  const parts: PartInput[] = [];
  for (const id of viewport.displayedBodies) {
    const metrics = viewport.bodyMesh(id)?.metrics;
    if (metrics) parts.push({ id, bbox: metrics.bbox, volume: metrics.volume });
  }
  return parts;
}

const tableHtml = (rows: CutRow[], unit: string) =>
  `<table><thead><tr>${["Pièce", "Qté", "L", "l", "Ép.", "Matière", "Fil", "Chants", "Coupe L", "Coupe l"].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.names.join(", "))}${r.approximate ? " (≈)" : ""}</td><td>${r.quantity}</td><td>${r.length}</td><td>${r.width}</td><td>${r.thickness}</td><td>${escapeHtml(r.material)}</td><td>${grainText(r.grain)}</td><td>${edgeText(r.edges)}${r.band ? ` (${r.band})` : ""}</td><td>${r.cutLength}</td><td>${r.cutWidth}</td></tr>`,
    )
    .join("")}</tbody></table><p>Dimensions en mm${unit ? ` (affichage : ${unit})` : ""}. L = longueur, l = largeur ; chants L1/L2 sur les grands côtés, l1/l2 sur les petits.</p>`;

function totalsHtml(totals: ReturnType<typeof cutList>["totals"]): string {
  return `<ul>${totals.map((t) => `<li>${escapeHtml(t.material)} ${t.thickness} mm : ${t.parts} pièces, ${t.area.toFixed(2)} m², chant ${t.bandLength.toFixed(1)} m</li>`).join("")}</ul>`;
}

function sheetSvg(sheet: Sheet, index: number): string {
  const [W, H] = sheet.size;
  const rects = sheet.placements
    .map((p) => {
      const label = `${Math.round(p.w)}×${Math.round(p.h)}`;
      const size = Math.max(14, Math.min(p.w, p.h) / 6);
      return `<g><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#fde68a" stroke="#92400e" stroke-width="2"/><text x="${p.x + p.w / 2}" y="${p.y + p.h / 2}" font-size="${size}" text-anchor="middle" dominant-baseline="middle" fill="#111">${label}</text></g>`;
    })
    .join("");
  return `<div class="sheet"><h3>Panneau ${index + 1} — ${escapeHtml(sheet.material)} ${sheet.thickness} mm (${W}×${H}), chutes ${Math.round((1 - sheet.usage) * 100)} %</h3><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#fff" stroke="#111" stroke-width="4"/>${rects}</svg></div>`;
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

  /** The look of a body: its material's colour, with a wood grain along the length (or the width) of the board. */
  const appearance = (id: string): BodyAppearance | null => {
    const info = bodyInfo(editor.doc, id);
    const material = materialById(info.material);
    if (!material) return null;
    const box = viewport.bodyMesh(id)?.metrics.bbox;
    const grain = info.grain ?? "length";
    if (material.look !== "wood" || grain === "none" || !box) return { color: material.color };
    const order = [0, 1, 2].sort((a, b) => (box[1][b] as number) - (box[0][b] as number) - ((box[1][a] as number) - (box[0][a] as number)));
    return { color: material.color, wood: true, grainAxis: order[grain === "length" ? 0 : 1] as 0 | 1 | 2 };
  };
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
    const { rows, totals } = cutList(editor.doc, partsOf(viewport));
    if (!rows.length) return editor.notify("Aucun corps à lister.", "info");
    const holder = el("div", { class: "text-xs" });
    holder.innerHTML = tableHtml(rows, editor.unit) + totalsHtml(totals);
    const close = openModal("Liste de débit", holder, [
      { label: "Exporter en CSV", run: () => downloadText("liste-de-debit.csv", `﻿${cutListCsv(rows)}`, "text/csv") },
      { label: "Imprimer / PDF", run: () => printHtml("Liste de débit", `<h1>Liste de débit</h1>${tableHtml(rows, editor.unit)}${totalsHtml(totals)}`) },
      { label: "Fermer", run: () => close() },
    ]);
  };

  const showNesting = () => {
    const { rows } = cutList(editor.doc, partsOf(viewport));
    if (!rows.length) return editor.notify("Aucun corps à découper.", "info");
    const { sheets, tooBig } = layoutSheets(rows);
    const html = sheets.map(sheetSvg).join("") + (tooBig.length ? `<p>Trop grandes pour leur panneau : ${escapeHtml(tooBig.join(", "))}.</p>` : "");
    const holder = el("div", { class: "text-xs" });
    holder.innerHTML = html || "<p>Rien à placer.</p>";
    const close = openModal(`Optimisation de découpe — ${sheets.length} panneau${sheets.length > 1 ? "x" : ""}`, holder, [
      { label: "Exporter en SVG", run: () => downloadText("decoupe.svg", sheets.length ? sheetSvg(sheets[0]!, 0).replace(/^.*?(<svg)/s, "$1").replace(/<\/div>$/, "") : "", "image/svg+xml") },
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
