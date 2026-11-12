/**
 * « Prolonger élément », jusqu'où et ce qui le garde, en nombres. Une face d'arrivée parallèle : jusqu'à son plan.
 * Inclinée (un mur en biais, un rampant) : un caisson ou une Répartition, des boîtes, s'allongent jusqu'à la toucher
 * de leur premier coin ; une autre pièce va jusqu'à son plan et en prend la pente (features/face-until.ts). Gardé :
 * une pièce reçoit une opération qui va jusqu'à la face à chaque recalcul ; un caisson ou une Répartition, une
 * liaison (`extendLinks`) que l'éditeur refait quand l'autre élément change (app/extend-follow.ts). Pur.
 */
import { extendable, extendElement } from "./extend-element";
import { bodyLabel, bodyOrigin, latestBody, uniqueId, uniqueName } from "./operations";
import { featureOfBody, type CadDocument, type ExtendLink, type ExtrudeFeature, type FaceRef, type Vec3 } from "./types";

/** A planar face: its centre, its outward normal, and its corners. */
export interface FacePlane {
  point: Vec3;
  normal: Vec3;
  points: readonly Vec3[];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** Closer than this to parallel, the faces are parallel (cosine). */
const PARALLEL = 0.9998;
/** A slant steeper than this is never met going along the normal (cosine). */
const GRAZING = 0.02;
/** Below this, the element is where it should be (mm): nothing done. */
export const SETTLED = 0.05;

/** How far each point goes along the normal `n` to the plane of `to` (negative: it is past it). */
export function travelTo(points: readonly Vec3[], n: Vec3, to: { point: Vec3; normal: Vec3 }): { min: number; max: number; parallel: boolean } | string {
  const m = unit(to.normal);
  const along = dot(unit(n), m);
  if (Math.abs(along) < GRAZING) return "la face d'arrivée est dans le sens de la face à prolonger : elle ne l'atteint jamais.";
  const t = points.map((p) => dot(sub(to.point, p), m) / along);
  return { min: Math.min(...t), max: Math.max(...t), parallel: Math.abs(along) > PARALLEL };
}

/** How far the face of a box element goes: to the plane when parallel, until its first corner touches it when slanted. */
export function reachBy(from: FacePlane, to: { point: Vec3; normal: Vec3 }): { by: number; slanted: boolean } | string {
  const n = unit(from.normal);
  const travel = travelTo([from.point, ...from.points], n, to);
  if (typeof travel === "string") return travel;
  const by = travel.parallel ? dot(n, sub(to.point, from.point)) : travel.min;
  return { by: Math.round(by * 10) / 10, slanted: !travel.parallel };
}

/** A plane at `by` along the face's normal: what extendElement takes as the face to reach. */
const planeAt = (from: FacePlane, by: number) => {
  const n = unit(from.normal);
  return { point: [from.point[0] + n[0] * by, from.point[1] + n[1] * by, from.point[2] + n[2] * by] as Vec3, normal: n };
};

export interface Extended {
  doc: CadDocument;
  by: number;
  /** What to select: the cabinet, the sketch, or the operation made. */
  id: string;
  /** Said to the user. */
  message: string;
}

/**
 * The element of `fromBody` extended from its face up to the face of `toBody` (the faces as the kernel finds them,
 * `refs` their persistent references), kept on it when `follow`; or why it cannot be. `piece`: the piece alone, as any
 * other piece, the cabinet or Répartition it is part of staying as it is.
 */
export function extendTo(doc: CadDocument, fromBody: string, toBody: string, from: FacePlane, to: FacePlane, refs: { from?: FaceRef; to?: FaceRef }, follow: boolean, piece = false): Extended | string {
  // `piece`: only the piece clicked (a shelf, a cloison of a cabinet or a Répartition), not the whole element.
  const owner = piece ? null : extendable(doc, fromBody);
  const reach = reachBy(from, to);
  if (typeof reach === "string") return `Impossible : ${reach}`;
  const name = owner?.name ?? bodyLabel(doc, fromBody);
  const target = bodyLabel(doc, toBody);
  const say = (by: number, kept: boolean) => `« ${name} » ${by >= 0 ? "prolongé" : "raccourci"} de ${cm(Math.abs(by))} jusqu'à « ${target} »${kept ? ", qu'il suivra" : ""}.`;
  if (!owner) {
    // A piece: its face pulled, up to the face (and its slope) when kept or slanted.
    if (!refs.from) return "Cette face ne peut pas être prolongée.";
    const exact = travelTo([from.point, ...from.points], unit(from.normal), to);
    if (typeof exact === "string") return `Impossible : ${exact}`;
    const by = Math.round((exact.parallel ? dot(unit(from.normal), sub(to.point, from.point)) : exact.min >= 0 ? exact.max : exact.min) * 10) / 10;
    if (Math.abs(by) < 0.1) return "Ces deux faces sont déjà dans le même plan.";
    const keep = (follow || reach.slanted) && refs.to;
    const id = uniqueId(doc, "ex");
    const feature: ExtrudeFeature = { id, type: "extrude", name: uniqueName(doc, by > 0 ? "Prolongement" : "Raccourci"), faces: [refs.from], target: latestBody(doc, fromBody), distance: by, operation: by > 0 ? "join" : "cut", ...(keep ? { until: { body: latestBody(doc, toBody), face: refs.to! } } : {}) };
    return { doc: { ...doc, features: [...doc.features, feature] }, by, id, message: say(by, !!keep) };
  }
  if (Math.abs(reach.by) < 0.1 && !follow) return "Ces deux faces sont déjà dans le même plan.";
  let next = doc;
  if (Math.abs(reach.by) >= 0.1) {
    const made = extendElement(doc, fromBody, from, planeAt(from, reach.by));
    if (typeof made === "string") return made;
    next = made.doc;
  }
  if (follow && refs.from && refs.to) {
    const link: ExtendLink = { id: uniqueLinkId(doc), from: { body: bodyOrigin(doc, fromBody), face: refs.from }, to: { body: bodyOrigin(doc, toBody), face: refs.to } };
    next = { ...next, extendLinks: [...(next.extendLinks ?? []), link] };
  }
  return { doc: next, by: reach.by, id: owner.id, message: say(reach.by, follow) };
}

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;

function uniqueLinkId(doc: CadDocument): string {
  const used = new Set((doc.extendLinks ?? []).map((l) => l.id));
  let n = 1;
  while (used.has(`pl${n}`)) n++;
  return `pl${n}`;
}

/** The bodies a link reads now (their latest ids), or null when its element or the other one is gone. */
export function linkBodies(doc: CadDocument, link: ExtendLink): { from: string; to: string } | null {
  const from = latestBody(doc, link.from.body);
  const to = latestBody(doc, link.to.body);
  const there = (id: string) => doc.features.some((f) => f.id === featureOfBody(id) && !f.suppressed) && !(doc.removedBodies ?? []).includes(id);
  return extendable(doc, from) && there(to) ? { from, to } : null;
}

/** A link applied again: the document with its element back on the face (null: already there), or why it cannot. */
export function followLink(doc: CadDocument, link: ExtendLink, from: FacePlane, to: FacePlane): { doc: CadDocument; by: number } | string | null {
  const bodies = linkBodies(doc, link);
  if (!bodies) return "Cet élément n'existe plus.";
  const reach = reachBy(from, to);
  if (typeof reach === "string") return reach;
  if (Math.abs(reach.by) < SETTLED) return null;
  const made = extendElement(doc, bodies.from, from, planeAt(from, reach.by));
  return typeof made === "string" ? made : { doc: made.doc, by: reach.by };
}

/** The document without these links. */
export function withoutLinks(doc: CadDocument, ids: readonly string[]): CadDocument {
  const kept = (doc.extendLinks ?? []).filter((l) => !ids.includes(l.id));
  const { extendLinks: _, ...rest } = doc;
  return kept.length ? { ...rest, extendLinks: kept } : rest;
}

/**
 * Whether a face of a piece is on the outside of its element (the box around all its bodies): a side, the top, the
 * front of a cabinet — the element is extended by default; a face inside it (the end or the top of a shelf, of a
 * cloison) extends that piece alone by default.
 */
export function onEnvelope(face: Pick<FacePlane, "point" | "normal">, boxes: readonly [Vec3, Vec3][]): boolean {
  const n = unit(face.normal);
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(n[i]!) > Math.abs(n[m]!) ? i : m), 0);
  if (!boxes.length || Math.abs(n[k]!) < PARALLEL) return true;
  const edge = n[k]! > 0 ? Math.max(...boxes.map((b) => b[1][k]!)) : Math.min(...boxes.map((b) => b[0][k]!));
  return Math.abs(face.point[k]! - edge) < 0.5;
}
