/**
 * « Standards » de l'Atelier : choisir comment le projet est construit (document/standards.ts) — un des modèles
 * fournis, un de ceux de l'atelier (enregistrés dans ce navigateur) ou le sien —, le régler, et l'appliquer d'un
 * coup à tous les caissons qui le suivent, avec leurs façades, matières et chants (une annulation). Le panneau dit
 * aussi quels caissons ne le suivent plus (retouchés à la main), pour les remettre d'accord. Un caisson peut suivre
 * un autre standard, ou aucun : outil Caisson, ligne « Standard ».
 */
import { EDGE_BANDS, MATERIALS } from "../../document/materials";
import { STANDARDS, applyStandards, drift, findStandard, setProjectStandard, standardProblem, type ConstructionStandard } from "../../document/standards";
import type { CabinetFeature } from "../../document/types";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { floatingPanel } from "./workshop-ui";

const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const INPUT = "h-8 w-20 border border-gray-300 bg-white px-2 text-right text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const KEY = "cao.workshop-standards";

/** The standards of the workshop, kept in this browser (as the quote's rates). */
export function workshopStandards(): ConstructionStandard[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? (list as ConstructionStandard[]).filter((s) => s && typeof s.id === "string" && !standardProblem(s)) : [];
  } catch {
    return [];
  }
}

