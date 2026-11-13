/**
 * « Modules à glisser » : la liste des modules (document/dressing-modules.ts) ; on en glisse un dans une niche d'une
 * Répartition, la niche visée s'allume en orange, et le module s'y pose, en une annulation. Ce qui ne rentre pas le dit
 * sans rien changer ; une niche vide le prend, même dans un module posé (une colonne d'étagères), une niche qui a déjà
 * une tringle ou des tiroirs non.
 * Au bas du panneau, ses réglages (module-options.ts) : ceux du module choisi dans la liste, qui servent au prochain
 * qu'on glisse ; puis, sitôt un module posé — ou un module posé cliqué dans la vue —, les siens : chaque réglage changé
 * le refait sur place, en une annulation (document/module-edit.ts), et « Retirer ce module » libère sa niche.
 */
import * as THREE from "three";
import { MODULES, moduleEquipment, moduleLayout, moduleSizes, withModules, type ModuleKind, type ModuleSizes } from "../../document/dressing-modules";
import { moduleAt, moduleOfNiche, withModuleChanged, withoutModule, type PlacedModule } from "../../document/module-edit";
import { findFeature } from "../../document/operations";
import type { SketchFeature } from "../../document/types";
import { nicheGeometry } from "../../features/niche-parts";
import { formatLength } from "../../measurements/units";
import { frameOf, toWorld } from "../../sketcher/frame";
import { isPartition } from "../../sketcher/partition-history";
import type { NicheBox } from "../../sketcher/shelves";
import { placePanel } from "../../ui/dock";
import { el } from "../../ui/dom";
import { panelHeader } from "../../ui/panel-close";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { moduleChoice } from "./module-list";
import { moduleOptionRows, SMALL } from "./module-options";
import { nicheUnderPointer, type PickedNiche } from "./niche-pick";

const GLOW = 0xf8500a;
const PRESSED = ["bg-sky-100", "font-semibold", "dark:bg-sky-900"];

const partitionOf = (sketch: SketchFeature, id: string) => {
  const record = sketch.offsets?.find((r) => r.id === id);
  return record && isPartition(record) ? record : undefined;
};

/** Why this module, at these sizes, does not fit this niche; null when it does. */
function misfit(sketch: SketchFeature, niche: { partition: string; path: number[]; box: NicheBox }, kind: ModuleKind, thickness: number, sizes: ModuleSizes): string | null {
  const layout = moduleLayout(niche.box, niche.path, kind, thickness, sizes);
  if (typeof layout === "string") return layout;
  const geometry = nicheGeometry({ partition: niche.partition, niche: niche.path }, sketch);
  return typeof geometry === "string" ? geometry : moduleEquipment(geometry, layout, sizes).problem;
}

/** The module in this niche as one undo step (then `done`), or why not. */
function drop(editor: Editor, kind: ModuleKind, sizes: ModuleSizes, niche: PickedNiche, done: () => void): void {
  const sketch = findFeature(editor.doc, niche.sketch);
  const record = sketch?.type === "sketch" ? partitionOf(sketch, niche.partition) : undefined;
  if (sketch?.type !== "sketch" || !record) return editor.notify("Cette répartition n'existe plus.", "error");
  // An empty niche takes the module, even inside one placed (a column of shelves, a hat over a rod); a niche that
  // holds a rod or drawers is already equipped.
  const key = niche.path.join(".");
  const held = editor.doc.features.some((f) => f.type === "niche" && f.sketch === niche.sketch && f.partition === niche.partition && (f.fill === "rod" || f.fill === "drawers") && f.niche.join(".") === key);
  if (held) return editor.notify(moduleOfNiche(editor.doc, sketch, niche.partition, niche.path) ? "Cette niche a déjà son module : cliquez-le pour le régler au bas de ce panneau." : "Cette niche est déjà équipée : retirez d'abord ce qu'elle a.", "error");
  const { thickness } = record.step.input;
  const problem = misfit(sketch, niche, kind, thickness, sizes);
  if (problem) return editor.notify(problem, "error");
  const made = withModules(editor.doc, niche.sketch, [niche], kind, thickness, sizes);
  if (typeof made === "string") return editor.notify(made, "error");
  void editor.change(made).then(() => {
    editor.notify(`Niche équipée : ${MODULES[kind].label.toLowerCase()}.`, "success");
    done();
  });
}

