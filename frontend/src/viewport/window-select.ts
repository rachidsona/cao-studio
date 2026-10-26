/**
 * Window selection, as in Fusion: a rectangle dragged in the view selects the
 * bodies and sketches it holds. Dragged from left to right ("fenêtre"), only
 * what lies entirely inside; from right to left ("capture"), anything it
 * touches. The tests run on screen polylines (pixels), so they do not depend
 * on the camera.
 */
export type ScreenPoint = [number, number];

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type WindowMode = "window" | "crossing";

/** The rectangle between two corners, and its mode from the direction of the drag. */
export function windowFrom(start: ScreenPoint, end: ScreenPoint): { rect: ScreenRect; mode: WindowMode } {
  return {
    rect: { x0: Math.min(start[0], end[0]), y0: Math.min(start[1], end[1]), x1: Math.max(start[0], end[0]), y1: Math.max(start[1], end[1]) },
    mode: end[0] >= start[0] ? "window" : "crossing",
  };
}

const inside = (r: ScreenRect, [x, y]: ScreenPoint) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

/** Whether the segment a–b meets the rectangle (Liang–Barsky clipping). */
function segmentMeets(r: ScreenRect, a: ScreenPoint, b: ScreenPoint): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] - r.x0],
    [dx, r.x1 - a[0]],
    [-dy, a[1] - r.y0],
    [dy, r.y1 - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Whether an object drawn as these polylines (a single point is a polyline of one point) is taken by the
 * rectangle: all of it inside ("window"), or any part of it inside ("crossing"). Nothing drawn: not taken.
 */
export function takenByWindow(rect: ScreenRect, mode: WindowMode, polylines: ScreenPoint[][]): boolean {
  const points = polylines.flat();
  if (points.length === 0) return false;
  if (mode === "window") return points.every((p) => inside(rect, p));
  return polylines.some((line) => (line.length === 1 ? inside(rect, line[0] as ScreenPoint) : line.some((p, i) => i > 0 && segmentMeets(rect, line[i - 1] as ScreenPoint, p))));
}

/** The rectangle drawn over the view while dragging: solid blue for a window, dashed green for a crossing. */
export class WindowOverlay {
  private readonly box: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.box = document.createElement("div");
    this.box.className = "pointer-events-none absolute hidden border";
    container.appendChild(this.box);
  }

  show(start: ScreenPoint, end: ScreenPoint): void {
    const { rect, mode } = windowFrom(start, end);
    Object.assign(this.box.style, {
      left: `${rect.x0}px`,
      top: `${rect.y0}px`,
      width: `${rect.x1 - rect.x0}px`,
      height: `${rect.y1 - rect.y0}px`,
      borderStyle: mode === "window" ? "solid" : "dashed",
      borderColor: mode === "window" ? "#2563eb" : "#16a34a",
      background: mode === "window" ? "rgba(37, 99, 235, 0.12)" : "rgba(22, 163, 74, 0.12)",
    });
    this.box.classList.remove("hidden");
  }

  hide(): void {
    this.box.classList.add("hidden");
  }

  dispose(): void {
    this.box.remove();
  }
}
