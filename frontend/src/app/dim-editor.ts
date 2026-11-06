/** Une cote de la vue changée sur place : un clic ouvre un champ à sa place, Entrée applique, Échap laisse tel quel. */
import { withNicheSize } from "../document/niche-size";
import { fromDisplay, parseNumber, toDisplay, trim } from "../measurements/units";
import type { Editor } from "./editor";

export function editDim(editor: Editor, sketchId: string, label: HTMLElement, axis: "x" | "y", span: [number, number], value: number): void {
  document.querySelector("[data-dim-editor]")?.remove();
  // Over the label, not in it: the labels are drawn again whenever the view moves.
  const { left, top } = label.getBoundingClientRect();
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.value = trim(toDisplay(value, editor.unit), 4);
  input.dataset.dimEditor = "";
  input.setAttribute("aria-label", "Nouvelle cote");
  input.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:60;width:4.5rem;color:#111;background:#fff;border:1px solid #0ea5e9;font:12px monospace;text-align:right;padding:1px 3px`;
  document.body.append(input);
  input.addEventListener("blur", () => input.remove());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") input.blur();
    if (event.key !== "Enter") return;
    const parsed = parseNumber(input.value);
    if (parsed === null || parsed <= 0) return input.blur();
    const made = withNicheSize(editor.doc, sketchId, axis, span, fromDisplay(parsed, editor.unit));
    input.blur();
    if (typeof made === "string") return editor.notify(made, "error");
    void editor.change(made);
  });
  input.focus();
  input.select();
}
