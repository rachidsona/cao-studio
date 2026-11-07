/**
 * « Modules à glisser » : la liste des modules (document/dressing-modules.ts) ; on en glisse un dans une niche d'une
 * Répartition, la niche visée s'allume en orange, et le module s'y pose à ses cotes usuelles, en une annulation. Ce qui
 * ne rentre pas le dit sans rien changer. On le règle ensuite d'un clic avec l'outil Module.
 */
import * as THREE from "three";
import { MODULES, moduleEquipment, moduleLayout, moduleSizes, withModules, type ModuleKind } from "../document/dressing-modules";
import { moduleOfNiche } from "../document/module-edit";
import { findFeature } from "../document/operations";
import type { SketchFeature } from "../document/types";
import { nicheGeometry } from "../features/niche-parts";
import { frameOf, toWorld } from "../sketcher/frame";
import { isPartition } from "../sketcher/partition-history";
import { placePanel } from "../ui/dock";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { moduleChoice } from "./module-list";
import { nicheUnderPointer, type PickedNiche } from "./niche-pick";

const GLOW = 0xf8500a;

const partitionOf = (sketch: SketchFeature, id: string) => {
  const record = sketch.offsets?.find((r) => r.id === id);
  return record && isPartition(record) ? record : undefined;
};

/** The module in this niche as one undo step, or why not. */
function drop(editor: Editor, kind: ModuleKind, niche: PickedNiche): void {
  const sketch = findFeature(editor.doc, niche.sketch);
  const record = sketch?.type === "sketch" ? partitionOf(sketch, niche.partition) : undefined;
  if (sketch?.type !== "sketch" || !record) return editor.notify("Cette répartition n'existe plus.", "error");
  if (moduleOfNiche(editor.doc, sketch, niche.partition, niche.path)) return editor.notify("Cette niche a déjà son module : ouvrez l'outil Module pour le changer.", "error");
  const sizes = moduleSizes(kind);
  const { thickness } = record.step.input;
  const layout = moduleLayout(niche.box, niche.path, kind, thickness, sizes);
  const geometry = nicheGeometry({ partition: niche.partition, niche: niche.path }, sketch);
  const problem = typeof layout === "string" ? layout : typeof geometry === "string" ? geometry : moduleEquipment(geometry, layout, sizes).problem;
  if (problem) return editor.notify(problem, "error");
  const made = withModules(editor.doc, niche.sketch, [niche], kind, thickness, sizes);
  if (typeof made === "string") return editor.notify(made, "error");
  void editor.change(made).then(() => editor.notify(`Niche équipée : ${MODULES[kind].label.toLowerCase()}.`, "success"));
}

export function bindModulePalette(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: HTMLElement | null = null;
  let dragged: ModuleKind | null = null;

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

  const close = () => {
    panel?.remove();
    panel = null;
  };
  const open = () => {
    if (panel) return close();
    const list = el(
      "ul",
      { class: "divide-y divide-gray-200 border border-gray-200 dark:divide-gray-700 dark:border-gray-700", "aria-label": "Modules à glisser" },
      ...(Object.keys(MODULES) as ModuleKind[]).map((kind) => {
        const row = moduleChoice(MODULES[kind].label, kind, false, () => editor.notify("Glissez ce module dans une niche de la vue.", "info"));
        const button = row.querySelector("button") as HTMLElement;
        button.draggable = true;
        button.classList.add("cursor-grab");
        button.addEventListener("dragstart", (event) => {
          dragged = kind;
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
    const end = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Terminer");
    end.addEventListener("click", close);
    panel = el(
      "div",
      { class: "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Modules à glisser" },
      el("h2", { class: "panel-title" }, "Modules à glisser"),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, "Glissez un module dans une niche de la vue. Vous le réglez ensuite avec l'outil Module."),
      list,
      end,
    );
    placePanel(container, panel);
  };
  root.querySelector('[data-workshop="module-palette"]')?.addEventListener("click", open);

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
    const niche = nicheUnderPointer(viewport, editor.doc, event);
    light(null);
    if (niche) drop(editor, dragged, niche);
    else editor.notify("Lâchez le module dans une niche d'une répartition.", "info");
  });
}
