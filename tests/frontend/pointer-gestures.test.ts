/**
 * Les gestes au doigt sur la vue (audit d'architecture du 11/11/2026) : un geste annulé par la tablette rend la caméra
 * et prévient l'outil ; un deuxième doigt posé pendant qu'un outil tire une poignée ne la déplace pas.
 */
import { describe, expect, it, vi } from "vitest";
import { bindPointerInput, type PointerHandler } from "../../frontend/src/viewport/pointer-input";

function pointer(type: string, pointerId: number, x = 10, y = 10): Event {
  return Object.assign(new Event(type), { pointerId, clientX: x, clientY: y, button: 0, shiftKey: false, ctrlKey: false, metaKey: false });
}

function setup(handler: PointerHandler) {
  const container = new EventTarget() as unknown as HTMLElement;
  const canvas = Object.assign(new EventTarget(), {
    setPointerCapture: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  }) as unknown as HTMLCanvasElement;
  const controls = { enabled: true } as { enabled: boolean };
  bindPointerInput({
    container, canvas, controls: controls as never,
    viewHelper: { handleClick: () => false } as never,
    windowOverlay: { show: () => undefined, hide: () => undefined } as never,
    handler: () => handler, windowSelect: () => false, clickOverride: () => false, select: () => undefined, finishWindow: () => undefined,
  });
  // The container's capture listener checks that the target is the canvas.
  const down = (id: number) => {
    const event = pointer("pointerdown", id);
    Object.defineProperty(event, "target", { value: canvas });
    container.dispatchEvent(event);
  };
  return { canvas, controls, down };
}

describe("gestes au doigt", () => {
  it("un geste annulé rend la caméra et prévient l'outil", () => {
    const handler = { down: () => true, move: vi.fn(), up: vi.fn(() => true), cancel: vi.fn() };
    const { canvas, controls, down } = setup(handler);
    down(1);
    expect(controls.enabled).toBe(false);
    canvas.dispatchEvent(pointer("pointercancel", 1));
    expect(controls.enabled).toBe(true);
    expect(handler.cancel).toHaveBeenCalledOnce();
  });

  it("une capture perdue en plein geste fait de même", () => {
    const handler = { down: () => true, move: vi.fn(), up: vi.fn(() => true), cancel: vi.fn() };
    const { canvas, controls, down } = setup(handler);
    down(1);
    canvas.dispatchEvent(pointer("lostpointercapture", 1));
    expect(controls.enabled).toBe(true);
    expect(handler.cancel).toHaveBeenCalledOnce();
  });

  it("un deuxième doigt ne déplace ni ne relâche la poignée tirée par le premier", () => {
    const handler = { down: () => true, move: vi.fn(), up: vi.fn(() => true), cancel: vi.fn() };
    const { canvas, down } = setup(handler);
    down(1);
    canvas.dispatchEvent(pointer("pointermove", 2, 50, 50));
    canvas.dispatchEvent(pointer("pointerup", 2, 50, 50));
    expect(handler.move).not.toHaveBeenCalled();
    expect(handler.up).not.toHaveBeenCalled();
    canvas.dispatchEvent(pointer("pointermove", 1, 20, 10));
    canvas.dispatchEvent(pointer("pointerup", 1, 20, 10));
    expect(handler.move).toHaveBeenCalledOnce();
    expect(handler.up).toHaveBeenCalledOnce();
  });
});
