/**
 * « Dossier de production » : le contrôle du projet d'abord, ce qu'il trouve sous les yeux, puis tous les fichiers de
 * l'atelier en un seul .zip. Chaque document vient de son propre outil (liste de débit, calepinage, fiches, étiquettes,
 * DXF, G-code, notice, devis) : le dossier ne calcule rien de plus, il les réunit, aux réglages déjà faits dans chacun.
 */
import { strToU8, zipSync, type Zippable } from "three/examples/jsm/libs/fflate.module.js";
import { cutList, cutListCsv } from "../document/cut-list";
import { modelHardware } from "../document/hardware";
import { folderReadme, FOLDER_ITEMS, type FolderItem } from "../document/production-folder";
import type { GeometryClient } from "../geometry/client";
import { download, el, slugify } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { AssemblyNotice } from "./assembly-guide";
import type { Editor } from "./editor";
import { checkModel, showCheck } from "./fabrication-check";
import { layoutFiles } from "./production";
import { cutListPage, partsOf } from "./workshop";
import { flatParts, labelsPage, savedDxf, savedGcode } from "./workshop-cnc";
import { savedQuoteHtml } from "./workshop-documents";
import { partSheetsPage } from "./workshop-sheets";
import { escapeHtml, openModal, pageHtml, type PrintPage } from "./workshop-ui";

const BOM = "﻿";

/** Everything asked for, as the files of the folder. */
async function folderFiles(viewport: Viewport, editor: Editor, geometry: GeometryClient, notice: AssemblyNotice, wanted: Set<FolderItem>): Promise<{ files: Map<string, string>; notes: string[] }> {
  const files = new Map<string, string>();
  const notes: string[] = [];
  const page = (name: string, built: PrintPage | null, what: string, header = true) => {
    if (built) files.set(name, pageHtml(built, header));
    else notes.push(`${what} : rien à produire.`);
  };
  const { rows, totals } = cutList(editor.doc, partsOf(viewport, editor.doc));
  if (wanted.has("cutlist")) {
    files.set("01-liste-de-debit.csv", `${BOM}${cutListCsv(rows, editor.unit)}`);
    page("01-liste-de-debit.html", cutListPage(rows, totals, editor.unit), "Liste de débit");
  }
  if (wanted.has("layout")) {
    const layout = await layoutFiles(rows, modelHardware(editor.doc), editor.unit);
    page("02-calepinage.html", layout.page, "Calepinage");
    files.set("02-liste-d-achat.csv", `${BOM}${layout.purchase}`);
  }
  // Without the layout of the page: each sheet has its own, and a label sheet has no room for it.
  if (wanted.has("sheets")) page("03-fiches-de-fabrication.html", await partSheetsPage(viewport, editor, geometry), "Fiches de fabrication", false);
  if (wanted.has("labels")) page("04-etiquettes.html", labelsPage(viewport, editor), "Étiquettes", false);
  if (wanted.has("cnc")) {
    const { parts, skipped, flip, edges } = await flatParts(viewport, editor, geometry);
    if (parts.length) {
      files.set("05-pieces-cnc.dxf", savedDxf(parts));
      files.set("05-pieces.nc", savedGcode(parts));
    } else notes.push("Fichiers machine : aucune pièce à plat.");
    if (skipped.length) notes.push(`Sans face plane, donc hors des fichiers machine : ${skipped.join(", ")}.`);
    if (flip.length) notes.push(`Perçages sur l'autre face, à retourner : ${flip.join(", ")}.`);
    if (edges.length) notes.push(`Perçages sur chant, à faire à part : ${edges.join(", ")}.`);
  }
  if (wanted.has("notice")) page("06-notice-de-montage.html", notice(), "Notice de montage", false);
  if (wanted.has("quote")) {
    const quote = savedQuoteHtml(viewport, editor);
    page("07-devis.html", quote ? { title: "Devis", html: `<h1>Devis — ${escapeHtml(projectName())}</h1>${quote}` } : null, "Devis");
  }
  return { files, notes };
}

const projectName = () => document.title.split("·")[0]?.trim() || "Projet";

async function openFolder(viewport: Viewport, editor: Editor, geometry: GeometryClient, notice: AssemblyNotice): Promise<void> {
  if (!partsOf(viewport, editor.doc).length) return editor.notify("Aucune pièce : il n'y a rien à fabriquer.", "info");
  const problems = await checkModel(viewport, editor, geometry);
  const errors = problems.filter((p) => p.severity === "error").map((p) => p.message);
  const warnings = problems.filter((p) => p.severity !== "error").map((p) => p.message);
  const wanted = new Set(FOLDER_ITEMS.filter((i) => !i.off).map((i) => i.key));
  const boxes = FOLDER_ITEMS.map((item) => {
    const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: wanted.has(item.key) });
    box.addEventListener("change", () => (box.checked ? wanted.add(item.key) : wanted.delete(item.key)));
    return el("label", { class: "flex items-center gap-2 py-0.5" }, box, item.label);
  });
  const details = el("button", { type: "button", class: "h-7 border border-gray-300 px-2 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Voir le détail");
  const verdict = errors.length
    ? el("p", { class: "bg-red-50 px-2 py-1.5 text-red-900 dark:bg-red-950 dark:text-red-100" }, `${errors.length} erreur${errors.length > 1 ? "s" : ""} à corriger avant de fabriquer${warnings.length ? `, et ${warnings.length} point${warnings.length > 1 ? "s" : ""} à vérifier` : ""}.`)
    : warnings.length
      ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, `${warnings.length} point${warnings.length > 1 ? "s" : ""} à vérifier.`)
      : el("p", { class: "bg-emerald-50 px-2 py-1.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" }, "Contrôle du projet : aucun problème trouvé.");
  const content = el(
    "div",
    { class: "space-y-3 text-sm" },
    verdict,
    problems.length ? details : null,
    el("div", {}, ...boxes),
    el("p", { class: "text-xs text-gray-500" }, "Les fichiers reprennent les réglages déjà faits dans chaque outil : machine, calques, tarifs. Le résultat du contrôle est écrit dans le dossier."),
  );
  const make = async () => {
    const project = projectName();
    const { files, notes } = await folderFiles(viewport, editor, geometry, notice, wanted);
    if (!files.size) return editor.notify("Choisissez au moins un document.", "info");
    const date = new Date().toLocaleDateString("fr-FR");
    const readme = folderReadme(project, date, [...files.keys()], { errors, warnings }, notes);
    const zipped: Zippable = { "00-lisez-moi.txt": strToU8(readme) };
    for (const [name, text] of files) zipped[name] = strToU8(text);
    const data = zipSync(zipped, { level: 6 });
    download(new Blob([data.slice().buffer as ArrayBuffer], { type: "application/zip" }), `${slugify(project)}-dossier-production.zip`);
    editor.notify(`Dossier de production prêt : ${files.size + 1} fichiers.`, "success");
    close();
  };
  const close = openModal("Dossier de production", content, [
    { label: errors.length ? "Télécharger quand même" : "Télécharger le dossier", run: () => void make().catch((e: unknown) => editor.notify(e instanceof Error ? e.message : String(e), "error")) },
    { label: "Fermer", run: () => close() },
  ]);
  details.addEventListener("click", () => {
    close();
    void showCheck(viewport, editor, geometry);
  });
}

export function bindProductionFolder(root: HTMLElement, viewport: Viewport, editor: Editor, geometry: GeometryClient, notice: AssemblyNotice): void {
  root.querySelector('[data-workshop="production-folder"]')?.addEventListener("click", () => void openFolder(viewport, editor, geometry, notice));
}
