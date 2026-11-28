/**
 * Déplacer un caisson d'un geste : quand les pièces d'un seul caisson sont sélectionnées, deux poignées s'affichent
 * dans la barre du bas de la vue, avec ses cotes (app/cabinet-bar.ts). « ✥ » se tire : le caisson glisse le long de son mur (Maj : librement sur le sol), avec ses façades,
 * et s'arrête au ras des autres corps — contre le côté d'un voisin, dans l'alignement de son fond ou de sa façade,
 * au bout du plan de travail, contre un mur, au milieu de la place libre entre ses voisins (la barre dit ce qui reste de chaque côté). Il n'entre jamais dans un autre meuble : amené dedans, il est posé à côté
 * de lui, au ras, du côté le plus proche (features/box-clear.ts) — ce qu'il touchait déjà (la plinthe sous lui, la
 * crédence derrière) ne le gêne pas ; il ne traverse pas non plus un mur de la Pièce (document/cabinet-clear.ts) (Alt : sans aimant ni arrêt, pour le poser où l'on veut). Un clic sur « ✥ » sans tirer le colle à une face ou
 * un coin qu'on clique ensuite (app/cabinet-stick.ts). « ↔ » se tire pour changer sa largeur par son bout, l'autre restant en place. « ↻ » le tourne d'un quart de tour sur place. « ⧉ Dupliquer »
 * (Ctrl + D) en met une copie à côté — sur son linéaire quand le Plan de cuisine l'a fait
 * (document/unit-duplicate.ts) — et « ✕ » le supprime avec ses façades.
 * Le document ne change qu'au lâcher, une annulation ; Échap rend le caisson à sa place. Rien ne s'affiche pendant un
 * outil.
 */
import * as THREE from "three";
import { keepInRoom, roomKeepOuts, wallBody } from "../document/cabinet-clear";
import { cabinetAxes, slideCabinet, turnCabinet } from "../document/kitchen-catalog";
import { bodyOrigin, deleteFeatures, findFeature, updateFeature } from "../document/operations";
import { withCabinetDuplicated } from "../document/unit-duplicate";
import { featureOfBody, type CabinetFeature, type CadDocument, type Vec3 } from "../document/types";
import { clearOf } from "../features/box-clear";
import { alignBox, middleOfRoom, pulledEdge, roomAlong, type Box } from "../features/smart-align";
import { cabinetKeptClear } from "../document/cabinet-clear";
import { cabinetProblem } from "../features/cabinet-parts";
import { formatLength } from "../measurements/units";
import { SnapGuides } from "../viewport/snap-guides";
import type { Viewport } from "../viewport/viewport";
import { cabinetBar } from "./cabinet-bar";
import { around, bodyBox, stickCabinet } from "./cabinet-stick";
import { selectedCabinet } from "./drivers-3d";
import type { Editor } from "./editor";

/** How near (px) a face of the dragged cabinet sticks to a face of another body. */
const STICK_PX = 12;
/** How near (px) it holds in the middle of the free room along its wall. */
const MIDDLE_PX = 16;

/** The bodies of the cabinet and of its fronts, as displayed. */
export function cabinetBodies(doc: CadDocument, bodies: readonly string[], cabinetId: string): string[] {
  return bodies.filter((id) => {
    const f = findFeature(doc, featureOfBody(bodyOrigin(doc, id)));
    return f?.id === cabinetId || (f?.type === "fronts" && f.cabinet === cabinetId);
  });
}

interface Drag {
  cabinet: CabinetFeature;
  /** Slid along its wall, or its width pulled by its end (« ↔ »): then the width it would have. */
  width?: number;
  bodies: string[];
  box: Box;
  others: Box[];
  /** The others, and the walls with what lies behind them: it goes into none, through none. */
  solid: Box[];
  /** The height of the plane the pointer slides on, and where it was taken. */
  z: number;
  from: Vec3;
  delta: Vec3;
  /** Where the pointer went down on the grip (a click there, not a drag, sticks the cabinet to a face or corner). */
  screen: [number, number];
  /** From the pointer to the middle of the cabinet's top, on the screen. */
  offset: [number, number];
}

