/**
 * Pilotes dans la vue (les « étiquettes de modification » de TopSolid) : quand les pièces d'un seul caisson sont
 * sélectionnées, ses cotes — largeur, hauteur, profondeur, étagères — s'affichent en étiquettes dans la barre du bas de
 * la vue, au-dessus de l'historique (app/cabinet-bar.ts), avec son nom ; un clic en
 * fait un champ, Entrée reconstruit le caisson (une annulation). Une cote qui suit un paramètre (« largeur ») change
 * le paramètre, et tout ce qui le suit ; une cote faite d'une formule plus longue est laissée à sa formule. Rien ne
 * s'affiche pendant un outil.
 */
import { cabinetKeptClear } from "../document/cabinet-clear";
import { applyExpressions } from "../document/expressions";
import { bodyOrigin, updateFeature } from "../document/operations";
import { featureOfBody, type CabinetFeature } from "../document/types";
import { cabinetProblem } from "../features/cabinet-parts";
import { formatLength, fromDisplay, toDisplay } from "../measurements/units";
import type { Viewport } from "../viewport/viewport";
import { cabinetBar } from "./cabinet-bar";
import type { Editor } from "./editor";

type Key = "width" | "height" | "depth" | "shelves";
const LABELS: Record<Key, string> = { width: "L", height: "H", depth: "P", shelves: "Étagères" };

/** The cabinet whose parts (or fronts) are all the bodies selected, or null. */
export function selectedCabinet(editor: Pick<Editor, "doc" | "picked">): CabinetFeature | null {
  const doc = editor.doc;
  const ids = editor.picked.selection.bodies;
  if (!ids.length) return null;
  const owners = new Set(
    ids.map((id) => {
      const f = doc.features.find((x) => x.id === featureOfBody(bodyOrigin(doc, id)));
      return f?.type === "cabinet" ? f.id : f?.type === "fronts" ? f.cabinet : "";
    }),
  );
  if (owners.size !== 1) return null;
  const id = [...owners][0];
  return doc.features.find((f): f is CabinetFeature => f.id === id && f.type === "cabinet" && !f.suppressed) ?? null;
}

export function bindDrivers(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const bar = cabinetBar(viewport);
  let shown = "";
  const clear = () => {
    bar.dims.replaceChildren();
    bar.name.textContent = "";
    bar.refresh();
    shown = "";
  };

  const set = (cabinet: CabinetFeature, key: Key, value: number) => {
    const next = { ...cabinet, [key]: value };
    const problem = cabinetProblem(next);
    if (problem) return editor.notify(problem, "error");
    const formula = cabinet.expressions?.[key]?.trim();
    if (!formula) {
      // Against a wall or a neighbour: slid flush by what it took, or refused with why (document/cabinet-clear.ts).
      const kept = cabinetKeptClear(editor.doc, next);
      if (typeof kept === "string") return editor.notify(kept, "error");
      if (kept !== next) editor.notify(`${cabinet.name} décalé au ras : à cette cote, il entrait dans un mur ou un meuble.`, "info");
      return void editor.change(updateFeature(editor.doc, cabinet.id, () => kept));
    }
    // Driven by a parameter: the parameter changes (and what follows it); by a longer formula: the formula stays.
    const parameter = editor.doc.parameters[formula];
    if (!parameter || parameter.expression) return editor.notify(`Cette cote suit la formule « ${formula} » : changez-la dans Atelier › Paramètres.`, "info");
    const { doc } = applyExpressions({ ...editor.doc, parameters: { ...editor.doc.parameters, [formula]: { ...parameter, value } } });
    void editor.change(doc);
    editor.notify(`Paramètre « ${formula} » : ${key === "shelves" ? value : formatLength(value, editor.unit)}.`, "success");
  };

  const label = (cabinet: CabinetFeature, key: Key) => {
    const span = document.createElement("span");
    span.className = "cad-measure cad-driver";
    span.style.pointerEvents = "auto";
    const value = cabinet[key];
    span.textContent = `${LABELS[key]} ${key === "shelves" ? value : formatLength(value, editor.unit)}`;
    span.title = "Cliquez pour changer la cote";
    span.addEventListener("pointerdown", (e) => e.stopPropagation());
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      // Typed in place, gone when it loses the focus: no keypad beside it (ui/field-keypads.ts).
      input.dataset.noKeypad = "";
      input.className = "w-20 bg-white px-1 text-right text-xs text-gray-900";
      input.value = String(key === "shelves" ? value : Number(toDisplay(value, editor.unit).toFixed(3)));
      span.replaceChildren(`${LABELS[key]} `, input);
      input.focus();
      input.select();
      let done = false;
      const finish = (apply: boolean) => {
        if (done) return;
        done = true;
        const v = Number(input.value);
        if (apply && Number.isFinite(v)) set(cabinet, key, key === "shelves" ? Math.max(0, Math.round(v)) : fromDisplay(v, editor.unit));
        else show(true);
      };
      input.addEventListener("keydown", (k) => {
        k.stopPropagation();
        if (k.key === "Enter") finish(true);
        if (k.key === "Escape") finish(false);
      });
      input.addEventListener("blur", () => finish(true));
    });
    bar.dims.append(span);
  };

  const show = (force = false) => {
    const cabinet = root.dataset.tool ? null : selectedCabinet(editor);
    if (!cabinet) return clear();
    const key = JSON.stringify(cabinet) + editor.unit;
    if (key === shown && !force) return;
    clear();
    shown = key;
    bar.name.textContent = cabinet.name;
    for (const key of ["width", "height", "depth", "shelves"] as const) label(cabinet, key);
    bar.refresh();
  };

  editor.afterRender(() => {
    show();
  });
}
