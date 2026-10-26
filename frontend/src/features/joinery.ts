/**
 * Cabinet-making machining as plain numbers, no kernel: from the boxes of the
 * boards, the operations (blind holes, boxes) of the 32 mm drilling system,
 * hinge cups, back grooves and the joints (dowels, confirmat, half-lap,
 * mortise and tenon). The boards are taken as boxes, which is what panels are.
 */
import type { Axis, MachiningOp, Vec3 } from "../document/types";

export type Box = [Vec3, Vec3];

/** A face of a box: the axis of its normal and the side (+1: the high face, −1: the low face). */
export interface BoxFace {
  axis: Axis;
  sign: 1 | -1;
}

const TOLERANCE = 0.05;

const others = (axis: Axis): [Axis, Axis] => ([0, 1, 2].filter((i) => i !== axis) as Axis[]).slice(0, 2) as [Axis, Axis];
const size = (box: Box, i: number) => (box[1][i] as number) - (box[0][i] as number);
const lowOf = (box: Box, i: number) => box[0][i] as number;
const highOf = (box: Box, i: number) => box[1][i] as number;
const round = (v: number) => Number(v.toFixed(4));

function point(axis: Axis, value: number, a: Axis, av: number, b: Axis, bv: number): Vec3 {
  const p: Vec3 = [0, 0, 0];
  p[axis] = round(value);
  p[a] = round(av);
  p[b] = round(bv);
  return p;
}

function unitAlong(axis: Axis, sign: number): Vec3 {
  const v: Vec3 = [0, 0, 0];
  v[axis] = sign;
  return v;
}

/** Unit vector into the material from a face. */
const inward = (face: BoxFace): Vec3 => unitAlong(face.axis, -face.sign);

const surfaceOf = (box: Box, face: BoxFace) => (face.sign > 0 ? highOf(box, face.axis) : lowOf(box, face.axis));

/** The two axes of a face: `along` (its longer side) and `across`. */
function faceAxes(box: Box, face: BoxFace): { along: Axis; across: Axis } {
  const [a, b] = others(face.axis);
  return size(box, a) >= size(box, b) ? { along: a, across: b } : { along: b, across: a };
}

/** Positions along a length: `count` evenly spaced between `margin` and `length − margin` (one: the middle). */
export function spread(length: number, count: number, margin: number): number[] {
  if (count <= 1) return [length / 2];
  const m = Math.min(margin, length / 4);
  return Array.from({ length: count }, (_, i) => m + ((length - 2 * m) * i) / (count - 1));
}

// ---- face machining -------------------------------------------------------------------------

export interface DrillingOptions {
  /** Edge of the face the setback is measured from. */
  side: "low" | "high";
  setback: number;
  spacing: number;
  /** Distance of the first hole from the end of the row. */
  start: number;
  diameter: number;
  depth: number;
  /** A second row, mirrored from the opposite edge. */
  rows: 1 | 2;
}

export const DRILLING_32: DrillingOptions = { side: "low", setback: 37, spacing: 32, start: 32, diameter: 5, depth: 12, rows: 1 };

/** Number of holes of a row of `length` at `spacing`, the first and last `start` from the ends. */
export function holesIn(length: number, spacing: number, start: number): number {
  return Math.max(1, Math.floor((length - 2 * start + 1e-9) / spacing) + 1);
}

/** The 32 mm system: rows of Ø5 holes every 32 mm, 37 mm from an edge. */
export function drilling32(box: Box, face: BoxFace, o: DrillingOptions = DRILLING_32): MachiningOp[] {
  const { along, across } = faceAxes(box, face);
  const length = size(box, along);
  const count = holesIn(length, o.spacing, o.start);
  // The row is centred on the face: the same margin at both ends.
  const first = (length - (count - 1) * o.spacing) / 2;
  const rows = o.rows === 2 ? [o.side, o.side === "low" ? "high" : "low"] : [o.side];
  const ops: MachiningOp[] = [];
  for (const side of rows) {
    const at = side === "low" ? lowOf(box, across) + o.setback : highOf(box, across) - o.setback;
    for (let i = 0; i < count; i++) {
      ops.push({ kind: "hole", at: point(face.axis, surfaceOf(box, face), along, lowOf(box, along) + first + i * o.spacing, across, at), dir: inward(face), diameter: o.diameter, depth: o.depth });
    }
  }
  return ops;
}

