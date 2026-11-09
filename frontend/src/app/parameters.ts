/**
 * "Paramètres" panel (Atelier group): named values (largeur, ep…), possibly
 * built from each other, and formulas that link the numbers of features to
 * them. Changing a parameter rewrites every linked number in one undo step.
 * Configurations keep named sets of values (variants of the model), applied
 * in one click. The maths is in document/expressions.ts.
 */
import {
  applyExpressions, evaluate, nameProblem, namesIn, numericFields, parameterUsage, resolveParameters,
} from "../document/expressions";
import { activeConfiguration, applyConfiguration, configurationsOf, removeConfiguration, saveConfiguration, updateConfiguration } from "../document/configurations";
import { findFeature, updateFeature } from "../document/operations";
import type { CadDocument, Feature, Parameter } from "../document/types";
import { askConfirm } from "../ui/confirm-dialog";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { floatingPanel } from "./workshop/workshop-ui";

const INPUT = "h-8 min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

const FIELD_LABELS: Record<string, string> = {
  width: "Largeur", height: "Hauteur", depth: "Profondeur", thickness: "Épaisseur", backThickness: "Épaisseur du fond", shelves: "Nombre d'étagères",
  plinth: "Socle", distance: "Distance", diameter: "Diamètre", radius: "Rayon", angle: "Angle", count: "Copies", position: "Position",
  x: "X", y: "Y", offset: "Décalage", translate: "Déplacement", origin: "Origine", step: "Pas", center: "Centre",
};

/** "Largeur", or "Déplacement Y" for the second coordinate of a vector. */
export function fieldLabel(path: string): string {
  const [key, index] = path.split(".") as [string, string | undefined];
  return `${FIELD_LABELS[key] ?? key}${index === undefined ? "" : ` ${"XYZ"[Number(index)]}`}`;
}

const NUMBER = /^-?\d+([.,]\d+)?$/;

/** What was typed for a parameter: a plain number, or a formula (optionally after "="). */
export function readParameter(text: string, previous?: Parameter): Parameter {
  const t = text.trim().replace(/^=/, "").trim();
  const unit = previous?.unit ?? "mm";
  if (NUMBER.test(t)) return { ...(previous?.comment ? { comment: previous.comment } : {}), value: Number(t.replace(",", ".")), unit };
  return { ...(previous?.comment ? { comment: previous.comment } : {}), value: previous?.value ?? 0, unit, expression: t };
}

