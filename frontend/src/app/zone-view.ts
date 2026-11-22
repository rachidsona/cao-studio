/**
 * « Voir ce mur » : une zone du plan isolée pour y travailler tranquille. La vue se met de face, seuls ses corps
 * restent (ses cotes seulement si on allume « Cotes des pièces ») ; les esquisses et les autres murs disparaissent, et les outils de niche ne voient qu'elle. L'isolement
 * tient pendant le travail, jusqu'à « Tout montrer ». La vue seulement : rien ne change dans le projet. Un linéaire du
 * Plan de cuisine s'isole de même (`isolateFeatures`) : ce que le plan a fait pour lui, vu de face, avec ses cotes ; et
 * un caisson seul (`isolateSketch`), pour l'aménager, comme « Isoler » de Fusion ; et plusieurs éléments choisis à la
 * fois (`isolateElements` : « Isoler la sélection »), pour ne travailler que sur eux.
 */
import * as THREE from "three";
import { bodyOrigin, findFeature } from "../document/operations";
import type { CadDocument, DressingPlan, SketchFeature, Vec3 } from "../document/types";
import { staysInView, type Keep } from "./zone-members";
import { el } from "../ui/dom";
import { frameOf } from "../sketcher/frame";
import type { SketchDrawing } from "../viewport/sketch-layer";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { wholeOwner } from "./move-whole";
import { downloadViewPdf } from "./view-pdf";

interface Focus {
  sketch: string;
  label: string;
  keep: () => Keep;
  bar: HTMLElement;
  dimsWereOff: boolean;
  /** The Répartition the niche tools work in (a zone, a caisson alone), or null: several elements, each its own. */
  partition: string | null;
  /** Whether this sketch's Répartition is among what is isolated. */
  shows: (sketchId: string) => boolean;
  /** What is isolated is still there: when it is gone, everything is shown again. */
  alive: () => boolean;
}
let focus: Focus | null = null;
let context: { viewport: Viewport; editor: Editor; drawSketches: (items: SketchDrawing[]) => void; sketches: SketchDrawing[] } | null = null;

/** The sketch of the zone isolated (or the key of what is), or null: nothing isolated, or several elements. */
export const isolatedSketch = (): string | null => focus?.partition ?? null;
/** Something is isolated. */
export const isolating = (): boolean => focus !== null;
/** Whether the Répartition of this sketch is in view: nothing isolated, or it is part of what is. */
export const sketchShown = (sketchId: string): boolean => !focus || focus.shows(sketchId);
/** Told when something is isolated, or everything shown again. */
const told = () => document.dispatchEvent(new CustomEvent("cad:isolated"));

/** What a body is a piece of, as a key: its cabinet or the sketch it is made on (a Répartition), else the body itself. */
export function elementOf(doc: CadDocument, bodyId: string): string {
  const owner = wholeOwner(doc, bodyId);
  return owner ? `${owner.kind}:${owner.id}` : bodyOrigin(doc, bodyId);
}

function apply(): void {
  if (!focus || !context) return;
  const { viewport, editor } = context;
  if (!focus.alive()) return showAll();
  // The bodies shown are those of a tool's preview while it is open: they are read in it.
  const doc = editor.previewDoc ?? editor.doc;
  const keep = focus.keep();
  for (const id of viewport.displayedBodies) viewport.setBodyVisible(id, staysInView(doc, id, keep));
  // How many bodies are left in view, on its bar.
  focus.bar.dataset.shown = String(viewport.bodyMeshes().filter((m) => m.visible).length);
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
  told();
}

/** Isolates this zone of a plan, seen from the front. */
export function isolateZone(plan: DressingPlan, zoneId: string, label: string): void {
  const sketchId = plan.made?.[zoneId];
  if (!context || !sketchId) return;
  const sketch = findFeature(context.editor.doc, sketchId) as SketchFeature | undefined;
  if (!sketch) return;
  const boards = new Set(plan.boards?.[zoneId] ?? []);
  isolate(sketchId, label, () => (f) => boards.has(f.id) || ((f.type === "extrude" || f.type === "niche") && f.sketch === sketchId), frameOf(sketch).normal);
}

/** Isolates a caisson (a Répartition of its own, kitchen cabinet furnished by hand), seen from the front. */
export function isolateSketch(sketchId: string, label: string): void {
  const sketch = context && (findFeature(context.editor.doc, sketchId) as SketchFeature | undefined);
  if (!sketch) return;
  isolate(sketchId, label, () => (f) => (f.type === "extrude" || f.type === "niche") && f.sketch === sketchId, frameOf(sketch).normal);
}

