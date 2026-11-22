/**
 * « Prolonger élément » jusqu'à une face inclinée, et gardé : un caisson va jusqu'à toucher un mur en biais ; une pièce
 * reçoit une opération qui va jusqu'à la face à chaque recalcul et en prend la pente ; un caisson garde une liaison,
 * refaite quand l'autre élément change.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { extendBy, extendTo, followLink, onEnvelope, reachBy, travelTo, wayOf, withoutLinks, type FacePlane } from "../../frontend/src/document/extend-reach";
import { bodyLabel } from "../../frontend/src/document/operations";
import { createReferencePlate, type CabinetFeature, type CadDocument, type ExtrudeFeature, type FaceRef, type TrimFeature, type Vec3 } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeFace } from "../../frontend/src/geometry/references";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";
import { makeBaseBox } from "replicad";
import { prismUntil } from "../../frontend/src/features/face-until";

beforeAll(setupKernel);

const face = (point: Vec3, normal: Vec3, points: Vec3[] = []): FacePlane => ({ point, normal, points });
const ref = (center: Vec3, rel: Vec3, normal: Vec3): FaceRef => ({ type: "PLANE", center, rel, normal, area: 0 });
const cabinet: CabinetFeature = { id: "c1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "none", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" };
const withCabinet = (): CadDocument => ({ ...createReferencePlate(), features: [cabinet, { ...cabinet, id: "c2", name: "Colonne", origin: [900, 0, 0] }] });
/** The right side of the cabinet: its four corners. */
const right = face([600, 280, 360], [1, 0, 0], [[600, 0, 0], [600, 560, 0], [600, 560, 720], [600, 0, 720]]);
const width = (doc: CadDocument) => (doc.features.find((f) => f.id === "c1") as CabinetFeature).width;

describe("jusqu'où", () => {
  it("parallèle : jusqu'au plan ; inclinée : jusqu'au premier coin qui la touche", () => {
    expect(reachBy(right, face([900, 0, 0], [-1, 0, 0]))).toEqual({ by: 300, slanted: false });
    // A wall at 45° in plan: x = 900 at the front (y = 0), x = 900 + 560 at the back… the front corner touches first.
    const slant = face([900, 0, 0], [-Math.SQRT1_2, Math.SQRT1_2, 0]);
    expect(reachBy(right, slant)).toEqual({ by: 300, slanted: true });
    // Already past it: shortened until no corner is beyond it.
    expect(reachBy(right, face([500, 0, 0], [-Math.SQRT1_2, Math.SQRT1_2, 0]))).toEqual({ by: -100, slanted: true });
    expect(travelTo([[0, 0, 0]], [1, 0, 0], face([10, 0, 0], [0, 1, 0]))).toMatch(/atteint jamais/);
  });
});