export interface HingeOptions {
  side: "low" | "high";
  count: number;
  /** From the door's edge to the middle of the cup. */
  edgeDistance: number;
  margin: number;
  diameter: number;
  depth: number;
}

export const HINGES: HingeOptions = { side: "low", count: 2, edgeDistance: 22.5, margin: 100, diameter: 35, depth: 13 };

/** Hinge cups: Ø35 holes along the long edge of a door, from its inside face. */
export function hinges(box: Box, face: BoxFace, o: HingeOptions = HINGES): MachiningOp[] {
  const { along, across } = faceAxes(box, face);
  const at = o.side === "low" ? lowOf(box, across) + o.edgeDistance : highOf(box, across) - o.edgeDistance;
  return spread(size(box, along), o.count, o.margin).map((s) => ({ kind: "hole", at: point(face.axis, surfaceOf(box, face), along, lowOf(box, along) + s, across, at), dir: inward(face), diameter: o.diameter, depth: o.depth }));
}

export interface GrooveOptions {
  side: "low" | "high";
  /** From the face's edge to the groove's nearest wall. */
  offset: number;
  width: number;
  depth: number;
  /** Along the face's longer side, or the shorter. */
  direction: "long" | "short";
}

export const GROOVE: GrooveOptions = { side: "low", offset: 10, width: 4, depth: 8, direction: "long" };

/** A groove cut across the whole face, parallel to one of its sides (back panel groove). */
export function groove(box: Box, face: BoxFace, o: GrooveOptions = GROOVE): MachiningOp[] {
  const axes = faceAxes(box, face);
  const [along, across] = o.direction === "long" ? [axes.along, axes.across] : [axes.across, axes.along];
  const from = o.side === "low" ? lowOf(box, across) + o.offset : highOf(box, across) - o.offset - o.width;
  const surface = surfaceOf(box, face);
  const lo: Vec3 = [0, 0, 0];
  const hi: Vec3 = [0, 0, 0];
  lo[across] = round(from);
  hi[across] = round(from + o.width);
  lo[along] = round(lowOf(box, along) - 1);
  hi[along] = round(highOf(box, along) + 1);
  // Overshoot the surface by 1 mm so the cut opens cleanly.
  lo[face.axis] = round(face.sign > 0 ? surface - o.depth : surface - 1);
  hi[face.axis] = round(face.sign > 0 ? surface + 1 : surface + o.depth);
  return [{ kind: "box", from: lo, to: hi, mode: "cut" }];
}

// ---- joints between two boards --------------------------------------------------------------

/** Two boards touching face to face. */
export interface Contact {
  axis: Axis;
  /** The board `a` lies on the low side of the contact plane. */
  aFirst: boolean;
  plane: number;
  /** Where they touch (zero thickness along `axis`). */
  overlap: Box;
}

/** How two boxes touch, face to face (the largest contact when several), or null. */
export function contactOf(a: Box, b: Box): Contact | null {
  let best: (Contact & { area: number }) | null = null;
  for (const axis of [0, 1, 2] as Axis[]) {
    const aFirst = Math.abs(highOf(a, axis) - lowOf(b, axis)) <= TOLERANCE;
    const bFirst = Math.abs(highOf(b, axis) - lowOf(a, axis)) <= TOLERANCE;
    if (!aFirst && !bFirst) continue;
    const plane = aFirst ? highOf(a, axis) : lowOf(a, axis);
    const [p, q] = others(axis);
    const lo = [0, 1, 2].map((i) => Math.max(lowOf(a, i), lowOf(b, i))) as Vec3;
    const hi = [0, 1, 2].map((i) => Math.min(highOf(a, i), highOf(b, i))) as Vec3;
    lo[axis] = hi[axis] = plane;
    const sp = hi[p] - lo[p];
    const sq = hi[q] - lo[q];
    if (sp <= TOLERANCE || sq <= TOLERANCE) continue;
    if (!best || sp * sq > best.area) best = { axis, aFirst, plane, overlap: [lo, hi], area: sp * sq };
  }
  return best ? { axis: best.axis, aFirst: best.aFirst, plane: best.plane, overlap: best.overlap } : null;
}

