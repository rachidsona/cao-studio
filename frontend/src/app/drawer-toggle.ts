/**
 * Drawers and doors opened by a click in the 3D view, and closed by another click (on it, open where it now is). All
 * the bodies of a drawer — its front and its box — slide out together, the way its front faces; a door of a
 * Répartition or of a cabinet turns outwards about its hinges (the side chosen for it), by 100°. View only, as
 * « Mouvements »: nothing changes in the model, and a regeneration of the model closes them. Not while a tool or a
 * sketch takes the clicks of the view, nor with Ctrl, Cmd or Maj (they add to the selection).
 *
 * « Ouvrir / fermer les portes » and « Ouvrir / fermer les tiroirs » (Dressing, Cuisine) do it for every door, or every
 * drawer, of the model at once.
 */
import { bodyLabel, findFeature } from "../document/operations";
import { featureOfBody, type Axis, type CabinetFeature, type CadDocument, type NicheFeature, type SketchFeature, type Vec3 } from "../document/types";
import { drawerNumber, drawerSlide, type Box } from "../features/drawer-open";
import { frontsParts } from "../features/fronts-parts";
import { poseOf, rotationMatrix } from "../features/motion";
import { nicheGeometry, nicheParts, nichePartsIn, nicheWorld } from "../features/niche-parts";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

/** What is open: its bodies, where they are when open by `s` (0 closed … 1 open), and the meshes they were opened on. */
interface Open {
  bodies: string[];
  pose: (s: number) => { rotation: number[]; translation: Vec3 };
  meshes: unknown[];
}

const DURATION = 250;
const DOOR_ANGLE = 100;

type Swing = { axis: Axis; pivot: Vec3; angle: number };

/** The part of a feature that this body is. */
const partNumber = (bodyId: string) => (bodyId.includes("#") ? Number(bodyId.slice(bodyId.indexOf("#") + 1)) : 0);

/** The sense that brings the free edge out, in front of the panels. */
function outwards(axis: Axis, pivot: Vec3, free: Vec3, normal: Vec3): Swing {
  const r = rotationMatrix(axis, DOOR_ANGLE);
  const d = [0, 1, 2].map((i) => free[i]! - pivot[i]!);
  const moved = [0, 1, 2].map((i) => r[i * 3]! * d[0]! + r[i * 3 + 1]! * d[1]! + r[i * 3 + 2]! * d[2]! - d[i]!);
  const out = moved[0]! * normal[0] + moved[1]! * normal[1] + moved[2]! * normal[2];
  return { axis, pivot, angle: out >= 0 ? DOOR_ANGLE : -DOOR_ANGLE };
}

/** A door of a cabinet's fronts: they face −Y, then turn with the cabinet about the vertical through its origin. */
function frontSwing(doc: CadDocument, fronts: Parameters<typeof frontsParts>[0], bodyId: string): Swing | null {
  const cabinet = findFeature(doc, fronts.cabinet) as CabinetFeature | undefined;
  const part = frontsParts(fronts, cabinet)[partNumber(bodyId)];
  if (!cabinet || part?.role?.kind !== "door") return null;
  const r = rotationMatrix(2, cabinet.rotation ?? 0);
  const turned = (x: number, y: number, z: number): Vec3 => {
    const [dx, dy] = [x - cabinet.origin[0], y - cabinet.origin[1]];
    return [cabinet.origin[0] + r[0]! * dx + r[1]! * dy, cabinet.origin[1] + r[3]! * dx + r[4]! * dy, z];
  };
  const [hingeX, freeX] = part.role.hinge === "left" ? [part.from[0], part.to[0]] : [part.to[0], part.from[0]];
  const z = (part.from[2] + part.to[2]) / 2;
  return outwards(2, turned(hingeX, part.from[1], z), turned(freeX, part.from[1], z), [-r[1]!, -r[4]!, 0]);
}

/** How a door turns: about the vertical line of its hinge edge, at its front, outwards. */
export function doorSwing(doc: CadDocument, bodyId: string): Swing | null {
  const feature = findFeature(doc, featureOfBody(bodyId));
  if (feature?.type === "fronts") return frontSwing(doc, feature, bodyId);
  if (feature?.type !== "niche" || (feature.fill !== "doors" && feature.fill !== "door")) return null;
  const n = nicheGeometry(feature as NicheFeature, findFeature(doc, feature.sketch) as SketchFeature | undefined);
  if (typeof n === "string") return null;
  const parts = nicheParts(feature, n);
  const own = parts[partNumber(bodyId)];
  // A handle swings with its door.
  const part = own?.kind === "handle" && own.of !== undefined ? parts[own.of] : own;
  if (!part?.handle) return null;
  const [hingeU, freeU] = part.handle === "right" ? [part.from[0], part.to[0]] : [part.to[0], part.from[0]];
  const [v, w] = [(part.from[1] + part.to[1]) / 2, part.to[2]];
  const pivot = nicheWorld(n, [hingeU, v, w]);
  const free = nicheWorld(n, [freeU, v, w]);
  return outwards(n.frame.v.findIndex((c) => Math.abs(c) > 0.5) as Axis, pivot, free, n.frame.normal);
}

