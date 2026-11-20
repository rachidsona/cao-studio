/**
 * La barre contextuelle, en haut de la vue : selon ce qu'on vient de cliquer, seuls les outils utiles
 * (document/context-tools.ts). Un clic dans une niche propose ses outils, la niche déjà choisie ; une pièce, un caisson,
 * une répartition ou le plan proposent les boutons du ruban qui leur servent, même rangés. Ses outils se choisissent,
 * pour chaque sorte d'élément, une niche comprise (ui/context-tools-store.ts) : son « + » ouvre la liste de tous les outils (un clic ajoute
 * ou retire), un clic droit sur une icône la retire, « Par défaut » remet ceux proposés. Elle s'efface quand un outil
 * travaille, quand on clique dans le vide et à l'annulation.
 */
import { contextTools } from "../document/context-tools";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import { toolIcon } from "../ui/icons";
import { contextKeys, resetContextKeys, toggleContextKey } from "../ui/context-tools-store";
import { catalogue } from "../ui/tool-catalogue";
import { iconOf, openPicker, type Tool } from "../ui/tool-columns-picker";
import type { Viewport } from "../viewport/viewport";
import { openNicheFront } from "./dressing/door-fronts-tool";
import type { Editor } from "./editor";
import { NICHE_ACTIONS, runNiche } from "./dressing/niche-menu";
import { nicheUnderPointer, type PickedNiche } from "./dressing/niche-pick";

const BUTTON = "tool-btn icon-btn";

export function bindContextBar(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const canvas = viewport.renderer.domElement;
  const bar = el("div", {
    role: "toolbar",
    "aria-label": "Outils de la sélection",
    "data-context-bar": "",
    class: "absolute top-2 left-1/2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 border border-gray-200 bg-white/95 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-gray-800 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-100",
  });
  bar.hidden = true;
  bar.addEventListener("pointerdown", (event) => event.stopPropagation());
  container.append(bar);

  let niche: PickedNiche | null = null;
  const free = () => root.dataset.mode === "model" && !viewport.inSketch && !root.dataset.tool;
  const hide = () => {
    niche = null;
    bar.hidden = true;
  };
  const show = (title: string, buttons: HTMLElement[]) => {
    bar.replaceChildren(el("span", { class: "px-1" }, title), ...buttons);
    bar.hidden = buttons.length === 0;
  };
  const button = (label: string, icon: SVGElement | Node, go: () => void) => {
    const made = el("button", { type: "button", class: BUTTON, title: label, "aria-label": label }, icon);
    made.addEventListener("click", () => {
      hide();
      go();
    });
    return made;
  };

  /**
   * The bar of a sort of element: its chosen tools (`own`: those of its own, before the ribbon's), its « + » and
   * « Par défaut ». A right-click takes a tool out.
   */
  const choosable = (kind: string, title: string, defaults: readonly string[], own: Tool[] = []) => {
    const tools = [...own, ...catalogue(root)];
    const byKey = new Map(tools.map((t) => [t.key, t]));
    // A tool put away in a menu of the ribbon is not in the list of the bars: found by its key all the same.
    const stored = (key: string): Tool | undefined => {
      const [name, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      const found = name.startsWith("data-") ? root.querySelector<HTMLElement>(`[data-ribbon="model"] [${name}="${CSS.escape(value)}"]`) : null;
      return found ? { key, label: found.getAttribute("aria-label") ?? found.title.split(" : ")[0] ?? key, group: "Ruban", button: found } : undefined;
    };
    const icons = contextKeys(kind, defaults).flatMap((key) => {
      const tool = byKey.get(key) ?? stored(key);
      const icon = tool && iconOf(tool.button);
      if (!tool || !icon) return [];
      const made = button(tool.label, icon, () => tool.button.click());
      made.title = `${tool.label} — clic droit : la retirer de cette barre`;
      made.dataset.contextTool = key;
      made.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        toggleContextKey(kind, defaults, key);
        draw();
      });
      return [made];
    });
    const add = el("button", { type: "button", class: "tool-btn min-h-8 min-w-8 px-1 text-lg leading-none text-gray-500 dark:text-gray-400", title: `Choisir les outils de cette barre (${title})`, "aria-label": `Choisir les outils de la barre ${title}`, "aria-haspopup": "dialog", "data-context-add": kind }, "+");
    add.addEventListener("click", () => {
      openPicker(add, {
        column: 0,
        title: `Barre « ${title} » : choisir les outils`,
        tools,
        chosen: (key) => contextKeys(kind, defaults).includes(key),
        toggle: (key) => (toggleContextKey(kind, defaults, key), draw()),
      });
    });
    const reset = el("button", { type: "button", class: "px-1 text-3xs font-normal text-gray-500 underline-offset-2 hover:underline dark:text-gray-400", title: "Remettre les outils proposés pour cette sorte d'élément", "data-context-reset": kind }, "Par défaut");
    reset.addEventListener("click", () => (resetContextKeys(kind), draw()));
    return [...icons, add, reset];
  };

  /** A niche's own tools, opened on it (« niche:shelves »…), as tools of the picker: a hidden button stands for each. */
  const nicheTools = (picked: PickedNiche): Tool[] => {
    const own = (key: string, label: string, icon: string, go: () => void): Tool => {
      const stand = el("button", { type: "button", title: label }, toolIcon(icon, "tool-icon"));
      stand.addEventListener("click", go);
      return { key, label, group: "Niche", button: stand };
    };
    return [...NICHE_ACTIONS.map(({ action, label, icon }) => own(`niche:${action}`, label, icon, () => runNiche(editor, action, picked))), own("niche:front", "Façade de cette case", "i-fronts", () => openNicheFront(viewport, editor, picked))];
  };
  const NICHE_DEFAULTS = [...NICHE_ACTIONS.map(({ action }) => `niche:${action}`), "niche:front"];

  const draw = () => {
    if (!free()) return hide();
    if (niche) {
      const picked = niche;
      const size = (v: number) => formatLength(v, editor.unit);
      return show(`Niche ${size(picked.box.x1 - picked.box.x0)} × ${size(picked.box.y1 - picked.box.y0)}`, choosable("niche", "Niche", NICHE_DEFAULTS, nicheTools(picked)));
    }
    const { sketches, sketch, bodies } = editor.picked.selection;
    const chosen = contextTools(editor.doc, sketches.length ? sketches : sketch.slice(0, 1).map((s) => s.sketchId), bodies.length || !editor.picked.bodyId ? bodies : [editor.picked.bodyId]);
    if (!chosen) return void (bar.hidden = true);
    show(chosen.title, choosable(chosen.kind, chosen.title, chosen.tools));
  };
  const later = () => setTimeout(draw, 0);

  let pressed: [number, number] | null = null;
  canvas.addEventListener("pointerdown", (event) => {
    pressed = event.button === 0 ? [event.clientX, event.clientY] : null;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pressed || Math.hypot(event.clientX - pressed[0], event.clientY - pressed[1]) > 5 || !free()) return;
    niche = nicheUnderPointer(viewport, editor.doc, event);
    later();
  });
  const selected = viewport.onSelectionChange;
  viewport.onSelectionChange = (selection) => {
    selected(selection);
    later();
  };
  editor.afterRender(() => {
    niche = null;
    later();
  });
  new MutationObserver(later).observe(root, { attributes: true, attributeFilter: ["data-tool", "data-mode"] });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
}
