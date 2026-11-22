/**
 * « Séparer les côtés » d'un corps fait de panneaux d'équerre (features/board-split.ts), côté noyau. Le repère des
 * panneaux est lu sur le corps lui-même (sa plus grande face, puis la plus grande d'équerre avec elle) : un caisson
 * tourné de biais se sépare comme un droit. Ses faces planes d'équerre dans ce repère donnent les panneaux — un bord
 * courbe compte pour sa corde, un perçage et une face de biais n'y comptent pas —, puis chaque panneau est recoupé par
 * le corps : perçages, chanfreins, encoches et arrondis lui restent.
 */
import { basicFaceExtrusion, makePolygon, measureArea, Vector, type Shape3D } from "replicad";
import type { SideCorner } from "../document/types";
import { arePanels, boardBoxes, hasGroove, lyingPass, type Axis, type AxisFace, type Box, type Pass } from "./board-split";
import { miterOutlines, type MiterOutlines } from "./board-miter";

type P3 = [number, number, number];
type P2 = [number, number];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vec = (v: { x: number; y: number; z: number }): P3 => [v.x, v.y, v.z];

/** The panels' frame: the largest flat face's normal, the largest square to it, and the third. */
type Frame = [P3, P3, P3];

interface Flat {
  normal: P3;
  area: number;
  face: Shape3D["faces"][number];
}

function frameOf(flats: readonly Flat[]): Frame | null {
  const sorted = [...flats].sort((a, b) => b.area - a.area);
  const u = sorted[0]?.normal;
  if (!u) return null;
  const v = sorted.find((f) => Math.abs(dot(f.normal, u)) < 1e-4)?.normal;
  if (!v) return null;
  return [u, v, cross(u, v)];
}

/** The body's faces square to the frame's axes, as straight edges in it (a curved edge by its chord). */
export function axisFaces(target: Shape3D): { faces: AxisFace[]; frame: Frame } | null {
  const flats: Flat[] = target.faces.filter((f) => f.geomType === "PLANE").map((face) => ({ face, normal: vec(face.normalAt(face.center)), area: measureArea(face) }));
  const frame = frameOf(flats);
  if (!frame) return null;
  // Mostly panels: the faces square to the frame make most of its surface (not a turned part with two flats).
  const total = target.faces.reduce((sum, f) => sum + measureArea(f), 0);
  let square = 0;
  const faces: AxisFace[] = [];
  for (const { face, normal, area } of flats) {
    const axis = frame.findIndex((d) => Math.abs(Math.abs(dot(normal, d)) - 1) < 1e-6);
    if (axis < 0) continue;
    square += area;
    const [a, b] = ([0, 1, 2] as const).filter((k) => k !== axis) as [Axis, Axis];
    const edges: AxisFace["edges"] = [];
    for (const edge of face.edges) {
      const [p, q] = [vec(edge.startPoint), vec(edge.endPoint)];
      if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6) continue; // a whole circle (a hole): no chord
      edges.push([[dot(p, frame[a]!), dot(p, frame[b]!)], [dot(q, frame[a]!), dot(q, frame[b]!)]]);
    }
    faces.push({ axis: axis as Axis, at: dot(vec(face.center), frame[axis]!), edges, area });
  }
  if (square < 0.7 * total) return null;
  return { faces, frame };
}

/** A box of the frame as a solid, where it is in the world. */
function prism([lo, hi]: Box, [u, v, w]: Frame): Shape3D {
  const at = (a: number, b: number, c: number): P3 => [0, 1, 2].map((k) => a * u[k]! + b * v[k]! + c * w[k]!) as P3;
  const base = makePolygon([at(lo[0], lo[1], lo[2]), at(hi[0], lo[1], lo[2]), at(hi[0], hi[1], lo[2]), at(lo[0], hi[1], lo[2])]);
  const h = hi[2] - lo[2];
  return basicFaceExtrusion(base, new Vector([w[0] * h, w[1] * h, w[2] * h])) as unknown as Shape3D;
}

