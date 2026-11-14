/**
 * La fenêtre « Formes de menuiserie » de l'esquisse : on choisit la forme (découpe d'évier, de plaque, encoche, queue
 * d'aronde, rangée système 32, poignée cuvette) et ses cotes, puis « Poser » : chaque clic dans l'esquisse en pose une
 * (sketcher/joinery-shapes.ts). Les cotes tapées sont gardées pour la fois suivante.
 */
import type { DisplayUnit } from "../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { currentStamp, defaults, JOINERY_SHAPES, setStamp, shapeProblem, type JoineryShape, type ShapeValues } from "../sketcher/joinery-shapes";
import { el } from "../ui/dom";
import { openModal } from "./workshop/workshop-ui";

const FIELD = "h-9 w-full border border-gray-300 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-900";
/** The sizes last typed, for each shape. */
const remembered = new Map<JoineryShape, ShapeValues>();

export function openJoineryShapes(unit: DisplayUnit, place: () => void): void {
  let kind = currentStamp().kind;
  const values = (k: JoineryShape) => remembered.get(k) ?? defaults(k);
  const select = el("select", { class: FIELD, "aria-label": "Forme" }, ...(Object.keys(JOINERY_SHAPES) as JoineryShape[]).map((k) => el("option", { value: k, selected: k === kind }, JOINERY_SHAPES[k].label)));
  const fields = el("div", { class: "grid gap-2" });
  const problem = el("p", { class: "min-h-5 text-sm text-red-700 dark:text-red-300", role: "alert" });
  const draw = () => {
    const v = values(kind);
    fields.replaceChildren(
      ...JOINERY_SHAPES[kind].fields.map((f) => {
        const shown = f.kind === "length" ? trim(toDisplay(v[f.key]!, unit), 4) : String(v[f.key]);
        const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: shown, "aria-label": f.label, "data-shape-field": f.key });
        input.addEventListener("keydown", (event) => event.stopPropagation());
        return el("label", { class: "grid grid-cols-[11rem_1fr] items-center gap-2 text-sm" }, f.kind === "length" ? `${f.label} (${UNIT_LABELS[unit]})` : f.label, input);
      }),
      el("p", { class: "text-xs text-gray-500 dark:text-gray-400" }, `Chaque clic dans l'esquisse pose la forme par ${JOINERY_SHAPES[kind].at}. Elle arrive cotée : changez une cote pour la régler, cotez sa place depuis un bord.`),
    );
    problem.textContent = "";
  };
  select.addEventListener("change", () => {
    kind = select.value as JoineryShape;
    draw();
  });
  draw();
  const read = (): ShapeValues | null => {
    const out: ShapeValues = {};
    for (const f of JOINERY_SHAPES[kind].fields) {
      const input = fields.querySelector<HTMLInputElement>(`[data-shape-field="${f.key}"]`);
      const n = input ? parseNumber(input.value) : null;
      if (n === null) return (problem.textContent = `${f.label} : un nombre.`), null;
      out[f.key] = f.kind === "length" ? fromDisplay(n, unit) : n;
    }
    const wrong = shapeProblem(kind, out);
    if (wrong) return (problem.textContent = wrong), null;
    return out;
  };
  const close = openModal("Formes de menuiserie", el("div", { class: "grid w-[28rem] max-w-full gap-3" }, el("label", { class: "grid gap-1 text-sm font-medium" }, "Forme", select), fields, problem), [
    {
      label: "Poser dans l'esquisse",
      run: () => {
        const v = read();
        if (!v) return;
        remembered.set(kind, v);
        setStamp(kind, v);
        close();
        place();
      },
    },
  ]);
}
