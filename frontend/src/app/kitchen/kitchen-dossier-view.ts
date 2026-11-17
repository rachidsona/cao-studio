/**
 * « Dossier de cuisine » (dans le Plan de cuisine) : le plan coté, l'élévation de chaque linéaire et la liste des
 * meubles (document/kitchen-dossier.ts), montrés dans une fenêtre, puis « Fichier PDF » pour les remettre au client.
 */
import { kitchenDossier } from "../../document/kitchen-dossier";
import { sheetsPdf } from "../../drawing/svg-pdf";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";
import { downloadText, openModal } from "../workshop/workshop-ui";

export function openKitchenDossier(editor: Editor, planId?: string): void {
  const project = document.title.split("·")[0]?.trim() || "Cuisine";
  const made = kitchenDossier(editor.doc, project, (mm) => formatLength(mm, editor.unit), planId);
  if (typeof made === "string") return editor.notify(made, "info");
  const content = el(
    "div",
    { class: "space-y-3 text-sm", "data-kitchen-dossier": "" },
    el("p", { class: "text-xs text-gray-500" }, `${made.pages.length} pages : le plan coté, chaque linéaire vu de face, la liste des ${made.lines.length} meubles.`),
    ...made.pages.map((svg) => {
      const page = el("div", { class: "border border-gray-200 bg-white dark:border-gray-700", "data-dossier-page": "" });
      page.innerHTML = svg.replace(/width="297mm" height="210mm"/, 'width="100%"');
      return page;
    }),
  );
  const close = openModal("Dossier de cuisine", content, [
    { label: "Fichier PDF", run: () => downloadText(`${project} - dossier de cuisine.pdf`.replace(/[\\/:*?"<>|]/g, "-"), sheetsPdf(made.pages, `${project} — dossier de cuisine`), "application/pdf") },
    { label: "Fermer", run: () => close() },
  ]);
}