describe("prolonger et garder", () => {
  it("un caisson s'allonge jusqu'au mur en biais et garde sa liaison", () => {
    const made = extendTo(withCabinet(), "c1#1", "c2#0", right, face([900, 0, 0], [-Math.SQRT1_2, Math.SQRT1_2, 0]), { from: ref([600, 280, 360], [1, 0.5, 0.5], [1, 0, 0]), to: ref([900, 0, 0], [0, 0, 0.5], [-1, 0, 0]) }, true);
    if (typeof made === "string") throw new Error(made);
    expect(width(made.doc)).toBe(900);
    expect(made.doc.extendLinks).toEqual([expect.objectContaining({ id: "pl1", from: expect.objectContaining({ body: "c1#1" }), to: expect.objectContaining({ body: "c2#0" }) })]);
    expect(made.message).toMatch(/prolongé de 30 cm jusqu'à .*qu'il suivra/);
    expect(validateDocument(made.doc)).toEqual([]);
    // Without « Suivre », nothing kept.
    const once = extendTo(withCabinet(), "c1#1", "c2#0", right, face([900, 0, 0], [-1, 0, 0]), {}, false);
    expect(typeof once !== "string" && once.doc.extendLinks).toBeFalsy();
  });

  it("la liaison refaite : le mur s'éloigne, le caisson le suit ; il y est, rien ; retirée, plus rien", () => {
    const made = extendTo(withCabinet(), "c1#1", "c2#0", right, face([900, 0, 0], [-1, 0, 0]), { from: ref([600, 280, 360], [1, 0.5, 0.5], [1, 0, 0]), to: ref([900, 0, 0], [0, 0, 0.5], [-1, 0, 0]) }, true);
    if (typeof made === "string") throw new Error(made);
    const link = made.doc.extendLinks![0]!;
    const side = face([900, 280, 360], [1, 0, 0], [[900, 0, 0], [900, 560, 720]]);
    const moved = followLink(made.doc, link, side, face([950, 0, 0], [-1, 0, 0]));
    expect(moved && typeof moved !== "string" && [moved.by, width(moved.doc)]).toEqual([50, 950]);
    expect(followLink(made.doc, link, side, face([900.02, 0, 0], [-1, 0, 0]))).toBeNull();
    expect(withoutLinks(made.doc, [link.id]).extendLinks).toBeUndefined();
  });

  it("une pièce : une opération qui va jusqu'à la face (gardée, ou inclinée) ; sinon une distance", () => {
    const doc = createReferencePlate();
    const from = face([40, 0, 5], [1, 0, 0], [[40, -25, 0], [40, 25, 10]]);
    const refs = { from: ref([40, 0, 5], [1, 0.5, 0.5], [1, 0, 0]), to: ref([100, 0, 5], [0, 0.5, 0.5], [-1, 0, 0]) };
    const kept = extendTo(doc, "h1", "ex9", from, face([100, 0, 5], [-1, 0, 0]), refs, true);
    if (typeof kept === "string") throw new Error(kept);
    expect(kept.doc.features.at(-1)).toMatchObject({ type: "extrude", name: "Prolongement 1", target: "h1", distance: 60, operation: "join", until: { body: "ex9" } });
    const plain = extendTo(doc, "h1", "ex9", from, face([100, 0, 5], [-1, 0, 0]), refs, false);
    expect(typeof plain !== "string" && (plain.doc.features.at(-1) as ExtrudeFeature).until).toBeUndefined();
    const slanted = extendTo(doc, "h1", "ex9", from, face([100, 0, 5], [-Math.SQRT1_2, Math.SQRT1_2, 0]), refs, false);
    expect(typeof slanted !== "string" && (slanted.doc.features.at(-1) as ExtrudeFeature).until).toBeTruthy();
  });

  it("une pièce selon une direction choisie : un axe ou droit vers la face d'arrivée, son bout en prend la pente", () => {
    const doc = createReferencePlate();
    // The end of a slanted shelf: its face turned 30° from X; the wall at x = 100, facing −X.
    const n: Vec3 = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0];
    const from = face([40, 0, 5], n, [[40, -25, 0], [40, 25, 10]]);
    const refs = { from: ref([40, 0, 5], [1, 0.5, 0.5], n), to: ref([100, 0, 5], [0, 0.5, 0.5], [-1, 0, 0]) };
    const along = extendTo(doc, "h1", "ex9", from, face([100, 0, 5], [-1, 0, 0]), refs, false, false, [1, 0, 0]);
    if (typeof along === "string") throw new Error(along);
    const f = along.doc.features.at(-1) as ExtrudeFeature;
    // Along X: 60 mm to the wall, and up to it (its slope) whatever « follow » says.
    expect([f.direction, f.distance, f.until?.body]).toEqual([[1, 0, 0], 60, "ex9"]);
    // Straight to the face to reach: against its normal, turned outward.
    const straight = extendTo(doc, "h1", "ex9", from, face([100, 0, 5], [-1, 0, 0]), refs, false, false, [-1, 0, 0]);
    expect(typeof straight !== "string" && (straight.doc.features.at(-1) as ExtrudeFeature).direction).toEqual([1, 0, 0]);
    // Along the face itself: refused; typed, the way kept.
    expect(wayOf({ normal: [1, 0, 0] }, [0, 0, 1])).toMatch(/longe la face/);
    const typed = extendBy(doc, "h1", from, 25, refs.from, false, [0, 1, 0]);
    expect(typeof typed !== "string" && (typed.doc.features.at(-1) as ExtrudeFeature).direction).toEqual([0, 1, 0]);
    expect(validateDocument({ ...along.doc, features: [...along.doc.features] }).length).toBe(0);
  });

  it("une étagère, une cloison seule : son caisson ne change pas, elle reçoit son opération ; par défaut pour une face à l'intérieur", () => {
    const shelfEnd = face([600 - 18, 280, 360], [1, 0, 0], [[582, 20, 351], [582, 540, 369]]);
    const made = extendTo(withCabinet(), "c1#5", "c2#0", shelfEnd, face([900, 0, 0], [-1, 0, 0]), { from: ref([582, 280, 360], [1, 0.5, 0.5], [1, 0, 0]), to: ref([900, 0, 0], [0, 0.5, 0.5], [-1, 0, 0]) }, true, true);
    if (typeof made === "string") throw new Error(made);
    expect(width(made.doc)).toBe(600);
    expect(made.doc.features.at(-1)).toMatchObject({ type: "extrude", target: "c1#5", distance: 318, until: { body: "c2#0" } });
    expect(made.message).toMatch(/^« Bas — .* » prolongé de 31,8 cm/);
    // The box of the cabinet: its outer side is on it, the end of its shelf is not.
    const boxes: [Vec3, Vec3][] = [[[0, 0, 0], [18, 560, 720]], [[582, 0, 0], [600, 560, 720]], [[18, 20, 351], [582, 540, 369]]];
    expect(onEnvelope({ point: [600, 280, 360], normal: [1, 0, 0] }, boxes)).toBe(true);
    expect(onEnvelope({ point: [582, 280, 360], normal: [1, 0, 0] }, boxes)).toBe(false);
    expect(onEnvelope({ point: [300, 280, 369], normal: [0, 0, 1] }, boxes)).toBe(false);
  });

  it("le document refuse une liaison ou une face d'arrivée mal formée", () => {
    const bad = { ...withCabinet(), extendLinks: [{ id: "pl1", from: { body: "c1#1" }, to: { body: "x" } }] } as unknown as CadDocument;
    expect(validateDocument(bad).join(" ")).toMatch(/extendLinks/);
    const op = { id: "ex2", type: "extrude", name: "P", faces: [ref([0, 0, 0], [1, 0.5, 0.5], [1, 0, 0])], target: "c1#1", distance: 1, operation: "join", until: { body: 3 } };
    expect(validateDocument({ ...withCabinet(), features: [cabinet, op] } as unknown as CadDocument).join(" ")).toMatch(/face d'arrivée invalide/);
  });
});

