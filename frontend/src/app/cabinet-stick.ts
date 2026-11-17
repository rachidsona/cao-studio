/**
 * « Coller » un caisson : un clic sur sa poignée ✥ (sans la tirer), puis un clic sur une face debout ou un coin d'un
 * autre corps — un meuble, un mur. Au survol, un fantôme orange montre où il ira : son côté contre le côté d'un
 * voisin (fonds alignés), son fond contre un mur ou une façade (centré sur le point, aimanté aux voisins), ou son coin
 * le plus proche sur le coin pointé (document/kitchen-catalog.ts, stickDelta) — jamais dans un mur ni dans un voisin :
 * visé près d'un angle de la pièce, il est glissé au ras (features/box-clear.ts). Le clic l'y pose, une annulation ;
 * Échap rend la main. La vue tourne toujours en glissant.
 */
import * as THREE from "three";
import { roomKeepOuts } from "../document/cabinet-clear";
import { cabinetAxes, slideCabinet, stickDelta, type StickTarget } from "../document/kitchen-catalog";
import { bodyOrigin, findFeature, updateFeature } from "../document/operations";
import { featureOfBody, type CabinetFeature, type Vec3 } from "../document/types";
import { clearOf } from "../features/box-clear";
import { alignBox, type Box } from "../features/smart-align";
import { THIN_CROSSHAIR } from "../ui/cursor";
import { faceSnaps } from "../viewport/face-snaps";
import { SnapGuides } from "../viewport/snap-guides";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

const CLICK_PX = 4;
const GHOST_COLOR = 0xea580c;

/** The box around boxes. */
export function around(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))) as Vec3;
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!))) as Vec3;
  return [lo, hi];
}

/** The box of a displayed body. */
export function bodyBox(viewport: Viewport, id: string): Box | null {
  const b = viewport.bodyMesh(id)?.metrics.bbox;
  return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
}

/** The cabinet a body is part of (its carcass or its fronts), if any. */
function ownerCabinet(editor: Editor, bodyId: string): CabinetFeature | null {
  const doc = editor.doc;
  const f = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  const id = f?.type === "cabinet" ? f.id : f?.type === "fronts" ? f.cabinet : null;
  const c = id ? findFeature(doc, id) : null;
  return c?.type === "cabinet" ? c : null;
}

/** Waits for the face or corner the cabinet is stuck to; `end` when it is placed or given up. */
export function stickCabinet(viewport: Viewport, editor: Editor, cabinet: CabinetFeature, bodies: string[], groupOf: (bodyId: string) => string[], end: () => void): void {
  const canvas = viewport.renderer.domElement;
  const own = new Set(bodies);
  const box = around(bodies.map((id) => bodyBox(viewport, id)).filter((b): b is Box => !!b));
  if (!box) return end();
  const others = viewport.displayedBodies.filter((id) => !own.has(id)).map((id) => bodyBox(viewport, id)).filter((b): b is Box => !!b);
  // The walls with what lies behind them: stuck on a wall's outer face, it would stand out of the room.
  const solid = [...others, ...roomKeepOuts(editor.doc)];
  const rotation = cabinet.rotation ?? 0;
  const guides = new SnapGuides(viewport.scene);
  const size = [0, 1, 2].map((i) => box[1][i]! - box[0][i]!) as Vec3;
  const ghost = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)),
    new THREE.LineBasicMaterial({ color: GHOST_COLOR, depthTest: false, transparent: true }),
  );
  ghost.renderOrder = 49;
  ghost.visible = false;
  viewport.scene.add(ghost);
  let current: { delta: Vec3; bodyId: string } | null = null;
  let down: { x: number; y: number } | null = null;

  const targetAt = (event: PointerEvent): { target: StickTarget; bodyId: string } | null => {
    const corner = viewport.pickVertex(event);
    if (corner && !own.has(corner.bodyId)) return { target: { kind: "point", point: [...corner.point] as Vec3 }, bodyId: corner.bodyId };
    const face = viewport.pickFace(event);
    if (!face || own.has(face.bodyId)) return null;
    const mesh = viewport.bodyMesh(face.bodyId);
    const normal = mesh ? faceSnaps(mesh, face.faceIndex)?.normal : null;
    const other = around(groupOf(face.bodyId).map((id) => bodyBox(viewport, id)).filter((b): b is Box => !!b));
    if (!normal || !other) return null;
    return { target: { kind: "face", point: [face.point.x, face.point.y, face.point.z], normal: [...normal] as Vec3, other }, bodyId: face.bodyId };
  };

  const hover = (event: PointerEvent) => {
    const hit = targetAt(event);
    let delta = hit ? stickDelta(box, rotation, hit.target) : null;
    let lines: [Vec3, Vec3][] = [];
    if (hit && delta && hit.target.kind === "face") {
      // Against a wall or a front, centred on the point: it still sticks to a neighbour near by.
      const n = hit.target.normal;
      const j = Math.abs(n[0]) >= Math.abs(n[1]) ? 1 : 0;
      if (Math.abs(cabinetAxes(rotation).back[j]!) <= 0.5) ({ translate: delta, guides: lines } = alignBox(box, others, delta, [j], 12 * viewport.worldPerPixel()));
    }
    // Never into a wall or a neighbour (a point near the corner of the room): slid out of it, flush; no place: none shown.
    const rounded = delta ? (delta.map(Math.round) as Vec3) : null;
    const clear = rounded ? clearOf(box, solid, rounded, [0, 1]) : null;
    if (clear !== rounded) lines = [];
    current = hit && clear ? { delta: clear, bodyId: hit.bodyId } : null;
    ghost.visible = !!current;
    if (current) ghost.position.set(...([0, 1, 2].map((i) => (box[0][i]! + box[1][i]!) / 2 + current!.delta[i]!) as Vec3));
    guides.show(current ? lines : [], viewport);
  };

  const stop = () => {
    canvas.removeEventListener("pointermove", hover);
    canvas.removeEventListener("pointerdown", press, true);
    canvas.removeEventListener("pointerup", release, true);
    window.removeEventListener("keydown", key, true);
    canvas.style.cursor = "";
    viewport.scene.remove(ghost);
    ghost.geometry.dispose();
    ghost.material.dispose();
    guides.clear();
    end();
  };
  const press = (event: PointerEvent) => {
    down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  };
  const release = (event: PointerEvent) => {
    const start = down;
    down = null;
    // A drag turns the view; a click places.
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_PX) return;
    event.stopImmediatePropagation();
    hover(event);
    if (!current) return editor.notify("Visez une face debout ou un coin d'un autre meuble, ou d'un mur.", "info");
    const { delta, bodyId } = current;
    const to = ownerCabinet(editor, bodyId)?.name ?? "la face choisie";
    stop();
    if (Math.hypot(delta[0], delta[1]) < 1) return editor.notify(`${cabinet.name} est déjà contre ${to}.`, "info");
    void editor.change(updateFeature(editor.doc, cabinet.id, (f) => (f.type === "cabinet" ? slideCabinet(f, delta) : f))).then(() => editor.notify(`${cabinet.name} collé contre ${to}.`, "success"));
  };
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    stop();
  };

  canvas.style.cursor = THIN_CROSSHAIR;
  canvas.addEventListener("pointermove", hover);
  canvas.addEventListener("pointerdown", press, true);
  canvas.addEventListener("pointerup", release, true);
  window.addEventListener("keydown", key, true);
  editor.notify(`Cliquez une face ou un coin d'un autre meuble (ou d'un mur) : ${cabinet.name} s'y colle. Échap pour annuler.`, "info");
}
