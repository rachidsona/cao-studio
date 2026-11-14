/**
 * « Gabarits de perçage 1:1 » (groupe Fabrication) : un PDF téléchargé, les pièces percées en vraie grandeur, en pages
 * A4 à coller (document/drill-template.ts), pour pointer les trous sur le panneau sans machine. Les pièces identiques
 * n'ont qu'un gabarit.
 */
import { drillTemplatePages } from "../../document/drill-template";
import { sheetsPdf } from "../../drawing/svg-pdf";
import type { GeometryClient } from "../../geometry/client";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { flatParts } from "./workshop-cnc";
import { downloadText } from "./workshop-ui";

export async function downloadDrillTemplates(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<void> {
  const { parts } = await flatParts(viewport, editor, geometry);
  const project = document.title.split("·")[0]?.trim() || "Projet";
  // The parts with holes, one template for identical ones (same size, same holes).
  const seen = new Set<string>();
  const drilled = parts.filter((p) => {
    if (p.edges.length === 1 || !p.edges.some((e) => e.kind === "circle")) return false;
    const key = JSON.stringify([p.width.toFixed(1), p.height.toFixed(1), p.edges.filter((e) => e.kind === "circle").map((e) => (e.kind === "circle" ? [e.center.map((v) => v.toFixed(1)), e.radius.toFixed(2)] : null))]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!drilled.length) return editor.notify("Aucune pièce percée à plat : pas de gabarit à imprimer.", "info");
  const pages = drilled.flatMap((p) => drillTemplatePages(p, project));
  downloadText(`${project} - gabarits de perçage 1-1.pdf`.replace(/[\\/:*?"<>|]/g, "-"), sheetsPdf(pages, `${project} — gabarits de perçage`), "application/pdf");
  editor.notify(`Gabarits de perçage : ${drilled.length} pièce${drilled.length > 1 ? "s" : ""}, ${pages.length} page${pages.length > 1 ? "s" : ""} A4 à imprimer à 100 %.`, "success");
}
