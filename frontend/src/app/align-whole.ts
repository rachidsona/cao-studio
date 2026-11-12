/**
 * « Face sur face » d'Aligner sur un meuble entier : la face cliquée est celle d'une pièce (le côté d'un caisson, une
 * façade, un panneau d'une Répartition), mais c'est tout le meuble qui vient se plaquer — le caisson avec ses façades et
 * l'électroménager posé dedans, ou toute la Répartition avec ses pièces —, comme Pousser et Coller par face le font.
 * Un caisson tourne aussi, par quarts de tour autour de la verticale (son origine tournée autour du centre de la face) ;
 * une Répartition ne fait que se déplacer. Le meuble reste un seul meuble, réglable, en une seule annulation.
 */
import { cabinetOfAppliance, shownCabinets } from "../document/appliance-follow";
import { findFeature, updateFeature } from "../document/operations";
import { movesNeeded, spacingFeatures, type Moving } from "../document/spacing";
import type { CadDocument, Feature, Vec3 } from "../document/types";
import type { FaceMate } from "../features/face-mate";
import { isPartition } from "../sketcher/partition-history";
import { wholeBodies, wholeOwner } from "./move-whole";

/** The cabinet or the Répartition a body is a piece of (not a plain body extruded from a sketch), or null. */
export function alignWhole(doc: CadDocument, bodyId: string): ReturnType<typeof wholeOwner> {
  const owner = wholeOwner(doc, bodyId);
  if (owner?.kind !== "sketch") return owner;
  const sketch = findFeature(doc, owner.id);
  return sketch?.type === "sketch" && (sketch.offsets ?? []).some(isPartition) ? owner : null;
}

/** The point `p` turned by `degrees` about the vertical through `c`. */
function turnedAbout(p: Vec3, c: Vec3, degrees: number): Vec3 {
  const a = (degrees * Math.PI) / 180;
  const [x, y] = [p[0] - c[0], p[1] - c[1]];
  const r = (v: number) => Number(v.toFixed(3));
  return [r(c[0] + x * Math.cos(a) - y * Math.sin(a)), r(c[1] + x * Math.sin(a) + y * Math.cos(a)), p[2]];
}

/** The quarter turns about the vertical a mate's turn is, in degrees; a string: why a whole cabinet cannot turn so. */
export function quarterTurn(rotation: FaceMate["rotation"]): number | string {
  if (!rotation) return 0;
  if (Math.abs(Math.abs(rotation.dir[2]) - 1) > 1e-6) return "Un meuble entier ne tourne qu'autour de la verticale : choisissez deux faces debout, ou « La pièce seule ».";
  const degrees = rotation.dir[2] > 0 ? rotation.angle : -rotation.angle;
  const quarters = Math.round(degrees / 90);
  if (Math.abs(degrees - quarters * 90) > 0.01) return "Un meuble entier ne tourne que par quarts de tour : choisissez des faces d'équerre, ou « La pièce seule ».";
  return quarters * 90;
}

/**
 * The features that lay the whole element of `bodyId` by `mate`, or why they cannot; null when the body is part of no
 * whole (it moves alone). `slots`: ids for the moves of bodies, made once (`fresh`) and kept while the tool is open.
 */