function saveWorkshop(list: ConstructionStandard[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Every standard one can choose: the project's own first, then the workshop's, then the built-in ones. */
export function allStandards(own: readonly ConstructionStandard[] = []): ConstructionStandard[] {
  const seen = new Set<string>();
  return [...own, ...workshopStandards(), ...STANDARDS].filter((s) => !seen.has(s.id) && seen.add(s.id));
}

export function bindStandardsPanel(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="standard"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;

  /** The project's standard changed: a built-in or workshop one becomes the project's own copy first. */
  const edit = (current: ConstructionStandard, patch: Partial<ConstructionStandard>) => {
    const own = editor.doc.standards?.some((s) => s.id === current.id);
    const next: ConstructionStandard = own ? { ...current, ...patch } : { ...current, ...patch, id: `std-${Date.now().toString(36)}`, name: `${current.name} (projet)` };
    const problem = standardProblem(next);
    if (problem) return editor.notify(problem, "error");
    void editor.change(setProjectStandard(editor.doc, next));
  };

  const render = () => {
    if (!panel) return;
    const doc = editor.doc;
    const workshop = workshopStandards();
    const current = findStandard(doc, doc.standard, workshop);
    const choose = el("select", { class: SELECT, "aria-label": "Standard du projet" }, el("option", { value: "" }, "Aucun (chaque caisson réglé à la main)"), ...allStandards(doc.standards).map((s) => el("option", { value: s.id, selected: s.id === current?.id }, s.name)));
    choose.addEventListener("change", () => void editor.change(setProjectStandard(editor.doc, allStandards(editor.doc.standards).find((s) => s.id === choose.value) ?? null)));
    const cabinets = doc.features.filter((f): f is CabinetFeature => f.type === "cabinet" && !f.suppressed);
    if (!current) {
      panel.body.replaceChildren(
        choose,
        el("p", { class: "text-gray-600 dark:text-gray-300" }, "Un standard dit comment le projet est construit : épaisseurs, fond, façades, matières, chants et assemblage. Les caissons le suivent ; le changer les reconstruit tous d'un coup."),
      );
      return;
    }
    const number = (label: string, key: keyof ConstructionStandard, unit = "mm", optional = false) => {
      const value = current[key] as number | undefined;
      const input = el("input", { type: "number", step: "any", min: "0", class: INPUT, value: value === undefined ? "" : String(value), placeholder: optional ? "libre" : "", "aria-label": label });
      input.addEventListener("keydown", (e) => e.stopPropagation());
      input.addEventListener("change", () => {
        if (optional && input.value === "") {
          const { [key]: _drop, ...rest } = current;
          return edit(rest as ConstructionStandard, {});
        }
        const v = Number(input.value);
        if (Number.isFinite(v)) edit(current, { [key]: v });
      });
      return el("label", { class: "flex items-center justify-between gap-2" }, el("span", {}, label), el("span", { class: "flex items-center gap-1" }, input, el("span", { class: "w-7 text-gray-500" }, unit)));
    };
    const pick = <K extends keyof ConstructionStandard>(label: string, key: K, options: [string, string][]) => {
      const select = el("select", { class: SELECT, "aria-label": label }, ...options.map(([v, t]) => el("option", { value: v, selected: String(current[key] ?? "") === v }, t)));
      select.addEventListener("change", () => {
        if (select.value === "") {
          const { [key]: _drop, ...rest } = current;
          return edit(rest as ConstructionStandard, {});
        }
        edit(current, { [key]: (["band"].includes(key as string) ? Number(select.value) : select.value) as ConstructionStandard[K] });
      });
      return el("label", { class: "grid gap-0.5" }, el("span", { class: "text-gray-500" }, label), select);
    };
    const materials: [string, string][] = [["", "Laissée telle quelle"], ...MATERIALS.map((m): [string, string] => [m.id, m.name])];
    const name = el("input", { type: "text", class: `${SELECT}`, value: current.name, maxlength: "80", "aria-label": "Nom du standard" });
    name.addEventListener("keydown", (e) => e.stopPropagation());
    name.addEventListener("change", () => name.value.trim() && edit(current, { name: name.value.trim() }));

    const following = cabinets.filter((c) => c.standard !== "none" && findStandard(doc, c.standard ?? doc.standard, workshop));
    const off = new Set(drift(doc, workshop));
    const { impact } = applyStandards(doc, workshop);
    const changes = impact.cabinets.length + impact.fronts.length + impact.parts;
    const apply = el("button", { type: "button", class: "h-9 w-full btn-accent px-3 text-sm font-medium", disabled: !changes }, changes ? `Appliquer : ${impact.cabinets.length} caisson(s), ${impact.fronts.length} façade(s), ${impact.parts} pièce(s)` : "Tout suit déjà le standard");
    apply.addEventListener("click", () => {
      const { doc: next, impact: done } = applyStandards(editor.doc, workshopStandards());
      void editor.change(next);
      editor.notify(`Standard appliqué : ${done.cabinets.length} caisson(s) reconstruit(s), ${done.parts} pièce(s) rhabillée(s).`, "success");
    });
    const keep = el("button", { type: "button", class: BUTTON }, "Enregistrer dans l'atelier");
    keep.addEventListener("click", () => {
      const copy = { ...current, id: current.id.startsWith("std-") || STANDARDS.some((s) => s.id === current.id) ? `atelier-${Date.now().toString(36)}` : current.id };
      const ok = saveWorkshop([...workshopStandards().filter((s) => s.name !== copy.name), copy]);
      editor.notify(ok ? `« ${copy.name} » est dans les standards de l'atelier (ce navigateur).` : "Impossible d'enregistrer dans ce navigateur.", ok ? "success" : "error");
      render();
    });
    panel.body.replaceChildren(
      choose,
      name,
      el("div", { class: "grid gap-y-1.5" },
        number("Épaisseur du caisson", "thickness"),
        number("Épaisseur du fond", "backThickness"),
        number("Hauteur du socle", "plinth", "mm", true),
        number("Épaisseur des façades", "frontThickness"),
        number("Jeu des façades", "frontGap"),
        number("Entraxe de l'assemblage", "jointSpacing"),
        number("Déduire les chants dès", "bandTrim"),
      ),
      el("div", { class: "grid grid-cols-2 gap-x-3 gap-y-1.5" },
        pick("Fond", "back", [["applied", "Vissé derrière"], ["inset", "Encastré (rainuré)"], ["none", "Sans fond"]]),
        pick("Construction", "construction", [["sides-through", "Côtés toute hauteur"], ["top-bottom-through", "Dessus et dessous toute largeur"]]),
        pick("Façades", "frontMount", [["overlay", "En applique"], ["inset", "Rentrées"]]),
        pick("Assemblage", "joint", [["confirmat", "Confirmat"], ["dowel", "Tourillons"], ["minifix", "Excentriques Minifix"]]),
        el("label", { class: "grid gap-0.5" }, el("span", { class: "text-gray-500" }, "Perçage des assemblages"), (() => {
          const select = el("select", { class: SELECT, "aria-label": "Perçage des assemblages", "data-auto-joints": "" }, el("option", { value: "1", selected: current.autoJoints === true }, "Automatique"), el("option", { value: "", selected: current.autoJoints !== true }, "À la main (Règles d'assemblage)"));
          select.addEventListener("change", () => edit(current, { autoJoints: select.value === "1" }));
          return select;
        })()),
        pick("Chant visible", "band", [["0", "Aucun"], ...EDGE_BANDS.map((b): [string, string] => [String(b), `${b} mm`])]),
        pick("Caisson en", "carcass", materials),
        pick("Façades en", "fronts", materials),
        pick("Fonds en", "backs", materials),
      ),
      el("p", { class: "text-[11px] text-gray-500" }, "Les chants au moins aussi épais que « Déduire les chants dès » sont retirés de la cote de coupe, les plus fins non. Socle vide : chaque caisson garde le sien. Perçage automatique : chaque caisson qui suit le standard est percé de ses confirmats, tourillons ou excentriques à chaque jonction, refaits à chaque changement de cote et comptés au devis."),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, `${following.length} caisson(s) sur ${cabinets.length} suivent un standard${off.size ? ` ; ne le suivent plus : ${cabinets.filter((c) => off.has(c.id)).map((c) => c.name).join(", ")}` : ""}.`),
      apply,
      keep,
    );
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Standard de construction", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
  });
  editor.afterRender(() => {
    if (panel && !panel.body.contains(document.activeElement)) render();
  });
}