export function bindModulePalette(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: HTMLElement | null = null;
  let list: HTMLElement | null = null;
  /** The bottom of the panel: the settings of a module. */
  let options: HTMLElement | null = null;
  let dragged: ModuleKind | null = null;
  /** The module of the list whose settings show: the next one dragged is laid at these sizes. */
  const next: { kind: ModuleKind; sizes: ModuleSizes } = { kind: "long", sizes: moduleSizes("long") };
  /** The module laid last, or clicked in the view: its settings show instead, and change it where it is. */
  let followed: { sketch: string; partition: string; path: number[] } | null = null;

  const glow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.35, depthTest: false }));
  glow.visible = false;
  glow.renderOrder = 46;
  viewport.scene.add(glow);
  /** The niche lit, as a block of the world. */
  const light = (niche: PickedNiche | null) => {
    const sketch = niche && findFeature(editor.doc, niche.sketch);
    const record = sketch?.type === "sketch" ? partitionOf(sketch, niche!.partition) : undefined;
    glow.visible = !!record;
    if (!niche || sketch?.type !== "sketch" || !record) return;
    const frame = frameOf(sketch);
    const front = new THREE.Vector3(...toWorld(frame, niche.box.x0, niche.box.y0));
    const back = new THREE.Vector3(...toWorld(frame, niche.box.x1, niche.box.y1)).addScaledVector(new THREE.Vector3(...frame.normal), record.step.depth ?? 0);
    const box = new THREE.Box3().setFromPoints([front, back]);
    box.getCenter(glow.position);
    box.getSize(glow.scale);
  };

  /** The module followed, as the document has it now; null once it is gone (an undo, its niche emptied). */
  const placed = (): { sketch: SketchFeature; module: PlacedModule } | null => {
    const sketch = followed && findFeature(editor.doc, followed.sketch);
    const module = sketch?.type === "sketch" ? moduleAt(editor.doc, sketch, followed!.partition, followed!.path) : null;
    return sketch?.type === "sketch" && module ? { sketch, module } : null;
  };

  /** The module whose settings show, marked in the list (in place: a row being dragged must stay). */
  const mark = (kind: ModuleKind) => {
    for (const button of list?.querySelectorAll<HTMLElement>("[data-module]") ?? []) {
      const on = button.dataset.module === kind;
      button.setAttribute("aria-pressed", String(on));
      for (const name of PRESSED) button.classList.toggle(name, on);
    }
  };

  const draw = () => {
    if (!options) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && options.contains(active)) return;
    const unit = editor.unit;
    const here = placed();
    if (!here) followed = null;
    const title = (text: string) => el("p", { class: "font-semibold text-gray-700 dark:text-gray-200", "data-module-options-title": "" }, text);
    const note = (text: string) => el("p", { class: "text-gray-600 dark:text-gray-300" }, text);
    if (!here) {
      mark(next.kind);
      const rows = moduleOptionRows({ kind: next.kind, sizes: next.sizes, unit, layout: null, levels: false, changed: draw, redraw: draw });
      options.dataset.moduleOptions = "next";
      options.replaceChildren(
        title(`Réglages : ${MODULES[next.kind].label}`),
        note("Ils servent au prochain module de ce type que vous glissez. Un module posé se règle ici ; cliquez-en un dans la vue pour le reprendre."),
        ...rows.filter((r): r is HTMLElement => r !== null),
      );
      return;
    }
    const { sketch, module } = here;
    mark(module.kind);
    // A copy to change: the document keeps its own until the change is made.
    const working = { sizes: structuredClone(module.sizes), thickness: module.thickness };
    const label = MODULES[module.kind].label;
    const change = () => {
      const made = misfit(sketch, module, module.kind, working.thickness, working.sizes) ?? withModuleChanged(editor.doc, sketch.id, module, module.kind, working.thickness, working.sizes);
      if (typeof made === "string") {
        editor.notify(made, "error");
        return draw();
      }
      void editor.change(made).then(() => editor.notify(`Module modifié : ${label.toLowerCase()}.`, "success"));
    };
    const layout = moduleLayout(module.box, module.path, module.kind, module.thickness, module.sizes);
    const rows = moduleOptionRows({
      kind: module.kind,
      sizes: working.sizes,
      unit,
      layout: typeof layout === "string" ? null : layout,
      levels: true,
      thickness: { value: working.thickness, set: (mm) => (working.thickness = mm) },
      changed: change,
      redraw: draw,
    });
    const remove = el("button", { type: "button", class: `${SMALL} w-full`, "data-module-remove": "" }, "Retirer ce module");
    remove.addEventListener("click", () => {
      followed = null;
      void editor.change(withoutModule(editor.doc, sketch.id, module)).then(() => editor.notify(`Module retiré : ${label.toLowerCase()}.`, "success"));
    });
    options.dataset.moduleOptions = "placed";
    options.replaceChildren(
      title(`Module posé : ${label}`),
      note(`Niche de ${formatLength(module.box.x1 - module.box.x0, unit)} × ${formatLength(module.box.y1 - module.box.y0, unit)}. Chaque réglage changé est enregistré aussitôt (Ctrl + Z l'annule).`),
      ...rows.filter((r): r is HTMLElement => r !== null),
      remove,
    );
  };

  /** A module of the list chosen: its usual sizes, for the next one dragged. */
  const choose = (kind: ModuleKind) => {
    if (kind !== next.kind) Object.assign(next, { kind, sizes: moduleSizes(kind) });
    followed = null;
    draw();
  };

  const close = () => {
    panel?.remove();
    panel = list = options = null;
  };
  const open = () => {
    if (panel) return close();
    list = el(
      "ul",
      { class: "divide-y divide-gray-200 border border-gray-200 dark:divide-gray-700 dark:border-gray-700", "aria-label": "Modules à glisser" },
      ...(Object.keys(MODULES) as ModuleKind[]).map((kind) => {
        const row = moduleChoice(MODULES[kind].label, kind, false, () => {
          choose(kind);
          editor.notify("Glissez ce module dans une niche de la vue.", "info");
        });
        const button = row.querySelector("button") as HTMLElement;
        button.draggable = true;
        button.classList.add("cursor-grab");
        button.addEventListener("dragstart", (event) => {
          dragged = kind;
          choose(kind);
          event.dataTransfer?.setData("text/plain", MODULES[kind].label);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
        });
        button.addEventListener("dragend", () => {
          dragged = null;
          light(null);
        });
        return row;
      }),
    );
    options = el("div", { class: "space-y-2 border-t border-gray-200 pt-2 dark:border-gray-700", role: "group", "aria-label": "Réglages du module" });
    options.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel = el(
      "div",
      {
        class: "absolute top-2 right-2 z-30 max-h-[calc(100%-1rem)] w-64 space-y-2 overflow-y-auto border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95",
        role: "dialog",
        "aria-label": "Modules à glisser",
      },
      panelHeader("Modules à glisser", close),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, "Glissez un module dans une niche de la vue. Ses réglages sont en bas : changez-les avant de le glisser, ou une fois posé."),
      list,
      options,
    );
    placePanel(container, panel);
    draw();
  };
  root.querySelector('[data-workshop="module-palette"]')?.addEventListener("click", open);
  // The document changed (an undo, another tool): the module followed is read again, or is gone.
  editor.afterRender(draw);

  container.addEventListener("dragover", (event) => {
    if (!dragged) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    light(nicheUnderPointer(viewport, editor.doc, event));
  });
  container.addEventListener("dragleave", () => light(null));
  container.addEventListener("drop", (event) => {
    if (!dragged) return;
    event.preventDefault();
    const kind = dragged;
    const niche = nicheUnderPointer(viewport, editor.doc, event);
    light(null);
    if (!niche) return editor.notify("Lâchez le module dans une niche d'une répartition.", "info");
    // Laid: it is the one whose settings show, to change it where it is.
    drop(editor, kind, structuredClone(kind === next.kind ? next.sizes : moduleSizes(kind)), niche, () => {
      followed = { sketch: niche.sketch, partition: niche.partition, path: niche.path };
      draw();
    });
  });

  // The palette open, a click (not a drag of the view) on a module placed takes it up: its settings show.
  const canvas = viewport.renderer.domElement;
  let pressed: [number, number] | null = null;
  canvas.addEventListener("pointerdown", (event) => (pressed = event.button === 0 ? [event.clientX, event.clientY] : null));
  canvas.addEventListener("pointerup", (event) => {
    const from = pressed;
    pressed = null;
    if (!panel || !from || Math.hypot(event.clientX - from[0], event.clientY - from[1]) > 5 || root.dataset.mode !== "model" || viewport.inSketch) return;
    const niche = nicheUnderPointer(viewport, editor.doc, event);
    const sketch = niche && findFeature(editor.doc, niche.sketch);
    const module = niche && sketch?.type === "sketch" ? moduleOfNiche(editor.doc, sketch, niche.partition, niche.path) : null;
    if (!niche || !module) return;
    followed = { sketch: niche.sketch, partition: module.partition, path: module.path };
    draw();
  });
}
