/**
 * Fiches de fabrication de l'Atelier : une page A4 à l'italienne par pièce (les pièces identiques de la liste de
 * débit en une seule fiche, avec leur quantité), pour usiner sans ouvrir la 3D — la pièce à plat à l'échelle avec ses
 * cotes, ses perçages cotés, ses chants et son fil (document/part-sheet.ts), les cotes finies et de coupe, la matière,
 * le tableau des perçages et un QR code. Impression ou PDF.
 */
import { cutList, edgeText, grainText, type CutRow } from "../../document/cut-list";
import { holeGroups, holeText, partSheetSvg } from "../../document/part-sheet";
import { edgeHoles, edgeHolesText } from "../../document/face-ops";
import { notchText, sideNotches } from "../../document/side-notches";
import { bodyLabel } from "../../document/operations";
import type { GeometryClient } from "../../geometry/client";
import { qrSvg } from "../../io/qr";
import { toDisplay, UNIT_LABELS } from "../../measurements/units";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { partsOf } from "./workshop";
import { pieceUrl } from "./workshop-progress";
import { flatParts } from "./workshop-cnc";
import { escapeHtml, printHtml, type PrintPage } from "./workshop-ui";

/** One sheet per part of the cut list, or null with none laid flat. */
export async function partSheetsPage(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<PrintPage | null> {
  const inputs = partsOf(viewport, editor.doc);
  const { rows } = cutList(editor.doc, inputs);
  const input = new Map(inputs.map((p) => [bodyLabel(editor.doc, p.id), p]));
  const { parts, flip } = await flatParts(viewport, editor, geometry);
  if (!rows.length || !parts.length) return null;
  const unit = editor.unit;
  const num = (mm: number) => Number(toDisplay(mm, unit).toFixed(unit === "mm" ? 1 : 3)).toLocaleString("fr-FR");
  const project = document.title.split("·")[0]?.trim() ?? "";
  const date = new Date().toLocaleDateString("fr-FR");
  const byName = new Map(parts.map((p) => [p.name, p]));
  const sheets: string[] = [];
  rows.forEach((row: CutRow, i) => {
    const flat = row.names.map((n) => byName.get(n)).find(Boolean);
    if (!flat) return;
    const holes = holeGroups(flat);
    const size = (a: number, b: number, c: number) => `${num(a)} × ${num(b)} × ${num(c)} ${UNIT_LABELS[unit]}`;
    const facts: [string, string][] = [
      ["Quantité", `${row.quantity}${row.quantity > 1 ? ` (${row.names.join(", ")})` : ""}`],
      ["Cotes finies", size(row.length, row.width, row.thickness)],
      ["Cotes de coupe", `${num(row.cutLength)} × ${num(row.cutWidth)} ${UNIT_LABELS[unit]}${row.band ? ` (chant ${row.band} mm déduit)` : ""}`],
      ["Matière", `${row.material}, ép. ${num(row.thickness)} ${UNIT_LABELS[unit]}`],
      ["Chants", edgeText(row.edges)],
      ["Fil", grainText(row.grain)],
      ["Perçages", holes.length ? holes.map((g) => holeText(g, num)).join(" · ") : "aucun"],
      ...((): [string, string][] => {
        // The holes of the edges (horizontal drilling): not on the drawing of the face.
        const p = input.get(row.names[0] ?? "");
        const lines = p ? edgeHolesText(edgeHoles(editor.doc, p.id, p.bbox), num) : [];
        return lines.length ? [["Sur chant", lines.join(" ; ")]] : [];
      })(),
      ...(row.names.some((n) => flip.includes(n)) ? [["Attention", "perçages borgnes aussi sur l'autre face : retourner la pièce"] as [string, string]] : []),
      ...(row.approximate ? [["Forme", "pas un simple panneau : cotes de son encombrement"] as [string, string]] : []),
      // The notches for the gorge profiles, from the bottom of the side, in the unit of the sheet.
      ...((): [string, string][] => {
        const p = input.get(row.names[0] ?? "");
        const text = p ? notchText(sideNotches(editor.doc, p.id), num, UNIT_LABELS[unit]) : "";
        return text ? [["Entailles", text]] : [];
      })(),
    ];
    // The QR code opens the piece's page in the workshop tracking.
    const qr = qrSvg(pieceUrl(row.names[0] ?? ""));
    sheets.push(`<section class="sheet">
      <header><div><b>${escapeHtml(row.names[0] ?? "")}</b><span>Fiche ${i + 1} / ${rows.length}</span></div><div>${escapeHtml(project)} · ${date}</div></header>
      <div class="body"><div class="drawing">${partSheetSvg(flat, row, num)}</div>
        <aside><div class="qr">${qr}</div><table>${facts.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("")}</table>
        <p class="note">Cotes en ${UNIT_LABELS[unit]}. Perçages cotés depuis le bord gauche (en haut) et depuis le bas (à droite), vue de la face percée. Chants : L1 en bas, L2 en haut, l1 à gauche, l2 à droite.</p></aside></div>
    </section>`);
  });
  if (!sheets.length) return null;
  return {
    title: "Fiches de fabrication",
    html: sheets.join(""),
    css: `@page{size:A4 landscape;margin:8mm}body{margin:0}.sheet{display:flex;flex-direction:column;height:190mm;page-break-after:always;box-sizing:border-box}
     header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:0.4mm solid #111;padding-bottom:2mm;margin-bottom:3mm}
     header b{font-size:15px;margin-right:6mm}header span,header div:last-child{color:#555}
     .body{display:flex;gap:5mm;flex:1;min-height:0}.drawing{flex:1;min-width:0}.drawing svg{width:100%;height:auto;max-height:180mm}
     aside{width:72mm;flex:none;display:flex;flex-direction:column;gap:3mm}.qr{width:30mm;height:30mm}.qr svg{width:100%;height:100%}
     th{width:26mm;font-weight:600}td,th{font-size:10px;vertical-align:top}.note{font-size:9px;color:#555;margin:0}`,
  };
}

export async function printPartSheets(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<void> {
  const page = await partSheetsPage(viewport, editor, geometry);
  if (!page) return editor.notify("Aucune pièce à plat pour les fiches.", "info");
  printHtml(page.title, page.html, page.css);
  editor.notify(`${page.html.split('class="sheet"').length - 1} fiche(s) de fabrication prête(s) à imprimer.`, "success");
}
