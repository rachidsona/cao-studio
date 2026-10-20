/**
 * Kernel side of sketch profiles: rebuilds the closed loops of a sketch as a
 * replicad Drawing (even–odd rule, see loops.ts).
 */
import { draw, drawCircle, type Drawing } from "replicad";
import type { SketchGeometry } from "../document/sketch";
import { extractLoops, loopAt, loopDepths, ProfileError, sketchFaces, type Loop } from "./loops";

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

/** The chosen areas: each is a loop minus the loops directly inside it; touching areas merge. */
function buildAreas(loops: Loop[], inside: [number, number][]): Drawing {
  const faces = sketchFaces(loops);
  const chosen = new Set<number>();
  for (const point of inside) {
    const index = loopAt(loops, point);
    if (index < 0) throw new ProfileError("Une zone choisie n'existe plus : l'esquisse a changé, choisissez à nouveau la zone à extruder.");
    chosen.add(index);
  }
  let region: Drawing | null = null;
  for (const index of [...chosen].sort((a, b) => a - b)) {
    let area = buildLoop(loops[index] as Loop);
    for (const child of (faces[index] as (typeof faces)[number]).children) area = area.cut(buildLoop(loops[child] as Loop));
    region = region ? region.fuse(area) : area;
  }
  if (!region) throw new ProfileError("Aucune zone à extruder.");
  return region;
}

/**
 * Builds the region bounded by the sketch's closed loops, or null when there is
 * none. With `areas` (points inside the wanted areas) only those areas are built.
 */
export function buildProfile(geometry: SketchGeometry, areas?: [number, number][]): Drawing | null {
  const loops = extractLoops(geometry);
  if (loops.length === 0) return null;
  if (areas) return buildAreas(loops, areas);
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