/** The long and the short side of a contact. */
function contactAxes(c: Contact): { along: Axis; across: Axis } {
  const [p, q] = others(c.axis);
  return size(c.overlap, p) >= size(c.overlap, q) ? { along: p, across: q } : { along: q, across: p };
}

/** Where fasteners go along a contact: on the line through the middle of its thin side, along its long side. */
function contactRow(c: Contact, count: number | null, spacing: number, margin: number): Vec3[] {
  const { along, across } = contactAxes(c);
  const length = size(c.overlap, along);
  const usable = length - 2 * margin;
  const n = count ?? (usable <= 0 ? 1 : Math.max(2, Math.floor(usable / spacing) + 1));
  const mid = (lowOf(c.overlap, across) + highOf(c.overlap, across)) / 2;
  return spread(length, n, margin).map((s) => point(c.axis, c.plane, along, lowOf(c.overlap, along) + s, across, mid));
}

export interface FastenerOptions {
  /** Number of fasteners, or null for one every `spacing`. */
  count: number | null;
  spacing: number;
  margin: number;
}

export interface Joint {
  a: MachiningOp[];
  b: MachiningOp[];
}

const depthIn = (box: Box, axis: Axis, wanted: number) => Math.max(1, Math.min(wanted, size(box, axis) - 2));

export interface DowelOptions extends FastenerOptions {
  diameter: number;
  depth: number;
}

export const DOWELS: DowelOptions = { count: null, spacing: 96, margin: 50, diameter: 8, depth: 15 };

/** Dowels: a hole in each board at the contact, facing each other. */
export function dowels(a: Box, b: Box, c: Contact, o: DowelOptions = DOWELS): Joint {
  const positions = contactRow(c, o.count, o.spacing, o.margin);
  const hole = (at: Vec3, sign: number, depth: number): MachiningOp => ({ kind: "hole", at, dir: unitAlong(c.axis, sign), diameter: o.diameter, depth });
  return {
    a: positions.map((at) => hole(at, c.aFirst ? -1 : 1, depthIn(a, c.axis, o.depth))),
    b: positions.map((at) => hole(at, c.aFirst ? 1 : -1, depthIn(b, c.axis, o.depth))),
  };
}

export interface ConfirmatOptions extends FastenerOptions {
  /** Which board the screw passes through. */
  through: "a" | "b";
  headDiameter: number;
  pilotDiameter: number;
  pilotDepth: number;
}

export const CONFIRMAT: ConfirmatOptions = { count: null, spacing: 128, margin: 50, through: "a", headDiameter: 7, pilotDiameter: 5, pilotDepth: 45 };

/** Confirmat screws: Ø7 through one board from its outer face, Ø5 pilot hole in the other. */
export function confirmats(a: Box, b: Box, c: Contact, o: ConfirmatOptions = CONFIRMAT): Joint {
  const positions = contactRow(c, o.count, o.spacing, o.margin);
  const throughA = o.through === "a";
  const through = throughA ? a : b;
  const other = throughA ? b : a;
  // The through board is on the low side of the contact plane when it is `a` and `a` is first, or `b` and `b` is first.
  const throughFirst = throughA === c.aFirst;
  const outer = throughFirst ? lowOf(through, c.axis) : highOf(through, c.axis);
  // The screw goes from the outer face toward, then across, the contact plane.
  const dir = unitAlong(c.axis, throughFirst ? 1 : -1);
  const [p, q] = others(c.axis);
  const head: MachiningOp[] = positions.map((at) => ({ kind: "hole", at: point(c.axis, outer, p, at[p] as number, q, at[q] as number), dir, diameter: o.headDiameter, depth: size(through, c.axis) }));
  const pilot: MachiningOp[] = positions.map((at) => ({ kind: "hole", at, dir, diameter: o.pilotDiameter, depth: depthIn(other, c.axis, o.pilotDepth) }));
  return throughA ? { a: head, b: pilot } : { a: pilot, b: head };
}

