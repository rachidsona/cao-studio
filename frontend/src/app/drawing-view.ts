/**
 * "Mise en plan" (Atelier group): the model as a drawing sheet — three views
 * with hidden edges, overall dimensions, title block, standard scale — in a
 * large window with the sheet format, the scale and the hidden lines to
 * choose; printed (to paper or PDF) or saved as SVG. The drawing itself is
 * built by document/drawing.ts.
 */
import { buildSheet, SCALES, SHEETS, type MeshInput, type SheetName } from "../document/drawing";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { downloadText, openModal, printHtml } from "./workshop-ui";

const SELECT = "h-8 rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
/// Above this many triangles the hidden lines are not computed (the check is quadratic).
const MAX_TRIANGLES = 60000;

export function bindDrawing(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const open = () => {
    const meshes: MeshInput[] = [];
    let triangles = 0;
    for (const id of viewport.displayedBodies) {
      const m = viewport.bodyMesh(id);
      if (m) {
        meshes.push({ id, vertices: m.vertices, indices: m.indices, edges: m.edges });
        triangles += m.indices.length / 3;
      }
    }
    if (!meshes.length) return editor.notify("Aucun corps à dessiner.", "info");
    const slow = triangles > MAX_TRIANGLES;
    const state = { sheet: "A3" as SheetName, scale: null as number | null, hidden: !slow };
    const title = document.title.split(" · ")[0] || "Mise en plan";
    const preview = el("div", { class: "mx-auto max-w-full overflow-auto rounded border border-gray-200 bg-white dark:border-gray-700" });
    const build = () =>
      buildSheet(meshes, { ...state, title, format: (mm) => formatLength(mm, editor.unit), date: new Date().toLocaleDateString("fr-FR") });
    let svg = "";
    const refresh = () => {
      svg = build().svg;
      preview.innerHTML = svg;
      const drawn = preview.querySelector("svg");
      if (drawn) {
        drawn.removeAttribute("width");
        drawn.removeAttribute("height");
        drawn.setAttribute("style", "width:100%;height:auto;display:block");
      }
    };
    const select = (label: string, value: string, options: [string, string][], set: (v: string) => void) => {
      const s = el("select", { class: SELECT, "aria-label": label }, ...options.map(([v, t]) => el("option", { value: v, selected: v === value }, t)));
      s.addEventListener("change", () => {
        set(s.value);
        refresh();
      });
      return el("label", { class: "flex items-center gap-1.5 text-xs" }, label, s);
    };
    const hidden = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: state.hidden, disabled: slow });
    hidden.addEventListener("change", () => {
      state.hidden = hidden.checked;
      refresh();
    });
    const content = el(
      "div",
      { class: "space-y-3" },
      el(
        "div",
        { class: "flex flex-wrap items-center gap-3" },
        select("Format", state.sheet, (Object.keys(SHEETS) as SheetName[]).map((s) => [s, `${s} paysage`]), (v) => (state.sheet = v as SheetName)),
        select("Échelle", "auto", [["auto", "Automatique"], ...SCALES.map((n): [string, string] => [String(n), `1:${n}`])], (v) => (state.scale = v === "auto" ? null : Number(v))),
        el("label", { class: "flex items-center gap-1.5 text-xs" }, hidden, slow ? "Lignes cachées (trop de détails)" : "Lignes cachées"),
      ),
      preview,
    );
    refresh();
    const close = openModal("Mise en plan", content, [
      { label: "Exporter en SVG", run: () => downloadText("mise-en-plan.svg", svg, "image/svg+xml") },
      { label: "Imprimer / PDF", run: () => printHtml("Mise en plan", svg, `@page{size:${state.sheet} landscape;margin:0} body{margin:0} svg{width:100%;height:auto}`) },
      { label: "Fermer", run: () => close() },
    ]);
  };
  root.querySelector('[data-workshop="drawing"]')?.addEventListener("click", open);
}
