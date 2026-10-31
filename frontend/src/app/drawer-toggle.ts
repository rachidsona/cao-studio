/**
 * Drawers and doors opened by a click in the 3D view, and closed by another click (on it, open where it now is). All
 * the bodies of a drawer — its front and its box — slide out together, the way its front faces; a door of a
 * Répartition turns outwards about its hinges (the side chosen for it), by 100°. View only, as
 * « Mouvements »: nothing changes in the model, and a regeneration of the model closes them. Not while a tool or a
 * sketch takes the clicks of the view, nor with Ctrl, Cmd or Maj (they add to the selection).
 */
import { bodyLabel, findFeature } from "../document/operations";
import { featureOfBody, type Axis, type CadDocument, type NicheFeature, type SketchFeature, type Vec3 } from "../document/types";
import { drawerNumber, drawerSlide, type Box } from "../features/drawer-open";
import { poseOf, rotationMatrix } from "../features/motion";
import { nicheGeometry, nicheParts, nichePartsIn, nicheWorld } from "../features/niche-parts";
import type { Viewport } from "../viewport/viewport";

/** What is open: its bodies, where they are when open by `s` (0 closed … 1 open), and the meshes they were opened on. */
interface Open {
  bodies: string[];
  pose: (s: number) => { rotation: number[]; translation: Vec3 };
  meshes: unknown[];
}

const DURATION = 250;
const DOOR_ANGLE = 100;

/** How a door of a Répartition turns: about the vertical line of its hinge edge, at its front, outwards. */
export function doorSwing(doc: CadDocument, bodyId: string): { axis: Axis; pivot: Vec3; angle: number } | null {
  const feature = findFeature(doc, featureOfBody(bodyId));
  if (feature?.type !== "niche" || feature.fill !== "doors") return null;
  const n = nicheGeometry(feature as NicheFeature, findFeature(doc, feature.sketch) as SketchFeature | undefined);
  if (typeof n === "string") return null;
  const parts = nicheParts(feature, n);
  const own = parts[Number(bodyId.slice(bodyId.indexOf("#") + 1))];
  // A handle swings with its door.
  const part = own?.kind === "handle" && own.of !== undefined ? parts[own.of] : own;
  if (!part?.handle) return null;
  const [hingeU, freeU] = part.handle === "right" ? [part.from[0], part.to[0]] : [part.to[0], part.from[0]];
  const [v, w] = [(part.from[1] + part.to[1]) / 2, part.to[2]];
  const pivot = nicheWorld(n, [hingeU, v, w]);
  const free = nicheWorld(n, [freeU, v, w]);
  const axis = n.frame.v.findIndex((c) => Math.abs(c) > 0.5) as Axis;
  // The sense that brings the free edge out, in front of the panels.
  const r = rotationMatrix(axis, DOOR_ANGLE);
  const d = [0, 1, 2].map((i) => free[i]! - pivot[i]!);
  const moved = [0, 1, 2].map((i) => r[i * 3]! * d[0]! + r[i * 3 + 1]! * d[1]! + r[i * 3 + 2]! * d[2]! - d[i]!);
  const out = moved[0]! * n.frame.normal[0] + moved[1]! * n.frame.normal[1] + moved[2]! * n.frame.normal[2];
  return { axis, pivot, angle: out >= 0 ? DOOR_ANGLE : -DOOR_ANGLE };
}

/** A door of a Répartition and its handle, by body id (the door first), from either of them. */
export function doorWithHandle(doc: CadDocument, bodyId: string): string[] {
  const feature = findFeature(doc, featureOfBody(bodyId));
  if (feature?.type !== "niche") return [bodyId];
  const parts = nichePartsIn(doc.features, feature);
  const index = Number(bodyId.slice(bodyId.indexOf("#") + 1));
  const door = parts[index]?.kind === "handle" ? (parts[index]!.of ?? index) : index;
  return [door, ...parts.flatMap((p, i) => (p.kind === "handle" && p.of === door ? [i] : []))].map((i) => `${feature.id}#${i}`);
}

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

  /** Moves the bodies from `from` to `to` (0 closed, 1 open) in a quarter of a second. */
  const animate = (bodies: string[], pose: Open["pose"], from: number, to: number) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const s = from + (to - from) * (1 - (1 - t) ** 3);
      for (const id of bodies) viewport.setBodyPose(id, s === 0 ? null : pose(s));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /** Opens it, or closes it when it is open (opened on meshes since made again: closed already). */
  const flip = (key: string, bodies: string[], pose: () => Open["pose"] | null) => {
    const meshes = bodies.map((id) => viewport.bodyMesh(id));
    const was = open.get(key);
    if (was && was.meshes.every((m, i) => m === meshes[i])) {
      open.delete(key);
      return animate(was.bodies, was.pose, 1, 0);
    }
    const made = pose();
    if (!made) return;
    open.set(key, { bodies, pose: made, meshes });
    animate(bodies, made, 0, 1);
  };

  const toggle = (bodyId: string) => {
    const doc = editor.doc;
    const swing = doorSwing(doc, bodyId);
    if (swing) {
      const door = doorWithHandle(doc, bodyId);
      return flip(door[0]!, door, () => (s) => poseOf({ kind: "hinge", axis: swing.axis, pivot: swing.pivot, angle: swing.angle * s }));
    }
    const drawer = drawerBodies(doc, viewport.displayedBodies, bodyId);
    if (!drawer) return;
    flip(drawer.key, drawer.bodies, () => {
      const label = (id: string) => bodyLabel(doc, id);
      const front = drawer.bodies.find((id) => /façade/i.test(label(id)));
      const back = drawer.bodies.find((id) => /arrière/i.test(label(id)));
      const [f, b] = [front && boxOf(front), back && boxOf(back)];
      if (!f || !b) return null;
      const slide = drawerSlide(f, b);
      return (s) => ({ rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [slide[0] * s, slide[1] * s, slide[2] * s] });
    });
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