export function bindCabinetDrag(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const bar = cabinetBar(viewport);
  const guides = new SnapGuides(viewport.scene);
  let shown = "";
  let drag: Drag | null = null;
  /** The grip that slides (it says how far while dragged). */
  let slider: HTMLElement | null = null;
  /** The grip that pulls its width (it says the width while pulled). */
  let widener: HTMLElement | null = null;

  const clear = () => {
    bar.grips.replaceChildren();
    bar.refresh();
    shown = "";
    slider = null;
    widener = null;
  };

  const boxOf = (id: string) => bodyBox(viewport, id);
  /** The bodies a target body stands with: all its cabinet's, or itself alone. */
  const groupOf = (bodyId: string) => {
    const f = findFeature(editor.doc, featureOfBody(bodyOrigin(editor.doc, bodyId)));
    const cabinet = f?.type === "cabinet" ? f.id : f?.type === "fronts" ? f.cabinet : null;
    return cabinet ? cabinetBodies(editor.doc, viewport.displayedBodies, cabinet) : [bodyId];
  };

  /**
   * The pointer on the horizontal plane at this height (null when the view looks along it), shifted by `offset` px:
   * the grip is in the bar under the view, the cabinet follows the pointer as if it had been taken on its top.
   */
  const onPlane = (event: PointerEvent, z: number, offset: [number, number] = drag?.offset ?? [0, 0]): Vec3 | null => {
    const { origin, direction } = viewport.rayFromEvent({ clientX: event.clientX + offset[0], clientY: event.clientY + offset[1] } as PointerEvent);
    if (Math.abs(direction[2]) < 1e-6) return null;
    const t = (z - origin[2]) / direction[2];
    return t > 0 ? [origin[0] + direction[0] * t, origin[1] + direction[1] * t, z] : null;
  };

  const pose = (d: Drag | null, delta: Vec3 | null) => {
    for (const id of d?.bodies ?? []) viewport.setBodyPose(id, delta ? { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: delta } : null);
  };

  const move = (event: PointerEvent) => {
    if (!drag) return;
    const p = onPlane(event, drag.z);
    if (!p) return;
    if (drag.width !== undefined) return pull(drag, p, event.altKey);
    let delta: Vec3 = [p[0] - drag.from[0], p[1] - drag.from[1], 0];
    // Along its wall (its width), unless Maj frees it on the floor.
    if (!event.shiftKey) {
      const { along } = cabinetAxes(drag.cabinet.rotation ?? 0);
      const s = delta[0] * along[0] + delta[1] * along[1];
      delta = [along[0] * s, along[1] * s, 0];
    }
    const axes = event.shiftKey ? [0, 1] : [Math.abs(cabinetAxes(drag.cabinet.rotation ?? 0).along[0]) ? 0 : 1];
    let lines: [Vec3, Vec3][] = [];
    if (!event.altKey) ({ translate: delta, guides: lines } = alignBox(drag.box, drag.others, delta, axes, STICK_PX * viewport.worldPerPixel()));
    // Along its wall, it holds in the middle of the free room between its neighbours (as on the run's strip).
    const middle = event.altKey || event.shiftKey ? null : middleOfRoom(drag.box, drag.others, delta, axes[0]!, MIDDLE_PX * viewport.worldPerPixel());
    if (middle) ({ translate: delta, guides: lines } = middle);
    delta = delta.map(Math.round) as Vec3;
    // Never into another piece of furniture: beside it, flush (no place clear on its path: where it was).
    const clear = event.altKey ? delta : keepInRoom(editor.doc, drag.box, clearOf(drag.box, drag.solid, delta, axes) ?? [0, 0, 0]);
    if (clear && clear !== delta) lines = [];
    delta = clear ?? [0, 0, 0];
    drag.delta = delta;
    pose(drag, delta);
    guides.show(lines, viewport);
    const moved = Math.hypot(delta[0], delta[1]);
    // What stays free on each side of it, along its wall.
    const [lo, hi] = event.shiftKey ? [-Infinity, Infinity] : roomAlong(drag.box, drag.others, delta, axes[0]!);
    const sides = [drag.box[0][axes[0]!]! + delta[axes[0]!]! - lo, hi - drag.box[1][axes[0]!]! - delta[axes[0]!]!].filter(Number.isFinite).map((v) => formatLength(Math.max(0, v), editor.unit));
    if (slider) slider.textContent = `✥ ${formatLength(moved, editor.unit)}${sides.length === 2 ? ` — ${sides.join(" | ")}${middle ? " (milieu)" : ""}` : ""}`;
  };

  /** Its end pulled along its wall, from its other end: held on a neighbour's face, stopped before the next body. */
  const pull = (d: Drag, p: Vec3, free: boolean) => {
    const { along } = cabinetAxes(d.cabinet.rotation ?? 0);
    const axis = Math.abs(along[0]) ? 0 : 1;
    const sign = (along[axis] > 0 ? 1 : -1) as 1 | -1;
    const by = (p[0] - d.from[0]) * along[0] + (p[1] - d.from[1]) * along[1];
    const made = free ? { by, guides: [] } : pulledEdge(d.box, d.others, axis, sign, by, STICK_PX * viewport.worldPerPixel());
    d.width = Math.max(100, Math.round(d.cabinet.width + made.by));
    // Seen stretched from its other end, until it is let go.
    const s = d.width / d.cabinet.width;
    const fixed = sign > 0 ? d.box[0][axis]! : d.box[1][axis]!;
    const rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    rotation[axis * 4] = s;
    const translation: Vec3 = [0, 0, 0];
    translation[axis] = fixed * (1 - s);
    for (const id of d.bodies) viewport.setBodyPose(id, { rotation, translation });
    guides.show(made.guides, viewport);
    if (widener) widener.textContent = `↔ ${formatLength(d.width, editor.unit)}`;
  };

  /** The width let go: as typed in the bar (against a wall or a neighbour, slid flush or refused, document/cabinet-clear.ts). */
  const widen = async (cabinet: CabinetFeature, width: number) => {
    if (cabinet.expressions?.width?.trim()) return editor.notify(`Sa largeur suit la formule « ${cabinet.expressions.width} » : changez-la dans Atelier › Paramètres.`, "info");
    const next = { ...cabinet, width };
    const problem = cabinetProblem(next);
    if (problem) return editor.notify(problem, "error");
    const kept = cabinetKeptClear(editor.doc, next);
    if (typeof kept === "string") return editor.notify(kept, "error");
    await editor.change(updateFeature(editor.doc, cabinet.id, () => kept));
    editor.notify(`${cabinet.name} : largeur ${formatLength(width, editor.unit)}.`, "success");
  };

  const finish = async (apply: boolean, click = false) => {
    const d = drag;
    if (!d) return;
    drag = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("keydown", key, true);
    guides.clear();
    if (d.width !== undefined) {
      if (apply && Math.abs(d.width - d.cabinet.width) >= 1) await widen(d.cabinet, d.width);
      pose(d, null);
      return show(true);
    }
    if (apply && Math.hypot(d.delta[0], d.delta[1]) >= 1) {
      await editor.change(updateFeature(editor.doc, d.cabinet.id, (f) => (f.type === "cabinet" ? slideCabinet(f, d.delta) : f)));
      editor.notify(`${d.cabinet.name} déplacé de ${formatLength(Math.hypot(d.delta[0], d.delta[1]), editor.unit)}.`, "success");
    }
    pose(d, null);
    show(true);
    if (click) stickCabinet(viewport, editor, d.cabinet, d.bodies, groupOf, () => show(true));
  };
  const up = (event: PointerEvent) => void finish(true, !!drag && Math.hypot(event.clientX - drag.screen[0], event.clientY - drag.screen[1]) <= 4);
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    void finish(false);
  };

  const start = (cabinet: CabinetFeature, event: PointerEvent, widthPull = false) => {
    const bodies = cabinetBodies(editor.doc, viewport.displayedBodies, cabinet.id);
    const box = around(bodies.map(boxOf).filter((b): b is Box => !!b));
    if (!box) return;
    const own = new Set(bodies);
    const others = viewport.displayedBodies.filter((id) => !own.has(id)).map(boxOf).filter((b): b is Box => !!b);
    const z = box[1][2];
    const top = new THREE.Vector3((box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2, z).project(viewport.camera);
    const rect = viewport.renderer.domElement.getBoundingClientRect();
    const offset: [number, number] = [rect.left + ((top.x + 1) / 2) * rect.width - event.clientX, rect.top + ((1 - top.y) / 2) * rect.height - event.clientY];
    const from = onPlane(event, z, offset);
    if (!from) return;
    const wall = wallBody(editor.doc);
    const solid = viewport.displayedBodies.filter((id) => !own.has(id) && !wall(id)).map(boxOf).filter((b): b is Box => !!b);
    drag = { cabinet, bodies, box, others, solid: [...solid, ...roomKeepOuts(editor.doc)], z, from, delta: [0, 0, 0], screen: [event.clientX, event.clientY], offset, ...(widthPull ? { width: cabinet.width } : {}) };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key, true);
  };

  const grip = (text: string, title: string, label: string) => {
    const span = document.createElement("span");
    span.className = "cad-measure cad-grip";
    span.style.pointerEvents = "auto";
    span.textContent = text;
    span.title = title;
    span.setAttribute("aria-label", label);
    return span;
  };

  const show = (force = false) => {
    if (drag) return;
    const cabinet = root.dataset.tool ? null : selectedCabinet(editor);
    if (!cabinet) return clear();
    const stamp = JSON.stringify(cabinet);
    if (stamp === shown && !force) return;
    clear();
    shown = stamp;
    const slide = grip("✥ Déplacer", "Tirez pour faire glisser le caisson le long de son mur : il s'arrête à côté des autres meubles, jamais dedans (Maj : librement sur le sol, Alt : sans aimant ni arrêt, Échap : annuler) ; cliquez, puis cliquez une face ou un coin d'un autre meuble pour l'y coller", "Déplacer le caisson");
    slide.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      start(cabinet, event);
    });
    const turn = grip("↻", "Tourner le caisson d'un quart de tour sur place", "Tourner le caisson");
    turn.style.cursor = "pointer";
    turn.addEventListener("pointerdown", (event) => event.stopPropagation());
    turn.addEventListener("click", (event) => {
      event.stopPropagation();
      void editor.change(updateFeature(editor.doc, cabinet.id, (f) => (f.type === "cabinet" ? turnCabinet(f) : f)));
    });
    // A copy of it beside it (on its run, when the plan made it), and itself taken away.
    const act = (text: string, title: string, label: string, go: () => void) => {
      const g = grip(text, title, label);
      g.style.cursor = "pointer";
      g.addEventListener("pointerdown", (event) => event.stopPropagation());
      g.addEventListener("click", (event) => (event.stopPropagation(), go()));
      return g;
    };
    const copy = act("⧉ Dupliquer", "Une copie du caisson à côté de lui ; sur un linéaire du Plan de cuisine, juste après lui s'il y a la place (Ctrl + D)", "Dupliquer le caisson", () => duplicate(cabinet.id));
    const remove = act("✕", "Supprimer le caisson et ses façades ; sur un linéaire, sa place reste libre pour un autre meuble (Suppr)", "Supprimer le caisson", () => void editor.change(deleteFeatures(editor.doc, [cabinet.id]).next));
    const wide = grip("↔", "Tirez pour changer sa largeur par son bout, l'autre restant en place : il s'arrête contre un voisin ou s'aligne sur lui (Alt : sans aimant, Échap : annuler)", "Tirer la largeur du caisson");
    wide.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      start(cabinet, event, true);
    });
    bar.grips.replaceChildren(slide, wide, turn, copy, remove);
    bar.refresh();
    slider = slide;
    widener = wide;
  };

  const duplicate = (id: string) => {
    const made = withCabinetDuplicated(editor.doc, id);
    if (typeof made === "string") return editor.notify(made, "error");
    void editor.change(made.doc);
    editor.notify(made.note, "success");
  };
  // Ctrl + D on the cabinet selected (not while typing, nor in a tool, nor on the run's strip, which has its own).
  window.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "d" || root.dataset.tool || root.dataset.mode !== "model") return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable], [data-run-strip]")) return;
    const cabinet = selectedCabinet(editor);
    if (!cabinet) return;
    event.preventDefault();
    duplicate(cabinet.id);
  });

  editor.afterRender(() => {
    show();
  });
}
