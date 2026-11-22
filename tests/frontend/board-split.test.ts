/** « Séparer les côtés » d'un caisson fait de panneaux joints en un seul corps : un corps par panneau. */
import { beforeAll, describe, expect, it } from "vitest";
import { miterOutlines } from "../../frontend/src/features/board-miter";
import { boardBoxes, lyingPass, type AxisFace, type Box } from "../../frontend/src/features/board-split";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

type Rect = [number, number, number, number];
/** A rectangle drawn on the floor, extruded from `z` by `height`. */
function board(id: string, [x0, y0, x1, y1]: Rect, z: number, height: number) {
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return [
    { id: `sk${id}`, type: "sketch", name: `Esquisse ${id}`, plane: "XY", offset: 0, points: corners.map(([x, y], i) => ({ id: `p${id}${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `l${id}${i}`, kind: "line", p1: `p${id}${i}`, p2: `p${id}${(i + 1) % 4}` })), constraints: [] },
    { id: `ex${id}`, type: "extrude", name: `Panneau ${id}`, sketch: `sk${id}`, distance: height, operation: "new", ...(z ? { startOffset: z } : {}) },
  ];
}

/** A sink cabinet as one body: two sides to the floor, a bottom raised over a 150 plinth, two rails at the top. */
async function caisson(pass?: "sides" | "boards", joint: "butt" | "miter" = "butt") {
  const { Recomputer } = await import("../../frontend/src/history/recompute");
  const { createReferencePlate } = await import("../../frontend/src/document/types");
  const doc = { ...createReferencePlate(), features: [
    ...board("1", [0, 0, 18, 580], 0, 864),
    ...board("2", [1182, 0, 1200, 580], 0, 864),
    ...board("3", [18, 0, 1182, 580], 150, 18),
    ...board("4", [18, 0, 1182, 18], 764, 100),
    ...board("5", [18, 562, 1182, 580], 764, 100),
    { id: "cb1", type: "combine", name: "Caisson", target: "ex1", tools: ["ex2", "ex3", "ex4", "ex5"], operation: "join" },
    { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "cb1", faces: [], thickness: 18, sides: "separate", joint, ...(pass ? { pass } : {}), frame: true },
  ] };
  const r = new Recomputer();
  const made = r.recompute(doc as never);
  const out = r.output("sh1");
  const sizes = (out?.kind === "solids" ? out.shapes : []).map((p) => {
    const [lo, hi] = p.boundingBox.bounds;
    return [0, 1, 2].map((i) => Math.round(hi[i]! - lo[i]!)).join("×");
  });
  const status = made.statuses.find((s) => s.id === "sh1");
  r.dispose();
  return { status, sizes: sizes.sort() };
}

describe("un caisson d'un seul corps séparé en panneaux", () => {
  it("sans choix : les côtés jusqu'au sol, le dessous entre eux, les deux traverses — cinq panneaux, aucun coupé en deux", async () => {
    const { status, sizes } = await caisson();
    expect(status?.state).toBe("ok");
    expect(sizes).toEqual(["1164×18×100", "1164×18×100", "1164×580×18", "18×580×864", "18×580×864"]);
  }, 120_000);

  it("en onglet aussi : des panneaux joints se rejoignent bout à bout", async () => {
    const { sizes } = await caisson(undefined, "miter");
    expect(sizes).toHaveLength(5);
  }, 120_000);

  it("« le dessus et le dessous passent » est suivi : le dessous traverse, chaque côté est coupé à sa hauteur", async () => {
    const { status, sizes } = await caisson("boards");
    expect(status?.state).toBe("ok");
    expect(sizes).toContain("1200×580×18");
    expect(sizes).toHaveLength(7);
  }, 120_000);
});

describe("en haut et en bas au choix", () => {
  // A box of four boards: two sides to the floor, the top and the bottom between them, 400 deep.
  const BOX: Box[] = [[[0, 0, 0], [18, 400, 800]], [[582, 0, 0], [600, 400, 800]], [[18, 0, 0], [582, 400, 18]], [[18, 0, 782], [582, 400, 800]]];
  const size = ([lo, hi]: Box) => [0, 1, 2].map((a) => Math.round(hi[a]! - lo[a]!)).join("×");

  it("le dessus passe sur les côtés, le dessous reste entre eux (et l'inverse)", () => {
    expect(lyingPass(BOX, 2, "top").map(size).sort()).toEqual(["18×400×782", "18×400×782", "564×400×18", "600×400×18"]);
    const under = lyingPass(BOX, 2, "bottom");
    expect(under.map(size).sort()).toEqual(["18×400×782", "18×400×782", "564×400×18", "600×400×18"]);
    expect(under[0]![0][2]).toBe(18); // the sides stand on the bottom
    expect(BOX[0]![1][2]).toBe(800); // the boxes given are left as they are
  });

  it("un cadre plat (une façade) : l'onglet seulement aux coins du haut, ceux du bas restent bout à bout", () => {
    // A door frame 20 thick (along y): two stiles, a top rail and a bottom rail between them, 60 wide.
    const frame: Box[] = [[[0, 0, 0], [60, 20, 700]], [[440, 0, 0], [500, 20, 700]], [[60, 0, 640], [440, 20, 700]], [[60, 0, 0], [440, 20, 60]]];
    const top = miterOutlines(frame, (o, plane) => o[plane.indexOf(2)]! > 350)!;
    // Each stile: 5 points (mitred at the top, square at the bottom); the top rail mitred at both ends, the bottom one not.
    expect(top.outlines.map((o) => o.length)).toEqual([5, 5, 6, 4]);
  });

  it("noyau : un caisson d'un seul corps, le dessus passant et le dessous entre les côtés", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { createReferencePlate } = await import("../../frontend/src/document/types");
    const doc = { ...createReferencePlate(), features: [
      ...board("1", [0, 0, 18, 400], 0, 800),
      ...board("2", [582, 0, 600, 400], 0, 800),
      ...board("3", [18, 0, 582, 400], 0, 18),
      ...board("4", [18, 0, 582, 400], 782, 18),
      { id: "cb1", type: "combine", name: "Caisson", target: "ex1", tools: ["ex2", "ex3", "ex4"], operation: "join" },
      { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "cb1", faces: [], thickness: 0, sides: "separate", joint: "butt", corners: { top: "boards", bottom: "sides" }, frame: true },
    ] };
    // Read back as it is; a corner of an unknown kind is refused.
    const { parseDocument } = await import("../../frontend/src/document/validate");
    expect(parseDocument(JSON.parse(JSON.stringify(doc))).features.at(-1)).toMatchObject({ corners: { top: "boards", bottom: "sides" } });
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc).replace('"top":"boards"', '"top":"dessus"')))).toThrow(/assemblage des côtés/);
    const r = new Recomputer();
    const made = r.recompute(doc as never);
    const out = r.output("sh1");
    const sizes = (out?.kind === "solids" ? out.shapes : []).map((p) => {
      const [lo, hi] = p.boundingBox.bounds;
      return [0, 1, 2].map((i) => Math.round(hi[i]! - lo[i]!)).join("×");
    });
    expect(made.statuses.find((x) => x.id === "sh1")?.state).toBe("ok");
    // The way of square panels too (not the frame's): the top over the sides; the bottom's mitre, as « En onglet », only
    // for a flat frame — here it stays between the sides.
    const { splitBoards } = await import("../../frontend/src/features/board-split-shape");
    const body = r.output("cb1");
    const pieces = body?.kind === "solid" ? splitBoards(body.shape, "largest", false, { top: "boards", bottom: "miter" }) : null;
    expect(pieces).toHaveLength(4);
    const { measureVolume } = await import("replicad");
    expect((pieces ?? []).reduce((v, p) => v + measureVolume(p), 0)).toBeCloseTo((2 * 18 * 800 + 2 * 564 * 18) * 400, -2);
    expect((pieces ?? []).map((p) => { const [lo, hi] = p.boundingBox.bounds; return Math.round(hi[0]! - lo[0]!); }).sort((a, b) => a - b)).toEqual([18, 18, 564, 600]);
    r.dispose();
    expect(sizes.sort()).toEqual(["18×400×782", "18×400×782", "564×400×18", "600×400×18"]);
  }, 120_000);
});

describe("un caisson tourné de biais et percé", () => {
  it("se sépare comme un droit, chaque panneau garde ses perçages", async () => {
    const { makeBox, makeCylinder, measureVolume } = await import("replicad");
    const { splitBoards } = await import("../../frontend/src/features/board-split-shape");
    const parts = [
      makeBox([0, 0, 0], [18, 580, 864]), makeBox([1182, 0, 0], [1200, 580, 864]), makeBox([18, 0, 150], [1182, 580, 168]),
      makeBox([18, 0, 764], [1182, 18, 864]), makeBox([18, 562, 764], [1182, 580, 864]),
    ];
    type Solid = import("replicad").Shape3D;
    let body = parts[0]! as unknown as Solid;
    for (const p of parts.slice(1)) body = body.fuse(p as never) as unknown as Solid;
    // A hole of 35 through the left side (a hinge cup drilled through, for the test), then the whole turned by 30°.
    body = body.cut(makeCylinder(17.5, 40, [-10, 300, 500], [1, 0, 0]) as never) as unknown as Solid;
    body = body.rotate(30, [0, 0, 0], [0, 0, 1]) as unknown as Solid;
    const pieces = splitBoards(body, "largest");
    expect(pieces).not.toBeNull();
    expect(pieces!).toHaveLength(5);
    const volumes = pieces!.map((p) => measureVolume(p)).sort((a, b) => a - b);
    expect(volumes.reduce((a, b) => a + b, 0)).toBeCloseTo(measureVolume(body), 0);
    // The drilled side has its hole: a little less than a whole side.
    const side = 18 * 580 * 864;
    expect(volumes.filter((v) => Math.abs(v - side) < 1)).toHaveLength(1);
    expect(volumes.some((v) => v < side - 1000 && v > side - 2 * Math.PI * 17.5 * 17.5 * 18)).toBe(true);
  }, 120_000);
});

describe("lecture en panneaux (calcul pur)", () => {
  // An L of two boards seen as faces: a floor board 600 × 400 × 18 and an upright 18 × 400 × 300 on its left end.
  const square = (axis: 0 | 1 | 2, at: number, [a0, b0, a1, b1]: Rect): AxisFace => ({ axis, at, edges: [[[a0, b0], [a1, b0]], [[a1, b0], [a1, b1]], [[a1, b1], [a0, b1]], [[a0, b1], [a0, b0]]] });
  const faces: AxisFace[] = [
    square(0, 0, [0, 0, 400, 318]), square(0, 18, [0, 18, 400, 318]), square(0, 600, [0, 0, 400, 18]),
    { axis: 1, at: 0, edges: [[[0, 0], [600, 0]], [[600, 0], [600, 18]], [[600, 18], [18, 18]], [[18, 18], [18, 318]], [[18, 318], [0, 318]], [[0, 318], [0, 0]]] },
    { axis: 1, at: 400, edges: [[[0, 0], [600, 0]], [[600, 0], [600, 18]], [[600, 18], [18, 18]], [[18, 18], [18, 318]], [[18, 318], [0, 318]], [[0, 318], [0, 0]]] },
    square(2, 0, [0, 0, 600, 400]), square(2, 18, [18, 0, 600, 400]), square(2, 318, [0, 0, 18, 400]),
  ];

  it("deux panneaux, l'un qui passe à l'angle", () => {
    const sides = boardBoxes(faces, "sides");
    expect(sides).toEqual([[[0, 0, 0], [18, 400, 318]], [[18, 0, 0], [600, 400, 18]]]);
    const boards = boardBoxes(faces, "boards");
    expect(boards).toEqual([[[0, 0, 0], [600, 400, 18]], [[0, 0, 18], [18, 400, 318]]]);
  });

  it("refuse un corps d'un seul panneau, ou qui n'est pas d'équerre sur ses trois axes", () => {
    const one: AxisFace[] = [square(0, 0, [0, 0, 400, 18]), square(0, 600, [0, 0, 400, 18]), square(1, 0, [0, 0, 600, 18]), square(1, 400, [0, 0, 600, 18]), square(2, 0, [0, 0, 600, 400]), square(2, 18, [0, 0, 600, 400])];
    expect(boardBoxes(one)).toMatch(/un seul panneau/);
    expect(boardBoxes(faces.filter((f) => f.axis !== 2))).toMatch(/d'équerre/);
  });
});

describe("une façade vitrée à cadre en bois en U, séparée telle qu'elle est", () => {
  it.each([[60, "butt", ["597×19×60", "60×19×144", "60×19×144"]], [20, "butt", ["20×19×184", "20×19×184", "597×19×20"]], [60, "miter", ["597×19×60", "60×19×204", "60×19×204"]]])("cadre de %i mm, %s : ses deux montants et sa traverse du bas, sa rainure de verre comprise, sans être vidée", async (frameWidth, joint, expected) => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { createReferencePlate } = await import("../../frontend/src/document/types");
    const cabinet = { id: "cb1", type: "cabinet", name: "Caisson", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 0, plinth: 100, construction: "sides-through" };
    const fronts = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "drawers", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: false, style: "glass", frameWidth: 60, glass: "clear", profile: "wood-u" };
    fronts.frameWidth = frameWidth as number;
    const doc = { ...createReferencePlate(), features: [cabinet, fronts, { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "fr1#0", faces: [], thickness: 0, sides: "separate", joint, frame: true }] };
    const r = new Recomputer();
    const made = r.recompute(doc as never);
    const out = r.output("sh1");
    const sizes = (out?.kind === "solids" ? out.shapes : []).map((p) => {
      const [lo, hi] = p.boundingBox.bounds;
      return [0, 1, 2].map((i) => Math.round(hi[i]! - lo[i]!)).join("×");
    });
    const status = made.statuses.find((s) => s.id === "sh1");
    r.dispose();
    expect(status?.state).toBe("ok");
    expect(sizes.sort()).toEqual(expected);
  }, 120_000);
});
