/**
 * Pointer gestures on the 3D view: a tool can claim a drag before the camera turns, Maj + glisser (or the
 * "Fenêtre" button) draws a selection window, and a click (no drag) goes to the tool, the view gizmo,
 * Sélection++ or the selection, in that order.
 */
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import type { WindowOverlay, ScreenPoint } from "./window-select";

/** Receives canvas pointer events while a tool is active; `down` returns true to take the drag. */
export interface PointerHandler {
  down(event: PointerEvent): boolean;
  move(event: PointerEvent): void;
  up(event: PointerEvent, isClick: boolean): boolean;
  /** The gesture was taken away (a system gesture on a tablet, the capture lost): what it was doing is let go. */
  cancel?(): void;
}

export interface PointerTarget {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  controls: OrbitControls;
  viewHelper: ViewHelper;
  windowOverlay: WindowOverlay;
  handler(): PointerHandler | null;
  windowSelect(): boolean;
  clickOverride(event: PointerEvent): boolean;
  select(event: PointerEvent): void;
  finishWindow(start: ScreenPoint, end: ScreenPoint): void;
}

/** Most a pointer may move (pixels) and still make a click. */
const CLICK_PX = 5;

export function bindPointerInput(t: PointerTarget): { windowDragging(): boolean } {
  const { canvas, controls } = t;
  let pointerDown: { x: number; y: number } | null = null;
  let exclusivePointer: number | null = null;
  let windowDrag: { pointerId: number; start: ScreenPoint; end: ScreenPoint } | null = null;
  const canvasPoint = (event: PointerEvent): ScreenPoint => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const far = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(b[0] - a[0], b[1] - a[1]) > CLICK_PX;

  // Capture phase on the container runs before OrbitControls' own listener on the canvas,
  // so a tool can claim a gesture (e.g. dragging a handle) before the camera reacts.
  t.container.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target !== canvas) return;
      if (windowDrag) {
        // A second finger: the window gives way to the camera.
        windowDrag = null;
        t.windowOverlay.hide();
        return;
      }
      pointerDown = { x: event.clientX, y: event.clientY };
      const handler = t.handler();
      if (!handler && event.button === 0 && (event.shiftKey || t.windowSelect())) {
        // Window selection: Maj + glisser, or any drag while the "Fenêtre" button is on.
        event.stopPropagation();
        canvas.setPointerCapture(event.pointerId);
        const at = canvasPoint(event);
        windowDrag = { pointerId: event.pointerId, start: at, end: at };
        return;
      }
      if (handler && event.button === 0 && handler.down(event)) {
        event.stopPropagation();
        canvas.setPointerCapture(event.pointerId);
        exclusivePointer = event.pointerId;
        controls.enabled = false;
      }
    },
    { capture: true },
  );
  canvas.addEventListener("pointermove", (event) => {
    // A drag taken by a tool follows its own finger only: a second finger laid meanwhile does not move it.
    if (exclusivePointer !== null && event.pointerId !== exclusivePointer) return;
    if (windowDrag?.pointerId === event.pointerId) {
      windowDrag.end = canvasPoint(event);
      if (far(windowDrag.start, windowDrag.end)) t.windowOverlay.show(windowDrag.start, windowDrag.end);
      return;
    }
    t.handler()?.move(event);
  });
  // The gesture taken away (the tablet's own gesture, a call, the capture lost): nothing stays held — the camera turns
  // again and the tool lets go (audit of 11/11/2026: the camera could stay frozen after a cancelled touch).
  const letGo = (event: PointerEvent) => {
    windowDrag = null;
    t.windowOverlay.hide();
    if (exclusivePointer === null || event.pointerId !== exclusivePointer) return;
    exclusivePointer = null;
    pointerDown = null;
    controls.enabled = true;
    t.handler()?.cancel?.();
  };
  canvas.addEventListener("pointercancel", letGo);
  canvas.addEventListener("lostpointercapture", (event) => {
    // Lost while still held (released normally, pointerup came first and cleared it).
    if (exclusivePointer === event.pointerId) letGo(event);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (exclusivePointer !== null && event.pointerId !== exclusivePointer) return;
    const start = pointerDown;
    pointerDown = null;
    const drag = windowDrag?.pointerId === event.pointerId ? windowDrag : null;
    if (drag) {
      windowDrag = null;
      t.windowOverlay.hide();
      drag.end = canvasPoint(event);
      // A click without dragging stays a click (Maj + clic adds to the selection).
      if (!far(drag.start, drag.end)) {
        if (!t.clickOverride(event)) t.select(event);
      } else t.finishWindow(drag.start, drag.end);
      return;
    }
    if (exclusivePointer === event.pointerId) {
      exclusivePointer = null;
      controls.enabled = true;
    }
    // A click (not a drag) selects; drags belong to the camera controls.
    const isClick = !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= CLICK_PX;
    const handler = t.handler();
    if (handler && event.button === 0 && handler.up(event, isClick)) return;
    if (!isClick || handler) return;
    if (t.viewHelper.handleClick(event)) return;
    if (t.clickOverride(event)) return;
    t.select(event);
  });
  return { windowDragging: () => windowDrag !== null };
}
