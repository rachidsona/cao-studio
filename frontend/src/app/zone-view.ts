/**
 * « Voir ce mur » : une zone du plan isolée pour y travailler tranquille. La vue se met de face, seuls ses corps et ses
 * cotes restent ; les esquisses et les autres murs disparaissent, et les outils de niche ne voient qu'elle. L'isolement
 * tient pendant le travail, jusqu'à « Tout montrer ». La vue seulement : rien ne change dans le projet.
 */
import * as THREE from "three";
import { bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type DressingPlan, type SketchFeature } from "../document/types";
import { el } from "../ui/dom";
import { frameOf } from "../sketcher/frame";
import type { SketchDrawing } from "../viewport/sketch-layer";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

let focus: { sketch: string; label: string; boards: Set<string>; bar: HTMLElement; dimsWereOff: boolean } | null = null;
let context: { viewport: Viewport; editor: Editor; drawSketches: (items: SketchDrawing[]) => void; sketches: SketchDrawing[] } | null = null;

/** The sketch of the zone isolated, or null. */
export const isolatedSketch = (): string | null => focus?.sketch ?? null;

function apply(): void {
  if (!focus || !context) return;
  const { viewport, editor } = context;
  const doc = editor.doc;
  if (!findFeature(doc, focus.sketch)) return showAll();
  for (const id of viewport.displayedBodies) {
    const feature = findFeature(doc, featureOfBody(bodyOrigin(doc, id)));
    viewport.setBodyVisible(id, !!feature && (focus.boards.has(feature.id) || ((feature.type === "extrude" || feature.type === "niche") && feature.sketch === focus.sketch)));
  }
}

/** Shows everything again. */
export function showAll(): void {
  if (!context) return;
  const { viewport, editor, drawSketches, sketches } = context;
  const was = focus;
  focus = null;
  was?.bar.remove();
  for (const id of viewport.displayedBodies) viewport.setBodyVisible(id, true);
  drawSketches(sketches);
  if (was?.dimsWereOff) document.querySelector<HTMLElement>("[data-piece-dims]")?.click();
  editor.render();
}

/** Isolates this zone of a plan, seen from the front. */
export function isolateZone(plan: DressingPlan, zoneId: string, label: string): void {
  const sketchId = plan.made?.[zoneId];
  if (!context || !sketchId) return;
  const { viewport, editor, drawSketches } = context;
  const sketch = findFeature(editor.doc, sketchId) as SketchFeature | undefined;
  if (!sketch) return;
  focus?.bar.remove();
  const bar = el("div", { class: "absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 border border-gray-200 bg-white/95 px-2 py-1 text-xs shadow dark:border-gray-700 dark:bg-gray-900/95", "data-zone-isolated": "" }, el("span", { class: "font-medium" }, `${label} isolé`));
  const back = el("button", { type: "button", class: "h-7 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Tout montrer");
  back.addEventListener("click", () => showAll());
  bar.append(back);
  (viewport.renderer.domElement.parentElement as HTMLElement).append(bar);
  const dims = document.querySelector<HTMLElement>("[data-piece-dims]");
  const dimsWereOff = focus?.dimsWereOff ?? dims?.getAttribute("aria-pressed") !== "true";
  focus = { sketch: sketchId, label, boards: new Set(plan.boards?.[zoneId] ?? []), bar, dimsWereOff };
  viewport.clearSelection();
  apply();
  drawSketches([]);
  if (dims?.getAttribute("aria-pressed") !== "true") dims?.click();
  const box = new THREE.Box3();
  for (const mesh of viewport.bodyMeshes()) if (mesh.visible) box.expandByObject(mesh);
  if (!box.isEmpty()) {
    const { camera, controls } = viewport.rig;
    const center = box.getCenter(new THREE.Vector3());
    camera.up.set(0, 0, 1);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(...frameOf(sketch).normal), 1000);
    viewport.fitBox(box, 1.15);
  }
  editor.render();
}

/** The isolation holds while the model changes and the sketches are drawn again. */
export function bindZoneView(viewport: Viewport, editor: Editor): void {
  const drawSketches = viewport.setSketchLines.bind(viewport);
  const here = { viewport, editor, drawSketches, sketches: [] as SketchDrawing[] };
  context = here;
  viewport.setSketchLines = (items) => {
    here.sketches = items;
    drawSketches(focus ? [] : items);
  };
  const setBodies = viewport.setBodies.bind(viewport);
  viewport.setBodies = (bodies) => {
    setBodies(bodies);
    apply();
  };
  const rendered = editor.onRender;
  editor.onRender = () => {
    rendered();
    apply();
  };
}
