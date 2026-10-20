/**
 * Arcs given by three points (end, middle, end) in sketch coordinates, as the
 * kernel returns them, turned into the sketch convention: counter-clockwise
 * from `start` to `end`, with `endAngle > startAngle`.
 */
type Vec = [number, number];

export interface OrientedArc {
  start: Vec;
  end: Vec;
  startAngle: number;
  endAngle: number;
}

const TWO_PI = 2 * Math.PI;

export function orientedArc(center: Vec, a: Vec, mid: Vec, b: Vec): OrientedArc {
  const angle = (p: Vec) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  const ccw = (from: number, to: number) => (((to - from) % TWO_PI) + TWO_PI) % TWO_PI;
  // Sketch arcs run counter-clockwise: swap the ends when the edge runs the other way.
  let [start, end] = [a, b];
  if (ccw(angle(a), angle(mid)) > ccw(angle(a), angle(b))) [start, end] = [b, a];
  const startAngle = angle(start);
  let endAngle = angle(end);
  if (endAngle <= startAngle) endAngle += TWO_PI;
  return { start, end, startAngle, endAngle };
}