describe("dans le noyau", () => {
  const board = (id: string, from: Vec3, to: Vec3): TrimFeature => ({ id, type: "trim", name: id, parts: [{ name: id, from, to }] });
  const plate = (extra: object[], b: [Vec3, Vec3] = [[300, 0, 0], [350, 50, 20]]): CadDocument =>
    ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [board("a", [0, 0, 0], [100, 50, 20]), board("b", ...b), ...extra] }) as CadDocument;
  const pull = (until: { body: string; face: FaceRef }): ExtrudeFeature => ({ id: "ex1", type: "extrude", name: "Prolongement 1", faces: [ref([100, 25, 10], [1, 0.5, 0.5], [1, 0, 0])], target: "a#0", distance: 200, operation: "join", until });
  const toB = { body: "b#0", face: ref([300, 25, 10], [0, 0.5, 0.5], [-1, 0, 0]) };
  const box = (r: Recomputer, id: string) => {
    const out = r.output(id);
    if (out?.kind !== "solid") throw new Error(`${id} : pas de solide`);
    return bodyMetrics(out.shape);
  };

  it("la face va jusqu'à la face de l'autre corps, et la suit quand il bouge (plus loin, ou derrière : creusée)", () => {
    const r = new Recomputer();
    const result = r.recompute(plate([pull(toB)]));
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    expect(box(r, "ex1").bbox[1][0]).toBeCloseTo(300, 3);
    r.recompute(plate([pull(toB)], [[420, 0, 0], [470, 50, 20]]));
    expect(box(r, "ex1").bbox[1][0]).toBeCloseTo(420, 3);
    r.recompute(plate([pull(toB)], [[60, 60, 0], [80, 90, 20]]));
    expect(box(r, "ex1").bbox[1][0]).toBeCloseTo(60, 3);
    // Already on it: the body as it is.
    r.recompute(plate([pull(toB)], [[100, 60, 0], [150, 90, 20]]));
    expect(box(r, "ex1").volume).toBeCloseTo(100 * 50 * 20, 1);
    r.dispose();
  });

  it("selon une direction choisie : la face avance de biais (selon X et Z) jusqu'à l'autre corps", () => {
    const r = new Recomputer();
    // Board a's end (x = 100) goes along (1, 0, 1)/√2 up to board b's face at x = 300: 200 mm along X, as much up.
    const slant: ExtrudeFeature = { ...pull(toB), direction: [Math.SQRT1_2, 0, Math.SQRT1_2] };
    const result = r.recompute(plate([slant]));
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    const m = box(r, "ex1");
    expect(m.bbox[1][0]).toBeCloseTo(300, 3);
    expect(m.bbox[1][2]).toBeCloseTo(220, 3);
    // Without a face to reach: its distance along the way.
    const free: ExtrudeFeature = { id: "ex1", type: "extrude", name: "Prolongement 1", faces: [ref([100, 25, 10], [1, 0.5, 0.5], [1, 0, 0])], target: "a#0", distance: 50, operation: "join", direction: [0, 0, 1] };
    expect(r.recompute(plate([{ ...free, direction: [1, 0, 0] }])).statuses.every((s) => s.state === "ok")).toBe(true);
    expect(box(r, "ex1").bbox[1][0]).toBeCloseTo(150, 3);
    r.dispose();
  });

  it("droit vers une face inclinée (contre sa normale) : le bout en prend la pente, pas celle de la face prolongée", () => {
    // A box 100 × 50 × 20, its end at x = 100; a plane leaning 15° from vertical, the way straight against its normal.
    const solid = makeBaseBox(100, 50, 20).translate([50, 25, 0]);
    const end = solid.faces.find((f) => f.normalAt().x > 0.99)!;
    const m: Vec3 = [-Math.cos(Math.PI / 12), 0, Math.sin(Math.PI / 12)];
    const made = prismUntil(end, { origin: [300, 25, 10], normal: m }, "t", [-m[0], 0, -m[2]]);
    expect(made?.out).toBe(true);
    // The end of what is added lies on the plane: every vertex on it or behind it, some on it.
    const along = (p: { x: number; z: number }) => (p.x - 300) * m[0] + (p.z - 10) * m[2];
    const vertices = made!.prism.edges.flatMap((e) => [e.startPoint, e.endPoint]);
    expect(Math.min(...vertices.map((p) => Math.abs(along(p))))).toBeLessThan(1e-3);
    expect(vertices.every((p) => along(p) > -1e-3)).toBe(true);
    expect(vertices.filter((p) => Math.abs(along(p)) < 1e-3).length).toBeGreaterThanOrEqual(4);
  });

  it("l'étagère d'un caisson, seule, jusqu'à la planche devant : le caisson reste, l'étagère s'allonge", () => {
    const r = new Recomputer();
    const base = (extra: object[]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [cabinet, board("b", [0, -400, 0], [600, -380, 720]), ...extra] }) as CadDocument;
    const result = r.recompute(base([]));
    const shelf = result.bodies.find((id) => bodyLabel(base([]), id).includes("Étagère"))!;
    const out = r.output(shelf);
    if (out?.kind !== "solid") throw new Error("étagère");
    const front = out.shape.faces.map((f) => describeFace(out.shape, f)).reduce((a, f) => (f.normal[1] < a.normal[1] ? f : a));
    const before = bodyMetrics(out.shape);
    const toBoard = { body: "b#0", face: ref([300, -380, 360], [0.5, 1, 0.5], [0, 1, 0]) };
    const op: ExtrudeFeature = { id: "ex1", type: "extrude", name: "Prolongement 1", faces: [front], target: shelf, distance: 1, operation: "join", until: toBoard };
    const after = r.recompute(base([op]));
    expect(after.statuses.every((s) => s.state === "ok")).toBe(true);
    const m = box(r, "ex1");
    expect(m.bbox[0][1]).toBeCloseTo(-380, 3);
    expect(m.bbox[1][1]).toBeCloseTo(before.bbox[1][1], 3);
    r.dispose();
  });

  it("jusqu'à une face inclinée : le bout de la pièce en prend la pente", () => {
    const r = new Recomputer();
    const turn = { id: "rt1", type: "rotate", name: "Rotation", target: "b#0", axis: 2, angle: 30, center: [325, 25, 10] };
    r.recompute(plate([turn]));
    const out = r.output("rt1");
    if (out?.kind !== "solid") throw new Error("rt1");
    // The face of the turned board that looks back toward A.
    const faces = out.shape.faces.map((f) => describeFace(out.shape, f));
    const slant = faces.reduce((a, f) => (f.normal[0] < a.normal[0] ? f : a));
    const m = slant.normal;
    const t = (y: number) => ((slant.center[0] - 100) * m[0] + (slant.center[1] - y) * m[1] + (slant.center[2] - 10) * m[2]) / m[0];
    const result = r.recompute(plate([turn, pull({ body: "rt1", face: slant })]));
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    const metrics = box(r, "ex1");
    expect(metrics.bbox[1][0]).toBeCloseTo(100 + Math.max(t(0), t(50)), 2);
    // The added part is a prism cut on the slant: its length on average is the length at mid-width.
    expect(metrics.volume).toBeCloseTo(100 * 50 * 20 + 50 * 20 * t(25), 0);
    r.dispose();
  });
});
