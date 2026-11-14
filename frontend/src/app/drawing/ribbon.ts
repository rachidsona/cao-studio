/**
 * Le ruban de la mise en plan, comme celui de l'espace Dessin de Fusion : sélection, vues (base, projetée, coupe,
 * détail), cotes (cote, cotes automatiques, réorganiser, effacer, diamètre, rayon, angle), annotations, dessin 2D, affichage (zoom fenêtre, ajuster) et exports.
 */
import { el } from "../../ui/dom";
import { SketchTool } from "./sketch-tool";
import {
  AngleTool, BaseViewTool, CircleDimensionTool, DetailTool, DimensionTool, LabelTool, ProjectedViewTool, SectionTool,
  type DrawingTool, type ToolHost,
} from "./tools";

const BTN = "flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 px-1.5 text-[11px] leading-tight hover:bg-gray-100 aria-pressed:bg-sky-100 aria-pressed:text-sky-800 dark:hover:bg-gray-800 dark:aria-pressed:bg-sky-950";

export interface RibbonActions {
  use(make: (host: ToolHost) => DrawingTool): void;
  select(): void;
  selected(): string | null;
  autoDimensions(): void;
  arrange(): void;
  clearDimensions(): void;
  zoomWindow(): void;
  fit(): void;
  exportPdf(): void;
  downloadPdf(): void;
  pose(): void;
  clientFile(): void;
  exportDxf(): void;
  exportSvg(): void;
  close(): void;
}

export function drawingRibbon(api: RibbonActions): HTMLElement {
  const button = (label: string, glyph: string, run: () => void, toolName?: string, title = label) => {
    const b = el("button", { type: "button", class: BTN, title, ...(toolName ? { "data-drawing-tool": toolName, "aria-pressed": "false" } : {}) }, el("span", { class: "text-lg leading-none", "aria-hidden": "true" }, glyph), label);
    b.addEventListener("click", run);
    return b;
  };
  const group = (caption: string, ...buttons: HTMLElement[]) =>
    el("div", { class: "flex flex-col border-r border-gray-200 px-1 dark:border-gray-700", role: "group", "aria-label": caption }, el("div", { class: "flex" }, ...buttons), el("span", { class: "text-center text-[10px] font-semibold tracking-wide text-gray-500 uppercase" }, caption));
  const use = (make: (host: ToolHost) => DrawingTool) => () => api.use(make);
  return el("div", { class: "flex shrink-0 items-stretch overflow-x-auto border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" },
    el("div", { class: "flex items-center px-3 text-sm font-bold tracking-wide text-sky-800 uppercase dark:text-sky-300" }, "Mise en plan"),
    group("Sélection", button("Choisir", "↖", () => api.select(), "select")),
    group("Vues",
      button("Vue de base", "▣", use((h) => new BaseViewTool(h)), "base"),
      button("Plan de pose", "▥", () => api.pose(), undefined, "Plan de pose : une feuille par mur, l'élévation cotée de ce qui est posé contre lui"),
      button("Projetée", "⊞", use((h) => new ProjectedViewTool(h, api.selected())), "projected", "Vue projetée : tirée d'une vue, à côté, dessus, dessous ou en biais"),
      button("Coupe", "⊟", use((h) => new SectionTool(h)), "section", "Coupe : un trait sur une vue, puis la place de la coupe"),
      button("Détail", "◎", use((h) => new DetailTool(h)), "detail", "Vue de détail : un cercle sur une vue, agrandi")),
    group("Cotes",
      button("Cote", "↔", use((h) => new DimensionTool(h)), "dimension", "Cote : cliquez un trait (sa cote aussitôt), ou deux points puis tirez (horizontale, verticale ; Maj : alignée)"),
      button("Cotes auto", "⇔", () => api.autoDimensions(), undefined, "Cotation automatique des vues sélectionnées (sinon de toutes) : hors tout, chaînes, diamètres"),
      button("Réorganiser", "☷", () => api.arrange(), undefined, "Réorganiser les cotes des vues sélectionnées (sinon de toutes), comme Fusion : rangées autour de la vue, la plus courte près d'elle, sans croisement"),
      button("Effacer", "⌫", () => api.clearDimensions(), undefined, "Effacer les cotes des vues sélectionnées, sinon toutes celles de la feuille (Ctrl+Z les rend)"),
      button("Diamètre", "⌀", use((h) => new CircleDimensionTool(h, "diameter")), "circle-dimension-d"),
      button("Rayon", "R", use((h) => new CircleDimensionTool(h, "radius")), "circle-dimension-r"),
      button("Angle", "∠", use((h) => new AngleTool(h)), "angle")),
    group("Annoter",
      button("Texte", "T", use((h) => new LabelTool(h, "text")), "text"),
      button("Note", "↘", use((h) => new LabelTool(h, "note")), "note", "Note avec ligne de rappel"),
      button("Repère", "①", use((h) => new LabelTool(h, "balloon")), "balloon", "Repère numéroté d'une pièce (le numéro de la nomenclature)"),
      button("Nomenclature", "☰", use((h) => new LabelTool(h, "bom")), "bom")),
    group("Dessin 2D",
      button("Ligne", "╱", use((h) => new SketchTool(h, "line")), "sketch-line"),
      button("Rectangle", "▭", use((h) => new SketchTool(h, "rect")), "sketch-rect"),
      button("Cercle", "○", use((h) => new SketchTool(h, "circle")), "sketch-circle")),
    group("Affichage",
      button("Zoom fenêtre", "⬚", () => api.zoomWindow(), "zoom-window", "Zoom fenêtre : tracez la zone de la feuille à agrandir (glisser, ou deux coins)"),
      button("Ajuster", "⤢", () => api.fit(), undefined, "Ajuster : toute la feuille à l'écran (F)")),
    group("Exporter",
      button("Fichier PDF", "⬇", () => api.downloadPdf(), undefined, "Fichier PDF téléchargé directement : toutes les feuilles, une page chacune à sa taille (A4 à A0), à l'échelle exacte, avec leur cartouche"),
      button("Imprimer", "⎙", () => api.exportPdf(), undefined, "Imprimer toutes les feuilles (ou les enregistrer en PDF par la boîte d'impression)"),
      button("Dossier client", "▤", () => api.clientFile(), undefined, "Dossier client en un PDF : la vue 3D du projet, toutes les feuilles et le devis"),
      button("DXF", "⬇", () => api.exportDxf(), undefined, "Feuille en DXF, par calques"),
      button("SVG", "⬇", () => api.exportSvg())),
    el("div", { class: "flex-1" }),
    el("div", { class: "flex items-center px-2" }, (() => {
      const close = el("button", { type: "button", class: "h-9 btn-accent px-4 text-sm font-medium", "data-drawing-close": "" }, "Fermer la mise en plan");
      close.addEventListener("click", () => api.close());
      return close;
    })()),
  );
}
