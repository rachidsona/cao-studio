/**
 * Drawers and doors opened by a click in the 3D view, and closed by another click (on it, open where it now is). All
 * the bodies of a drawer — its front and its box — slide out together, the way its front faces; a door of a
 * Répartition or of a cabinet turns outwards about its hinges (the side chosen for it), by 100°, with its handle and the
 * glass of a glazed door. View only, as
 * « Mouvements »: nothing changes in the model, and a regeneration of the model closes them. Not while a tool or a
 * sketch takes the clicks of the view, nor with Ctrl, Cmd or Maj (they add to the selection).
 *
 * An interior accessory comes out the same way (features/accessory-open.ts): a basket on its slides, the half-moons
 * about their post, the pull-down rail down in front; a cutlery tray in a drawer opens its drawer.
 *
 * « Ouvrir / fermer les portes » and « Ouvrir / fermer les tiroirs » (Dressing, Cuisine) do it for every door, or every
 * drawer, of the model at once.
 */
import { madeDoor } from "../document/kitchen-floor";
import { bodyLabel, findFeature } from "../document/operations";
import { featureOfBody, type Axis, type CabinetFeature, type CadDocument, type NicheFeature, type SketchFeature, type Vec3 } from "../document/types";
import { accessoryMoves } from "../features/accessory-open";
import { drawerNumber, drawerSlide, type Box } from "../features/drawer-open";
import { frontsParts } from "../features/fronts-parts";
import { poseOf, rotationMatrix } from "../features/motion";
import { nicheGeometry, nicheParts, nichePartsIn, nicheWorld } from "../features/niche-parts";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

/** What is open: its bodies, where each is when open by `s` (0 closed … 1 open), and the meshes they were opened on. */
interface Open {
  bodies: string[];
  pose: (s: number, bodyId: string) => { rotation: number[]; translation: Vec3 };
  meshes: unknown[];
}

const DURATION = 250;
const DOOR_ANGLE = 100;
/** A flap comes down to the horizontal. */
const FLAP_ANGLE = 90;

type Swing = { axis: Axis; pivot: Vec3; angle: number };

/** The part of a feature that this body is. */
const partNumber = (bodyId: string) => (bodyId.includes("#") ? Number(bodyId.slice(bodyId.indexOf("#") + 1)) : 0);

/** The sense that brings the free edge out, in front of the panels. */
function outwards(axis: Axis, pivot: Vec3, free: Vec3, normal: Vec3, angle = DOOR_ANGLE): Swing {
  const r = rotationMatrix(axis, angle);
  const d = [0, 1, 2].map((i) => free[i]! - pivot[i]!);
  const moved = [0, 1, 2].map((i) => r[i * 3]! * d[0]! + r[i * 3 + 1]! * d[1]! + r[i * 3 + 2]! * d[2]! - d[i]!);
  const out = moved[0]! * normal[0] + moved[1]! * normal[1] + moved[2]! * normal[2];
  return { axis, pivot, angle: out >= 0 ? angle : -angle };
}

