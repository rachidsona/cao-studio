/**
 * « Quincaillerie » de l'Atelier : choisir pour le projet la charnière, la coulisse et la poignée dans le catalogue
 * (document/hardware-catalog.ts). Le choix est gardé dans le document (une annulation) : les perçages des façades et
 * des portes prennent ses cotes, le devis et la notice son nom et son prix. Le panneau dit aussi, aussitôt, ce qui
 * ne va pas avec ce choix selon les règles des fabricants (document/maker-rules.ts : cuvette et épaisseur de porte,
 * largeur de porte, entraxe de poignée, charge des coulisses), chaque ligne avec « Voir » ; et toute la quincaillerie
 * du projet, comptée.
 */
import { chosenHardware, HANDLE_MODELS, HINGE_MODELS, modelName, SLIDE_MODELS } from "../../document/hardware-catalog";
import { modelHardware } from "../../document/hardware";
import { CONTENT_LOAD, projectMakerProblems } from "../../document/maker-rules";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { floatingPanel } from "./workshop-ui";

const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const money = (v: number) => v.toLocaleString("fr-FR", { style: "currency", currency: "MAD" });

export function bindHardwarePanel(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="hardware"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;

  const choose = (kind: "hinge" | "slide" | "handle", id: string, label: string) => {
    void Promise.resolve(editor.change({ ...editor.doc, hardware: { ...editor.doc.hardware, [kind]: id } })).then(refreshRules);
    editor.notify(`Quincaillerie : ${label}.`, "success");
  };

  /** What the makers' rules say of the project with this hardware, with « Voir » on each line. */
  const makerRules = (): HTMLElement => {
    const problems = projectMakerProblems(editor.doc);
    const see = (bodies: string[]) => {
      viewport.clearSelection();
      for (const id of bodies) viewport.toggleInSelection("body", id);
    };
    return el("div", { class: "space-y-1", "data-maker-rules": "" },
      el("h3", { class: "panel-title pt-1" }, `Règles des fabricants${problems.length ? ` (${problems.length})` : ""}`),
      ...(problems.length
        ? problems.map((p) => {
            const button = el("button", { type: "button", class: "tool-btn shrink-0 border border-gray-300 px-1.5 text-[11px] dark:border-gray-600" }, "Voir");
            button.addEventListener("click", () => see(p.bodies));
            return el("div", { class: `flex items-start gap-2 ${p.severity === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`, "data-maker-problem": p.severity }, el("p", { class: "min-w-0 flex-1" }, p.message), button);
          })
        : [el("p", { class: "text-emerald-700 dark:text-emerald-400" }, "Tout va avec ce choix : portes assez épaisses pour la cuvette, poignées qui tiennent sur leurs façades, coulisses assez fortes pour les tiroirs pleins.")]),
      el("p", { class: "text-[11px] text-gray-500" }, `Repères courants : ${CONTENT_LOAD} kg de contenu par m² de fond de tiroir, 3 mm de porte sous la cuvette, 600 mm au plus pour une porte battante. La fiche du fabricant fait foi.`));
  };
  /** Only the rules again (the lists keep their focus while one is being chosen). */
  const refreshRules = () => panel?.body.querySelector("[data-maker-rules]")?.replaceWith(makerRules());

  const render = () => {
    if (!panel) return;
    const choice = chosenHardware(editor.doc);
    const section = <T extends { id: string; label: string; reference?: string; price: number }>(title: string, kind: "hinge" | "slide" | "handle", list: T[], current: T, facts: (m: T) => string) => {
      const select = el("select", { class: SELECT, "aria-label": title }, ...list.map((m) => el("option", { value: m.id, selected: m.id === current.id }, modelName(m))));
      select.addEventListener("change", () => {
        const m = list.find((x) => x.id === select.value);
        if (m) choose(kind, m.id, modelName(m));
      });
      return el("div", { class: "space-y-1" }, el("h3", { class: "panel-title" }, title), select, el("p", { class: "text-gray-600 dark:text-gray-300" }, `${facts(current)} · ${money(current.price)} HT`));
    };
    const all = modelHardware(editor.doc);
    panel.body.replaceChildren(
      section("Charnières", "hinge", HINGE_MODELS, choice.hinge, (m) => `Cuvette Ø${m.cup.diameter} × ${m.cup.depth}, à ${m.cup.edge} mm du bord · ${m.opening}°${m.softClose ? " · amortie" : ""}`),
      section("Coulisses", "slide", SLIDE_MODELS, choice.slide, (m) => `${m.load} kg · ${m.full ? "sortie totale" : "sortie partielle"}${m.softClose ? " · amortie" : ""}`),
      section("Poignées", "handle", HANDLE_MODELS, choice.handle, (m) => (m.spacing ? `Entraxe ${m.spacing} mm, trous Ø${m.hole}` : `Un trou Ø${m.hole}`)),
      el("p", { class: "text-[11px] text-gray-500" }, "Les façades, portes et tiroirs sont percés aux cotes du modèle choisi ; un usinage « Charnières » déjà fait garde les siennes, un nouveau prend celles de la charnière choisie. Cotes courantes de chaque gamme : vérifiez la fiche du fabricant avant une série."),
      makerRules(),
      el("h3", { class: "panel-title pt-1" }, "Quincaillerie du projet"),
      ...(all.length ? all.map((h) => el("p", {}, `${h.name} : ${h.quantity}${h.unit ? ` ${h.unit}` : ""}`)) : [el("p", { class: "text-gray-500" }, "Aucune pour l'instant.")]),
    );
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Quincaillerie", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
  });
  editor.afterRender(() => {
    if (panel && !panel.body.contains(document.activeElement)) render();
    else refreshRules();
  });
}
