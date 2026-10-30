/** « Décaler l'arête » without a dialog: a click copies at once, the copy is remade in place, Échap keeps it. */
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { offsetPaths } from "../../frontend/src/geometry/offset";
import { EdgeOffsetTool, typedDigit, type EdgeOffsetHost } from "../../frontend/src/sketcher/edge-offset-tool";
import { addRectangle, pointPos } from "../../frontend/src/sketcher/edit";
import type { Viewport } from "../../frontend/src/viewport/viewport";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

// The arrow's label is a DOM element: a stand-in is enough in Node.
const element = () => ({ style: {}, className: "", textContent: "", addEventListener() {}, setAttribute() {}, remove() {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, height: 0 }) });
(globalThis as { document?: unknown }).document ??= { createElement: element };

const viewport = { scene: new THREE.Scene(), onEachFrame: () => () => {}, worldPerPixel: () => 1, intersect: () => [] } as unknown as Viewport;
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function setup() {
  let geometry: SketchGeometry = addRectangle({ points: [], curves: [], constraints: [] }, { at: [0, 0] }, { at: [100, 50] }).geometry;
  let ids = 0;
  const host: EdgeOffsetHost = {
    geometry: () => geometry,
    display: () => {},
    container: () => ({}) as HTMLElement,
    viewport,
    world: ([x, y]) => [x, y, 0],
    direction: ([x, y]) => [x, y, 0],
    unit: () => "mm",
    compute: async (paths, distance, join) => offsetPaths(paths, distance, join),
    apply: (next) => ((geometry = next), true),
    newOffsetId: () => `of${++ids}`,
    notify: () => {},
    closed: () => {},
  };
  const right = geometry.curves.find((c) => c.kind === "line" && pointPos(geometry, c.p1)[0] === 100 && pointPos(geometry, c.p2)[0] === 100)!.id;
  return { host, right, get: () => geometry, set: (g: SketchGeometry) => (geometry = g) };
}

/** The x of the vertical lines made by the offsets. */
const copiesX = (g: SketchGeometry) =>
  (g.offsets ?? []).flatMap((o) => o.curves.map((id) => g.curves.find((c) => c.id === id)!)).map((c) => (c.kind === "line" ? pointPos(g, c.p1)[0] : NaN));

describe("décaler l'arête, sans fenêtre", () => {
  it("un clic sur un trait le copie tout de suite, vers l'intérieur de la forme, à la dernière distance", async () => {
    const { host, right, get } = setup();
    const tool = new EdgeOffsetTool(host);
    tool.pickCurve(right);
    await flush();
    expect(get().curves).toHaveLength(5);
    expect(get().offsets).toEqual([expect.objectContaining({ name: "Arête décalée 1", distance: 10, source: [right] })]);
    expect(copiesX(get())[0]).toBeCloseTo(90, 6);
  });

  it("une nouvelle distance refait la copie à sa place, sans en ajouter", async () => {
    const { host, right, get } = setup();
    const tool = new EdgeOffsetTool(host);
    tool.pickCurve(right);
    await flush();
    await (tool as unknown as { make(d: number): Promise<void> }).make(25);
    expect(get().curves).toHaveLength(5);
    expect(get().offsets).toHaveLength(1);
    expect(get().offsets![0]!.distance).toBe(25);
    expect(copiesX(get())[0]).toBeCloseTo(75, 6);
    // Negative: the other side of the line.
    await (tool as unknown as { make(d: number): Promise<void> }).make(-5);
    expect(copiesX(get())[0]).toBeCloseTo(105, 6);
  });

  it("plusieurs copies de suite (aussi de la copie) jusqu'à Échap, qui les garde", async () => {
    const { host, right, get } = setup();
    let closed = false;
    const tool = new EdgeOffsetTool({ ...host, closed: () => (closed = true) });
    tool.pickCurve(right);
    await flush();
    const first = get().offsets![0]!.curves[0]!;
    tool.pickCurve(first);
    await flush();
    expect(get().offsets!.map((o) => o.name)).toEqual(["Arête décalée 1", "Arête décalée 2"]);
    expect(copiesX(get()).sort()).toEqual([80, 90]);
    tool.cancel();
    expect(closed).toBe(true);
    expect(get().curves).toHaveLength(6);
  });

  it("une copie annulée (Ctrl+Z) est oubliée : la distance ne la refait pas", async () => {
    const { host, right, get, set } = setup();
    const before = get();
    const tool = new EdgeOffsetTool(host);
    tool.pickCurve(right);
    await flush();
    set(before);
    tool.sync();
    await (tool as unknown as { make(d: number): Promise<void> }).make(30);
    expect(get()).toBe(before);
  });

  it("lit les chiffres d'un clavier AZERTY sans Maj", () => {
    expect(typedDigit({ key: "&", code: "Digit1" })).toBe("1");
    expect(typedDigit({ key: "é", code: "Digit2" })).toBe("2");
    expect(typedDigit({ key: "5", code: "Numpad5" })).toBe("5");
    expect(typedDigit({ key: "-", code: "Digit6" })).toBeNull();
    // Signs of a sum keep their meaning, on the digit row too.
    expect(typedDigit({ key: "(", code: "Digit5" })).toBeNull();
    expect(typedDigit({ key: "a", code: "KeyQ" })).toBeNull();
  });
});
