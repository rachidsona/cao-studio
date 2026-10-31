/**
 * What the sketcher's panel tools (Décalage, Déplacer, Réseau rectangulaire) see of the sketch mode: the
 * geometry and its live selection, the keypad's container, snapping, and the commit rule; their preview is
 * drawn by the mode, which forgets them when they close.
 */
import type { SketchArrayTool } from "./array-tool";
import type { ShelvesTool } from "./shelves-tool";
import type { SketchPartitionTool } from "./partition-tool";
import * as THREE from "three";
import { toWorld } from "./frame";
import { pointerSnap } from "./smart-snap";
import type { SketchMode } from "./mode";
import type { SketchMoveTool } from "./move-tool";
import type { OffsetTool } from "./offset-tool";
import type { EdgeOffsetTool } from "./edge-offset-tool";

/** Draws the tool's preview again. */
function refresh(mode: SketchMode, preview: SketchMode["preview"]): void {
  mode.preview = preview;
  mode.render();
  mode.host.changed();
}

export function arrayHost(mode: SketchMode): ConstructorParameters<typeof SketchArrayTool>[0] {
  return {
    geometry: () => mode.geometry,
    // The sketch replaces its selection set on undo/redo: always read the current one.
    get selection() {
      return mode.selection;
    },
    container: () => mode.host.calculatorContainer(),
    unit: () => mode.host.unit(),
    tolerance: () => mode.tolerance(),
    apply: (geometry, success) => mode.apply(geometry, success),
    changed: () => refresh(mode, mode.arrayTool?.preview ?? null),
    closed: () => {
      mode.arrayTool = null;
      refresh(mode, null);
    },
    notify: (message, kind) => mode.host.notify(message, kind),
  };
}

export function moveHost(mode: SketchMode): ConstructorParameters<typeof SketchMoveTool>[0] {
  return {
    geometry: () => mode.geometry,
    get selection() {
      return mode.selection;
    },
    container: () => mode.host.calculatorContainer(),
    unit: () => mode.host.unit(),
    viewport: mode.viewport,
    frame: () => mode.frame,
    world: ([x, y]) => toWorld(mode.frame, x, y),
    toSketch: (event) => mode.toSketch(event),
    // On the points and lines (if on) or the grid; no alignment guides while moving.
    snap: (p, exclude) => {
      return pointerSnap(mode.geometry, p, { tolerance: mode.tolerance(), geometry: mode.geometrySnap, smart: false, grid: mode.gridSnap ? mode.viewport.gridStep : null, exclude }).pos;
    },
    tolerance: () => mode.tolerance(),
    apply: (geometry, success) => mode.apply(geometry, success),
    changed: () => refresh(mode, mode.moveTool?.preview ?? null),
    closed: () => {
      mode.moveTool = null;
      refresh(mode, null);
    },
    notify: (message, kind) => mode.host.notify(message, kind),
  };
}

export function shelvesHost(mode: SketchMode): ConstructorParameters<typeof ShelvesTool>[0] {
  return {
    geometry: () => mode.geometry,
    regions: () => mode.faces,
    // The sketch replaces its selection set on undo/redo: always read the current one.
    get selection() {
      return mode.selection;
    },
    container: () => mode.host.calculatorContainer(),
    unit: () => mode.host.unit(),
    apply: (geometry, success, extrusion) => mode.apply(geometry, success, extrusion),
    offsetId: () => mode.host.offsetId(),
    changed: () => refresh(mode, mode.shelves?.preview ?? null),
    closed: () => {
      mode.shelves = null;
      refresh(mode, null);
    },
    notify: (message, kind) => mode.host.notify(message, kind),
  };
}

export function partitionHost(mode: SketchMode): ConstructorParameters<typeof SketchPartitionTool>[0] {
  return {
    geometry: () => mode.geometry,
    container: () => mode.host.calculatorContainer(),
    unit: () => mode.host.unit(),
    apply: (geometry, success, extrusion) => mode.apply(geometry, success, extrusion),
    offsetId: () => mode.host.offsetId(),
    flat: () => Math.abs(mode.frame.normal[2]) > 0.9,
    changed: () => refresh(mode, mode.partition?.preview ?? null),
    fit: ([x0, y0], [x1, y1]) => {
      const box = new THREE.Box3().setFromPoints([new THREE.Vector3(...toWorld(mode.frame, x0, y0)), new THREE.Vector3(...toWorld(mode.frame, x1, y1))]);
      mode.viewport.fitBox(box, 1.35);
    },
    closed: () => {
      mode.partition = null;
      refresh(mode, null);
    },
    notify: (message, kind) => mode.host.notify(message, kind),
  };
}

export function edgeOffsetHost(mode: SketchMode): ConstructorParameters<typeof EdgeOffsetTool>[0] {
  return {
    geometry: () => mode.geometry,
    display: (geometry, preview) => {
      mode.geometry = geometry;
      refresh(mode, preview);
    },
    container: () => mode.host.calculatorContainer(),
    viewport: mode.viewport,
    world: ([x, y]) => toWorld(mode.frame, x, y),
    direction: ([x, y]) => {
      const { u, v } = mode.frame;
      return [u[0] * x + v[0] * y, u[1] * x + v[1] * y, u[2] * x + v[2] * y];
    },
    unit: () => mode.host.unit(),
    compute: (paths, distance, join) => mode.host.offset(paths, distance, join),
    newOffsetId: () => mode.host.offsetId(),
    apply: (geometry, success) => mode.apply(geometry, success),
    notify: (message, kind) => mode.host.notify(message, kind),
    // Échap: back to the selection tool, the copies made stay.
    closed: () => {
      mode.edgeOffset = null;
      mode.setTool("select");
    },
  };
}

export function offsetHost(mode: SketchMode): ConstructorParameters<typeof OffsetTool>[0] {
  return {
    geometry: () => mode.geometry,
    get selection() {
      return mode.selection;
    },
    container: () => mode.host.calculatorContainer(),
    viewport: mode.viewport,
    world: ([x, y]) => toWorld(mode.frame, x, y),
    direction: ([x, y]) => {
      const { u, v } = mode.frame;
      return [u[0] * x + v[0] * y, u[1] * x + v[1] * y, u[2] * x + v[2] * y];
    },
    unit: () => mode.host.unit(),
    compute: (paths, distance, join) => mode.host.offset(paths, distance, join),
    newOffsetId: () => mode.host.offsetId(),
    apply: (geometry, success) => mode.apply(geometry, success),
    changed: () => refresh(mode, mode.offset?.preview ?? null),
    // The offset curves made are left selected.
    closed: (created) => {
      mode.viewport.renderer.domElement.style.cursor = "";
      mode.offset = null;
      mode.selection.clear();
      for (const id of created) mode.selection.add(id);
      refresh(mode, null);
    },
    notify: (message, kind) => mode.host.notify(message, kind),
  };
}
