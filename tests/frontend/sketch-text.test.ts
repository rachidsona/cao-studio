/** Textes d'esquisse : le noyau écrit les lettres là où l'écran les dessine, et on peut les graver. */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Shape3D } from "replicad";
import { createReferencePlate, type SketchFeature } from "../../frontend/src/document/types";
import { loadTextFont } from "../../frontend/src/features/text";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setTextFont, textBox } from "../../frontend/src/sketcher/text-outline";
import { setupKernel } from "./kernel-setup";

const font = readFileSync("node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff");
const bytes = font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer;

beforeAll(async () => {
  await setupKernel();
  await loadTextFont(bytes);
  setTextFont(bytes);
});

let messages: string[] = [];

function solid(recomputer: Recomputer, id: string): Shape3D {
  const output = recomputer.output(id);
  if (output?.kind !== "solid") throw new Error(`pas de solide pour ${id} : ${messages.join(" / ")}`);
  return output.shape;
}

describe("textes d'esquisse", () => {
  it("une lettre seule s'extrude, exactement dans la boîte dessinée à l'écran", () => {
    const doc = createReferencePlate();
    const text = { id: "t1", text: "O", x: -20, y: 5, height: 10, angle: 0 };
    doc.features = [
      { id: "sk2", type: "sketch", name: "Texte", plane: "XY", offset: 10, points: [], curves: [], constraints: [], texts: [text] } as SketchFeature,
      { id: "ex2", type: "extrude", name: "Lettres", sketch: "sk2", distance: 2, operation: "new" },
    ];
    const recomputer = new Recomputer();
    messages = recomputer.recompute(doc).statuses.map((st) => `${st.id}: ${st.message ?? st.state}`);
    const box = bodyMetrics(solid(recomputer, "ex2")).bbox;
    const [lo, hi] = textBox(text);
    expect(box[0][0]).toBeCloseTo(lo[0], 0);
    expect(box[1][0]).toBeCloseTo(hi[0], 0);
    expect(box[0][1]).toBeCloseTo(lo[1], 0);
    expect(box[1][1]).toBeCloseTo(hi[1], 0);
    expect(box[1][2] - box[0][2]).toBeCloseTo(2, 6);
  });

  it("un texte gravé dans la plaque retire de la matière", () => {
    const doc = createReferencePlate();
    doc.features.push(
      { id: "sk2", type: "sketch", name: "Gravure", plane: "XY", offset: 10, points: [], curves: [], constraints: [], texts: [{ id: "t1", text: "OK", x: -30, y: -20, height: 8 }] } as SketchFeature,
      { id: "ex2", type: "extrude", name: "Gravure", sketch: "sk2", distance: -1, operation: "cut", target: "h1" },
    );
    const recomputer = new Recomputer();
    messages = recomputer.recompute(doc).statuses.map((st) => `${st.id}: ${st.message ?? st.state}`);
    const before = bodyMetrics(solid(recomputer, "h1")).volume;
    const after = bodyMetrics(solid(recomputer, "ex2")).volume;
    expect(after).toBeLessThan(before - 5);
  });
});

describe("textes et solveur", () => {
  it("le solveur garde les textes de l'esquisse", async () => {
    const { solveSketch, initSolver } = await import("../../frontend/src/constraints/solver");
    await initSolver();
    const { centeredRectangle } = await import("../../frontend/src/document/sketch");
    const g = { ...centeredRectangle(80, 50), texts: [{ id: "t1", text: "A", x: 0, y: 0, height: 5 }] };
    expect(solveSketch(g).geometry.texts).toEqual(g.texts);
  });
});
