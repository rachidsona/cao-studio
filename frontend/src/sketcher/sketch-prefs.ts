/**
 * Choices of the sketcher remembered in this browser: grid, geometry and smart snapping (on by default) and constraint
 * symbols (off).
 */
const GLYPHS_KEY = "cao-studio:sketch-glyphs";
const GRID_SNAP_KEY = "cao-studio:sketch-grid-snap";
const POINTS_KEY = "cao-studio:sketch-points";
const GEOMETRY_SNAP_KEY = "cao-studio:sketch-geometry-snap";
const SMART_SNAP_KEY = "cao-studio:sketch-smart-snap";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice simply does not persist.
  }
}

export const sketchPrefs = {
  get gridSnap(): boolean {
    return read(GRID_SNAP_KEY) !== "0";
  },
  set gridSnap(on: boolean) {
    write(GRID_SNAP_KEY, on ? "1" : "0");
  },
  /** On the points and lines of the sketch. */
  get geometrySnap(): boolean {
    return read(GEOMETRY_SNAP_KEY) !== "0";
  },
  set geometrySnap(on: boolean) {
    write(GEOMETRY_SNAP_KEY, on ? "1" : "0");
  },
  /** In line with the points of the sketch (dashed guides). */
  get smartSnap(): boolean {
    return read(SMART_SNAP_KEY) !== "0";
  },
  set smartSnap(on: boolean) {
    write(SMART_SNAP_KEY, on ? "1" : "0");
  },
  /** The black points at the ends of the lines: hidden by default (they stay pickable, and show when pointed at). */
  get points(): boolean {
    return read(POINTS_KEY) === "1";
  },
  set points(on: boolean) {
    write(POINTS_KEY, on ? "1" : "0");
  },
  get glyphs(): boolean {
    return read(GLYPHS_KEY) === "1";
  },
  set glyphs(on: boolean) {
    write(GLYPHS_KEY, on ? "1" : "0");
  },
};

/** Turns a snapping on or off, wherever its button is (sketch or model): the buttons of both follow. */
export const SNAP_CHANGE = "cao-studio:snap-change";

export function toggleSnap(which: "geometrySnap" | "smartSnap"): string {
  sketchPrefs[which] = !sketchPrefs[which];
  window.dispatchEvent(new Event(SNAP_CHANGE));
  return `${which === "geometrySnap" ? "Accrochage à la géométrie" : "Accrochage intelligent"} ${sketchPrefs[which] ? "activé" : "désactivé"}.`;
}
