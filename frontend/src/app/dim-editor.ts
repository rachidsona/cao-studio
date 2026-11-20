/**
 * Une cote de la vue changée sur place : un clic en fait un petit champ, à sa place, où l'on tape la valeur ou un calcul
 * (« 190 - 5 », « 2 × 45 + 10 », « 1,2 m + 15 cm ») ; Entrée applique, Échap ou un clic ailleurs laisse tel quel. Au
 * doigt (tablette, téléphone), la calculatrice et son pavé s'ouvrent à côté d'elle.
 */
import { withNicheSize, withPartitionSize } from "../document/niche-size";
import type { CadDocument } from "../document/types";
import { evaluateExpression } from "../measurements/expression";
import { toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { openCalculator } from "../ui/calculator";
import { el } from "../ui/dom";
import type { Editor } from "./editor";

/** A niche's dimension; `whole`: the dimension of the whole Répartition. */
export function editDim(editor: Editor, sketchId: string, label: HTMLElement, axis: "x" | "y", span: [number, number], value: number, whole = false): void {
  editValue(editor, label, value, (mm) => (whole ? withPartitionSize(editor.doc, sketchId, axis, value, mm) : withNicheSize(editor.doc, sketchId, axis, span, mm)));
}

/** What `apply` made (mm) put in the document: a tool open on the Répartition (Étagères, Cloisons…) finds its niches again. */
function applied(editor: Editor, made: CadDocument): void {
  void editor.change(made).then(() => editor.sketches.sync());
}

/**
 * A label of the view changed: typed in its place (with a mouse), or on the calculator's keypad beside it (with a finger,
 * or `keypad`). A value or a calculation; Entrée applies what `apply` makes of it (mm), a refusal says why and leaves
 * the field open.
 */
export function editValue(editor: Editor, label: HTMLElement, value: number, apply: (mm: number) => CadDocument | string, keypad = matchMedia("(pointer: coarse)").matches): void {
  if (!keypad) return typeInPlace(editor, label, value, apply);
  const { left, top, width, height } = label.getBoundingClientRect();
  openCalculator({
    container: document.body,
    anchor: { x: left + width / 2, y: top + height / 2 },
    value,
    unit: editor.unit,
    title: "Nouvelle cote",
    locked: false,
    noLock: true,
    inputAttrs: { "data-dim-editor": "" },
    onSubmit: (mm) => {
      const made = apply(mm);
      if (typeof made === "string") return made;
      applied(editor, made);
      return true;
    },
  });
}

/** The field typed in where the label is (the label itself is drawn again as the view moves: the field stays). */
function typeInPlace(editor: Editor, label: HTMLElement, value: number, apply: (mm: number) => CadDocument | string): void {
  document.querySelector(".cad-dim-field")?.dispatchEvent(new Event("close"));
  const { left, top, width, height } = label.getBoundingClientRect();
  const unit = editor.unit;
  const field = el("input", {
    type: "text", class: "cad-dim-field", value: trim(toDisplay(value, unit), 4), autocomplete: "off", spellcheck: "false",
    "aria-label": `Nouvelle cote (${UNIT_LABELS[unit]})`, title: "Une valeur ou un calcul (190 - 5, 2 × 45 + 10, 1 m + 5 cm) ; Entrée applique, Échap laisse tel quel",
    // A calculation: « ( » stays what it is (digit-keys.ts).
    "data-expression": "", "data-dim-editor": "",
  });
  field.style.left = `${left + width / 2}px`;
  field.style.top = `${top + height / 2}px`;
  const fit = () => (field.style.width = `${Math.max(7, field.value.length + 3)}ch`);
  const outside = (event: PointerEvent) => event.target !== field && close();
  const close = () => {
    document.removeEventListener("pointerdown", outside, true);
    field.remove();
  };
  const refuse = (message: string) => {
    field.setAttribute("aria-invalid", "true");
    field.title = message;
    editor.notify(message, "error");
  };
  field.addEventListener("close", close);
  field.addEventListener("input", () => (fit(), field.removeAttribute("aria-invalid")));
  field.addEventListener("pointerdown", (event) => event.stopPropagation());
  field.addEventListener("keydown", (event) => {
    event.stopPropagation();
    // « + 5 » typed on the value as it opens: 185 + 5, not 5.
    if (/^[+−×÷*/-]$/.test(event.key) && field.value && field.selectionStart === 0 && field.selectionEnd === field.value.length) field.setSelectionRange(field.value.length, field.value.length);
    if (event.key === "Escape") return (event.preventDefault(), close());
    if (event.key !== "Enter") return;
    event.preventDefault();
    let mm: number;
    try {
      mm = evaluateExpression(field.value, unit);
    } catch (e) {
      return refuse(e instanceof Error ? e.message : String(e));
    }
    if (!(mm > 0)) return refuse("La cote doit être positive.");
    const made = apply(mm);
    if (typeof made === "string") return refuse(made);
    close();
    applied(editor, made);
  });
  fit();
  document.body.append(field);
  field.focus();
  field.select();
  // After the click that opened it.
  setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
}
