/**
 * "Suivre-moi" (as SketchUp's Follow Me): a closed profile swept along the
 * path of another sketch — a skirting board along a wall outline, a moulding,
 * a cornice. The path is the chain of the sketch's lines and arcs; the
 * profile must be drawn in a plane through the start of the path (the plane
 * perpendicular to it is the usual choice). Exact B-rep sweep of the kernel. Extrude Along Path (JHS PowerBar) sets a
 * profile drawn anywhere at the start of the path, or sweeps a plain rectangle (width × height) with no profile drawn.
 */
import { draw, genericSweep, Plane, type Drawing, type Shape3D, type Wire } from "replicad";
import type { SketchGeometry } from "../document/sketch";
import type { SweepFeature } from "../document/types";
import { GeometryError } from "../geometry/kernel";
import { applyOperation, onProfilePlane, profileDrawing, requireProfile, type OutputLookup } from "./common";
import { frameOf, toWorld, type SketchFrame } from "../sketcher/frame";
import type { ProfileOutput, SolidOutput, SolidsOutput } from "./outputs";

type Vec = [number, number];
export type PathStep = { kind: "line"; to: Vec } | { kind: "arc"; to: Vec; mid: Vec };
export interface PathChain {
  start: Vec;
  steps: PathStep[];
  /** The chain ends where it starts. */
  closed: boolean;
}

const TOLERANCE = 1e-6;
const key = ([x, y]: Vec) => `${Math.round(x / TOLERANCE)},${Math.round(y / TOLERANCE)}`;

interface Piece {
  a: Vec;
  b: Vec;
  /** Point halfway along an arc. */
  mid?: Vec;
}

/**
 * The lines and arcs of a sketch (construction curves left out) as one chain, from a free end (or anywhere when the
 * chain is closed). A GeometryError says why there is none: no curve, a branch, or several separate chains.
 */
