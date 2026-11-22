/**
 * Les trois axes de la vue, comme dans SketchUp : des droites par l'origine, rouge (X), verte (Y) et bleue (Z), pleines
 * du côté positif, en tirets du côté négatif, pour dessiner en s'y repérant (Magie extrusion). Affichés ou cachés au
 * choix, gardé dans ce navigateur ; cachés au départ.
 */
import * as THREE from "three";
import type { Viewport } from "./viewport";

const KEY = "cao.axes-visible";
/** How far each axis runs from the origin (mm): a room and more. */
const REACH = 50_000;
const COLORS = [0xef4444, 0x22c55e, 0x3b82f6];

const made = new WeakMap<Viewport, THREE.Group>();

function axesOf(viewport: Viewport): THREE.Group {
  const found = made.get(viewport);
  if (found) return found;
  const group = new THREE.Group();
  group.name = "world-axes";
  COLORS.forEach((color, axis) => {
    const end = (sign: number) => new THREE.Vector3(...[0, 1, 2].map((k) => (k === axis ? sign * REACH : 0)));
    const plus = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), end(1)]), new THREE.LineBasicMaterial({ color }));
    const minus = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), end(-1)]), new THREE.LineDashedMaterial({ color, dashSize: 40, gapSize: 30 }));
    minus.computeLineDistances();
    group.add(plus, minus);
  });
  group.visible = false;
  viewport.scene.add(group);
  made.set(viewport, group);
  return group;
}

export const axesVisible = (viewport: Viewport): boolean => made.get(viewport)?.visible ?? false;

export function setAxesVisible(viewport: Viewport, on: boolean): void {
  axesOf(viewport).visible = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Kept for this page only.
  }
}

/** At the page's start: the axes as they were left. */
export function restoreAxes(viewport: Viewport): void {
  let on = false;
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch {
    // No storage: hidden.
  }
  if (on) setAxesVisible(viewport, true);
}
