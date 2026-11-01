/**
 * Deux sorties de la mise en plan pour le client et la pose : le plan de pose (une feuille par mur, son élévation
 * cotée, drawing/pose.ts) et le dossier client (un seul PDF : la vue 3D du projet, toutes les feuilles, le devis aux
 * tarifs enregistrés).
 */
import { bodyLabel, findFeature } from "../../document/operations";
import { featureOfBody } from "../../document/types";
import type { SheetLayout } from "../../drawing/layout";
import { FORMATS, type DrawingSheet, type Format } from "../../drawing/model";
import { poseSheets, type PoseBody } from "../../drawing/pose";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { savedQuoteHtml } from "../workshop-documents";
import { escapeHtml, printHtml } from "../workshop-ui";
import { withAutoDimensions } from "./sheet-actions";

/** The displayed bodies with their boxes; the room's « Mur … » bodies are the walls. */
function poseBodies(viewport: Viewport, editor: Editor): PoseBody[] {
  return viewport.displayedBodies.flatMap((id) => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    if (!b) return [];
    // « Pièce — Mur A » (a surveyed room's), « Mur A » (drawn by an assistant).
    const name = bodyLabel(editor.doc, id).replace(/^.* — (?=Mur\b)/, "");
    return [{ id, name, box: [[...b[0]], [...b[1]]] as PoseBody["box"], wall: /^Mur\b/.test(name) && (!!editor.doc.bodyInfo?.[id]?.room || findFeature(editor.doc, featureOfBody(id))?.type === "room") }];
  });
}

/** The pose sheets added after the others, dimensioned; `done` gets every sheet and the first new one. */
export function addPoseSheets(viewport: Viewport, editor: Editor, layout: SheetLayout, sheets: DrawingSheet[], done: (all: DrawingSheet[], first: string) => void): void {
  const made = poseSheets(sheets, document.title.split(" · ")[0] || "Projet", poseBodies(viewport, editor)).map((s) => withAutoDimensions(s, layout, []));
  if (!made.length) return editor.notify("Aucun mur avec des meubles contre lui : il faut les murs de la pièce (Pièce relevée, ou « Dessiner les murs » de l'Implantation ou du Dressing).", "info");
  done([...sheets, ...made], made[0]!.id);
  editor.notify(`${made.length} feuille(s) de pose ajoutée(s), une par mur.`, "success");
}

/** The client file: a cover with the 3D view, every sheet, the quote; printed (or saved as PDF). */
export function printClientFile(viewport: Viewport, editor: Editor, sheetSvgs: string[], title: string, format: Format): void {
  viewport.renderer.render(viewport.scene, viewport.camera);
  const image = viewport.renderer.domElement.toDataURL("image/png");
  const quote = savedQuoteHtml(viewport, editor);
  const date = new Date().toLocaleDateString("fr-FR");
  const cover = `<section class="page cover"><h1>${escapeHtml(title)}</h1><p>Dossier client — ${date}</p><img src="${image}" alt="Vue du projet"></section>`;
  const sheets = sheetSvgs.map((svg) => `<section class="page">${svg}</section>`).join("");
  const priced = quote ? `<section class="page text"><h2>Devis</h2>${quote}<p>Prix indicatifs, établis à partir de la liste de débit.</p></section>` : "";
  const [w, h] = FORMATS[format];
  printHtml(`${title} — dossier client`, cover + sheets + priced, `@page{size:${w}mm ${h}mm;margin:0} body{margin:0;font-family:system-ui,sans-serif} .page{page-break-after:always;width:100vw;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center} .page svg{width:100%;height:100%} .cover img{max-width:90%;max-height:75%;object-fit:contain} .text{justify-content:flex-start;padding:15mm} .text table{width:100%;border-collapse:collapse;margin-bottom:6mm} .text td,.text th{border-bottom:1px solid #ccc;padding:4px 8px;text-align:left} .text td:not(:first-child){text-align:right}`);
}
