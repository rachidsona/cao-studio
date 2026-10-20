/** Coincident constraint: two points forced to one position by the real solver, never a visual link. */
import { beforeAll, describe, expect, it } from "vitest";
import { classify, COMMANDS, describeConstraints } from "../../frontend/src/constraints/catalog";
import { solveSketch } from "../../frontend/src/constraints/solver";
import { ORIGIN, type SketchConstraint, type SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { UndoStack } from "../../frontend/src/history/undo";
import { addConstraint, removeEntities } from "../../frontend/src/sketcher/edit";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** Two free lines: l1 a(0,0)–b(10,0) and l2 c(12,1)–d(20,5). */
const base = (): SketchGeometry => ({
  points: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 },
    { id: "c", x: 12, y: 1 },
    { id: "d", x: 20, y: 5 },
  ],
  curves: [
    { id: "l1", kind: "line", p1: "a", p2: "b" },
    { id: "l2", kind: "line", p1: "c", p2: "d" },
  ],
  constraints: [],
});

const command = (id: string) => COMMANDS.find((c) => c.id === id)!;

/** What the toolbar button does: checks the selection, builds the constraint, stores it. */
function coincide(g: SketchGeometry, a: string, b: string): { geometry: SketchGeometry; id: string } {
  const selection = classify(g, [a, b]);
  if (!command("coincident").applies(selection)) throw new Error("Coïncidence non applicable à cette sélection.");
  const [constraint] = command("coincident").build(selection, g);
  return addConstraint(g, constraint as Omit<SketchConstraint, "id">);
}

const at = (g: SketchGeometry, id: string): [number, number] => {
  const p = g.points.find((q) => q.id === id)!;
  return [Number(p.x.toFixed(6)), Number(p.y.toFixed(6))];
};

describe("coïncidence de deux points", () => {
  it("impose exactement la même position, sans supprimer les géométries", () => {
    const { geometry } = coincide(base(), "b", "c");
    const solved = solveSketch(geometry);
    expect(solved.state).toBe("ok");
    expect(at(solved.geometry, "b")).toEqual(at(solved.geometry, "c"));
    expect(solved.geometry.curves.map((c) => c.id)).toEqual(["l1", "l2"]);
    expect(solved.dof).toBe(solveSketch(base()).dof - 2); // two coordinates removed
  });

  it("prend en charge extrémités, centres, origine et géométrie de construction", () => {
    // Arc centre on a line end.
    const arc: SketchGeometry = {
      ...base(),
      points: [...base().points, { id: "ac", x: 0, y: 10 }, { id: "as", x: 5, y: 10 }, { id: "ae", x: 0, y: 15 }],
      curves: [...base().curves, { id: "a1", kind: "arc", center: "ac", start: "as", end: "ae", radius: 5, startAngle: 0, endAngle: Math.PI / 2 }],
    };
    const centred = solveSketch(coincide(arc, "ac", "b").geometry);
    expect(centred.state).toBe("ok");
    expect(at(centred.geometry, "ac")).toEqual(at(centred.geometry, "b"));
    const [cx, cy] = at(centred.geometry, "ac");
    for (const id of ["as", "ae"]) {
      const [x, y] = at(centred.geometry, id);
      expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(5, 4); // the arc keeps its radius
    }
    // Arc start on a line end.
    const start = solveSketch(coincide(arc, "as", "d").geometry);
    expect(at(start.geometry, "as")).toEqual(at(start.geometry, "d"));
    // Circle centre on the origin.
    const circle: SketchGeometry = { points: [{ id: "cc", x: 3, y: 4 }], curves: [{ id: "k", kind: "circle", center: "cc", radius: 2 }], constraints: [] };
    expect(at(solveSketch(coincide(circle, "cc", ORIGIN).geometry).geometry, "cc")).toEqual([0, 0]);
    // Construction line end on a normal line end.
    const construction = base();
    construction.curves[1] = { id: "l2", kind: "line", p1: "c", p2: "d", construction: true };
    const built = solveSketch(coincide(construction, "b", "c").geometry);
    expect(at(built.geometry, "b")).toEqual(at(built.geometry, "c"));
  });

  it("n'est pas la contrainte point-sur-courbe : le point ne peut plus glisser", () => {
    // l1 is fixed: otherwise the solver may as well move the line to the point.
    const withLine = { ...base(), points: [{ id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 10, y: 0, fixed: true }, ...base().points.slice(2), { id: "p", x: 4, y: 7 }] };
    // A point and a curve: coincidence is not offered, point-on-curve is.
    const mixed = classify(withLine, ["p", "l1"]);
    expect(command("coincident").applies(mixed)).toBe(false);
    expect(command("pointOnCurve").applies(mixed)).toBe(true);
    // Point on curve removes one degree of freedom and lets the point slide along the line.
    const onCurve = addConstraint(withLine, { kind: "pointOnCurve", point: "p", curve: "l1" } as never).geometry;
    const slid = solveSketch(onCurve, { drag: { point: "p", x: 6, y: 5 }, diagnose: false });
    expect(at(slid.geometry, "p")[1]).toBeCloseTo(0, 4); // stays on the line y = 0…
    expect(at(slid.geometry, "p")[0]).toBeCloseTo(6, 3); // …but moved along it
    // Coincidence with a point removes both coordinates: the point cannot be pulled away.
    const linked = coincide(withLine, "p", "b").geometry;
    expect(solveSketch(linked).dof).toBe(solveSketch(onCurve).dof - 1);
    const pulled = solveSketch(linked, { drag: { point: "p", x: 30, y: 30 }, diagnose: false });
    expect(at(pulled.geometry, "p")).toEqual([10, 0]); // b is fixed: p cannot leave it
  });
});

