/** Coque et lissage : un bac ouvert creusé dans un bloc, un pied qui passe d'un carré à un plus petit. */
import { beforeAll, describe, expect, it } from "vitest";
import { draw, drawCircle, drawPolysides, makeBaseBox, makeSphere, type Shape3D } from "replicad";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type ShellFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { buildShell } from "../../frontend/src/features/shell-loft";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeFace } from "../../frontend/src/geometry/references";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

function block(): CadDocument {
  const doc = createReferencePlate();
  doc.features = doc.features.slice(0, 2); // sk1 (80 × 50) + ex1 (10 high)
  (doc.features[1] as { distance: number }).distance = 40;
  return doc;
}

function solid(r: Recomputer, id: string): Shape3D {
  const out = r.output(id);
  if (out?.kind !== "solid") throw new Error(`pas de solide ${id}`);
  return out.shape;
}

describe("coque", () => {
  it("un bloc 80 × 50 × 40 creusé à 3 mm, dessus ouvert : volume des parois", () => {
    const doc = block();
    const r = new Recomputer();
    r.recompute(doc);
    const shape = solid(r, "ex1");
    const top = shape.faces.find((f) => Math.abs(f.center.z - 40) < 1e-6)!;
    doc.features.push({ id: "sh1", type: "shell", name: "Coque 1", target: "ex1", faces: [describeFace(shape, top)], thickness: 3 });
    const statuses = r.recompute(doc).statuses;
    expect(statuses.find((s) => s.id === "sh1")?.state).toBe("ok");
    const walls = 80 * 50 * 40 - 74 * 44 * 37;
    expect(bodyMetrics(solid(r, "sh1")).volume).toBeCloseTo(walls, 0);
  });
});

