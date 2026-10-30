/**
 * "Suivre-moi" (as SketchUp's Follow Me): a closed profile swept along the
 * path of another sketch — a skirting board along a wall outline, a moulding,
 * a cornice. The path is the chain of the sketch's lines and arcs; the
 * profile must be drawn in a plane through the start of the path (the plane
 * perpendicular to it is the usual choice). Exact B-rep sweep of the kernel.
 */
import { draw, genericSweep, type Shape3D, type Wire } from "replicad";
import type { SketchGeometry } from "../document/sketch";
import type { SweepFeature } from "../document/types";
import { GeometryError } from "../geometry/kernel";
import { applyOperation, onProfilePlane, profileDrawing, requireProfile, type OutputLookup } from "./common";
import { frameOf, toWorld } from "../sketcher/frame";
import type { SolidOutput, SolidsOutput } from "./outputs";

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

const wireOf = (sketch: unknown): Wire | null => (typeof sketch === "object" && sketch !== null && "wire" in sketch ? (sketch as { wire: Wire }).wire : null);
const release = (sketch: unknown) => (sketch as { delete?: () => void }).delete?.();

export function buildSweep(feature: SweepFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  const profile = requireProfile(lookup, feature.profile);
  const path = requireProfile(lookup, feature.path);
  if (feature.profile === feature.path) throw new GeometryError(`${feature.name} : le profil et le chemin doivent être deux esquisses différentes.`);
  let chain = pathChain(path.geometry, `${feature.name} : le chemin`);
  const region = profileDrawing(feature.name, profile).clone();
  // The profile sits at one end of the path: the sweep starts there.
  if (!chain.closed) {
    const box = region.boundingBox;
    const at = toWorld(frameOf(profile), (box.bounds[0][0] + box.bounds[1][0]) / 2, (box.bounds[0][1] + box.bounds[1][1]) / 2);
    const pathFrame = frameOf(path);
    const [first, last] = [toWorld(pathFrame, chain.start[0], chain.start[1]), toWorld(pathFrame, (chain.steps.at(-1) as PathStep).to[0], (chain.steps.at(-1) as PathStep).to[1])];
    const gap = (p: number[]) => Math.hypot(p[0]! - at[0], p[1]! - at[1], p[2]! - at[2]);
    if (gap(last) < gap(first)) chain = reverseChain(chain);
  }
  const pen = draw(chain.start);
  for (const step of chain.steps) {
    if (step.kind === "line") pen.lineTo(step.to);
    else pen.threePointsArcTo(step.to, step.mid);
  }
  const spineSketch = onProfilePlane(chain.closed ? pen.close() : pen.done(), path);
  const profileSketch = onProfilePlane(region, profile);
  try {
    const profileWire = wireOf(profileSketch);
    const spineWire = wireOf(spineSketch);
    if (!profileWire || !spineWire) throw new GeometryError(`${feature.name} : le profil ne doit pas avoir de trou, ni le chemin être fermé en plusieurs boucles.`);
    let swept: Shape3D;
    try {
      swept = genericSweep(profileWire, spineWire, { frenet: feature.frenet ?? false, transitionMode: "right" });
    } catch {
      throw new GeometryError(`${feature.name} : le balayage est impossible ; placez le profil dans un plan qui passe par le début du chemin.`);
    }
    return applyOperation(feature.name, swept, feature.operation, feature.target, lookup);
  } finally {
    release(profileSketch);
    release(spineSketch);
  }
}
