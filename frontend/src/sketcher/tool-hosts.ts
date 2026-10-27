/**
 * What the sketcher's panel tools (Décalage, Déplacer, Réseau rectangulaire) see of the sketch mode: the
 * geometry and its live selection, the keypad's container, snapping, and the commit rule; their preview is
 * drawn by the mode, which forgets them when they close.
 */
import type { SketchArrayTool } from "./array-tool";
import { toWorld } from "./frame";
import { snap, snapToGrid } from "./hit";
import type { SketchMode } from "./mode";
import type { SketchMoveTool } from "./move-tool";
import type { OffsetTool } from "./offset-tool";

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
    toSketch: (event) => mode.toSketch(event),
    snap: (p, exclude) => {
      const s = snap(mode.geometry, p, mode.tolerance(), exclude);
      return (mode.gridSnap ? snapToGrid(s, mode.viewport.gridStep) : s).pos;
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
