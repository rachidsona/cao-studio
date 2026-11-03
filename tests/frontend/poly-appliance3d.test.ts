/** Vue 3D de la pièce (atelier poly_3D) : les portes d'un caisson s'ouvrent autour d'un four encastré, et le four a sa face. */
import { describe, expect, it } from "vitest";
// @ts-expect-error -- a plain JavaScript module of the workshop (apps/furniture/static/poly/js).
import { applianceFront, doorSpans } from "../../apps/furniture/static/poly/js/appliance3d.js";

describe("portes autour d'un appareil encastré", () => {
  it("une colonne avec un four de 80 à 140 cm : une porte dessous, une dessus", () => {
    expect(doorSpans(100, 2196, [[800, 1400]])).toEqual([[100, 796], [1404, 2196]]);
  });
  it("sans appareil, la porte entière ; un reste trop petit ne fait pas de porte", () => {
    expect(doorSpans(100, 2196, [])).toEqual([[100, 2196]]);
    expect(doorSpans(100, 720, [[120, 720]])).toEqual([]);
  });
});

describe("face d'un four", () => {
  it("un cadre, un bandeau, une porte, sa vitre, ses boutons et sa poignée, devant la face du caisson", () => {
    const front = applianceFront("oven", 600, 600, 560);
    expect(front.children.length).toBeGreaterThanOrEqual(9);
    const zs = front.children.map((c: { position: { z: number } }) => c.position.z);
    expect(Math.min(...zs)).toBeGreaterThan(540);
  });
  it("un micro-ondes : sa fenêtre à gauche, ses touches à droite", () => {
    expect(applianceFront("microwave", 600, 380, 400).children.length).toBeGreaterThanOrEqual(5);
  });
});
