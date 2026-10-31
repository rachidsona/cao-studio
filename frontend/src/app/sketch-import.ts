/**
 * « Importer un plan DXF » dans l'esquisse ouverte : le fichier est lu (io/dxf-import.ts), on choisit de le poser comme
 * référence (traits de construction fixes, pour dessiner le meuble par-dessus) ou comme dessin (traits ordinaires, à
 * extruder), à ses coordonnées ou son coin bas-gauche sur l'origine ; une seule annulation.
 */
import { parseDxf, shapesBox } from "../io/dxf-import";
import { addShapes } from "../sketcher/import-shapes";
import type { SketchMode } from "../sketcher/mode";
import { el } from "../ui/dom";
import { openModal } from "./workshop-ui";

/** Asks for a .dxf file of the computer, then how to put it in the sketch. */
export function importDxf(mode: SketchMode, notify: (message: string, kind?: "info" | "success" | "error") => void): void {
  const input = el("input", { type: "file", accept: ".dxf,application/dxf,image/vnd.dxf" });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const read = parseDxf(await file.text());
    const box = shapesBox(read.shapes);
    if (!box) return notify("Rien à importer : ce DXF n'a ni ligne, ni cercle, ni arc, ni polyligne.", "error");
    const skipped = Object.entries(read.skipped).map(([type, n]) => `${n} ${type}`).join(", ");
    const size = `${Math.round(box[1][0] - box[0][0])} × ${Math.round(box[1][1] - box[0][1])} mm`;
    const origin = el("input", { type: "checkbox", checked: true });
    const content = el(
      "div",
      { class: "space-y-2 text-sm" },
      el("p", {}, `« ${file.name} » : ${read.shapes.length} traits, ${size} (unité du fichier : ${read.unitName}).`),
      skipped ? el("p", { class: "text-xs text-gray-500" }, `Laissés de côté : ${skipped} (textes, cotes, blocs…).`) : null,
      el("label", { class: "flex items-center gap-2" }, origin, "Poser son coin bas-gauche sur l'origine de l'esquisse"),
      el("p", { class: "text-xs text-gray-500" }, "En référence, les traits sont de construction et fixes : on s'y accroche et on dessine le meuble par-dessus. En dessin, ce sont des traits ordinaires, qu'on peut extruder."),
    );
    const put = (reference: boolean) => {
      close();
      const shift: [number, number] = origin.checked ? [-box[0][0], -box[0][1]] : [0, 0];
      const next = addShapes(mode.geometry, read.shapes, { reference, shift });
      if (mode.apply(next, `Plan « ${file.name} » importé : ${read.shapes.length} traits${reference ? " de référence" : ""}.`)) mode.ensureVisible(true);
    };
    const close = openModal("Importer un plan DXF", content, [
      { label: "Comme référence", run: () => put(true) },
      { label: "Comme dessin", run: () => put(false) },
      { label: "Annuler", run: () => close() },
    ]);
  });
  input.click();
}