describe("vider un corps", () => {
  const T = 10;
  /** The body emptied: one hollow solid, or its sides. */
  function emptied(shape: Shape3D, over: Partial<ShellFeature> = {}): Shape3D[] {
    const feature: ShellFeature = { id: "sh1", type: "shell", name: "Corps vidé 1", target: "b1", faces: [], thickness: T, sides: "joined", ...over };
    const out = buildShell(feature, () => ({ kind: "solid", shape }));
    return out.kind === "solid" ? [out.shape] : out.shapes;
  }
  const volumes = (shapes: Shape3D[]) => shapes.map((s) => bodyMetrics(s).volume);
  const total = (shapes: Shape3D[]) => volumes(shapes).reduce((a, b) => a + b, 0);
  const triangle = () => drawPolysides(100, 3).sketchOnPlane("XY").extrude(200) as Shape3D;
  const cylinder = () => drawCircle(100).sketchOnPlane("XY").extrude(200) as Shape3D;
  /** A parallelogram, its sides askew, 150 high. */
  const askew = () => draw([0, 0]).lineTo([300, 0]).lineTo([400, 200]).lineTo([100, 200]).close().sketchOnPlane("XY").extrude(150) as Shape3D;

  it("sans face ouverte, le corps devient creux et fermé, côtés joints : carré, triangle, cercle, de biais", () => {
    const [box] = emptied(makeBaseBox(100, 100, 100) as Shape3D);
    expect(bodyMetrics(box!).volume).toBeCloseTo(100 ** 3 - 80 ** 3, 0);
    const [tube] = emptied(cylinder());
    expect(bodyMetrics(tube!).volume).toBeCloseTo(Math.PI * (100 ** 2 * 200 - 90 ** 2 * 180), -1);
    for (const make of [triangle, askew]) {
      const whole = bodyMetrics(make()).volume;
      const made = emptied(make());
      expect(made).toHaveLength(1);
      // A wall all round: less than the body, more than nothing; its box is the body's.
      expect(bodyMetrics(made[0]!).volume).toBeLessThan(whole * 0.6);
      expect(bodyMetrics(made[0]!).volume).toBeGreaterThan(whole * 0.1);
      expect(bodyMetrics(made[0]!).bbox).toEqual(bodyMetrics(make()).bbox);
    }
    // Une plaque percée de part en part : la paroi de son trou aussi.
    const pierced = () => (makeBaseBox(80, 50, 10) as Shape3D).cut(drawCircle(5).sketchOnPlane("XY").extrude(10) as Shape3D) as Shape3D;
    const [plate] = emptied(pierced(), { thickness: 2 });
    expect(bodyMetrics(plate!).volume).toBeCloseTo(bodyMetrics(pierced()).volume - (76 * 46 - Math.PI * 7 ** 2) * 6, 0);
    const apart = volumes(emptied(pierced(), { thickness: 2, sides: "separate", joint: "butt" })).sort((a, b) => a - b);
    expect(apart).toHaveLength(7);
    expect(apart[0]).toBeCloseTo(Math.PI * (7 ** 2 - 5 ** 2) * 6, 0);
    // Une sphère aussi, sans aucune face plane.
    const [ball] = emptied(makeSphere(100) as unknown as Shape3D);
    expect(bodyMetrics(ball!).volume).toBeCloseTo((4 / 3) * Math.PI * (100 ** 3 - 90 ** 3), -2);
  });

  it("chaque côté seul : six panneaux pour un cube, en onglet ou bout à bout, la même paroi", () => {
    for (const joint of ["miter", "butt"] as const) {
      const made = emptied(makeBaseBox(100, 100, 100) as Shape3D, { sides: "separate", joint });
      expect(made).toHaveLength(6);
      expect(total(made)).toBeCloseTo(100 ** 3 - 80 ** 3, 0);
    }
    // En onglet, les six sont pareils ; bout à bout, le premier passe entier.
    const mitred = volumes(emptied(makeBaseBox(100, 100, 100) as Shape3D, { sides: "separate", joint: "miter" })).sort((a, b) => a - b);
    expect(mitred[0]).toBeCloseTo(mitred[5]!, 0);
    const butted = volumes(emptied(makeBaseBox(100, 100, 100) as Shape3D, { sides: "separate", joint: "butt" }));
    expect(butted[0]).toBeCloseTo(100 * 100 * T, 0);
  });

  it("chaque côté seul : cinq panneaux pour un prisme à base de triangle, six pour un corps de biais", () => {
    const prism = emptied(triangle(), { sides: "separate" });
    expect(prism).toHaveLength(5);
    expect(total(prism)).toBeCloseTo(bodyMetrics(emptied(triangle())[0]!).volume, -1);
    const slanted = emptied(askew(), { sides: "separate", joint: "butt" });
    expect(slanted).toHaveLength(6);
    expect(total(slanted)).toBeCloseTo(bodyMetrics(emptied(askew())[0]!).volume, -1);
  });

  it("chaque côté seul d'un cylindre : ses deux fonds entiers, et le tube entre eux", () => {
    const made = volumes(emptied(cylinder(), { sides: "separate" })).sort((a, b) => a - b);
    expect(made).toHaveLength(3);
    const disc = Math.PI * 100 ** 2 * T;
    expect(made[0]).toBeCloseTo(disc, -1);
    expect(made[1]).toBeCloseTo(disc, -1);
    expect(made[2]).toBeCloseTo(Math.PI * (100 ** 2 - 90 ** 2) * 180, -1);
    // Une sphère n'a qu'un côté : sa paroi, d'un seul corps.
    expect(emptied(makeSphere(100) as unknown as Shape3D, { sides: "separate" })).toHaveLength(1);
  });

  it("une face ouverte n'a pas de côté ; toutes ouvertes, il ne reste rien", () => {
    const box = makeBaseBox(100, 100, 100) as Shape3D;
    const top = box.faces.find((f) => f.normalAt(f.center).z > 0.9)!;
    const open = emptied(box, { sides: "separate", faces: [describeFace(box, top)] });
    expect(open).toHaveLength(5);
    expect(total(open)).toBeCloseTo(100 ** 3 - 80 * 80 * 90, 0);
    const tube = cylinder();
    const lid = tube.faces.find((f) => f.geomType === "PLANE" && f.normalAt(f.center).z > 0.9)!;
    const pot = volumes(emptied(tube, { sides: "separate", faces: [describeFace(tube, lid)] })).sort((a, b) => a - b);
    expect(pot).toHaveLength(2);
    expect(pot[1]).toBeCloseTo(Math.PI * (100 ** 2 - 90 ** 2) * 190, -1);
    const all = makeBaseBox(100, 100, 100) as Shape3D;
    expect(() => emptied(all, { sides: "separate", faces: all.faces.map((f) => describeFace(all, f)) })).toThrow(/aucun côté/);
  });

  it("devant et derrière ouverts : un caisson, ses quatre côtés de la même épaisseur", () => {
    const box = makeBaseBox(100, 100, 100) as Shape3D;
    const ends = box.faces.filter((f) => Math.abs(f.normalAt(f.center).y) > 0.9).map((f) => describeFace(box, f));
    expect(ends).toHaveLength(2);
    for (const joint of ["butt", "miter"] as const) {
      const made = emptied(box, { sides: "separate", joint, faces: ends });
      expect(made).toHaveLength(4);
      expect(total(made)).toBeCloseTo((100 ** 2 - 80 ** 2) * 100, 0);
      // Each side a board 10 thick, as long as the body is deep.
      for (const side of made) {
        const [lo, hi] = bodyMetrics(side).bbox;
        const size = [0, 1, 2].map((i) => hi[i]! - lo[i]!).sort((a, b) => a - b);
        expect(size[0]).toBeCloseTo(T, 3);
        expect(size[2]).toBeCloseTo(100, 3);
      }
    }
    // Bout à bout : deux côtés passent entiers, les deux autres tiennent entre eux.
    const butted = volumes(emptied(box, { sides: "separate", joint: "butt", faces: ends })).sort((a, b) => a - b);
    expect(butted.map((v) => Math.round(v))).toEqual([80000, 80000, 100000, 100000]);
    // Un caisson plus haut que large : ses montants, les plus grands, passent sur toute la hauteur.
    const tall = makeBaseBox(600, 400, 900) as Shape3D;
    const open = tall.faces.filter((f) => Math.abs(f.normalAt(f.center).y) > 0.9).map((f) => describeFace(tall, f));
    const boards = emptied(tall, { sides: "separate", joint: "butt", faces: open, thickness: 18 }).map((b) => bodyMetrics(b).bbox).map(([lo, hi]) => [0, 1, 2].map((i) => Math.round(hi[i]! - lo[i]!)));
    expect(boards.filter((b) => b[2] === 900)).toEqual([[18, 400, 900], [18, 400, 900]]);
    expect(boards.filter((b) => b[2] === 18)).toEqual([[564, 400, 18], [564, 400, 18]]);
    // Une plaque percée ouverte dessus et dessous : ses quatre côtés, et la paroi de son trou.
    const plate = (makeBaseBox(80, 50, 10) as Shape3D).cut(drawCircle(5).sketchOnPlane("XY").extrude(10) as Shape3D) as Shape3D;
    const faces = plate.faces.filter((f) => f.geomType === "PLANE" && Math.abs(f.normalAt(f.center).z) > 0.9).map((f) => describeFace(plate, f));
    expect(faces).toHaveLength(2);
    const pierced = volumes(emptied(plate, { sides: "separate", joint: "butt", faces, thickness: 2 })).sort((a, b) => a - b);
    expect(pierced).toHaveLength(5);
    expect(pierced[0]).toBeCloseTo(Math.PI * (7 ** 2 - 5 ** 2) * 10, 0);
    // Côtés joints : le tour d'un corps, la paroi du trou d'un autre — plus rien ne les tient ensemble.
    const joined = emptied(plate, { faces, thickness: 2 });
    expect(joined).toHaveLength(2);
    expect(total(joined)).toBeCloseTo((80 * 50 - 76 * 46) * 10 + Math.PI * (7 ** 2 - 5 ** 2) * 10, 0);
    // Côtés joints : le même tour, d'un seul corps.
    const [frame] = emptied(box, { faces: ends });
    expect(bodyMetrics(frame!).volume).toBeCloseTo((100 ** 2 - 80 ** 2) * 100, 0);
  });

  it("refuse une paroi plus épaisse que le corps, et des côtés ou un assemblage inconnus", () => {
    expect(() => emptied(makeBaseBox(100, 100, 100) as Shape3D, { thickness: 60 })).toThrow(/ne se vide pas|aucun solide|invalide/);
    const doc = block();
    const shell = (over: Record<string, unknown>) => ({ ...doc, features: [...doc.features, { id: "sh1", type: "shell", name: "Corps vidé 1", target: "ex1", faces: [], thickness: 3, ...over }] });
    expect(() => parseDocument(JSON.parse(JSON.stringify(shell({ sides: "separate", joint: "butt" }))))).not.toThrow();
    expect(() => parseDocument(JSON.parse(JSON.stringify(shell({}))))).not.toThrow();
    expect(() => parseDocument(JSON.parse(JSON.stringify(shell({ sides: "apart" }))))).toThrow(/côtés/);
    expect(() => parseDocument(JSON.parse(JSON.stringify(shell({ joint: "glued" }))))).toThrow(/assemblage/);
  });

  it("dans l'historique : le corps vidé remplace le corps, ses côtés sont des corps « sh1#n »", () => {
    const doc = block();
    doc.features.push({ id: "sh1", type: "shell", name: "Corps vidé 1", target: "ex1", faces: [], thickness: 3, sides: "separate", joint: "miter" });
    const r = new Recomputer();
    const statuses = r.recompute(doc).statuses;
    expect(statuses.find((s) => s.id === "sh1")?.state).toBe("ok");
    const out = r.output("sh1");
    expect(out?.kind).toBe("solids");
    expect(out?.kind === "solids" ? out.shapes.length : 0).toBe(6);
    expect(out?.kind === "solids" ? out.shapes.reduce((sum, s) => sum + bodyMetrics(s).volume, 0) : 0).toBeCloseTo(80 * 50 * 40 - 74 * 44 * 34, 0);
  });
});

describe("lissage", () => {
  it("relie un carré de 40 en bas à un carré de 20 à 100 mm : tronc de pyramide", () => {
    const sketch = (id: string, offset: number, side: number): SketchFeature => ({ id, type: "sketch", name: id, plane: "XY", offset, ...centeredRectangle(side, side) });
    const doc: CadDocument = { ...createReferencePlate(), features: [sketch("a", 0, 40), sketch("b", 100, 20), { id: "lo1", type: "loft", name: "Lissage 1", profiles: ["a", "b"], ruled: true, operation: "new" }] };
    const r = new Recomputer();
    const statuses = r.recompute(doc).statuses;
    expect(statuses.find((s) => s.id === "lo1")?.state).toBe("ok");
    const frustum = (100 / 3) * (40 * 40 + 20 * 20 + 40 * 20);
    expect(bodyMetrics(solid(r, "lo1")).volume).toBeCloseTo(frustum, 0);
  });
});
