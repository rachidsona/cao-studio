/**
 * Déplacer un caisson d'un geste : quand les pièces d'un seul caisson sont sélectionnées, deux poignées s'affichent
 * sur son dessus. « ✥ » se tire : le caisson glisse le long de son mur (Maj : librement sur le sol), avec ses façades,
 * et s'arrête au ras des autres corps — contre le côté d'un voisin, dans l'alignement de son fond ou de sa façade,
 * au bout du plan de travail, contre un mur (Alt : sans aimant). « ↻ » le tourne d'un quart de tour sur place.
 * Le document ne change qu'au lâcher, une annulation ; Échap rend le caisson à sa place. Rien ne s'affiche pendant un
 * outil.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { cabinetAxes, slideCabinet, turnCabinet } from "../document/kitchen-catalog";
import { bodyOrigin, findFeature, updateFeature } from "../document/operations";
import { featureOfBody, type CabinetFeature, type CadDocument, type Vec3 } from "../document/types";
import { alignBox, type Box } from "../features/smart-align";
import { formatLength } from "../measurements/units";
import { SnapGuides } from "../viewport/snap-guides";
import type { Viewport } from "../viewport/viewport";
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

/** The box around boxes. */
function around(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))) as Vec3;
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!))) as Vec3;
  return [lo, hi];
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
}

export function bindCabinetDrag(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const group = new THREE.Group();
  viewport.scene.add(group);
  const guides = new SnapGuides(viewport.scene);
  let shown = "";
  let drag: Drag | null = null;
  /** The grips, and where they stand before a drag. */
  let handles: { object: CSS2DObject; at: Vec3 } | null = null;

  const clear = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
    }
    shown = "";
    handles = null;
  };

  const boxOf = (id: string): Box | null => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  };

  /** The pointer on the horizontal plane at this height (null when the view looks along it). */
  const onPlane = (event: PointerEvent, z: number): Vec3 | null => {
    const { origin, direction } = viewport.rayFromEvent(event);
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
    if (handles) handles.object.position.set(handles.at[0] + delta[0], handles.at[1] + delta[1], handles.at[2]);
    guides.show(lines, viewport);
    const moved = Math.hypot(delta[0], delta[1]);
    viewport.renderer.domElement.title = moved ? `Déplacé de ${formatLength(moved, editor.unit)}` : "";
  };

  const finish = async (apply: boolean) => {
    const d = drag;
    if (!d) return;
    drag = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("keydown", key, true);
    guides.clear();
    document.body.classList.remove("cad-dragging");
    viewport.renderer.domElement.title = "";
    if (apply && Math.hypot(d.delta[0], d.delta[1]) >= 1) {
      await editor.change(updateFeature(editor.doc, d.cabinet.id, (f) => (f.type === "cabinet" ? slideCabinet(f, d.delta) : f)));
      editor.notify(`${d.cabinet.name} déplacé de ${formatLength(Math.hypot(d.delta[0], d.delta[1]), editor.unit)}.`, "success");
    }
    pose(d, null);
    show(true);
  };
  const up = () => void finish(true);
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
    const from = onPlane(event, z);
    if (!from) return;
    drag = { cabinet, bodies, box, others, z, from, delta: [0, 0, 0] };
    // The dimensions of the cabinet stay where it was: hidden while it slides.
    document.body.classList.add("cad-dragging");
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
    const box = around(cabinetBodies(editor.doc, viewport.displayedBodies, cabinet.id).map(boxOf).filter((b): b is Box => !!b));
    if (!box) return;
    const row = document.createElement("span");
    row.className = "flex gap-1";
    const slide = grip("✥ Déplacer", "Tirez pour faire glisser le caisson le long de son mur (Maj : librement sur le sol, Alt : sans aimant, Échap : annuler)", "Déplacer le caisson");
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
    row.append(slide, turn);
    const object = new CSS2DObject(row);
    const at: Vec3 = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2, box[1][2]];
    object.position.set(...at);
    object.center.set(0.5, 1.6);
    group.add(object);
    handles = { object, at };
  };

  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    show();
  };
}
