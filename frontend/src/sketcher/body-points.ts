/**
 * Corners of the bodies as reference points of a sketch.
 *
 * While a sketch is open, the corners of every displayed body are projected
 * onto its plane as fixed points (purple). They snap like any point, so a
 * coincidence, a distance or a line end can tie the sketch to a corner of
 * another body. Only the points that something uses are stored in the
 * sketch; the others are offered afresh each time it is opened.
 */
import { constraintRefs, curvePoints, type SketchGeometry, type SketchPoint } from "../document/sketch";
import { SAME_POINT, type Point3 } from "../viewport/body-points";
import { nextId } from "./edit";
import { toSketch, type SketchFrame } from "./frame";

const BODY_POINT = /^bp\d+$/;

/** A body corner offered by the sketch (fixed, id "bp1", "bp2"…). */
export function isBodyPoint(p: SketchPoint): boolean {
  return p.fixed === true && BODY_POINT.test(p.id);
}

/** `g` plus the body `corners` projected onto the sketch plane, except where a point already is. */
export function withBodyPoints(g: SketchGeometry, frame: SketchFrame, corners: Point3[]): SketchGeometry {
  const points = [...g.points];
  const taken = (x: number, y: number) =>
    (Math.abs(x) < SAME_POINT && Math.abs(y) < SAME_POINT) || points.some((q) => Math.abs(q.x - x) < SAME_POINT && Math.abs(q.y - y) < SAME_POINT);
  for (const corner of corners) {
    const [x, y] = toSketch(frame, corner);
    if (taken(x, y)) continue;
    points.push({ id: nextId({ ...g, points }, "bp"), x, y, fixed: true });
  }
  return { ...g, points };
}

/** `g` without the body points no curve or constraint uses (what is stored in the document). */
export function pruneBodyPoints(g: SketchGeometry): SketchGeometry {
  const used = new Set<string>();
  for (const curve of g.curves) for (const id of curvePoints(curve)) used.add(id);
  for (const constraint of g.constraints) for (const id of constraintRefs(constraint)) used.add(id);
  const points = g.points.filter((p) => !isBodyPoint(p) || used.has(p.id));
  return points.length === g.points.length ? g : { ...g, points };
}