/** A door of a cabinet's fronts: they face −Y, then turn with the cabinet about the vertical through its origin. */
function frontSwing(doc: CadDocument, fronts: Parameters<typeof frontsParts>[0], bodyId: string): Swing | null {
  const cabinet = findFeature(doc, fronts.cabinet) as CabinetFeature | undefined;
  const parts = frontsParts(fronts, cabinet);
  // The glass of a glazed door turns with its door.
  const own = parts[partNumber(bodyId)];
  const part = own?.of !== undefined ? parts[own.of] : own;
  if (!cabinet || part?.role?.kind !== "door") return null;
  const r = rotationMatrix(2, cabinet.rotation ?? 0);
  const turned = (x: number, y: number, z: number): Vec3 => {
    const [dx, dy] = [x - cabinet.origin[0], y - cabinet.origin[1]];
    return [cabinet.origin[0] + r[0]! * dx + r[1]! * dy, cabinet.origin[1] + r[3]! * dx + r[4]! * dy, z];
  };
  const out: Vec3 = [-r[1]!, -r[4]!, 0];
  if (part.role.hinge === "top" || part.role.hinge === "bottom") {
    // A lift-up door or a flap: about the horizontal line of its top or bottom edge, along the cabinet's width.
    const x = (part.from[0] + part.to[0]) / 2;
    const [hingeZ, freeZ] = part.role.hinge === "top" ? [part.to[2], part.from[2]] : [part.from[2], part.to[2]];
    const across = (Math.abs(r[0]!) > 0.5 ? 0 : 1) as Axis;
    const [px, py] = turned(x, part.from[1], hingeZ);
    const [fx, fy] = turned(x, part.from[1], freeZ);
    return outwards(across, [px, py, hingeZ], [fx, fy, freeZ], out, part.role.hinge === "top" ? DOOR_ANGLE : FLAP_ANGLE);
  }
  const [hingeX, freeX] = part.role.hinge === "left" ? [part.from[0], part.to[0]] : [part.to[0], part.from[0]];
  const z = (part.from[2] + part.to[2]) / 2;
  return outwards(2, turned(hingeX, part.from[1], z), turned(freeX, part.from[1], z), out);
}

/**
 * A door made as a plain board (a corner unit's, ExtrudeFeature.door), from where it stands (`box`, world): about the
 * vertical of its hinge edge, on its front face.
 */
function boardSwing(door: { hinge: Vec3; out: Vec3 }, [low, high]: Box): Swing | null {
  const axisOf = (v: Vec3) => [0, 1].find((i) => Math.abs(v[i]!) > 0.5);
  const [h, o] = [axisOf(door.hinge), axisOf(door.out)];
  if (h === undefined || o === undefined || h === o) return null;
  const z = (low[2] + high[2]) / 2;
  const at = (i: number, v: number) => (v > 0 ? high[i]! : low[i]!);
  const point = (hinge: boolean): Vec3 => {
    const p: Vec3 = [0, 0, z];
    p[h] = at(h, hinge ? door.hinge[h]! : -door.hinge[h]!);
    p[o] = at(o, door.out[o]!);
    return p;
  };
  return outwards(2, point(true), point(false), door.out);
}

