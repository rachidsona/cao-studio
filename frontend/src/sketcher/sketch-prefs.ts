/** Choices of the sketcher remembered in this browser: grid snapping (on by default) and constraint symbols (off). */
const GLYPHS_KEY = "cao-studio:sketch-glyphs";
const GRID_SNAP_KEY = "cao-studio:sketch-grid-snap";
const POINTS_KEY = "cao-studio:sketch-points";

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
