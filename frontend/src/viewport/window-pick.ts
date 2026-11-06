/**
 * What a selection window dragged in the view holds: the bodies and sketches whose screen projection it takes
 * (left to right: entirely inside; right to left: touched). See window-select.ts for the tests on the screen.
 */
import * as THREE from "three";
import type { BodyObject } from "./body-layer";
import { takenByWindow, windowFrom, type ScreenPoint } from "./window-select";

export interface WindowScene {
  camera: THREE.Camera;
  /** Canvas size in pixels. */
  width: number;
  height: number;
  bodies: ReadonlyMap<string, BodyObject>;
  sketches: { id: string; lines: THREE.Vector3[][] }[];
  /** Body seen at a canvas point, if any. */
  bodyAt(x: number, y: number): string | null;
}

export function windowPick(start: ScreenPoint, end: ScreenPoint, scene: WindowScene): { bodies: string[]; sketches: string[] } {
  const { rect, mode } = windowFrom(start, end);
  const screen = (v: THREE.Vector3): ScreenPoint | null => {
    const p = v.project(scene.camera);
    return p.z < -1 || p.z > 1 ? null : [((p.x + 1) / 2) * scene.width, ((1 - p.y) / 2) * scene.height];
  };
  /** Screen polylines of an object, or null when part of it is behind the camera (a window cannot hold it). */
  const project = (lines: THREE.Vector3[][]): ScreenPoint[][] | null => {
    const out: ScreenPoint[][] = [];
    for (const line of lines) {
      const points = line.map(screen);
      if (points.some((p) => p === null)) {
        if (mode === "window") return null;
        continue;
      }
      out.push(points as ScreenPoint[]);
    }
    return out;
  };
  // A crossing window inside a single face touches no edge: the body under its centre is taken too.
  const center = mode === "crossing" ? scene.bodyAt((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2) : null;
  const bodies = [...scene.bodies.values()].filter(({ data, mesh }) => {
    if (!mesh.visible) return false;
    if (data.bodyId === center) return true;
    const lines: THREE.Vector3[][] = [];
    for (let i = 0; i + 5 < data.edges.length; i += 6) {
      lines.push([new THREE.Vector3(data.edges[i], data.edges[i + 1], data.edges[i + 2]), new THREE.Vector3(data.edges[i + 3], data.edges[i + 4], data.edges[i + 5])]);
    }
    const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) lines.push([new THREE.Vector3().fromBufferAttribute(position, i)]);
    const polylines = project(lines);
    return polylines !== null && takenByWindow(rect, mode, polylines);
  });
  const sketches = scene.sketches.filter(({ lines }) => {
    const polylines = project(lines);
    return polylines !== null && takenByWindow(rect, mode, polylines);
  });
  return { bodies: bodies.map((b) => b.data.bodyId), sketches: sketches.map((s) => s.id) };
}
