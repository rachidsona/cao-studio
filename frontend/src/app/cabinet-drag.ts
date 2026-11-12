/**
 * Déplacer un caisson d'un geste : quand les pièces d'un seul caisson sont sélectionnées, deux poignées s'affichent
 * dans la barre du bas de la vue, avec ses cotes (app/cabinet-bar.ts). « ✥ » se tire : le caisson glisse le long de son mur (Maj : librement sur le sol), avec ses façades,
 * et s'arrête au ras des autres corps — contre le côté d'un voisin, dans l'alignement de son fond ou de sa façade,
 * au bout du plan de travail, contre un mur (Alt : sans aimant). Un clic sur « ✥ » sans tirer le colle à une face ou
 * un coin qu'on clique ensuite (app/cabinet-stick.ts). « ↻ » le tourne d'un quart de tour sur place. « ⧉ Dupliquer »
 * (Ctrl + D) en met une copie à côté — sur son linéaire quand le Plan de cuisine l'a fait
 * (document/unit-duplicate.ts) — et « ✕ » le supprime avec ses façades.
 * Le document ne change qu'au lâcher, une annulation ; Échap rend le caisson à sa place. Rien ne s'affiche pendant un
 * outil.
 */
import * as THREE from "three";
import { cabinetAxes, slideCabinet, turnCabinet } from "../document/kitchen-catalog";
import { bodyOrigin, deleteFeatures, findFeature, updateFeature } from "../document/operations";
import { withCabinetDuplicated } from "../document/unit-duplicate";
import { featureOfBody, type CabinetFeature, type CadDocument, type Vec3 } from "../document/types";
import { alignBox, type Box } from "../features/smart-align";
import { formatLength } from "../measurements/units";
import { SnapGuides } from "../viewport/snap-guides";
import type { Viewport } from "../viewport/viewport";
import { cabinetBar } from "./cabinet-bar";
import { around, bodyBox, stickCabinet } from "./cabinet-stick";
import { selectedCabinet } from "./drivers-3d";
import type { Editor } from "./editor";

/** How near (px) a face of the dragged cabinet sticks to a face of another body. */
const STICK_PX = 12;

/** The bodies of the cabinet and of its fronts, as displayed. */
export function cabinetBodies(doc: CadDocument, bodies: readonly string[], cabinetId: string): string[] {
  return bodies.filter((id) => {
    const f = findFeature(doc, featureOfBody(bodyOrigin(doc, id)));
    return f?.id === cabinetId || (f?.type === "fronts" && f.cabinet === cabinetId);
  });
}

interface Drag {
  cabinet: CabinetFeature;
  bodies: string[];
  box: Box;
  others: Box[];
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

  const clear = () => {
    bar.grips.replaceChildren();
    bar.refresh();
    shown = "";
    slider = null;
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
    delta = delta.map(Math.round) as Vec3;
    drag.delta = delta;
    pose(drag, delta);
    guides.show(lines, viewport);
    const moved = Math.hypot(delta[0], delta[1]);
    if (slider) slider.textContent = `✥ ${formatLength(moved, editor.unit)}`;
  };

  const finish = async (apply: boolean, click = false) => {
    const d = drag;
    if (!d) return;
    drag = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("keydown", key, true);
    guides.clear();
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

  const start = (cabinet: CabinetFeature, event: PointerEvent) => {
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
    drag = { cabinet, bodies, box, others, z, from, delta: [0, 0, 0], screen: [event.clientX, event.clientY], offset };
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
    const slide = grip("✥ Déplacer", "Tirez pour faire glisser le caisson le long de son mur (Maj : librement sur le sol, Alt : sans aimant, Échap : annuler) ; cliquez, puis cliquez une face ou un coin d'un autre meuble pour l'y coller", "Déplacer le caisson");
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
    bar.grips.replaceChildren(slide, turn, copy, remove);
    bar.refresh();
    slider = slide;
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
