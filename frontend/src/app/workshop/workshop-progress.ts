/**
 * « Suivi d'atelier » : où en est chaque pièce — débitée, chantée, percée, montée. Le QR code des étiquettes et des
 * fiches ouvre sur un téléphone la page de la pièce (/atelier/<projet>/?piece=…), où un bouton la fait avancer ; ce
 * panneau de l'Atelier montre l'avancement de tout le projet (une barre par étape), et chaque pièce se règle aussi à la
 * main. Gardé par le serveur (/api/projects/<id>/workshop/).
 */
import { cutList } from "../../document/cut-list";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { call } from "./sharing";
import { partsOf } from "./workshop";
import { floatingPanel } from "./workshop-ui";

const SELECT = "h-7 w-28 shrink-0 border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";

/** The id of the project open in the editor (from its address). */
const projectId = () => location.pathname.match(/\/projects\/([0-9a-f-]+)\//)?.[1] ?? "";

/** The page a piece's QR code opens: its step in the workshop, to move on with a tap. */
export function pieceUrl(name: string): string {
  return `${location.origin}/atelier/${projectId()}/?piece=${encodeURIComponent(name)}`;
}

interface Progress {
  steps: [string, string][];
  parts: Record<string, { step: string; updated_at: string }>;
}

export function bindProgress(root: HTMLElement, viewport: Viewport, editor: Editor, apiUrl: string): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="progress"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const url = `${apiUrl}workshop/`;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let data: Progress = { steps: [], parts: {} };

  const render = () => {
    if (!panel) return;
    const names = cutList(editor.doc, partsOf(viewport, editor.doc)).rows.flatMap((r) => r.names);
    const keys = data.steps.map(([k]) => k);
    const reached = (name: string, key: string) => {
      const at = keys.indexOf(data.parts[name]?.step ?? "");
      return at >= 0 && at >= keys.indexOf(key);
    };
    const bars = data.steps.map(([key, label]) => {
      const n = names.filter((name) => reached(name, key)).length;
      const share = names.length ? Math.round((100 * n) / names.length) : 0;
      return el(
        "div",
        { class: "space-y-0.5" },
        el("div", { class: "flex justify-between" }, el("span", {}, label), el("span", { class: "text-gray-500" }, `${n} / ${names.length}`)),
        el("div", { class: "h-2 bg-gray-200 dark:bg-gray-700" }, el("div", { class: "h-2 bg-emerald-500", style: `width:${share}%` })),
      );
    });
    const rows = names.map((name) => {
      const select = el("select", { class: SELECT, "aria-label": `Étape de ${name}` }, el("option", { value: "" }, "—"), ...data.steps.map(([key, label]) => el("option", { value: key, selected: data.parts[name]?.step === key }, label)));
      select.addEventListener("change", () => void set(name, select.value));
      return el("div", { class: "flex items-center gap-2" }, el("span", { class: "min-w-0 flex-1 truncate", title: name }, name), select);
    });
    const refresh = el("button", { type: "button", class: "h-7 border border-gray-300 px-2 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Actualiser");
    refresh.addEventListener("click", () => void load());
    panel.body.replaceChildren(
      el("p", { class: "text-gray-600 dark:text-gray-300" }, "Le QR code des étiquettes et des fiches ouvre la page de la pièce sur un téléphone (connecté à votre compte) : un bouton la fait passer à l'étape suivante."),
      ...bars,
      el("div", { class: "flex items-center justify-between pt-1" }, el("h3", { class: "panel-title" }, `Pièces (${names.length})`), refresh),
      ...rows,
    );
  };

  const load = async () => {
    try {
      data = await call<Progress>(url);
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
    render();
  };

  const set = async (part: string, step: string) => {
    try {
      const saved = await call<{ step: string; updated_at: string | null }>(url, { method: "POST", body: JSON.stringify({ part, step }) });
      if (saved.step) data.parts[part] = { step: saved.step, updated_at: saved.updated_at ?? "" };
      else delete data.parts[part];
      render();
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Suivi d'atelier", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
    void load();
  });
  // The pieces follow the model (and its first computation, when the panel is opened early).
  editor.afterRender(() => {
    if (panel && !panel.body.contains(document.activeElement)) render();
  });
}
