/** « Déplacer ce trait » : les coins d'un trait vont ailleurs, les faces du corps s'étirent pour les suivre. */
import type { Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import type { CadDocument, Feature, ModifierFeature, Vec3 } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

// The board of the request: 300 × 282 × 50, its front-left corner 82 mm from the side and 100 mm behind its front.
const board: Feature[] = [
  { id: "s", type: "sketch", name: "Planche", plane: "XY", offset: 0, points: [[100, 100], [400, 100], [400, 382], [100, 382]].map(([x, y], i) => ({ id: `p${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `l${i}`, kind: "line", p1: `p${i}`, p2: `p${(i + 1) % 4}` })), constraints: [] } as Feature,
  { id: "e", type: "extrude", name: "Planche", sketch: "s", distance: 50, operation: "new" },
];
const move = (moves: ModifierFeature["moves"]): ModifierFeature => ({ id: "m", type: "modifier", name: "Trait déplacé", target: "e", kind: "points", amount: 0, moves });

function built(feature: ModifierFeature) {
  const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [...board, feature] };
  expect(validateDocument(doc)).toEqual([]);
  const r = new Recomputer();
  try {
    const status = r.recompute(doc).statuses.find((s) => s.id === "m");
    const out = r.output("m");
    return { state: status?.state, message: status?.message, metrics: out?.kind === "solid" ? bodyMetrics(out.shape as Shape3D) : null, faces: out?.kind === "solid" ? (out.shape as Shape3D).faces.length : 0 };
  } finally {
    r.dispose();
  }
}

/** Area of a polygon of the floor (shoelace). */
const area = (pts: [number, number][]) => Math.abs(pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * y, 0)) / 2;

describe("déplacer un trait", () => {
  it("le trait vertical avant gauche amené au coin du côté : le dessus devient un quadrilatère, six faces planes", () => {
    const shift: Vec3 = [-82, -100, 0];
    const ends: Vec3[] = [[100, 100, 0], [100, 100, 50]];
    const result = built(move(ends.map((from) => ({ from, to: from.map((c, i) => c + shift[i]!) as Vec3 }))));
    expect(result.state).toBe("ok");
    expect(result.metrics!.volume).toBeCloseTo(area([[18, 0], [400, 100], [400, 382], [100, 382]]) * 50, 3);
    expect(result.metrics!.bbox[0][0]).toBeCloseTo(18, 6);
    expect(result.metrics!.bbox[0][1]).toBeCloseTo(0, 6);
    // The faces left flat are merged again: a six-sided solid, like the board.
    expect(result.faces).toBe(6);
  });

  it("un trait qui n'est plus sur le corps est signalé", () => {
    const result = built(move([{ from: [5, 5, 5], to: [0, 0, 0] }]));
    expect(result.state).not.toBe("ok");
    expect(result.message).toContain("n'est plus sur le corps");
  });
});
