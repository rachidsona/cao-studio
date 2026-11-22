/**
 * Équipement d'une niche dans le noyau : chaque pièce de niche-parts.ts devient un corps — boîtes pour les tiroirs,
 * cylindres pour la tringle et ses supports ; les façades de tiroir et les portes reçoivent leurs trous de poignée
 * (traversants, à l'entraxe et au diamètre de la poignée choisie, Ø5 × 128 mm par défaut) quand on le demande : en
 * travers au milieu d'une façade, le long du bord d'une porte opposé aux charnières ; et la poignée elle-même en 3D,
 * devant ses trous (deux pieds et une barre, ou un bouton). Une porte vitrée est un cadre en profilé alu : l'ouverture
 * du verre traverse la porte, et la rainure où il s'engage est creusée dans le cadre ; le verre est une pièce à part.
 */
import { cast, makeBox, makeCompound, makeCylinder, Transformation, type Shape3D } from "replicad";
import type { NicheFeature, SketchFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import type { SolidsOutput } from "./outputs";
import { glassFrame, glassOpening, glassPane, handleInset, isGlass, uFrame } from "./glass-door";
import { cutGrooves } from "./decor-cut";
import { decorGrooves, isDecor } from "./door-decor";
import { nicheGeometry, nicheParts, nicheProblem, nicheWorld, worldBox, type NicheGeometry, type NichePart } from "./niche-parts";
import { underCeiling } from "./sloped-ceiling";
import { toWallPlanes } from "./within-walls";
import type { OutputLookup } from "./common";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** How far a handle stands out of its front, its bar and post radii, a knob's radius (mm). */
const HANDLE = { stand: 25, bar: 6, post: 4, overhang: 15, knob: 15 };

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * The handles made once for each length (a knob: 0), along +X with their posts towards +Y from the origin: fusing three
 * cylinders that cross costs some 45 ms, and every handle of a project is the same — a copy put in place costs nothing.
 */
const handles = new Map<string, Shape3D>();

function handleModel(length: number): Shape3D {
  const key = length.toFixed(3);
  const kept = handles.get(key);
  if (kept) return kept;
  let shape: Shape3D;
  if (length < 0.5) shape = makeCylinder(HANDLE.knob, HANDLE.stand, [0, 0, 0], [0, 1, 0]) as unknown as Shape3D;
  else {
    const pieces = [
      makeCylinder(HANDLE.post, HANDLE.stand, [0, 0, 0], [0, 1, 0]),
      makeCylinder(HANDLE.post, HANDLE.stand, [length, 0, 0], [0, 1, 0]),
      makeCylinder(HANDLE.bar, length + 2 * HANDLE.overhang, [-HANDLE.overhang, HANDLE.stand, 0], [1, 0, 0]),
    ] as unknown as Shape3D[];
    shape = pieces[0]!;
    for (const piece of pieces.slice(1)) {
      const fused = shape.fuse(piece) as Shape3D;
      shape.delete();
      piece.delete();
      shape = fused;
    }
  }
  handles.set(key, shape);
  return shape;
}

/** A bar handle (two posts and a bar beyond them) or a knob, standing out of the front: the model, put in place. */
function handleShape(part: NichePart, n: NicheGeometry): Shape3D {
  const a = nicheWorld(n, part.from);
  const b = nicheWorld(n, part.to);
  const out = sub(nicheWorld(n, [0, 0, 1]), nicheWorld(n, [0, 0, 0]));
  const along = sub(b, a);
  const length = Math.hypot(...along);
  // Its +X along the handle (any way square to `out` for a knob), its +Y out of the front.
  const dir: Vec3 = length < 0.5 ? (Math.abs(out[2]) > 0.5 ? [1, 0, 0] : [0, 0, 1]) : (along.map((c) => c / length) as Vec3);
  const place = new Transformation();
  place.coordSystemChange({ origin: a, zDir: cross(dir, out), xDir: dir }, "reference");
  try {
    return cast(place.transform(handleModel(length).wrapped)) as Shape3D;
  } finally {
    place.delete();
  }
}

function partShape(part: NichePart, n: NicheGeometry, f: NicheFeature): Shape3D {
  if (part.kind === "handle") return handleShape(part, n);
  if (part.kind !== "box") {
    const start = nicheWorld(n, part.from);
    const axis = sub(nicheWorld(n, part.to), start);
    const length = Math.hypot(...axis);
    return makeCylinder(part.radius ?? 1, length, start, axis.map((c) => c / length) as Vec3) as unknown as Shape3D;
  }
  const [a, b] = worldBox(n, part);
  let solid = makeBox(a, b) as unknown as Shape3D;
  // A frame door or drawer front: the panel set back inside the frame, routed from the front face.
  const front = part.role === "front" && (!!part.handle || f.fill === "drawers");
  if (front && f.style === "frame") {
    const [w, d] = [f.frameWidth ?? 70, f.frameDepth ?? 6];
    const [p, q] = worldBox(n, { from: [part.from[0] + w, part.from[1] + w, part.to[2] - d], to: [part.to[0] - w, part.to[1] - w, part.to[2] + 1] });
    const pocket = makeBox(p, q) as unknown as Shape3D;
    const cut = solid.cut(pocket) as Shape3D;
    solid.delete();
    pocket.delete();
    solid = cut;
  }
  // A fluted or slatted door: its grooves in its front face.
  if (front && isDecor(f)) {
    solid = cutGrooves(solid, decorGrooves(f, part.from[0], part.to[0], part.from[1], part.to[1]), part.to[2], -1, (p) => nicheWorld(n, p));
  }
  // A glass door, or a glazed drawer front: the opening through the aluminium frame, and the groove the glass sits in (one after the other: they
  // overlap, and overlapping tools cut at once give a wrong solid).
  if (part.role === "front" && (part.handle || f.fill === "drawers") && isGlass(f)) {
    for (const [from, to] of [glassOpening(part.from, part.to, 2, glassFrame(f), uFrame(f)), glassPane(part.from, part.to, 2, glassFrame(f), uFrame(f))]) {
      const [p, q] = worldBox(n, { from, to });
      const tool = makeBox(p, q) as unknown as Shape3D;
      const cut = solid.cut(tool) as Shape3D;
      solid.delete();
      tool.delete();
      solid = cut;
    }
  }
  // The handle holes, apart from each other, cut at once (one boolean instead of one each: a third of the time).
  const tools: Shape3D[] = [];
  if (part.role === "front" && f.handles) {
    // Two holes through the front, the handle's spacing apart across its middle (one for a knob), drilled from the
    // front face backwards.
    const [u0, v0, w0] = part.from;
    const [u1, v1, w1] = part.to;
    // A door: along its edge, 40 mm in (on the frame of a glass door), at mid-height.
    const inset = handleInset(f);
    // A drawer front across its middle; a glazed one in the middle of its frame's top rail, not through the glass.
    const drawerV = isGlass(f) ? (uFrame(f) ? v0 + glassFrame(f) / 2 : v1 - glassFrame(f) / 2) : (v0 + v1) / 2;
    // A lift-up door or a flap: across its middle, near its free edge.
    const at = (k: number): [number, number] =>
      part.handle === "top" || part.handle === "bottom" ? [(u0 + u1) / 2 + k, part.handle === "top" ? v1 - inset : v0 + inset]
      : part.handle ? [part.handle === "left" ? u0 + inset : u1 - inset, (v0 + v1) / 2 + k]
      : [(u0 + u1) / 2 + k, drawerV];
    const spacing = f.hw?.handleSpacing ?? 128;
    for (const du of spacing > 0 ? [-spacing / 2, spacing / 2] : [0]) {
      const start = nicheWorld(n, [...at(du), w1 + 0.005]);
      const back = sub(nicheWorld(n, [0, 0, -1]), nicheWorld(n, [0, 0, 0]));
      tools.push(makeCylinder((f.hw?.handleHole ?? 5) / 2, w1 - w0 + 0.01, start, back) as unknown as Shape3D);
    }
  }
  if (tools.length) {
    // makeCompound takes the tools in: deleting the compound releases them.
    const tool = (tools.length === 1 ? tools[0]! : makeCompound(tools)) as Shape3D;
    const cut = solid.cut(tool) as Shape3D;
    solid.delete();
    tool.delete();
    solid = cut;
  }
  return solid;
}

export function buildNiche(feature: NicheFeature, sketch: SketchFeature | undefined, lookup?: OutputLookup): SolidsOutput {
  const n = nicheGeometry(feature, sketch);
  if (typeof n === "string") throw new GeometryError(`${feature.name} : ${n}`);
  const problem = nicheProblem(feature, n);
  if (problem) throw new GeometryError(`${feature.name} : ${problem}`);
  const shapes: Shape3D[] = [];
  try {
    for (const part of nicheParts(feature, n)) {
      const shape = partShape(part, n, feature);
      const under = sketch?.ceiling ? underCeiling(shape, sketch.ceiling, part.name) : shape;
      // In a body furnished, a door or a back follows the walls round the niche, even slanted (a drawer stays square).
      const follows = sketch?.host && lookup && (feature.fill === "door" || feature.fill === "doors" || feature.fill === "back") && part.kind === "box" && part.of === undefined;
      const solid = follows ? toWallPlanes(under, [part.from, part.to], sketch.host!, n.frame, lookup) : under;
      if (!isShapeValid(solid)) {
        solid.delete();
        throw new GeometryError(`${feature.name} : la pièce « ${part.name} » est invalide.`);
      }
      shapes.push(solid);
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}
