/**
 * "Atelier" ribbon group: what each board is made of (material, grain, edge
 * bands) and the cut list. Buttons carry `data-workshop` ("material",
 * "cutlist"); the first is a docked panel acting on the selected bodies, the
 * other opens a large window with CSV / print. The sheet layout is in
 * production.ts.
 */
import * as THREE from "three";
import { withGrainRun, withoutGrainRun } from "../../document/grain-run";
import { cutList, cutListCsv, rowMatches, type CutRow, type CutTotals, type PartInput } from "../../document/cut-list";
import { bodyAppearance, faceAppearances } from "../../appearance/assign";
import { EDGE_BANDS, MATERIALS, bodyInfo, setBodyInfo } from "../../document/materials";
import { fabricationParts } from "../../document/fabrication-parts";
import { importParts as placeParts, parsePartsCsv } from "../../document/parts-import";
import type { BodyInfo, CadDocument, DisplayUnit } from "../../document/types";
import { el } from "../../ui/dom";
import type { FaceAppearance } from "../../viewport/body-layer";
import type { BodyAppearance, Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { CUT_SHEET_CSS, cutSheet, cutSheetHtml } from "./cut-list-view";
import { CUT_GROUPINGS, type CutGrouping } from "../../document/cut-groups";
import { downloadText, floatingPanel, openModal, printHtml, type PrintPage } from "./workshop-ui";

type Edges = NonNullable<BodyInfo["edges"]>;
const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const EDGE_NAMES: [keyof Edges, string][] = [["length1", "L1"], ["length2", "L2"], ["width1", "l1"], ["width2", "l2"]];

/** The parts of the furniture, hidden ones included (document/fabrication-parts.ts): not the walls, not the hardware. */
export function partsOf(viewport: Viewport, doc: CadDocument): PartInput[] {
  return fabricationParts(doc, viewport.modelBodies);
}

/** The cut list as a document. */
export const cutListPage = (rows: CutRow[], totals: CutTotals[], unit: DisplayUnit, by: CutGrouping = "material"): PrintPage => ({ title: "Liste de débit", html: `<h1>Liste de débit${by === "material" ? "" : ` — par ${CUT_GROUPINGS.find(([id]) => id === by)?.[1].toLowerCase()}`}</h1>${cutSheetHtml(rows, totals, unit, by)}`, css: CUT_SHEET_CSS });

const RENDER_KEY = "cao.render-materials";
const CUT_GROUPING_KEY = "cao.cut-grouping";

export function bindWorkshop(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let rendering = true;
  try {
    rendering = localStorage.getItem(RENDER_KEY) !== "off";
  } catch {
    // No storage (private window): the view shows the materials.
  }

  /** The document shown: a preview's (a run being changed), whose bodies are not the project's, else the project. */
  const shown = () => editor.previewDoc ?? editor.doc;
  /** The look of a body: its appearance (library) or its material's, the grain along the board's length or width. */
  const appearance = (id: string): BodyAppearance | null => bodyAppearance(shown(), id, viewport.bodyMesh(id)?.metrics.bbox);
  /** The faces of a body with a motif of their own. */
  const faces = (id: string): FaceAppearance[] => faceAppearances(shown(), id, viewport.bodyMesh(id)?.metrics.bbox);
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
    const inRun = ids.some((id) => bodyInfo(editor.doc, id).grainRun);
    const run = el("button", { type: "button", class: "h-8 w-full border border-gray-300 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Au calepinage, ces pièces se suivent sur le panneau : le veinage continue de l'une à l'autre." }, inRun ? "Retirer le fil continu" : `Fil continu sur ces ${ids.length} pièces`);
    run.addEventListener("click", () => {
      const places = ids.map((id) => ({ id, box: viewport.bodyMesh(id)?.metrics.bbox }));
      void editor.change(inRun ? withoutGrainRun(editor.doc, ids) : withGrainRun(editor.doc, places.flatMap(({ id, box }) => (box ? [{ id, box }] : [])))).then(renderMaterial);
    });
    panel.body.append(
      el("p", { class: "text-gray-500" }, ids.length === 1 ? "1 corps" : `${ids.length} corps`),
      material,
      grain,
      el("div", { class: "grid grid-cols-4 gap-1" }, ...checks),
      band,
      el("p", { class: "text-[11px] text-gray-500" }, "L1/L2 : les deux grands côtés ; l1/l2 : les deux petits."),
    );
    if (ids.length > 1 || inRun) panel.body.append(run);
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
    const holder = el("div");
    const sheet = el("div");
    // The lists it is made of: by material and thickness, or by kind of piece, wood, thickness (kept by the browser).
    let by: CutGrouping = "material";
    try {
      const kept = localStorage.getItem(CUT_GROUPING_KEY);
      if (CUT_GROUPINGS.some(([id]) => id === kept)) by = kept as CutGrouping;
    } catch {
      // No storage: by material.
    }
    /** The rows as they are shown: a row shared between two lists is two of them. */
    let shownRows: CutRow[] = rows;
    // A row: its parts selected in the model (as OpenCutList's highlight), brought into view when out of it.
    holder.addEventListener("click", (event) => {
      const row = shownRows[Number((event.target as HTMLElement).closest<HTMLElement>("tr[data-row]")?.dataset.row ?? NaN)];
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
    const search = el("input", { type: "search", placeholder: "Filtrer : nom, repère, matière, mur…", "aria-label": "Filtrer la liste de débit", class: "h-9 w-full min-w-0 flex-1 border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-900" });
    const shown = el("p", { class: "shrink-0 text-xs text-gray-500", "data-cut-count": "" });
    search.addEventListener("keydown", (event) => event.stopPropagation());
    const filter = () => {
      let parts = 0;
      for (const tr of holder.querySelectorAll<HTMLElement>("tr[data-row]")) {
        const row = shownRows[Number(tr.dataset.row)];
        const on = !!row && rowMatches(row, search.value);
        tr.hidden = !on;
        if (on) parts += row.quantity;
      }
      // A card with nothing left goes.
      for (const group of holder.querySelectorAll<HTMLElement>(".cut-group")) group.hidden = ![...group.querySelectorAll<HTMLElement>("tr[data-row]")].some((tr) => !tr.hidden);
      shown.textContent = search.value.trim() ? `${parts} pièce${parts > 1 ? "s" : ""} trouvée${parts > 1 ? "s" : ""}.` : "";
    };
    search.addEventListener("input", filter);
    const draw = () => {
      const made = cutSheet(rows, totals, editor.unit, by);
      shownRows = made.rows;
      sheet.innerHTML = `<style>${CUT_SHEET_CSS}</style>${made.html}`;
      filter();
    };
    const grouping = el("select", { class: "h-9 shrink-0 border border-gray-300 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-900", "aria-label": "Listes par", title: "Ranger la liste en plusieurs listes : par matière et épaisseur, par type d'élément (côtés, dessus, étagères…), par type de bois, par épaisseur, ou par type et épaisseur à la fois" }, ...CUT_GROUPINGS.map(([id, label]) => el("option", { value: id, selected: id === by }, `Par ${label.charAt(0).toLowerCase()}${label.slice(1)}`)));
    grouping.addEventListener("change", () => {
      by = grouping.value as CutGrouping;
      try {
        localStorage.setItem(CUT_GROUPING_KEY, by);
      } catch {
        // Kept for this list only.
      }
      draw();
    });
    holder.append(el("div", { class: "sticky top-0 z-10 flex h-11 items-center gap-3 bg-white pb-2 dark:bg-gray-900" }, search, grouping, shown), sheet);
    draw();
    const close = openModal("Liste de débit", holder, [
      { label: "Exporter en CSV", run: () => downloadText("liste-de-debit.csv", `﻿${cutListCsv(shownRows, editor.unit)}`, "text/csv") },
      { label: "Imprimer / PDF", run: () => {
        const page = cutListPage(rows, totals, editor.unit, by);
        printHtml(page.title, page.html, page.css);
      } },
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