describe("la relation est maintenue", () => {
  const linked = () => coincide(base(), "b", "c").geometry;

  it("après déplacement d'un point", () => {
    const moved = solveSketch(linked(), { drag: { point: "c", x: 30, y: 30 }, diagnose: false }).geometry;
    expect(at(moved, "b")).toEqual(at(moved, "c"));
  });

  it("après modification d'une cote", () => {
    const g = addConstraint(linked(), { kind: "length", line: "l1", value: 25 } as never).geometry;
    const horizontal = addConstraint(g, { kind: "horizontal", line: "l1" } as never).geometry;
    const solved = solveSketch(addConstraint(horizontal, { kind: "fix", point: "a", x: 0, y: 0 } as never).geometry).geometry;
    expect(at(solved, "b")).toEqual([25, 0]);
    expect(at(solved, "c")).toEqual([25, 0]); // the other line's end followed
  });

  it("après enregistrement et rechargement du document", () => {
    const sketch: SketchFeature = { id: "sk", type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...solveSketch(linked()).geometry };
    const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [sketch] };
    const reloaded = parseDocument(JSON.parse(JSON.stringify(doc)));
    const feature = reloaded.features[0] as SketchFeature;
    expect(feature.constraints).toEqual(sketch.constraints);
    const again = solveSketch(feature);
    expect(again.state).toBe("ok");
    expect(at(again.geometry, "b")).toEqual(at(again.geometry, "c"));
  });

  it("une coïncidence qui désigne un point inexistant est refusée à l'ouverture", () => {
    const sketch = { id: "sk", type: "sketch", name: "E", plane: "XY", offset: 0, ...linked() };
    sketch.constraints = [{ id: "k1", kind: "coincident", a: "b", b: "zzz" }];
    expect(() => parseDocument({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [sketch] })).toThrow(/zzz|introuvable|inconnu/i);
  });
});

