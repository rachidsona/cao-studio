/** Phase 5 solid operations and persistent edge/face references, on the real kernel. */
import type { Edge, Face, Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { centeredRectangle, rectangleAt, AXIS_Y, type SketchGeometry } from "../../frontend/src/document/sketch";
import { consumedBodies, createReferencePlate, type CadDocument, type EdgeRef, type Feature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeEdge, describeFace } from "../../frontend/src/geometry/references";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

const HOLE = Math.PI * 25 * 10;

function doc(...features: Feature[]): CadDocument {
  return { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features };
}

function solidOf(r: Recomputer, id: string): Shape3D {
  const out = r.output(id);
  if (out?.kind !== "solid") throw new Error(`no solid for ${id}`);
  return out.shape;
}

/** Recomputes `d` and describes the edges of body `id` matching `pick`. */
function edgeRefs(d: CadDocument, id: string, pick: (e: Edge) => boolean): EdgeRef[] {
  const r = new Recomputer();
  try {
    r.recompute(d);
    const shape = solidOf(r, id);
    return shape.edges.filter(pick).map((e) => describeEdge(shape, e));
  } finally {
    r.dispose();
  }
}

/** Vertical corner edges (not the seam line of the cylindrical hole). */
const vertical = (e: Edge) => e.geomType === "LINE" && Math.abs(e.tangentAt(0.5).z) > 0.99 && Math.abs(e.pointAt(0.5).x) > 39;
const topLine = (e: Edge) => e.geomType === "LINE" && Math.abs(e.tangentAt(0.5).z) < 0.01 && e.pointAt(0.5).z > 9.99;

function setWidth(d: CadDocument, value: number): void {
  const sketch = d.features[0];
  if (sketch?.type !== "sketch") throw new Error("sketch expected");
  sketch.constraints = sketch.constraints.map((c) => (c.id === "d2" && "value" in c ? { ...c, value } : c));
}

function volume(d: CadDocument, id: string): { volume?: number; message?: string } {
  const r = new Recomputer();
  try {
    const result = r.recompute(d);
    const status = result.statuses.find((s) => s.id === id);
    if (status?.state !== "ok") return { message: status?.message };
    return { volume: bodyMetrics(solidOf(r, id)).volume };
  } finally {
    r.dispose();
  }
}

describe("congés et chanfreins avec références persistantes", () => {
  beforeAll(setupKernel);

  it("arrondit les arêtes verticales de la plaque", () => {
    const base = createReferencePlate();
    const edges = edgeRefs(base, "h1", vertical);
    expect(edges).toHaveLength(4);
    const d = doc(...base.features, { id: "f1", type: "fillet", name: "Congé 1", target: "h1", edges, radius: 5 });
    expect(volume(d, "f1").volume).toBeCloseTo(40000 - HOLE - 4 * (25 - (Math.PI * 25) / 4) * 10, 6);
  });

  it("retrouve les arêtes après un changement de largeur", () => {
    const base = createReferencePlate();
    const edges = edgeRefs(base, "h1", vertical);
    const d = doc(...base.features, { id: "f1", type: "fillet", name: "Congé 1", target: "h1", edges, radius: 5 });
    setWidth(d, 70);
    expect(volume(d, "f1").volume).toBeCloseTo(80 * 70 * 10 - HOLE - 4 * (25 - (Math.PI * 25) / 4) * 10, 6);
  });

  it("signale une arête disparue au lieu d'en choisir une autre", () => {
    const base = createReferencePlate();
    const [edge] = edgeRefs(base, "h1", vertical) as [EdgeRef];
    const ghost: EdgeRef = { ...edge, rel: [0.25, 0.5, 0.5] }; // no vertical edge there
    const d = doc(...base.features, { id: "f1", type: "fillet", name: "Congé 1", target: "h1", edges: [ghost], radius: 2 });
    expect(volume(d, "f1").message).toMatch(/introuvable après recalcul/);
  });

  it("signale un rayon trop grand", () => {
    const base = createReferencePlate();
    const edges = edgeRefs(base, "h1", vertical);
    const d = doc(...base.features, { id: "f1", type: "fillet", name: "Congé 1", target: "h1", edges, radius: 40 });
    expect(volume(d, "f1").message).toMatch(/Congé 1/);
  });

  it("chanfreine les arêtes du dessus", () => {
    const base = createReferencePlate();
    const edges = edgeRefs(base, "ex1", topLine);
    expect(edges).toHaveLength(4);
    const d = doc(...base.features.slice(0, 2), { id: "c1", type: "chamfer", name: "Chanfrein 1", target: "ex1", edges, distance: 2 });
    // 4 prisms along the perimeter (2×2/2 × 260 mm) minus the 4 corner overlaps (pyramids of 2³/3).
    expect(volume(d, "c1").volume).toBeCloseTo(40000 - 2 * 260 + 4 * (8 / 3), 6);
  });
});

describe("révolution", () => {
  beforeAll(setupKernel);

  const ring = (): SketchGeometry => rectangleAt(15, 15, 10, 30); // x 10..20, v (=Z) 0..30 on XZ

  it("fait tourner un profil autour de l'axe vertical de l'esquisse", () => {
    const d = doc(
      { id: "sk", type: "sketch", name: "Profil", plane: "XZ", offset: 0, ...ring() },
      { id: "rv", type: "revolve", name: "Révolution 1", sketch: "sk", axis: AXIS_Y, angle: 360, operation: "new" },
    );
    expect(volume(d, "rv").volume).toBeCloseTo(Math.PI * (400 - 100) * 30, 6);
  });

  it("accepte un angle partiel et une ligne de l'esquisse comme axe", () => {
    const g = ring();
    g.points.push({ id: "a1", x: 0, y: 0 }, { id: "a2", x: 0, y: 10 });
    g.curves.push({ id: "axe", kind: "line", p1: "a1", p2: "a2", construction: true });
    const d = doc(
      { id: "sk", type: "sketch", name: "Profil", plane: "XZ", offset: 0, ...g },
      { id: "rv", type: "revolve", name: "Révolution 1", sketch: "sk", axis: "axe", angle: 90, operation: "new" },
    );
    expect(volume(d, "rv").volume).toBeCloseTo((Math.PI * (400 - 100) * 30) / 4, 6);
  });
});

describe("combinaison de corps et extrusion en intersection", () => {
  beforeAll(setupKernel);

  const box = (id: string, cx: number, w: number): Feature[] => [
    { id: `s${id}`, type: "sketch", name: `Esquisse ${id}`, plane: "XY", offset: 0, ...rectangleAt(cx, 0.5, w, 20) },
    { id: `e${id}`, type: "extrude", name: `Bloc ${id}`, sketch: `s${id}`, distance: 10, operation: "new" },
  ];

  it.each([
    ["join", 30 * 20 * 10],
    ["cut", 10 * 20 * 10],
    ["intersect", 10 * 20 * 10],
  ] as const)("combine deux blocs qui se chevauchent (%s)", (operation, expected) => {
    // Block A: x −10..10, block B: x 0..20.
    const d = doc(...box("A", 0, 20), ...box("B", 10, 20), { id: "cb", type: "combine", name: "Combinaison", target: "eA", tools: ["eB"], operation });
    expect(volume(d, "cb").volume).toBeCloseTo(expected, 6);
  });

  it("sans le commun : chaque bloc perd la partie commune, les deux restent, la cible et l'outil consommés", () => {
    // Block A: x −10..10, block B: x 0..20; in common x 0..10.
    const d = doc(...box("A", 0, 20), ...box("B", 10, 20), { id: "cb", type: "combine", name: "Combinaison", target: "eA", tools: ["eB"], operation: "exclude" });
    const r = new Recomputer();
    try {
      const result = r.recompute(d);
      expect(result.statuses.find((s) => s.id === "cb")?.state).toBe("ok");
      const out = r.output("cb");
      expect(out?.kind).toBe("solids");
      const shapes = out?.kind === "solids" ? out.shapes : [];
      expect(shapes.map((s) => Math.round(bodyMetrics(s).volume))).toEqual([10 * 20 * 10, 10 * 20 * 10]);
      expect(consumedBodies(d.features.at(-1)!)).toEqual(["eA", "eB"]);
    } finally {
      r.dispose();
    }
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
  });

  it("limiter : la cible s'arrête à l'outil qui la traverse (ce qui dépasse ôté), l'outil reste entier et gardé", () => {
    // Shelf A: x −10..10; side B: x 5..7, right across it: A keeps x −10..5, its 3 beyond B taken away.
    const d = doc(...box("A", 0, 20), ...box("B", 6, 2), { id: "cb", type: "combine", name: "Combinaison", target: "eA", tools: ["eB"], operation: "limit" });
    expect(volume(d, "cb").volume).toBeCloseTo(15 * 20 * 10, 6);
    expect(consumedBodies(d.features.at(-1)!)).toEqual(["eA"]);
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
  });

  it("refuse l'union de corps disjoints", () => {
    const d = doc(...box("A", 0, 10), ...box("B", 50, 10), { id: "cb", type: "combine", name: "Combinaison", target: "eA", tools: ["eB"], operation: "join" });
    expect(volume(d, "cb").message).toMatch(/ne se touchent pas/);
  });

  it("intersecte une extrusion avec un corps existant", () => {
    const [sB] = box("B", 10, 20) as [Feature];
    const d = doc(...box("A", 0, 20), sB, { id: "eB", type: "extrude", name: "Inter", sketch: "sB", distance: 10, operation: "intersect", target: "eA" });
    expect(volume(d, "eB").volume).toBeCloseTo(10 * 20 * 10, 6);
  });
});

describe("perçage sur une face", () => {
  beforeAll(setupKernel);

  /** Plate 80 × 50 × 10 and a blind Ø6 hole, 5 mm deep, on its +X side face. */
  function sideHoleDoc(): CadDocument {
    const base = createReferencePlate();
    const r = new Recomputer();
    r.recompute(base);
    const shape = solidOf(r, "ex1");
    const face = shape.faces.find((f: Face) => f.geomType === "PLANE" && f.normalAt(f.center).x > 0.99) as Face;
    const ref = describeFace(shape, face);
    r.dispose();
    return doc(...base.features.slice(0, 2), {
      id: "h2",
      type: "hole",
      name: "Perçage latéral",
      target: "ex1",
      x: 0,
      y: 0,
      diameter: 6,
      depth: 5,
      origin: [40, 0, 5],
      direction: [-1, 0, 0],
      face: ref,
    });
  }

  it("perce perpendiculairement à la face choisie", () => {
    expect(volume(sideHoleDoc(), "h2").volume).toBeCloseTo(40000 - Math.PI * 9 * 5, 6);
  });

  it("suit la face quand la pièce s'allonge", () => {
    const d = sideHoleDoc();
    const sketch = d.features[0];
    if (sketch?.type !== "sketch") throw new Error();
    sketch.constraints = sketch.constraints.map((c) => (c.id === "d1" && "value" in c ? { ...c, value: 100 } : c));
    // Without anchoring, a 5 mm hole started at x = 40 would now be buried inside the part (x up to 50).
    expect(volume(d, "h2").volume).toBeCloseTo(100 * 50 * 10 - Math.PI * 9 * 5, 6);
  });

  it("valide un document contenant les nouvelles opérations", () => {
    const d = sideHoleDoc();
    d.features.push({ id: "c1", type: "combine", name: "C", target: "h2", tools: ["h2b"], operation: "cut" });
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
    expect(() => parseDocument({ ...d, features: [{ id: "x", type: "fillet", name: "x", target: "a", edges: [{}], radius: 1 }] })).toThrow(/arête/);
  });
});

void centeredRectangle;

describe("extrusion de faces (pousser / tirer)", () => {
  beforeAll(setupKernel);

  function faceRef(base: CadDocument, id: string, pick: (f: Face) => boolean) {
    const r = new Recomputer();
    try {
      r.recompute(base);
      const shape = solidOf(r, id);
      return describeFace(shape, shape.faces.find(pick) as Face);
    } finally {
      r.dispose();
    }
  }

  it("tire la face du dessus en ajoutant de la matière (le trou suit)", () => {
    const base = createReferencePlate();
    const top = faceRef(base, "h1", (f) => f.geomType === "PLANE" && f.normalAt(f.center).z > 0.99);
    const d = doc(...base.features, { id: "ef", type: "extrude", name: "Tirer", faces: [top], target: "h1", distance: 5, operation: "join" });
    expect(volume(d, "ef").volume).toBeCloseTo((4000 - Math.PI * 25) * 15, 6);
  });

  it("pousse une face latérale vers l'intérieur", () => {
    const base = createReferencePlate();
    const side = faceRef(base, "h1", (f) => f.geomType === "PLANE" && f.normalAt(f.center).x > 0.99);
    const d = doc(...base.features, { id: "ef", type: "extrude", name: "Pousser", faces: [side], target: "h1", distance: -10, operation: "cut" });
    expect(volume(d, "ef").volume).toBeCloseTo(40000 - 50 * 10 * 10 - HOLE, 6);
  });

  it("tirée depuis une arête : seulement la bande de la face le long de l'arête (20 mm sur 50)", () => {
    const base = createReferencePlate();
    const side = faceRef(base, "h1", (f) => f.geomType === "PLANE" && f.normalAt(f.center).x > 0.99);
    const d = doc(...base.features, { id: "ef", type: "extrude", name: "Tirer", faces: [side], strip: { from: [40, -25, 10], to: [40, -5, 10] }, target: "h1", distance: 10, operation: "join" });
    expect(parseDocument(JSON.parse(JSON.stringify(d))).features.at(-1)).toMatchObject({ strip: { from: [40, -25, 10] } });
    const m = volume(d, "ef");
    expect(m.volume).toBeCloseTo(40000 - HOLE + 10 * 20 * 10, 6);
  });
});
