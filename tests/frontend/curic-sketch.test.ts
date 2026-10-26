/** Curic tools on sketches: box in the model, mirror copy, stretch — the results stay solvable. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument, SketchFeature } from "../../frontend/src/document/types";
import { sketchLevels } from "../../frontend/src/app/select-plus";
import { mirrorSketch, rotateSketch, sketchBox, stretchSketch } from "../../frontend/src/sketcher/sketch-transform";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** 100 × 50 rectangle from (0, 0), with its dimensions, on XY at height 0. */
const rect = (over: Partial<SketchFeature> = {}): SketchFeature => ({ id: "sk", type: "sketch", name: "Rect", plane: "XY", offset: 0, ...rectangleAt(50, 25, 100, 50), ...over });
const round = (b: number[][] | null) => b?.map((p) => p.map((x) => Number(x.toFixed(6)) + 0));

describe("esquisses et outils Curic", () => {
  it("encadrement dans le modèle, y compris décalée et glissée dans son plan", () => {
    expect(round(sketchBox(rect()))).toEqual([[0, 0, 0], [100, 50, 0]]);
    expect(round(sketchBox(rect({ offset: 30, shift: [10, 0] })))).toEqual([[10, 0, 30], [110, 50, 30]]);
  });

  it("symétrie : copie retournée dans son plan, ou sur un plan parallèle ; toujours résoluble", () => {
    const copy = mirrorSketch(rect(), 0, 150, "sk2", "Rect (symétrie)")!;
    expect(copy.id).toBe("sk2");
    expect(round(sketchBox(copy))).toEqual([[200, 0, 0], [300, 50, 0]]);
    expect(solveSketch(copy).state).toBe("ok");
    const above = mirrorSketch(rect({ offset: 0 }), 2, 10, "sk3", "Rect (symétrie)")!;
    expect(above.offset).toBe(20);
  });

  it("étirer : les points au-delà du plan bougent, les cotes suivent", () => {
    const longer = stretchSketch(rect(), 0, 40, 60)!;
    expect(round(sketchBox(longer))).toEqual([[0, 0, 0], [160, 50, 0]]);
    expect(solveSketch(longer).state).toBe("ok");
    expect(stretchSketch(rect(), 0, 120, 60)).toBeNull(); // nothing beyond the plane
    expect(stretchSketch(rect({ offset: 10 }), 2, 5, 20)?.offset).toBe(30); // the whole sketch is beyond: it moves
  });
});

describe("tourner une esquisse dans son plan", () => {
  it("quart de tour autour de son coin : toujours résoluble ; un axe dans son plan ne la tourne pas", () => {
    const turned = rotateSketch(rect(), 2, 90, [0, 0, 0])!;
    expect(round(sketchBox(turned))).toEqual([[-50, 0, 0], [0, 100, 0]]);
    expect(solveSketch(turned).state).toBe("ok");
    const slanted = rotateSketch(rect(), 2, 30, [0, 0, 0])!;
    expect(solveSketch(slanted).state).not.toBe("conflicting");
    expect(rotateSketch(rect(), 0, 90, [0, 0, 0])).toBeNull();
  });
});

describe("Sélection++ sur une esquisse", () => {
  it("niveaux : l'esquisse, puis le trait ou la zone sous le pointeur", () => {
    const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [rect()] };
    const levels = sketchLevels(doc, "sk", { sketchId: "sk", kind: "curve", id: "l1", points: [], measure: 100 }, "mm");
    expect(levels.map((l) => l.kind)).toEqual(["sketch", "item"]);
    expect(levels[0]?.label).toBe("Esquisse « Rect »");
    expect(levels[0]?.target).toEqual({ sketches: ["sk"] });
    expect(levels[1]?.label).toBe("Trait — 100 mm");
    expect(sketchLevels(doc, "sk", null, "mm").map((l) => l.kind)).toEqual(["sketch"]);
  });
});
