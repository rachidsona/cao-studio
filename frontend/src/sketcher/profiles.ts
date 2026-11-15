/**
 * Kernel side of sketch profiles: rebuilds the closed loops of a sketch as a
 * replicad Drawing (even–odd rule, see loops.ts).
 */
import { draw, drawCircle, type Drawing } from "replicad";
import type { SketchGeometry } from "../document/sketch";
import { extractLoops, loopAt, loopDepths, loopKey, ProfileError, sketchFaces, type Loop } from "./loops";

export { ProfileError, extractLoops, loopKey, pointInPolygon, VERTEX_TOLERANCE } from "./loops";

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

/**
 * What a sketch's geometry gives, worked out once: its loops, the faces they bound and their keys. Every board of a
 * Répartition is an extrusion of one area of the same sketch: without this, each of them found all the loops again.
 * The geometry of a solved sketch is not changed afterwards (a change makes a new one).
 */
const analysed = new WeakMap<object, { loops: Loop[]; faces?: ReturnType<typeof sketchFaces>; keys?: string[] }>();

function analysis(geometry: SketchGeometry) {
  let found = analysed.get(geometry);
  if (!found) analysed.set(geometry, (found = { loops: extractLoops(geometry) }));
  return found;
}

/** The closed loops of a sketch's geometry (worked out once for it). */
export function sketchLoops(geometry: SketchGeometry): Loop[] {
  return analysis(geometry).loops;
}

/** The loop of a chosen area: by its key when it has one (loopKey), else the smallest loop around its inside point. */
export function chosenLoop(loops: Loop[], geometry: Pick<SketchGeometry, "points">, point: [number, number], key: string | undefined): number {
  if (key) {
    const kept = analysed.get(geometry);
    const keys = kept?.loops === loops ? (kept.keys ??= loops.map((loop) => loopKey(loop, geometry))) : loops.map((loop) => loopKey(loop, geometry));
    const named = keys.indexOf(key);
    if (named >= 0) return named;
    // Its corners are no longer a loop (a line added across it, a point removed): the point says where it was, but
    // another area there would be extruded in its place — the area is to be chosen again.
    const at = loopAt(loops, point);
    if (at >= 0 && keys[at] !== key) throw new ProfileError("Une zone choisie a changé de forme : choisissez à nouveau la zone à extruder.");
    return at;
  }
  return loopAt(loops, point);
}

/** The chosen areas: each is a loop minus the loops directly inside it; touching areas merge. */
function buildAreas(loops: Loop[], geometry: SketchGeometry, inside: [number, number][], keys?: string[]): Drawing {
  const kept = analysed.get(geometry);
  const faces = kept?.loops === loops ? (kept.faces ??= sketchFaces(loops)) : sketchFaces(loops);
  const chosen = new Set<number>();
  for (const [i, point] of inside.entries()) {
    const index = chosenLoop(loops, geometry, point, keys?.[i] || undefined);
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
export function buildProfile(geometry: SketchGeometry, areas?: [number, number][], keys?: string[]): Drawing | null {
  const { loops } = analysis(geometry);
  if (loops.length === 0) return null;
  if (areas) return buildAreas(loops, geometry, areas, keys);
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
