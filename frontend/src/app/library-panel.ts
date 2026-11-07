/**
 * « Ma bibliothèque » (groupe Menuiserie) : enregistrer les corps choisis — un caisson, un tiroir, une colonne réglés —
 * comme un module de son compte (avec une vignette prise dans la vue), puis le remettre d'un clic dans n'importe quel
 * projet, à l'endroit où il était, ses pièces sélectionnées pour le déplacer. Les modules sont gardés par le serveur
 * (/api/library/) ; leur contenu et l'insertion : document/library.ts.
 */
import { insertModule, moduleOf } from "../document/library";
import { featureOfBody, type CadDocument } from "../document/types";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { call } from "./sharing";
import { floatingPanel } from "./workshop-ui";

const URL = "/api/library/";
const BUTTON = "h-7 shrink-0 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

interface ModuleRow {
  id: number;
  name: string;
  thumbnail: string;
}

/** The view as a small JPEG (the drawing buffer is read right after a render). */
function thumbnail(viewport: Viewport): string {
  viewport.renderer.render(viewport.scene, viewport.camera);
  const source = viewport.renderer.domElement;
  const canvas = document.createElement("canvas");
  const scale = 220 / Math.max(source.width, source.height, 1);
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const g = canvas.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#f8fafc";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function bindLibrary(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>("[data-library]");
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let modules: ModuleRow[] = [];
  let message = "";

  /** The bodies chosen: picked whole, or through one of their faces, edges or corners; and the sketches. */
  const chosen = () => {
    const s = editor.picked.selection;
    return [...new Set([...s.bodies, ...s.faces.map((f) => f.bodyId), ...s.edges.map((e) => e.bodyId), ...s.vertices.map((v) => v.bodyId), ...s.sketches])];
  };

  const save = async (name: string) => {
    const module = moduleOf(editor.doc, chosen());
    if (typeof module === "string") return editor.notify(module, "info");
    try {
      await call(URL, { method: "POST", body: JSON.stringify({ name, document: module, thumbnail: thumbnail(viewport) }) });
      message = `« ${name} » est dans la bibliothèque (${module.features.length} fonction${module.features.length > 1 ? "s" : ""}).`;
      await load();
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const insert = async (row: ModuleRow) => {
    try {
      const { document } = await call<{ document: CadDocument }>(`${URL}${row.id}/`);
      const { doc, features } = insertModule(editor.doc, document);
      await editor.change(doc);
      // The view takes in all the model (the module may stand away from what was in view); its pieces are selected,
      // ready for Déplacer.
      viewport.setView("iso");
      viewport.clearSelection();
      for (const id of viewport.displayedBodies) if (features.includes(featureOfBody(id))) viewport.toggleInSelection("body", id);
      editor.notify(`« ${row.name} » inséré à l'endroit où il était enregistré ; ses pièces sont sélectionnées pour le déplacer.`, "success");
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const remove = async (row: ModuleRow) => {
    if (!window.confirm(`Supprimer « ${row.name} » de la bibliothèque ? Les projets où il a été inséré ne changent pas.`)) return;
    try {
      await call(`${URL}${row.id}/`, { method: "DELETE" });
      await load();
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const render = () => {
    if (!panel) return;
    const count = chosen().length;
    const name = el("input", { type: "text", maxlength: "120", placeholder: "Nom du module (Caisson bas 600…)", class: "h-8 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Nom du module" });
    const keep = el("button", { type: "button", class: BUTTON }, "Enregistrer");
    keep.disabled = count === 0;
    keep.addEventListener("click", () => {
      const text = name.value.trim();
      if (!text) return name.focus();
      void save(text);
    });
    const cards = modules.map((m) => {
      const put = el("button", { type: "button", class: BUTTON }, "Insérer");
      put.addEventListener("click", () => void insert(m));
      const drop = el("button", { type: "button", class: `${BUTTON} text-red-600`, "aria-label": `Supprimer ${m.name}` }, "✕");
      drop.addEventListener("click", () => void remove(m));
      return el(
        "div",
        { class: "flex items-center gap-2 border border-gray-200 p-1 dark:border-gray-700" },
        m.thumbnail ? el("img", { src: m.thumbnail, alt: "", class: "h-12 w-16 shrink-0 object-contain bg-gray-50" }) : el("div", { class: "h-12 w-16 shrink-0 bg-gray-100 dark:bg-gray-800" }),
        el("span", { class: "min-w-0 flex-1 truncate font-medium", title: m.name }, m.name),
        put,
        drop,
      );
    });
    panel.body.replaceChildren(
      el("p", { class: "text-gray-600 dark:text-gray-300" }, count ? `${count} élément${count > 1 ? "s" : ""} sélectionné${count > 1 ? "s" : ""} : donnez-lui un nom pour l'enregistrer, avec tout ce dont il dépend.` : "Sélectionnez les corps d'un caisson, d'un tiroir ou d'une colonne pour l'enregistrer comme module."),
      el("div", { class: "flex gap-1" }, name, keep),
      ...(message ? [el("p", { class: "bg-emerald-50 px-2 py-1 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" }, message)] : []),
      el("h3", { class: "panel-title pt-1" }, `Mes modules (${modules.length})`),
      ...(cards.length ? cards : [el("p", { class: "text-gray-500" }, "Aucun module pour l'instant.")]),
    );
  };

  const load = async () => {
    try {
      modules = (await call<{ modules: ModuleRow[] }>(URL)).modules;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    render();
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    message = "";
    panel = floatingPanel(container, "Ma bibliothèque", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
    void load();
  });
  // The count of the selection follows the clicks in the view.
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    if (panel && !panel.body.contains(document.activeElement)) render();
  };
}
