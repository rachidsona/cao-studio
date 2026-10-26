/** Selection of several bodies and sketches: Ctrl/Maj + clic, and the selection window (as in Fusion). */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SelectionLayer } from "../../frontend/src/viewport/selection-layer";
import { takenByWindow, windowFrom, type ScreenPoint } from "../../frontend/src/viewport/window-select";

/** A square drawn as its outline, from (x, y), side s (pixels). */
const square = (x: number, y: number, s: number): ScreenPoint[][] => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];

describe("fenêtre de sélection", () => {
  it("de gauche à droite : fenêtre ; de droite à gauche : capture", () => {
    expect(windowFrom([10, 10], [100, 80]).mode).toBe("window");
    const back = windowFrom([100, 80], [10, 10]);
    expect(back.mode).toBe("crossing");
    expect(back.rect).toEqual({ x0: 10, y0: 10, x1: 100, y1: 80 });
  });

  it("une fenêtre ne prend que ce qui est entièrement dedans", () => {
    const { rect } = windowFrom([0, 0], [100, 100]);
    expect(takenByWindow(rect, "window", square(10, 10, 20))).toBe(true);
    expect(takenByWindow(rect, "window", square(90, 10, 20))).toBe(false); // dépasse à droite
    expect(takenByWindow(rect, "window", [])).toBe(false);
  });

  it("une capture prend ce qu'elle touche, même un trait qui la traverse sans sommet dedans", () => {
    const { rect } = windowFrom([100, 100], [0, 0]);
    expect(takenByWindow(rect, "crossing", square(90, 10, 20))).toBe(true);
    expect(takenByWindow(rect, "crossing", [[[-50, 50], [150, 50]]])).toBe(true); // traverse de part en part
    expect(takenByWindow(rect, "crossing", [[[-50, 150], [150, 150]]])).toBe(false); // passe à côté
    expect(takenByWindow(rect, "crossing", [[[50, 50]]])).toBe(true); // un point seul, dedans
    expect(takenByWindow(rect, "crossing", square(200, 200, 10))).toBe(false);
  });
});

describe("plusieurs corps et esquisses sélectionnés", () => {
  it("Ctrl/Maj + clic ajoute ou retire une esquisse ; la fenêtre ajoute sans doublon", () => {
    const layer = new SelectionLayer(new THREE.Scene());
    layer.toggleSketch("sk1");
    layer.toggleSketch("sk2");
    layer.toggleSketch("sk1");
    expect(layer.sketches).toEqual(["sk2"]);
    layer.add(["ex1", "ex2"], ["sk2", "sk3"]);
    expect(layer.bodies).toEqual(["ex1", "ex2"]);
    expect(layer.sketches).toEqual(["sk2", "sk3"]);
    expect(layer.count).toBe(4);
    expect(layer.snapshot().sketches).toEqual(["sk2", "sk3"]);
  });

  it("une esquisse masquée ou supprimée quitte la sélection", () => {
    const layer = new SelectionLayer(new THREE.Scene());
    layer.add([], ["sk1", "sk2"]);
    expect(layer.pruneSketch(new Set(["sk2"]))).toBe(true);
    expect(layer.sketches).toEqual(["sk2"]);
    layer.clear();
    expect(layer.empty).toBe(true);
  });
});
