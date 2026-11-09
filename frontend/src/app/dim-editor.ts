/** Une cote de la vue changée sur place : un clic ouvre la calculatrice à côté d'elle, Entrée applique, Échap laisse tel quel. */
import { withNicheSize, withPartitionSize } from "../document/niche-size";
import type { CadDocument } from "../document/types";
import { openCalculator } from "../ui/calculator";
import type { Editor } from "./editor";

/** A niche's dimension; `whole`: the dimension of the whole Répartition. */
export function editDim(editor: Editor, sketchId: string, label: HTMLElement, axis: "x" | "y", span: [number, number], value: number, whole = false): void {
  editValue(editor, label, value, (mm) => (whole ? withPartitionSize(editor.doc, sketchId, axis, value, mm) : withNicheSize(editor.doc, sketchId, axis, span, mm)));
}

/**
 * The calculator over a label of the view: a value typed or calculated (« 360 - 2 × 60 », « 1,2 m + 15 cm »), with its
 * keypad; Entrée (or ✓) applies what `apply` makes of it (mm), a refusal says why and leaves the calculator open.
 */
export function editValue(editor: Editor, label: HTMLElement, value: number, apply: (mm: number) => CadDocument | string): void {
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
      void editor.change(made);
      return true;
    },
  });
}