/**
 * Isolates the features `ids` gives (read again at each change: a kitchen made again keeps its run isolated), while the
 * feature `key` exists, seen along `front` (towards the viewer); `frame`: the view set again.
 */
export function isolateFeatures(key: string, label: string, ids: () => ReadonlySet<string>, front: Vec3, frame = true): void {
  // Its own dimensions are drawn by whoever isolates it: the pieces' are left as they are.
  isolate(key, label, () => {
    const set = ids();
    return (f) => set.has(f.id);
  }, front, frame, false);
}

/**
 * Isolates several elements at once (« Isoler la sélection », app/isolate-selection.ts): their bodies only, by the
 * keys `elementOf` gives; what is made while they are isolated shows too, to work on them. The view keeps its way and
 * frames them; the niche tools work in each of their Répartitions.
 */
export function isolateElements(keys: ReadonlySet<string>, text: string): void {
  if (!context || !keys.size) return;
  const { viewport, editor } = context;
  const known = new Set(viewport.displayedBodies.map((id) => bodyOrigin(editor.doc, id)));
  const sketches = new Set([...keys].filter((k) => k.startsWith("sketch:")).map((k) => k.slice("sketch:".length)));
  const shown = () => context!.editor.previewDoc ?? context!.editor.doc;
  // A key is a whole element (a cabinet, a Répartition) or a piece of it alone (its body).
  const kept = (id: string) => keys.has(elementOf(shown(), id)) || keys.has(bodyOrigin(shown(), id));
  // A body made since (not known then, and in view) stays too — not a body a step has consumed since, hidden: the sides
  // split from it would all come back through it.
  isolate("selection", text, () => (_f, id) => kept(id) || (!known.has(bodyOrigin(shown(), id)) && viewport.displayedBodies.includes(id)), [0, -1, 0], false, false, {
    text,
    partition: keys.size === 1 && sketches.size === 1 ? [...sketches][0]! : null,
    shows: (id) => sketches.has(id),
    alive: () => viewport.displayedBodies.some(kept),
  });
  const box = new THREE.Box3();
  for (const mesh of viewport.bodyMeshes()) if (mesh.visible) box.expandByObject(mesh);
  if (!box.isEmpty()) viewport.fitBox(box, 1.15);
}

function isolate(key: string, label: string, keep: Focus["keep"], front: readonly number[], frame = true, pieceDims = false, more: Partial<Pick<Focus, "partition" | "shows" | "alive">> & { text?: string } = {}): void {
  if (!context) return;
  const { viewport, editor, drawSketches } = context;
  focus?.bar.remove();
  const bar = el("div", { class: "absolute bottom-2 left-1/2 z-20 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 whitespace-nowrap border border-gray-200 bg-white/95 px-2 py-1 text-xs shadow dark:border-gray-700 dark:bg-gray-900/95", "data-zone-isolated": "" }, el("span", { class: "font-medium" }, more.text ?? `${label} isolé`));
  const back = el("button", { type: "button", class: "h-7 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Tout montrer");
  back.addEventListener("click", () => showAll());
  // The view as it is framed, with its dimensions, on a page to print or send.
  const pdf = el("button", { type: "button", class: "h-7 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "La vue cadrée, avec ses cotes, sur une page A4 en PDF", "data-zone-pdf": "" }, "PDF");
  pdf.addEventListener("click", () => downloadViewPdf(viewport, more.text ?? `${label} isolé`, editor.unit));
  bar.append(back, pdf);
  (viewport.renderer.domElement.parentElement as HTMLElement).append(bar);
  const dims = document.querySelector<HTMLElement>("[data-piece-dims]");
  const dimsWereOff = pieceDims && (focus?.dimsWereOff ?? dims?.getAttribute("aria-pressed") !== "true");
  focus = { sketch: key, label, keep, bar, dimsWereOff, partition: "partition" in more ? more.partition ?? null : key, shows: more.shows ?? ((id) => id === key), alive: more.alive ?? (() => !!findFeature(context!.editor.doc, key)) };
  viewport.clearSelection();
  apply();
  drawSketches([]);
  if (pieceDims && dims?.getAttribute("aria-pressed") !== "true") dims?.click();
  const box = new THREE.Box3();
  for (const mesh of viewport.bodyMeshes()) if (mesh.visible) box.expandByObject(mesh);
  if (frame && !box.isEmpty()) {
    const { camera, controls } = viewport.rig;
    const center = box.getCenter(new THREE.Vector3());
    camera.up.set(0, 0, 1);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(front[0], front[1], front[2]), 1000);
    viewport.fitBox(box, 1.15);
  }
  editor.render();
  told();
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
  editor.afterRender(() => {
    apply();
  });
}