export function bindParameters(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="parameters"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  /** The feature and field being linked, kept across redraws. */
  const draft = { feature: "", path: "" };

  const nameOf = (id: string) => findFeature(editor.doc, id)?.name ?? id;

  /** Applies the formulas and commits; any formula that fails is reported and nothing changes. */
  const commit = (next: CadDocument): void => {
    const result = applyExpressions(next);
    const problems = [...Object.entries(result.parameterErrors).map(([n, m]) => `${n} : ${m}`), ...result.errors.map((e) => `${nameOf(e.featureId)} (${fieldLabel(e.path)}) : ${e.message}`)];
    if (problems.length) {
      editor.notify(problems[0] as string, "error");
      render();
      return;
    }
    void editor.change(result.doc);
  };

  const setParameter = (name: string, parameter: Parameter | null): void => {
    const parameters = { ...editor.doc.parameters };
    if (parameter) parameters[name] = parameter;
    else delete parameters[name];
    commit({ ...editor.doc, parameters });
  };

  const removeParameter = async (name: string): Promise<void> => {
    const uses = parameterUsage(editor.doc, name);
    if (uses.length && !(await askConfirm(`« ${name} » est utilisé par : ${uses.join(", ")}. Le supprimer quand même (les nombres gardent leur valeur actuelle) ?`, "Supprimer"))) return;
    const features = editor.doc.features.map((f) => dropLinks(f, name));
    const parameters = { ...editor.doc.parameters };
    delete parameters[name];
    // A parameter made from it keeps its value but loses the formula.
    for (const [other, p] of Object.entries(parameters)) {
      if (!p.expression || !namesIn(p.expression).includes(name)) continue;
      const { expression: _formula, ...plain } = p;
      parameters[other] = plain;
    }
    void editor.change({ ...editor.doc, parameters, features });
  };

  const parameterRow = (name: string, p: Parameter, error: string | undefined): HTMLElement => {
    const input = el("input", { type: "text", class: `${INPUT} w-full text-right font-mono`, value: p.expression ? `= ${p.expression}` : String(p.value), "aria-label": `Valeur de ${name}`, "aria-invalid": error ? "true" : undefined });
    input.addEventListener("keydown", (event) => event.stopPropagation());
    input.addEventListener("change", () => setParameter(name, readParameter(input.value, p)));
    const remove = el("button", { type: "button", class: `${BUTTON} w-8`, "aria-label": `Supprimer ${name}` }, "✕");
    remove.addEventListener("click", () => void removeParameter(name));
    const shown = p.expression ? el("span", { class: "text-[11px] text-gray-500" }, `= ${Number(p.value.toFixed(4))} ${p.unit}`) : null;
    return el("div", { class: "space-y-0.5" }, el("div", { class: "grid grid-cols-[5rem_1fr_auto] items-center gap-1.5" }, el("span", { class: "truncate font-mono font-semibold", title: p.comment ?? name }, name), input, remove), shown, error ? el("p", { class: "text-red-600", role: "alert" }, error) : null);
  };

  const addRow = (): HTMLElement => {
    const name = el("input", { type: "text", class: `${INPUT} w-full font-mono`, placeholder: "nom (largeur)", "aria-label": "Nom du paramètre" });
    const value = el("input", { type: "text", class: `${INPUT} w-full text-right font-mono`, placeholder: "600 ou formule", "aria-label": "Valeur du nouveau paramètre" });
    for (const input of [name, value]) input.addEventListener("keydown", (event) => event.stopPropagation());
    const add = el("button", { type: "button", class: BUTTON }, "Ajouter");
    add.addEventListener("click", () => {
      const key = name.value.trim();
      const problem = nameProblem(key);
      if (problem) return editor.notify(problem, "error");
      if (key in editor.doc.parameters) return editor.notify(`« ${key} » existe déjà.`, "error");
      if (!value.value.trim()) return editor.notify("Donnez une valeur ou une formule.", "error");
      setParameter(key, readParameter(value.value));
    });
    return el("div", { class: "grid grid-cols-[1fr_1fr_auto] gap-1.5" }, name, value, add);
  };

  const configurationSection = (): HTMLElement[] => {
    const doc = editor.doc;
    const active = activeConfiguration(doc);
    const rows = configurationsOf(doc).map((c) => {
      const isActive = c.id === active;
      const apply = el("button", { type: "button", class: `${BUTTON} min-w-0 flex-1 truncate text-left ${isActive ? "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : ""}`, "aria-pressed": String(isActive), title: Object.entries(c.values).map(([n, v]) => `${n} = ${v}`).join(", ") || "Aucune valeur" }, c.name);
      apply.addEventListener("click", () => commit(applyConfiguration(editor.doc, c.id)));
      const update = el("button", { type: "button", class: `${BUTTON} w-8`, title: "Remplacer par les valeurs actuelles", "aria-label": `Mettre à jour ${c.name}` }, "↻");
      update.addEventListener("click", () => void editor.change(updateConfiguration(editor.doc, c.id)));
      const remove = el("button", { type: "button", class: `${BUTTON} w-8`, "aria-label": `Supprimer ${c.name}` }, "✕");
      remove.addEventListener("click", () => void editor.change(removeConfiguration(editor.doc, c.id)));
      return el("div", { class: "flex items-center gap-1.5" }, apply, update, remove);
    });
    const name = el("input", { type: "text", class: `${INPUT} w-full`, placeholder: "Grand 900", "aria-label": "Nom de la configuration" });
    name.addEventListener("keydown", (event) => event.stopPropagation());
    const save = el("button", { type: "button", class: BUTTON, disabled: !Object.keys(doc.parameters).length }, "Enregistrer");
    save.addEventListener("click", () => void editor.change(saveConfiguration(editor.doc, name.value).doc));
    return [
      ...(rows.length ? rows : [el("p", { class: "text-gray-500" }, "Aucune configuration. Enregistrez les valeurs actuelles pour revenir à cette variante d'un clic.")]),
      el("div", { class: "grid grid-cols-[1fr_auto] gap-1.5" }, name, save),
    ];
  };

  const linkSection = (values: Record<string, number>): HTMLElement[] => {
    const doc = editor.doc;
    const candidates = doc.features.filter((f) => f.type !== "sketch" && numericFields(f).length > 0);
    const links = doc.features.flatMap((f) => Object.entries(f.expressions ?? {}).map(([path, text]) => ({ f, path, text })));
    const feature = candidates.find((f) => f.id === draft.feature) ?? candidates[0];
    const fields = feature ? numericFields(feature) : [];
    const path = fields.find((x) => x.path === draft.path)?.path ?? fields[0]?.path ?? "";
    const rows = links.map(({ f, path: p, text }) => {
      const drop = el("button", { type: "button", class: `${BUTTON} w-8`, "aria-label": `Délier ${f.name} ${fieldLabel(p)}` }, "✕");
      drop.addEventListener("click", () => void editor.change(updateFeature(doc, f.id, (x) => unlink(x, p))));
      let shown = "";
      try {
        shown = ` = ${Number(evaluate(text, values).toFixed(4))}`;
      } catch {
        shown = " (erreur)";
      }
      return el("div", { class: "grid grid-cols-[1fr_auto] items-center gap-1.5" }, el("span", { class: "break-words" }, `${f.name} · ${fieldLabel(p)} : `, el("span", { class: "font-mono" }, text), shown), drop);
    });
    if (!feature) return [el("p", { class: "text-gray-500" }, "Aucune fonction avec des cotes à lier.")];
    const pick = el("select", { class: `${INPUT} w-full`, "aria-label": "Fonction à lier" }, ...candidates.map((f) => el("option", { value: f.id, selected: f.id === feature.id }, f.name)));
    pick.addEventListener("change", () => {
      draft.feature = pick.value;
      draft.path = "";
      render();
    });
    const field = el("select", { class: `${INPUT} w-full`, "aria-label": "Cote à lier" }, ...fields.map((x) => el("option", { value: x.path, selected: x.path === path }, `${fieldLabel(x.path)} (${Number(x.value.toFixed(3))})`)));
    field.addEventListener("change", () => {
      draft.path = field.value;
    });
    const formula = el("input", { type: "text", class: `${INPUT} w-full font-mono`, placeholder: "largeur - 2 * ep", "aria-label": "Formule" });
    formula.addEventListener("keydown", (event) => event.stopPropagation());
    const link = el("button", { type: "button", class: BUTTON }, "Lier");
    link.addEventListener("click", () => {
      const target = field.value;
      try {
        evaluate(formula.value, values);
      } catch (error) {
        return editor.notify(error instanceof Error ? error.message : String(error), "error");
      }
      draft.feature = pick.value;
      draft.path = target;
      commit(updateFeature(editor.doc, pick.value, (x) => ({ ...x, expressions: { ...x.expressions, [target]: formula.value.trim() } }) as Feature));
    });
    return [...rows, el("div", { class: "space-y-1.5 border-t border-gray-200 pt-2 dark:border-gray-700" }, pick, field, el("div", { class: "grid grid-cols-[1fr_auto] gap-1.5" }, formula, link))];
  };

  const render = (): void => {
    if (!panel) return;
    const { parameters } = editor.doc;
    const { values, errors } = resolveParameters(parameters);
    const names = Object.keys(parameters);
    panel.body.replaceChildren(
      ...(names.length ? names.map((n) => parameterRow(n, parameters[n] as Parameter, errors[n])) : [el("p", { class: "text-gray-500" }, "Aucun paramètre. Ajoutez-en un : la largeur, l'épaisseur des panneaux…")]),
      addRow(),
      el("h3", { class: "panel-title pt-1" }, "Configurations"),
      ...configurationSection(),
      el("h3", { class: "panel-title pt-1" }, "Liens avec les cotes"),
      ...linkSection(values),
      el("p", { class: "text-[11px] text-gray-500" }, "Formules : + − * / ^ ( ), pi, min(a; b), max, round, floor, ceil, sqrt. Les paramètres et formules sont en millimètres (1 cm = 10). Modifier un paramètre met à jour toutes les cotes liées."),
    );
  };

  const toggle = (): void => {
    if (panel) return panel.close();
    panel = floatingPanel(
      container,
      "Paramètres",
      () => {
        panel = null;
        button?.setAttribute("aria-pressed", "false");
      },
      true,
    );
    button?.setAttribute("aria-pressed", "true");
    render();
  };

  button?.addEventListener("click", toggle);
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    render();
  };
}

/** The feature without the formulas that name a parameter (its numbers stay as they are). */
function dropLinks(feature: Feature, name: string): Feature {
  if (!feature.expressions) return feature;
  const kept = Object.fromEntries(Object.entries(feature.expressions).filter(([, text]) => !namesIn(text).includes(name)));
  const { expressions: _old, ...rest } = feature;
  return (Object.keys(kept).length ? { ...rest, expressions: kept } : rest) as Feature;
}

function unlink(feature: Feature, path: string): Feature {
  const { [path]: _gone, ...rest } = feature.expressions ?? {};
  const { expressions: _old, ...others } = feature;
  return (Object.keys(rest).length ? { ...others, expressions: rest } : others) as Feature;
}
