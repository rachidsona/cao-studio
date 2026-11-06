/**
 * "Atelier" ribbon group: what each board is made of (material, grain, edge
 * bands) and the cut list. Buttons carry `data-workshop` ("material",
 * "cutlist"); the first is a docked panel acting on the selected bodies, the
 * other opens a large window with CSV / print. The sheet layout is in
 * production.ts.
 */
import * as THREE from "three";
import { barLength } from "../document/bars";
import { cutList, cutListCsv, edgeText, grainText, type CutRow, type PartInput } from "../document/cut-list";
import { bodyAppearance, faceAppearances } from "../appearance/assign";
import { EDGE_BANDS, MATERIALS, bodyInfo, setBodyInfo } from "../document/materials";
import { isHardwareBody } from "../document/hardware";
import { importParts as placeParts, parsePartsCsv } from "../document/parts-import";
import type { BodyInfo, CadDocument, DisplayUnit } from "../document/types";
import { formatLength, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import type { FaceAppearance } from "../viewport/body-layer";
import type { BodyAppearance, Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { downloadText, escapeHtml, floatingPanel, openModal, printHtml, type PrintPage } from "./workshop-ui";

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

const fr = (v: number, digits: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const HEAD = ["Repère", "Pièce", "Qté", "L", "l", "Ép.", "Fil", "Chants", "Coupe L", "Coupe l", "Débit brut"];

const rowHtml = (r: CutRow, i: number, unit: DisplayUnit) =>
  `<tr data-row="${i}" title="Voir ces pièces dans le modèle"><td><b>${r.tag ?? ""}</b></td><td>${escapeHtml(r.names.join(", "))}${r.approximate ? " (≈)" : ""}</td><td>${r.quantity}</td><td>${num(r.length, unit)}</td><td>${num(r.width, unit)}</td><td>${num(r.thickness, unit)}</td><td>${grainText(r.grain)}</td><td>${edgeText(r.edges)}${r.band ? ` (${r.band} mm)` : ""}</td><td>${num(r.cutLength, unit)}</td><td>${num(r.cutWidth, unit)}</td><td>${r.roughLength !== undefined && r.roughWidth !== undefined && (r.roughLength !== r.cutLength || r.roughWidth !== r.cutWidth) ? `${num(r.roughLength, unit)} × ${num(r.roughWidth, unit)}` : "—"}</td></tr>`;

/** The cut list grouped as OpenCutList's: one table per material and thickness, with its totals. */
function tableHtml(rows: CutRow[], totals: ReturnType<typeof cutList>["totals"], unit: DisplayUnit): string {
  const groups = totals.map((t) => {
    const own = rows.map((r, i) => [r, i] as const).filter(([r]) => r.material === t.material && r.thickness === t.thickness);
    return `<h3>${escapeHtml(t.material)} ${formatLength(t.thickness, unit)} — ${t.parts} pièce${t.parts > 1 ? "s" : ""}, ${barLength(t.material) !== null ? `${fr(t.metres ?? 0, 2)} m bout à bout` : `${fr(t.area, 2)} m²`}${t.bandLength ? `, chant ${fr(t.bandLength, 1)} m` : ""}</h3><table><thead><tr>${HEAD.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${own.map(([r, i]) => rowHtml(r, i, unit)).join("")}</tbody></table>`;
  });
  return `${groups.join("")}<p>Dimensions en ${UNIT_LABELS[unit]}. Repère : la lettre de la pièce sur le calepinage et dans la vue (bouton « Repères des pièces »). L = longueur, l = largeur ; chants L1/L2 sur les grands côtés, l1/l2 sur les petits. Débit brut : le massif est scié avec sa surcote, puis raboté à la cote de coupe.</p>`;
}

/** The cut list as a document. */
export const cutListPage = (rows: CutRow[], totals: ReturnType<typeof cutList>["totals"], unit: DisplayUnit): PrintPage => ({ title: "Liste de débit", html: `<h1>Liste de débit</h1>${tableHtml(rows, totals, unit)}` });

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
  /** The faces of a body with a motif of their own. */
  const faces = (id: string): FaceAppearance[] => faceAppearances(editor.doc, id, viewport.bodyMesh(id)?.metrics.bbox);
  const showMaterials = () => {
    viewport.setAppearance(rendering ? appearance : null, faces);
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
    const holder = el("div", { class: "text-xs [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_tbody_tr]:cursor-pointer [&_tbody_tr:hover]:bg-amber-50 dark:[&_tbody_tr:hover]:bg-gray-800" });
    holder.innerHTML = tableHtml(rows, totals, editor.unit);
    // A row: its parts selected in the model (as OpenCutList's highlight), brought into view when out of it.
    holder.addEventListener("click", (event) => {
      const row = rows[Number((event.target as HTMLElement).closest<HTMLElement>("tr[data-row]")?.dataset.row ?? NaN)];
      if (!row?.ids?.length) return;
      close();
      viewport.selectLevel({ bodies: row.ids }, false);
      const box = new THREE.Box3();
      for (const id of row.ids) {
        const b = viewport.bodyMesh(id)?.metrics.bbox;
        if (b) box.expandByPoint(new THREE.Vector3(...b[0])).expandByPoint(new THREE.Vector3(...b[1]));
      }
      if (!box.isEmpty() && !viewport.boxVisible(box, 0.8)) viewport.fitBox(box, 1.6);
      editor.notify(`Pièce ${row.tag} : ${row.quantity} sélectionnée${row.quantity > 1 ? "s" : ""}.`, "info");
    });
    const close = openModal("Liste de débit", holder, [
      { label: "Exporter en CSV", run: () => downloadText("liste-de-debit.csv", `﻿${cutListCsv(rows, editor.unit)}`, "text/csv") },
      { label: "Imprimer / PDF", run: () => printHtml("Liste de débit", `<h1>Liste de débit</h1>${tableHtml(rows, totals, editor.unit)}`) },
      { label: "Fermer", run: () => close() },
    ]);
  };

  /** A CSV of parts (OpenCutList's importer) as boards laid flat to the right of the model, in one step. */
  const importParts = () => {
    const input = el("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain", class: "hidden" });
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void file.text().then(async (text) => {
        const { parts, problems } = parsePartsCsv(text);
        if (!parts.length) return editor.notify(problems[0] ?? "Aucune pièce dans ce fichier.", "error");
        const boxes = viewport.displayedBodies.map((id) => viewport.bodyMesh(id)?.metrics.bbox).filter((b) => !!b);
        const from: [number, number] = boxes.length ? [Math.max(...boxes.map((b) => b[1][0])) + 500, Math.min(...boxes.map((b) => b[0][1]))] : [0, 0];
        const { doc, boards } = placeParts(editor.doc, parts, from);
        await editor.change(doc);
        viewport.fit();
        editor.notify(`${boards} planche${boards > 1 ? "s" : ""} importée${boards > 1 ? "s" : ""} (${parts.length} pièce${parts.length > 1 ? "s" : ""} de la liste)${problems.length ? ` ; ${problems.length} ligne${problems.length > 1 ? "s" : ""} ignorée${problems.length > 1 ? "s" : ""} : ${problems.join(" ")}` : "."}`, problems.length ? "info" : "success");
      });
    });
    document.body.append(input);
    input.click();
  };

  button("material")?.addEventListener("click", toggleMaterial);
  button("cutlist")?.addEventListener("click", showCutList);
  button("import-parts")?.addEventListener("click", importParts);

  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    renderMaterial();
    if (rendering) viewport.setAppearance(appearance, faces);
  };
}
