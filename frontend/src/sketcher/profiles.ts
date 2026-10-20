/**
 * Kernel side of sketch profiles: rebuilds the closed loops of a sketch as a
 * replicad Drawing (even–odd rule, see loops.ts).
 */
import { draw, drawCircle, type Drawing } from "replicad";
import type { SketchGeometry } from "../document/sketch";
import { extractLoops, loopDepths, type Loop } from "./loops";

export { ProfileError, extractLoops, pointInPolygon, VERTEX_TOLERANCE } from "./loops";

function buildLoop(loop: Loop): Drawing {
  const shape = loop.shape;
  if (shape.kind === "circle") return drawCircle(shape.radius).translate(shape.center[0], shape.center[1]);
  const pen = draw(shape.start);
  for (const step of shape.steps) {
    if (step.kind === "line") pen.lineTo(step.to);
    else pen.threePointsArcTo(step.to, step.mid);
  }
  return pen.close();
}

/** Builds the region bounded by the sketch's closed loops, or null when there is none. */
export function buildProfile(geometry: SketchGeometry): Drawing | null {
  const loops = extractLoops(geometry);
  if (loops.length === 0) return null;
  const depth = loopDepths(loops);
  const order = loops.map((_, i) => i).sort((a, b) => (depth[a] as number) - (depth[b] as number));
  let region: Drawing | null = null;
  for (const i of order) {
    const shape = buildLoop(loops[i] as Loop);
    if (!region) region = shape;
    else region = (depth[i] as number) % 2 === 0 ? region.fuse(shape) : region.cut(shape);
  }
  return region;
}
