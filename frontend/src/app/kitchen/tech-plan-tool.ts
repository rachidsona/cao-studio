/**
 * « Plan technique » (groupe Cuisine) : ce que le plombier et l'électricien doivent amener au mur avant la pose —
 * eau, évacuations, lignes et prises —, d'après la cuisine posée (document/tech-plan.ts). Une fenêtre montre chaque
 * mur vu de face avec ses points numérotés et cotés ; « Fichier PDF » télécharge les pages A4 à leur remettre.
 */
import { techPlan } from "../../document/tech-plan";
import { techPlanPages } from "../../document/tech-plan-sheets";
import { sheetsPdf } from "../../drawing/svg-pdf";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";
import { downloadText, openModal } from "../workshop/workshop-ui";

export function openTechPlan(editor: Editor): void {
  const { walls, notes } = techPlan(editor.doc);
  const project = document.title.split("·")[0]?.trim() || "Cuisine";
  const pages = techPlanPages(walls, project, (mm) => formatLength(mm, editor.unit));
  const content = el(
    "div",
    { class: "space-y-3 text-sm", "data-tech-plan": "" },
    ...notes.map((n) => el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100", "data-tech-note": "" }, n)),
    el("p", { class: "text-xs text-gray-500" }, `${walls.reduce((n, w) => n + w.points.length, 0)} points sur ${walls.length} mur${walls.length > 1 ? "s" : ""}. Les hauteurs sont des repères d'usage : à faire valider par le plombier et l'électricien.`),
    ...pages.map((svg, i) => {
      const page = el("div", { class: "border border-gray-200 bg-white dark:border-gray-700", "data-tech-wall": walls[i]!.name });
      page.innerHTML = svg.replace(/width="297mm" height="210mm"/, 'width="100%" height="auto"');
      return page;
    }),
  );
  const close = openModal("Plan technique", content, [
    ...(pages.length ? [{ label: "Fichier PDF", run: () => downloadText(`${project} - plan technique.pdf`.replace(/[\\/:*?"<>|]/g, "-"), sheetsPdf(pages, `${project} — plan technique`), "application/pdf") }] : []),
    { label: "Fermer", run: () => close() },
  ]);
}

export function bindTechPlan(root: HTMLElement, editor: Editor): void {
  for (const b of root.querySelectorAll('[data-workshop="tech-plan"]')) b.addEventListener("click", () => openTechPlan(editor));
}