describe("géométries fixes et contraintes existantes", () => {
  it("un point fixe ne bouge jamais : l'autre vient à lui", () => {
    const g = base();
    g.points[1] = { id: "b", x: 10, y: 0, fixed: true };
    const solved = solveSketch(coincide(g, "b", "c").geometry);
    expect(solved.state).toBe("ok");
    expect(at(solved.geometry, "b")).toEqual([10, 0]);
    expect(at(solved.geometry, "c")).toEqual([10, 0]);
    const pulled = solveSketch(coincide(g, "b", "c").geometry, { drag: { point: "c", x: 30, y: 30 }, diagnose: false });
    expect(at(pulled.geometry, "b")).toEqual([10, 0]);
    expect(at(pulled.geometry, "c")[0]).toBeCloseTo(10, 3);
  });

  it("deux points fixes éloignés : conflit signalé, géométrie inchangée", () => {
    const g = base();
    g.points[1] = { id: "b", x: 10, y: 0, fixed: true };
    g.points[2] = { id: "c", x: 12, y: 1, fixed: true };
    const { geometry, id } = coincide(g, "b", "c");
    const solved = solveSketch(geometry);
    expect(solved.state).toBe("conflicting");
    expect(solved.conflicting).toContain(id);
    expect(at(solved.geometry, "b")).toEqual([10, 0]);
    expect(at(solved.geometry, "c")).toEqual([12, 1]);
  });

  it("une cote incompatible est un conflit nommé, pas une liaison forcée", () => {
    const { geometry } = coincide(base(), "b", "c");
    const over = addConstraint(geometry, { kind: "distance", a: "b", b: "c", value: 5 } as never).geometry;
    const solved = solveSketch(over);
    expect(solved.state).toBe("conflicting");
    expect(describeConstraints(over, solved.conflicting)).toMatch(/Coïncidence .*Distance /);
  });

  it("une coïncidence déjà impliquée par les autres est signalée comme redondante", () => {
    let g = base();
    g.points.push({ id: "e", x: 30, y: 0 }, { id: "f", x: 31, y: 1 });
    g.curves.push({ id: "l3", kind: "line", p1: "e", p2: "f" });
    g = coincide(g, "b", "c").geometry; // b = c
    g = coincide(g, "c", "e").geometry; // c = e
    const closing = coincide(g, "b", "e"); // b = e is already implied
    const solved = solveSketch(closing.geometry);
    expect(solved.state).toBe("redundant");
    expect(solved.redundant).toEqual([closing.id]);
  });
});

describe("cas refusés à la création", () => {
  it("les deux extrémités d'une même ligne ne peuvent pas coïncider", () => {
    expect(() => coincide(base(), "a", "b")).toThrow(/même courbe/);
  });

  it("un arc ne peut pas être refermé sur lui-même ni sur son centre", () => {
    const arc: SketchGeometry = {
      points: [{ id: "ac", x: 0, y: 0 }, { id: "as", x: 5, y: 0 }, { id: "ae", x: 0, y: 5 }],
      curves: [{ id: "a1", kind: "arc", center: "ac", start: "as", end: "ae", radius: 5, startAngle: 0, endAngle: Math.PI / 2 }],
      constraints: [],
    };
    expect(() => coincide(arc, "as", "ae")).toThrow(/même courbe/);
    expect(() => coincide(arc, "ac", "as")).toThrow(/même courbe/);
  });

  it("la même paire ne reçoit pas deux fois la contrainte", () => {
    const { geometry } = coincide(base(), "b", "c");
    expect(() => coincide(geometry, "b", "c")).toThrow(/déjà coïncidents/);
    expect(() => coincide(geometry, "c", "b")).toThrow(/déjà coïncidents/);
  });

  it("n'est pas proposée sans exactement deux points", () => {
    const applies = (ids: string[]) => command("coincident").applies(classify(base(), ids));
    expect(applies(["b"])).toBe(false);
    expect(applies(["b", "c", "d"])).toBe(false);
    expect(applies(["l1", "l2"])).toBe(false);
    expect(applies(["b", "c"])).toBe(true);
  });
});

describe("suppression et annulation", () => {
  it("supprimer la contrainte garde les géométries et libère les points", () => {
    const original = base();
    const { geometry, id } = coincide(original, "b", "c");
    const freed = removeEntities(geometry, [id]);
    expect(freed.constraints).toEqual([]);
    expect(freed.points).toEqual(original.points);
    expect(freed.curves).toEqual(original.curves);
    const pulled = solveSketch(freed, { drag: { point: "c", x: 30, y: 30 }, diagnose: false }).geometry;
    expect(at(pulled, "b")).toEqual([10, 0]); // no longer dragged along
    expect(at(pulled, "c")).toEqual([30, 30]);
  });

  it("annuler retire la contrainte, rétablir la remet", () => {
    const sketch = (g: SketchGeometry): CadDocument => ({
      format: "cao-studio",
      schemaVersion: 2,
      units: "mm",
      parameters: {},
      features: [{ id: "sk", type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...g }],
    });
    const before = sketch(base());
    const after = sketch(coincide(base(), "b", "c").geometry);
    const stack = new UndoStack();
    stack.push(before);
    expect(stack.undo(after)).toEqual(before);
    expect(stack.redo(before)).toEqual(after);
  });

  it("les messages nomment les contraintes", () => {
    const { geometry, id } = coincide(base(), "b", "c");
    expect(describeConstraints(geometry, [id])).toBe(`Coïncidence ${id}`);
    expect(describeConstraints(geometry, ["inconnue"])).toBe("inconnue");
  });
});