/** A door of a Répartition and its handle, by body id (the door first), from either of them. */
export function doorWithHandle(doc: CadDocument, bodyId: string): string[] {
  const feature = findFeature(doc, featureOfBody(bodyId));
  if (feature?.type !== "niche") return [bodyId];
  const parts = nichePartsIn(doc.features, feature);
  const index = partNumber(bodyId);
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

export function bindDrawers(root: HTMLElement, viewport: Viewport, editor: Editor): void {
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

  /** Whether it is open now (opened on meshes since made again: closed already). */
  const isOpen = (key: string, bodies: string[]) => {
    const was = open.get(key);
    return !!was && was.meshes.every((m, i) => m === viewport.bodyMesh(bodies[i]!));
  };

  /** Opens it, or closes it when it is open. */
  const flip = (key: string, bodies: string[], pose: () => Open["pose"] | null) => {
    const was = open.get(key);
    if (was && isOpen(key, bodies)) {
      open.delete(key);
      return animate(was.bodies, was.pose, 1, 0);
    }
    const made = pose();
    if (!made) return;
    open.set(key, { bodies, pose: made, meshes: bodies.map((id) => viewport.bodyMesh(id)) });
    animate(bodies, made, 0, 1);
  };

  /** A door (with its handle) or a drawer (all its bodies), and how it opens. */
  type Item = { key: string; bodies: string[]; pose: () => Open["pose"] | null };
  const flipItem = (item: Item) => flip(item.key, item.bodies, item.pose);

  const doorItem = (door: string[], swing: Swing): Item => ({
    key: door[0]!,
    bodies: door,
    pose: () => (s) => poseOf({ kind: "hinge", axis: swing.axis, pivot: swing.pivot, angle: swing.angle * s }),
  });
  const drawerItem = (drawer: { key: string; bodies: string[] }): Item => ({
    ...drawer,
    pose: () => {
      const label = (id: string) => bodyLabel(editor.doc, id);
      const front = drawer.bodies.find((id) => /façade/i.test(label(id)));
      const back = drawer.bodies.find((id) => /arrière/i.test(label(id)));
      const [f, b] = [front && boxOf(front), back && boxOf(back)];
      if (!f || !b) return null;
      const slide = drawerSlide(f, b);
      return (s) => ({ rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [slide[0] * s, slide[1] * s, slide[2] * s] });
    },
  });

  /** Every door shown, each with its handle; every drawer shown. */
  const doors = (): Item[] => {
    const found = new Map<string, Item>();
    for (const id of viewport.displayedBodies) {
      const swing = doorSwing(editor.doc, id);
      if (swing) {
        const item = doorItem(doorWithHandle(editor.doc, id), swing);
        found.set(item.key, item);
      }
    }
    return [...found.values()];
  };
  const drawers = (): Item[] => {
    const found = new Map<string, Item>();
    for (const id of viewport.displayedBodies) {
      const drawer = drawerBodies(editor.doc, viewport.displayedBodies, id);
      if (drawer && !found.has(drawer.key)) found.set(drawer.key, drawerItem(drawer));
    }
    return [...found.values()];
  };

  // A button is down while all its doors, or all its drawers, are open.
  const kinds = [
    { buttons: [...root.querySelectorAll<HTMLButtonElement>('[data-workshop="doors-open"]')], list: doors, none: "Il n'y a aucune porte dans ce modèle." },
    { buttons: [...root.querySelectorAll<HTMLButtonElement>('[data-workshop="drawers-open"]')], list: drawers, none: "Il n'y a aucun tiroir dans ce modèle." },
  ];
  const showButtons = () => {
    for (const kind of kinds) {
      const all = open.size > 0 ? kind.list() : [];
      const down = all.length > 0 && all.every((item) => isOpen(item.key, item.bodies));
      for (const button of kind.buttons) button.setAttribute("aria-pressed", String(down));
    }
  };
  for (const kind of kinds) {
    const flipAll = () => {
      const all = kind.list();
      if (!all.length) return editor.notify(kind.none, "info");
      const closing = all.every((item) => isOpen(item.key, item.bodies));
      for (const item of all) if (isOpen(item.key, item.bodies) === closing) flipItem(item);
      showButtons();
    };
    for (const button of kind.buttons) button.addEventListener("click", flipAll);
  }
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    showButtons();
  };

  const toggle = (bodyId: string) => {
    const doc = editor.doc;
    const swing = doorSwing(doc, bodyId);
    const drawer = swing ? null : drawerBodies(doc, viewport.displayedBodies, bodyId);
    if (swing) flipItem(doorItem(doorWithHandle(doc, bodyId), swing));
    else if (drawer) flipItem(drawerItem(drawer));
    showButtons();
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
