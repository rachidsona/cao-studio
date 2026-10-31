/** Image de référence de l'esquisse : gardée avec elle, validée, et mise à l'échelle par deux points. */
import { beforeAll, describe, expect, it } from "vitest";
import { scaleUnderlay } from "../../frontend/src/app/sketch-underlay";
import { emptySketchGeometry, type SketchUnderlay } from "../../frontend/src/document/sketch";
import { createReferencePlate } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { cloneGeometry } from "../../frontend/src/sketcher/edit";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";

const IMAGE = "data:image/png;base64,iVBORw0KGgo=";
const U: SketchUnderlay = { image: IMAGE, x: 100, y: 50, width: 1000, height: 750, opacity: 0.5 };

describe("image de référence", () => {
  beforeAll(() => initSolver());
  it("se met à l'échelle autour du premier point cliqué", () => {
    // Two points measured 400 mm apart on the image, really 600 apart: everything grows by 1.5 around (300, 250).
    expect(scaleUnderlay(U, [300, 250], 1.5)).toEqual({ ...U, x: 0, y: -50, width: 1500, height: 1125 });
  });

  it("reste avec l'esquisse (copie, solveur) et se valide avec le document", () => {
    const g = { ...emptySketchGeometry(), underlay: U };
    expect(cloneGeometry(g).underlay).toEqual(U);
    expect(solveSketch(g).geometry.underlay).toEqual(U);
    const plate = createReferencePlate();
    const doc = { ...plate, features: plate.features.map((f) => (f.type === "sketch" ? { ...f, underlay: U } : f)) };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    const bad = { ...plate, features: plate.features.map((f) => (f.type === "sketch" ? { ...f, underlay: { ...U, image: "http://x/y.png" } } : f)) };
    expect(() => parseDocument(bad)).toThrow(/image de référence/);
  });
});