/** A mitred piece's outline, through the frame's thickness, as a solid where it is in the world. */
function outlinePrism(outline: readonly [number, number][], { axis, span, plane }: MiterOutlines, frame: Frame): Shape3D {
  const at = (a: number, b: number, t: number): P3 => {
    const c = [0, 0, 0];
    [c[plane[0]], c[plane[1]], c[axis]] = [a, b, t];
    return [0, 1, 2].map((k) => c[0]! * frame[0][k]! + c[1]! * frame[1][k]! + c[2]! * frame[2][k]!) as P3;
  };
  const base = makePolygon(outline.map(([a, b]) => at(a, b, span[0])));
  const h = span[1] - span[0];
  const d = frame[axis];
  return basicFaceExtrusion(base, new Vector([d[0] * h, d[1] * h, d[2] * h])) as unknown as Shape3D;
}

/** Faces closer than this (mm) along an axis are read as one at a second try: a groove, not a panel. */
const GROOVE = 6;

/** The panels of a body made of square panels, a body each; null when it is not such a body (left to the other ways). */
export function splitBoards(target: Shape3D, pass: Pass, miter = false, corners?: { top: SideCorner; bottom: SideCorner }): Shape3D[] | null {
  const read = axisFaces(target);
  if (!read) return null;
  const { faces, frame } = read;
  // The upright: the frame's axis nearest the world's Z.
  const vertical = [0, 1, 2].reduce((best, k) => (Math.abs(frame[k]![2]) > Math.abs(frame[best]![2]) ? k : best), 0) as Axis;
  // A glazed frame's groove (a few mm) cuts it in slivers: read again over it — each panel keeps it when recut.
  const panels = (merge: number) => {
    // Each end its own way: read with the sides passing, then the top (the bottom) put over (under) them there.
    const found = boardBoxes(faces, corners ? "sides" : pass, vertical, merge);
    return typeof found === "string" || !arePanels(found, 100, merge > 0) ? null : found;
  };
  const found = panels(0) ?? (hasGroove(faces, GROOVE) ? panels(GROOVE) : null);
  if (!found) return null;
  const ends = ["top", "bottom"] as const;
  const boxes = corners ? ends.reduce((b, end) => (corners[end] === "boards" ? lyingPass(b, vertical, end) : b), found) : found;
  // Which end a corner is at: above or below the middle of the body, along the upright (or the plane's second axis).
  const lo = Math.min(...boxes.map((b) => b[0][vertical]!));
  const hi = Math.max(...boxes.map((b) => b[1][vertical]!));
  const atTop = (o: P2, plane: [Axis, Axis]) => {
    const i = plane.indexOf(vertical);
    if (i >= 0) return o[i]! > (lo + hi) / 2;
    const a = plane[1];
    return o[1] > (Math.min(...boxes.map((b) => b[0][a]!)) + Math.max(...boxes.map((b) => b[1][a]!))) / 2;
  };
  const mitreAt = (o: P2, plane: [Axis, Axis]) => !corners || corners[atTop(o, plane) ? "top" : "bottom"] === "miter";
  const pieces: Shape3D[] = [];
  // In mitre, a flat frame's corners shared on their diagonals (each end chosen: only there).
  const mitred = miter || (corners && ends.some((e) => corners[e] === "miter")) ? miterOutlines(boxes, mitreAt) : null;
  for (const [n, box] of boxes.entries()) {
    const block = mitred ? outlinePrism(mitred.outlines[n]!, mitred, frame) : prism(box, frame);
    // Cut by the body: what it has of holes, chamfers and notches stays with each panel.
    const piece = block.intersect(target) as Shape3D;
    block.delete();
    if (piece.faces.length) pieces.push(piece);
  }
  return pieces.length >= 2 ? pieces : null;
}