export function wholeMate(doc: CadDocument, bodyId: string, displayed: readonly string[], mate: FaceMate, slots: { id: string; name: string }[], fresh: (n: number) => { id: string; name: string }[]): Feature[] | string | null {
  const owner = alignWhole(doc, bodyId);
  if (!owner) return null;
  const turn = quarterTurn(mate.rotation);
  if (typeof turn === "string") return turn;
  if (turn && owner.kind !== "cabinet") return "Une Répartition entière se déplace sans tourner : choisissez deux faces déjà face à face, ou « La pièce seule ».";
  const cabinet = owner.kind === "cabinet" ? findFeature(doc, owner.id) : undefined;
  const appliances = cabinet?.type === "cabinet" ? doc.features.filter((a) => a.type === "appliance" && cabinetOfAppliance(shownCabinets(doc), a)?.id === cabinet.id) : [];
  // Turned first (the cabinet and what is in it, about the centre of the face), then moved.
  let base = doc;
  if (turn && mate.rotation) {
    const centre = mate.rotation.center;
    for (const f of [cabinet!, ...appliances]) {
      base = updateFeature(base, f.id, (g) => (g.type === "cabinet" || g.type === "appliance" ? { ...g, origin: turnedAbout(g.origin, centre, turn), rotation: (((((g.rotation ?? 0) + turn) % 360) + 360) % 360) as 0 | 90 | 180 | 270 } : g));
    }
  }
  const shift = mate.translate.map((c) => Number(c.toFixed(6))) as Vec3;
  const moving: Moving[] = [
    { key: owner.id, whole: true, shift, bodies: wholeBodies(doc, owner.kind, owner.id, displayed) },
    ...appliances.map((a): Moving => ({ key: a.id, whole: true, shift, bodies: displayed.filter((b) => b.startsWith(`${a.id}#`)) })),
  ];
  const needed = movesNeeded(base, moving);
  if (slots.length < needed) slots.splice(0, slots.length, ...fresh(needed));
  const made = spacingFeatures(base, moving, slots);
  // Turned without moving: the turned cabinet and appliances still go in.
  for (const f of base === doc ? [] : [cabinet!, ...appliances]) if (!made.some((m) => m.id === f.id)) made.push(findFeature(base, f.id)!);
  return made.length ? made : "Ces deux faces sont déjà l'une contre l'autre.";
}

/** A face of a box: its centre, outward normal, corners and sides. */
export interface BoxFace {
  center: Vec3;
  normal: Vec3;
  corners: Vec3[];
  sides: [Vec3, Vec3][];
}

/**
 * The outer face of an element's box on the side of a face clicked on it: on the axis of the face's normal, on the side
 * of the box the point clicked is nearest — so the inside of a cabinet's left side (its normal toward the inside) still
 * gives the outside of its left side. Null when the face is slanted (no side of the box).
 */
export function envelopeFace(box: [Vec3, Vec3], normal: Vec3, clicked: Vec3): BoxFace | null {
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(normal[i]!) > Math.abs(normal[m]!) ? i : m), 0);
  if (Math.abs(normal[k]!) / (Math.hypot(...normal) || 1) < 0.98) return null;
  const [min, max] = box;
  const high = clicked[k]! > (min[k]! + max[k]!) / 2;
  const level = high ? max[k]! : min[k]!;
  const [a, b] = [0, 1, 2].filter((i) => i !== k) as [number, number];
  const at = (u: number, v: number): Vec3 => {
    const p: Vec3 = [0, 0, 0];
    p[k] = level;
    p[a] = u;
    p[b] = v;
    return p;
  };
  const corners = [at(min[a]!, min[b]!), at(max[a]!, min[b]!), at(max[a]!, max[b]!), at(min[a]!, max[b]!)];
  const n: Vec3 = [0, 0, 0];
  n[k] = high ? 1 : -1;
  return { center: at((min[a]! + max[a]!) / 2, (min[b]! + max[b]!) / 2), normal: n, corners, sides: corners.map((c, i) => [c, corners[(i + 1) % 4]!] as [Vec3, Vec3]) };
}

/**
 * The outer face, on the side clicked, of the cabinet or Répartition a face belongs to — its bodies as shown, their
 * boxes from `boxOf` — or null for a body that is part of no such whole.
 */
export function elementEnvelope(doc: CadDocument, bodyId: string, normal: Vec3, clicked: Vec3, displayed: readonly string[], boxOf: (id: string) => [Vec3, Vec3] | null): BoxFace | null {
  const owner = alignWhole(doc, bodyId);
  if (!owner) return null;
  const boxes = wholeBodies(doc, owner.kind, owner.id, displayed).flatMap((id) => {
    const b = boxOf(id);
    return b ? [b] : [];
  });
  if (!boxes.length) return null;
  const box: [Vec3, Vec3] = [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!))) as Vec3];
  return envelopeFace(box, normal, clicked);
}
