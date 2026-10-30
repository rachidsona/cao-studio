/**
 * Drawers opened by a click in the 3D view, and closed by another click (on the drawer, open where it now is). All
 * the bodies of the drawer — its front and its box — slide out together, the way its front faces. View only, as
 * « Mouvements »: nothing changes in the model, and a regeneration of the model closes them. Not while a tool or a
 * sketch takes the clicks of the view, nor with Ctrl, Cmd or Maj (they add to the selection).
 */
import { bodyLabel, findFeature } from "../document/operations";
import { featureOfBody, type CadDocument, type Vec3 } from "../document/types";
import { drawerNumber, drawerSlide, type Box } from "../features/drawer-open";
import type { Viewport } from "../viewport/viewport";

/** The drawers that are open: their bodies, their slide, and the meshes they were opened on. */
interface Open {
  bodies: string[];
  slide: Vec3;
  meshes: unknown[];
}

const DURATION = 250;

/** The bodies of the drawer this body is a piece of (null: not a drawer). */
export function drawerBodies(doc: CadDocument, bodies: string[], bodyId: string): { key: string; bodies: string[] } | null {
  if (!bodyId.includes("#")) return null;
  const featureId = featureOfBody(bodyId);
  const feature = findFeature(doc, featureId);
  const drawers = (feature?.type === "niche" && feature.fill === "drawers") || (feature?.type === "fronts" && feature.layout === "drawers");
  const k = drawers ? drawerNumber(bodyLabel(doc, bodyId)) : null;
  if (k === null) return null;
  return { key: `${featureId}:${k}`, bodies: bodies.filter((id) => id.startsWith(`${featureId}#`) && drawerNumber(bodyLabel(doc, id)) === k) };
}

export function bindDrawers(viewport: Viewport, editor: { readonly doc: CadDocument }): void {
  const canvas = viewport.renderer.domElement;
  const open = new Map<string, Open>();
  let down: { x: number; y: number } | null = null;

  const boxOf = (id: string): Box | null => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  };

  /** Slides the bodies from `from` to `to` (0 closed, 1 open) in a quarter of a second. */
  const animate = (bodies: string[], slide: Vec3, from: number, to: number) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const s = from + (to - from) * (1 - (1 - t) ** 3);
      for (const id of bodies) viewport.setBodyPose(id, s === 0 ? null : { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [slide[0] * s, slide[1] * s, slide[2] * s] });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const toggle = (bodyId: string) => {
    const doc = editor.doc;
    const drawer = drawerBodies(doc, viewport.displayedBodies, bodyId);
    if (!drawer) return;
    const meshes = drawer.bodies.map((id) => viewport.bodyMesh(id));
    const was = open.get(drawer.key);
    // Opened on meshes since made again: closed already.
    if (was && was.meshes.every((m, i) => m === meshes[i])) {
      open.delete(drawer.key);
      return animate(was.bodies, was.slide, 1, 0);
    }
    const label = (id: string) => bodyLabel(doc, id);
    const front = drawer.bodies.find((id) => /façade/i.test(label(id)));
    const back = drawer.bodies.find((id) => /arrière/i.test(label(id)));
    const [f, b] = [front && boxOf(front), back && boxOf(back)];
    if (!f || !b) return;
    const slide = drawerSlide(f, b);
    open.set(drawer.key, { bodies: drawer.bodies, slide, meshes });
    animate(drawer.bodies, slide, 0, 1);
  };

  canvas.addEventListener("pointerdown", (event) => {
    down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  });
  canvas.addEventListener("pointerup", (event) => {
    const start = down;
    down = null;
    // A click, not a turn of the camera; nothing else takes it.
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || viewport.inSketch) return;
    const hit = viewport.pickFace(event);
    if (hit) toggle(hit.bodyId);
  });
}
