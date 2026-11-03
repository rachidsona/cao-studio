/**
 * Échanger (le Composwapper de JHS PowerBar) : chaque élément choisi — un corps, ou toutes les pièces d'un caisson
 * avec ses façades — est remplacé par une copie liée de l'élément source, posée à sa place : centrée sur lui et sur le
 * même sol (ou centre sur centre, ou coin sur coin). Les copies suivent l'original (réseau d'une copie) ; les éléments
 * remplacés sont retirés (gardés si on le demande). Pur.
 */
import { bodyOrigin, findFeature } from "./operations";
import { featureOfBody, type ArrayFeature, type CadDocument, type Feature, type Vec3 } from "./types";

export type Box = [Vec3, Vec3];
export type Anchor = "floor" | "center" | "corner";

export interface Element {
  /** The feature the element is (a cabinet stands for its fronts too). */
  key: string;
  bodies: string[];
  box: Box;
}

/** The element a body belongs to: its feature, a cabinet with its fronts. */
export function elementKey(doc: CadDocument, bodyId: string): string {
  const owner = featureOfBody(bodyOrigin(doc, bodyId));
  const f = findFeature(doc, owner);
  return f?.type === "fronts" ? f.cabinet : owner;
}

/** The bodies grouped by element, each with its box. */
export function elementsOf(doc: CadDocument, bodies: readonly string[], boxOf: (id: string) => Box | null): Element[] {
  const groups = new Map<string, string[]>();
  for (const id of bodies) {
    const key = elementKey(doc, id);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return [...groups].flatMap(([key, ids]) => {
    const boxes = ids.map(boxOf).filter((b): b is Box => !!b);
    if (!boxes.length) return [];
    const box: Box = [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!))) as Vec3];
    return [{ key, bodies: ids, box }];
  });
}

/** The settings of a cabinet that make its model (not where it stands, nor its name). */
function cabinetModel(f: Feature): string {
  const { id: _id, name: _name, origin: _origin, rotation: _rotation, expressions: _expressions, ...model } = f as Feature & { origin?: unknown; rotation?: unknown; expressions?: unknown };
  return JSON.stringify(model, Object.keys(model).sort());
}

/**
 * Whether two elements are « the same » (Ctrl + click of the Composwapper: all instances): two cabinets of one model
 * (same sizes, shelves, construction…), or two other elements of the same kind and size (turned or not) — the copies
 * of one piece.
 */
export function sameModel(doc: CadDocument, a: Element, b: Element): boolean {
  const [fa, fb] = [findFeature(doc, a.key), findFeature(doc, b.key)];
  if (fa?.type === "cabinet" || fb?.type === "cabinet") return fa?.type === "cabinet" && fb?.type === "cabinet" && cabinetModel(fa) === cabinetModel(fb);
  const size = (e: Element) => [0, 1, 2].map((i) => e.box[1][i]! - e.box[0][i]!).sort((x, y) => x - y);
  const [sa, sb] = [size(a), size(b)];
  return a.bodies.length === b.bodies.length && sa.every((v, i) => Math.abs(v - sb[i]!) < 0.5);
}

/** How far the replacement moves to stand where `target` is. */
export function swapOffset(replacement: Box, target: Box, anchor: Anchor): Vec3 {
  const mid = (b: Box, i: number) => (b[0][i]! + b[1][i]!) / 2;
  return [0, 1, 2].map((i) => {
    if (anchor === "corner") return target[0][i]! - replacement[0][i]!;
    if (anchor === "floor" && i === 2) return target[0][2]! - replacement[0][2]!;
    return mid(target, i) - mid(replacement, i);
  }) as Vec3;
}

/** The copies of the replacement, one per target (the replacement itself left out), and the bodies removed. */
export function swapFeatures(doc: CadDocument, targets: readonly Element[], replacement: Element, anchor: Anchor, slots: readonly { id: string; name: string }[]): { features: ArrayFeature[]; removed: string[] } {
  const features: ArrayFeature[] = [];
  const removed: string[] = [];
  targets
    .filter((t) => t.key !== replacement.key)
    .forEach((t, i) => {
      const step = swapOffset(replacement.box, t.box, anchor).map((v) => Number(v.toFixed(6))) as Vec3;
      const slot = slots[i];
      if (!slot) return;
      removed.push(...t.bodies.map((b) => bodyOrigin(doc, b)));
      // Already in place (the same box): only the removal… which would leave nothing: keep the copy all the same.
      features.push({ ...slot, type: "array", targets: [...replacement.bodies], step: Math.hypot(...step) < 1e-6 ? [1e-3, 0, 0] : step, count: 1 });
    });
  return { features, removed: [...new Set(removed)] };
}