/** How a door turns: about the vertical line of its hinge edge, at its front, outwards (a board door: from `box`). */
export function doorSwing(doc: CadDocument, bodyId: string, box?: Box | null): Swing | null {
  const feature = findFeature(doc, featureOfBody(bodyId));
  if (feature?.type === "fronts") return frontSwing(doc, feature, bodyId);
  if (feature?.type === "extrude") {
    // A corner door made by a kitchen plan before doors knew their hinge: the plan tells it.
    const door = feature.door ?? (/^Porte (d'angle|pliante)/.test(feature.name) ? madeDoor(doc, feature.id) : null);
    return door && box ? boardSwing(door, box) : null;
  }
  if (feature?.type !== "niche" || (feature.fill !== "doors" && feature.fill !== "door")) return null;
  const n = nicheGeometry(feature as NicheFeature, findFeature(doc, feature.sketch) as SketchFeature | undefined);
  if (typeof n === "string") return null;
  const parts = nicheParts(feature, n);
  const own = parts[partNumber(bodyId)];
  // A handle, or the glass of a glazed door, swings with its door.
  const part = own?.of !== undefined ? parts[own.of] : own;
  if (!part?.handle) return null;
  const [hingeU, freeU] = part.handle === "right" ? [part.from[0], part.to[0]] : [part.to[0], part.from[0]];
  const [v, w] = [(part.from[1] + part.to[1]) / 2, part.to[2]];
  const pivot = nicheWorld(n, [hingeU, v, w]);
  const free = nicheWorld(n, [freeU, v, w]);
  return outwards(n.frame.v.findIndex((c) => Math.abs(c) > 0.5) as Axis, pivot, free, n.frame.normal);
}

/**
 * A door of a Répartition with its handle and its glass, or a cabinet's door with its glass, by body id (the door
 * first), from any of them.
 */
export function doorWithHandle(doc: CadDocument, bodyId: string): string[] {
  const feature = findFeature(doc, featureOfBody(bodyId));
  const parts: { of?: number }[] =
    feature?.type === "niche" ? nichePartsIn(doc.features, feature) : feature?.type === "fronts" ? frontsParts(feature, findFeature(doc, feature.cabinet) as CabinetFeature | undefined) : [];
  if (!feature || !parts.length) return [bodyId];
  const index = partNumber(bodyId);
  const door = parts[index]?.of ?? index;
  return [door, ...parts.flatMap((p, i) => (p.of === door ? [i] : []))].map((i) => `${feature.id}#${i}`);
}

/** The bodies of the drawer this body is a piece of (null: not a drawer). */
export function drawerBodies(doc: CadDocument, bodies: string[], bodyId: string): { key: string; bodies: string[] } | null {
  if (!bodyId.includes("#")) return null;
  const featureId = featureOfBody(bodyId);
  const feature = findFeature(doc, featureId);
  const drawers = (feature?.type === "niche" && feature.fill === "drawers") || (feature?.type === "fronts" && feature.layout === "drawers");
  const k = drawers ? drawerNumber(bodyLabel(doc, bodyId)) : null;
  return k === null ? null : drawerOf(doc, bodies, featureId, k);
}

/** Drawer `k` of these drawers: its bodies, and what stands in it. */
function drawerOf(doc: CadDocument, bodies: string[], featureId: string, k: number): { key: string; bodies: string[] } {
  const feature = findFeature(doc, featureId);
  const own = bodies.filter((id) => id.startsWith(`${featureId}#`) && drawerNumber(bodyLabel(doc, id)) === k);
  // What is put in that drawer (a cutlery tray « Dans le tiroir »: its bottom on the drawer's) slides out with it.
  const inside = feature?.type === "niche" ? accessoriesIn(doc, feature, k) : [];
  return { key: `${featureId}:${k}`, bodies: [...own, ...bodies.filter((id) => inside.includes(featureOfBody(id)))] };
}

/** The accessories of the niche of these drawers standing on the bottom of drawer `k` (their feature ids). */
function accessoriesIn(doc: CadDocument, drawers: NicheFeature, k: number): string[] {
  const n = nicheGeometry(drawers, findFeature(doc, drawers.sketch) as SketchFeature | undefined);
  if (typeof n === "string") return [];
  const bottom = nicheParts(drawers, n).find((p) => p.name === `Tiroir ${k} — fond`);
  if (!bottom) return [];
  const lift = bottom.to[1] - n.box.y0;
  const same = (f: NicheFeature) => f.sketch === drawers.sketch && f.partition === drawers.partition && f.niche.join(".") === drawers.niche.join(".");
  return doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.fill === "accessory" && !f.suppressed && same(f) && Math.abs((f.accessory?.lift ?? -1) - lift) < 0.5).map((f) => f.id);
}

/** The drawer a cutlery tray (or any accessory) stands in, by its feature id. */
function drawerHolding(doc: CadDocument, bodies: string[], accessory: NicheFeature): { key: string; bodies: string[] } | null {
  for (const f of doc.features) {
    if (f.type !== "niche" || f.fill !== "drawers" || f.suppressed || f.sketch !== accessory.sketch || f.partition !== accessory.partition || f.niche.join(".") !== accessory.niche.join(".")) continue;
    for (let k = 1; k <= f.drawers; k++) if (accessoriesIn(doc, f, k).includes(accessory.id)) return drawerOf(doc, bodies, f.id, k);
  }
  return null;
}

/**
 * An accessory pulled out: its bodies, each one's pose (open by `s`), by any of its bodies; or the drawer it stands
 * in. Null: not an accessory, or one that does not move.
 */
export function accessoryOpening(doc: CadDocument, bodies: string[], bodyId: string): { key: string; bodies: string[]; pose?: Open["pose"] } | null {
  const feature = findFeature(doc, featureOfBody(bodyId));
  if (feature?.type !== "niche" || feature.fill !== "accessory") return null;
  const drawer = drawerHolding(doc, bodies, feature);
  if (drawer) return drawer;
  const n = nicheGeometry(feature, findFeature(doc, feature.sketch) as SketchFeature | undefined);
  if (typeof n === "string") return null;
  const moves = accessoryMoves(feature.accessory?.model, nicheParts(feature, n), n);
  const origin = nicheWorld(n, [0, 0, 0]);
  const poses = new Map<string, (s: number) => { rotation: number[]; translation: Vec3 }>();
  for (const move of moves) {
    let pose: ((s: number) => { rotation: number[]; translation: Vec3 }) | null = null;
    if (move.slide) {
      const to = nicheWorld(n, move.slide);
      const d = [0, 1, 2].map((i) => to[i]! - origin[i]!);
      pose = (s) => ({ rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [d[0]! * s, d[1]! * s, d[2]! * s] });
    } else if (move.turn) {
      const axis = n.frame.v.findIndex((c) => Math.abs(c) > 0.5) as Axis;
      const swing = outwards(axis, nicheWorld(n, move.turn.pivot), nicheWorld(n, move.turn.free), n.frame.normal, move.turn.angle);
      pose = (s) => poseOf({ kind: "hinge", axis: swing.axis, pivot: swing.pivot, angle: swing.angle * s });
    }
    if (pose) for (const i of move.parts) poses.set(`${feature.id}#${i}`, pose);
  }
  const moving = bodies.filter((id) => poses.has(id));
  if (!moving.length) return null;
  return { key: feature.id, bodies: moving, pose: (s, id) => poses.get(id)!(s) };
}

export function bindDrawers(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const canvas = viewport.renderer.domElement;
  const open = new Map<string, Open>();
  let down: { x: number; y: number } | null = null;
  // What the 3D shows: a preview not yet recorded (a run of the kitchen plan being changed), else the project.
  const shown = () => editor.previewDoc ?? editor.doc;

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
      for (const id of bodies) viewport.setBodyPose(id, s === 0 ? null : pose(s, id));
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
      const label = (id: string) => bodyLabel(shown(), id);
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
      const swing = doorSwing(shown(), id, boxOf(id));
      if (swing) {
        const item = doorItem(doorWithHandle(shown(), id), swing);
        found.set(item.key, item);
      }
    }
    return [...found.values()];
  };
  const drawers = (): Item[] => {
    const found = new Map<string, Item>();
    for (const id of viewport.displayedBodies) {
      const drawer = drawerBodies(shown(), viewport.displayedBodies, id);
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
  editor.afterRender(() => {
    showButtons();
  });

  const toggle = (bodyId: string) => {
    const doc = shown();
    const swing = doorSwing(doc, bodyId, boxOf(bodyId));
    const drawer = swing ? null : drawerBodies(doc, viewport.displayedBodies, bodyId);
    const accessory = swing || drawer ? null : accessoryOpening(doc, viewport.displayedBodies, bodyId);
    if (swing) flipItem(doorItem(doorWithHandle(doc, bodyId), swing));
    else if (drawer) flipItem(drawerItem(drawer));
    else if (accessory?.pose) flipItem({ key: accessory.key, bodies: accessory.bodies, pose: () => accessory.pose! });
    else if (accessory) flipItem(drawerItem(accessory));
    showButtons();
  };

  // « Ouvrir / fermer la porte » of its menu (app/door-menu.ts).
  document.addEventListener("cad:toggle-door", (event) => toggle((event as CustomEvent<string>).detail));

  canvas.addEventListener("pointerdown", (event) => {
    // A click begun while a tool held the view is that tool's, even when the tool closes on it.
    down = event.button === 0 && !viewport.inSketch ? { x: event.clientX, y: event.clientY } : null;
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