/** The box shared by two boards crossing each other, or null. */
export function overlapBox(a: Box, b: Box): Box | null {
  const lo = [0, 1, 2].map((i) => Math.max(lowOf(a, i), lowOf(b, i))) as Vec3;
  const hi = [0, 1, 2].map((i) => Math.min(highOf(a, i), highOf(b, i))) as Vec3;
  return [0, 1, 2].every((i) => (hi[i] as number) - (lo[i] as number) > TOLERANCE) ? [lo, hi] : null;
}

/** A cut box, opened by 1 mm where it lies flush with the board's own faces. */
function flushCut(cut: Box, board: Box): MachiningOp {
  const from = [0, 1, 2].map((i) => round(lowOf(cut, i) - (Math.abs(lowOf(cut, i) - lowOf(board, i)) <= TOLERANCE ? 1 : 0))) as Vec3;
  const to = [0, 1, 2].map((i) => round(highOf(cut, i) + (Math.abs(highOf(cut, i) - highOf(board, i)) <= TOLERANCE ? 1 : 0))) as Vec3;
  return { kind: "box", from, to, mode: "cut" };
}

/** Half-lap (mi-bois): where two boards cross, each loses half of the height they share, so they interlock. */
export function halfLap(a: Box, b: Box, aOnTop = true): Joint | null {
  const o = overlapBox(a, b);
  if (!o) return null;
  const n = [0, 1, 2].reduce((best, i) => (size(o, i) > size(o, best) + TOLERANCE ? i : best), 0) as Axis;
  const mid = (lowOf(o, n) + highOf(o, n)) / 2;
  const part = (upper: boolean): Box => {
    const lo = [...o[0]] as Vec3;
    const hi = [...o[1]] as Vec3;
    if (upper) lo[n] = mid;
    else hi[n] = mid;
    return [lo, hi];
  };
  return { a: [flushCut(part(aOnTop), a)], b: [flushCut(part(!aOnTop), b)] };
}

export interface TenonOptions {
  /** How far the tenon goes into the other board. */
  length: number;
  /** Share of the board's thickness the tenon takes (1/3). */
  thickness: number;
  /** Left on each side along the joint. */
  shoulder: number;
}

export const TENON: TenonOptions = { length: 25, thickness: 1 / 3, shoulder: 10 };

/** Mortise and tenon: a tenon grows from board `a` into a mortise cut in board `b`. */
export function tenon(a: Box, b: Box, c: Contact, o: TenonOptions = TENON): Joint {
  const { along, across } = contactAxes(c);
  const length = Math.max(1, Math.min(o.length, size(c.aFirst ? b : a, c.axis) - 2));
  const wall = Math.max(2, size(c.overlap, across) * o.thickness);
  const mid = (lowOf(c.overlap, across) + highOf(c.overlap, across)) / 2;
  const shoulder = Math.min(o.shoulder, size(c.overlap, along) / 4);
  // `a` is the tenon board: the other board lies in the direction `into`.
  const into = c.aFirst ? 1 : -1;
  const lo: Vec3 = [0, 0, 0];
  const hi: Vec3 = [0, 0, 0];
  lo[along] = round(lowOf(c.overlap, along) + shoulder);
  hi[along] = round(highOf(c.overlap, along) - shoulder);
  lo[across] = round(mid - wall / 2);
  hi[across] = round(mid + wall / 2);
  // The tenon starts 1 mm inside its board (a union of solids, not a mere contact); the mortise opens 1 mm outside.
  const [from, to] = [c.plane - into, c.plane + into * length];
  lo[c.axis] = round(Math.min(from, to));
  hi[c.axis] = round(Math.max(from, to));
  return { a: [{ kind: "box", from: lo, to: hi, mode: "join" }], b: [{ kind: "box", from: lo, to: hi, mode: "cut" }] };
}