export function pathChain(geometry: SketchGeometry, name = "Le chemin"): PathChain {
  const at = new Map(geometry.points.map((p) => [p.id, [p.x, p.y] as Vec]));
  const point = (id: string): Vec => at.get(id) as Vec;
  const pieces: Piece[] = [];
  for (const c of geometry.curves) {
    if (c.construction) continue;
    if (c.kind === "line") pieces.push({ a: point(c.p1), b: point(c.p2) });
    else if (c.kind === "arc") {
      const [cx, cy] = point(c.center);
      // The arc runs counter-clockwise from its start to its end: its middle is half the sweep further.
      const sweep = (((c.endAngle - c.startAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const half = c.startAngle + sweep / 2;
      pieces.push({ a: point(c.start), b: point(c.end), mid: [cx + c.radius * Math.cos(half), cy + c.radius * Math.sin(half)] });
    } else throw new GeometryError(`${name} : un cercle n'est pas un chemin (utilisez des lignes et des arcs).`);
  }
  if (pieces.length === 0) throw new GeometryError(`${name} : l'esquisse ne contient ni ligne ni arc.`);
  const touching = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    for (const end of [p.a, p.b]) touching.set(key(end), [...(touching.get(key(end)) ?? []), i]);
  });
  if ([...touching.values()].some((list) => list.length > 2)) throw new GeometryError(`${name} : le chemin se ramifie ; gardez une seule ligne continue.`);
  const free = [...touching.entries()].filter(([, list]) => list.length === 1);
  if (free.length !== 0 && free.length !== 2) throw new GeometryError(`${name} : le chemin est en plusieurs morceaux ; les lignes doivent se suivre.`);
  const first = pieces[0] as Piece;
  const startKey = free.length ? (free[0] as [string, number[]])[0] : key(first.a);
  const used = new Set<number>();
  let cursorKey = startKey;
  let start: Vec | null = null;
  const steps: PathStep[] = [];
  for (;;) {
    const index = (touching.get(cursorKey) ?? []).find((i) => !used.has(i));
    if (index === undefined) break;
    used.add(index);
    const p = pieces[index] as Piece;
    const forward = key(p.a) === cursorKey;
    const [from, to] = forward ? [p.a, p.b] : [p.b, p.a];
    start ??= from;
    steps.push(p.mid ? { kind: "arc", to, mid: p.mid } : { kind: "line", to });
    cursorKey = key(to);
  }
  if (used.size !== pieces.length) throw new GeometryError(`${name} : le chemin est en plusieurs morceaux ; les lignes doivent se suivre.`);
  return { start: start as Vec, steps, closed: free.length === 0 };
}

/** The same chain walked the other way round. */
export function reverseChain(chain: PathChain): PathChain {
  const points: Vec[] = [chain.start, ...chain.steps.map((s) => s.to)];
  const steps = chain.steps.map((s, i): PathStep => (s.kind === "arc" ? { kind: "arc", to: points[i] as Vec, mid: s.mid } : { kind: "line", to: points[i] as Vec })).reverse();
  return { start: points.at(-1) as Vec, steps, closed: chain.closed };
}

type V3 = [number, number, number];
const unit3 = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Where the chain starts, in the model, and its direction there (along an arc: square to its radius). */
export function chainStart(chain: PathChain, frame: SketchFrame): { origin: V3; tangent: V3 } {
  const step = chain.steps[0] as PathStep;
  const [sx, sy] = chain.start;
  let dir: Vec = [step.to[0] - sx, step.to[1] - sy];
  if (step.kind === "arc") {
    // The centre of the circle through the start, the middle and the end; the tangent turns towards the middle.
    const [[ax, ay], [bx, by], [cx, cy]] = [chain.start, step.mid, step.to];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    dir = [-(sy - uy), sx - ux];
    if (dir[0] * (bx - sx) + dir[1] * (by - sy) < 0) dir = [-dir[0], -dir[1]];
  }
  const origin = toWorld(frame, sx, sy) as V3;
  const ahead = toWorld(frame, sx + dir[0], sy + dir[1]) as V3;
  return { origin, tangent: unit3([ahead[0] - origin[0], ahead[1] - origin[1], ahead[2] - origin[2]]) };
}

/** The axes of a profile set square to `tangent`: y up (the vertical made square to it), x across. */
export function profileAxes(tangent: V3): { u: V3; v: V3 } {
  const seed: V3 = Math.abs(tangent[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
  const along = seed[0] * tangent[0] + seed[1] * tangent[1] + seed[2] * tangent[2];
  const v = unit3([seed[0] - tangent[0] * along, seed[1] - tangent[1] * along, seed[2] - tangent[2] * along]);
  return { u: cross3(v, tangent), v };
}

/** The profile's drawing set at the start of the path (Extrude Along Path). */
function placedProfile(region: Drawing, place: NonNullable<SweepFeature["place"]>, start: { origin: V3; tangent: V3 }) {
  const [[x0, y0], [x1, y1]] = region.boundingBox.bounds;
  const anchor: Vec = place.anchor === "center" ? [(x0 + x1) / 2, (y0 + y1) / 2] : place.anchor === "bottom-left" ? [x0, y0] : place.anchor === "bottom-right" ? [x1, y0] : [0, 0];
  let drawing = region.translate(-anchor[0], -anchor[1]);
  if (place.spin) drawing = drawing.rotate(place.spin, [0, 0]);
  const { u } = profileAxes(start.tangent);
  // Mirrored: x the other way, and the plane turned over so that y stays up.
  const plane = place.flip ? new Plane(start.origin, u.map((c) => -c) as V3, start.tangent.map((c) => -c) as V3) : new Plane(start.origin, u, start.tangent);
  return drawing.sketchOnPlane(plane);
}

/** The rectangle of Extrude Along Path, standing at the start of the path: centred on it, or on its left or right. */
function sectionProfile(section: NonNullable<SweepFeature["section"]>, start: { origin: V3; tangent: V3 }) {
  const { width: w, height: h, align } = section;
  // x runs to the left of the path (u = up × tangent), y up.
  const [x0, x1] = align === "left" ? [0, w] : align === "right" ? [-w, 0] : [-w / 2, w / 2];
  const { u } = profileAxes(start.tangent);
  return draw([x0, 0]).lineTo([x1, 0]).lineTo([x1, h]).lineTo([x0, h]).close().sketchOnPlane(new Plane(start.origin, u, start.tangent));
}

const wireOf = (sketch: unknown): Wire | null => (typeof sketch === "object" && sketch !== null && "wire" in sketch ? (sketch as { wire: Wire }).wire : null);
const release = (sketch: unknown) => (sketch as { delete?: () => void }).delete?.();

export function buildSweep(feature: SweepFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  const path = requireProfile(lookup, feature.path);
  let chain = pathChain(path.geometry, `${feature.name} : le chemin`);
  if (feature.section) return sweepSection(feature, feature.section.fromEnd ? reverseChain(chain) : chain, path, lookup);
  const profile = requireProfile(lookup, feature.profile);
  if (feature.profile === feature.path) throw new GeometryError(`${feature.name} : le profil et le chemin doivent être deux esquisses différentes.`);
  const region = profileDrawing(feature.name, profile).clone();
  // The profile sits at one end of the path: the sweep starts there (placed there, it starts at the path's start).
  if (!chain.closed && !feature.place) {
    const box = region.boundingBox;
    const at = toWorld(frameOf(profile), (box.bounds[0][0] + box.bounds[1][0]) / 2, (box.bounds[0][1] + box.bounds[1][1]) / 2);
    const pathFrame = frameOf(path);
    const [first, last] = [toWorld(pathFrame, chain.start[0], chain.start[1]), toWorld(pathFrame, (chain.steps.at(-1) as PathStep).to[0], (chain.steps.at(-1) as PathStep).to[1])];
    const gap = (p: number[]) => Math.hypot(p[0]! - at[0], p[1]! - at[1], p[2]! - at[2]);
    if (gap(last) < gap(first)) chain = reverseChain(chain);
  }
  const profileSketch = feature.place ? placedProfile(region, feature.place, chainStart(chain, frameOf(path))) : onProfilePlane(region, profile);
  return sweepAlong(feature, chain, path, profileSketch, lookup);
}

/** The rectangle swept along the path. */
function sweepSection(feature: SweepFeature, chain: PathChain, path: ProfileOutput, lookup: OutputLookup): SolidOutput | SolidsOutput {
  return sweepAlong(feature, chain, path, sectionProfile(feature.section!, chainStart(chain, frameOf(path))), lookup);
}

function sweepAlong(feature: SweepFeature, chain: PathChain, path: ProfileOutput, profileSketch: unknown, lookup: OutputLookup): SolidOutput | SolidsOutput {
  const pen = draw(chain.start);
  for (const step of chain.steps) {
    if (step.kind === "line") pen.lineTo(step.to);
    else pen.threePointsArcTo(step.to, step.mid);
  }
  const spineSketch = onProfilePlane(chain.closed ? pen.close() : pen.done(), path);
  try {
    const profileWire = wireOf(profileSketch);
    const spineWire = wireOf(spineSketch);
    if (!profileWire || !spineWire) throw new GeometryError(`${feature.name} : le profil ne doit pas avoir de trou, ni le chemin être fermé en plusieurs boucles.`);
    let swept: Shape3D;
    try {
      swept = genericSweep(profileWire, spineWire, { frenet: feature.frenet ?? false, transitionMode: "right" });
    } catch {
      throw new GeometryError(feature.place || feature.section ? `${feature.name} : le balayage est impossible ; un profil plus petit que les courbes du chemin, ou un autre point d'accroche.` : `${feature.name} : le balayage est impossible ; placez le profil dans un plan qui passe par le début du chemin.`);
    }
    return applyOperation(feature.name, swept, feature.operation, feature.target, lookup);
  } finally {
    release(profileSketch);
    release(spineSketch);
  }
}
