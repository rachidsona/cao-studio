/**
 * Un meuble de l'« Assistant meuble » posé dans le document : ses caissons (des Répartitions extrudées, avec leur
 * intérieur, leurs portes et leur fond : document/caisson-spec.ts) et ses planches libres (une esquisse cachée, un
 * rectangle extrudé), dans la matière choisie, nommés d'après lui (« Bureau 1 — Plateau »). Il regarde vers −Y, comme une
 * Répartition dessinée de face, et `place` est le coin avant gauche de son pied ; ou, contre un mur, `frame` dit le
 * coin arrière gauche de son pied et le sens de sa largeur (il regarde ce sens tourné d'un quart vers la droite). Le
 * document le garde (`furniture`) pour le refaire à d'autres cotes (withFurnitureRemade). Une seule annulation. Pur.
 */
import { withCaissonPlaced } from "./caisson-spec";
import { BACK, furnitureLayout, furnitureModel, furnitureSize, type FurnitureAsk } from "./furniture-models";
import { setBodyInfo } from "./materials";
import { deleteFeatures, uniqueId, uniqueName } from "./operations";
import { rectangleAt, type SketchGeometry } from "./sketch";
import type { CadDocument, Feature, FurnitureRecord, TrimFeature, Vec3 } from "./types";

/** A closed outline as a sketch: its points and lines (a board turned with a wall). */
function outlineSketch(points: [number, number][]): SketchGeometry {
  const ids = points.map((_, i) => `p${i + 1}`);
  return {
    points: points.map(([x, y], i) => ({ id: ids[i]!, x, y })),
    curves: points.map((_, i) => ({ id: `l${i + 1}`, kind: "line" as const, p1: ids[i]!, p2: ids[(i + 1) % ids.length]! })),
    constraints: [],
  };
}

/** « Bureau 2 » when a « Bureau 1 » (or one of its parts, « Bureau 1 — Plateau ») is there. */
function furnitureName(doc: CadDocument, base: string): string {
  const taken = (name: string) => doc.features.some((f) => f.name === name || f.name.startsWith(`${name} — `));
  let n = 1;
  while (taken(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * The furniture added at `place` (front left corner of its foot), in `material`, or against a wall (`frame`); its
 * name and new features, kept in the document's `furniture`.
 */
export function withFurniture(base: CadDocument, ask: FurnitureAsk, place: Vec3, material: string, frame?: { corner: Vec3; along: [number, number] }, named?: string): { doc: CadDocument; name: string; features: string[] } | string {
  const layout = furnitureLayout(ask);
  if (typeof layout === "string") return layout;
  const name = named ?? furnitureName(base, furnitureModel(ask.kind).label);
  // The back left corner of its foot, its width along `u`, its front towards `f` (u turned a quarter clockwise).
  const corner: Vec3 = frame?.corner ?? [place[0], place[1] + furnitureSize(ask)[1], place[2]];
  const u = frame?.along ?? [1, 0];
  const f: [number, number] = [u[1], -u[0]];
  const at = (x: number, y: number, z: number): Vec3 => [corner[0] + u[0] * x + f[0] * y, corner[1] + u[1] * x + f[1] * y, corner[2] + z];
  const square = Math.abs(u[0] - 1) < 1e-9 && Math.abs(u[1]) < 1e-9;
  const known = new Set(base.features.map((x) => x.id));
  let doc = base;
  for (const piece of layout.pieces) {
    // The panels' back, the back board behind them.
    const frame = { origin: at(piece.at[0], piece.at[1] + BACK, piece.at[2]), xDir: [u[0], u[1], 0] as Vec3, normal: [f[0], f[1], 0] as Vec3 };
    const made = withCaissonPlaced(doc, { ...piece.spec, carcass: material, facing: material }, { frame, width: piece.width, height: piece.height, name: layout.pieces.length > 1 || layout.boards.length ? `${name} — ${piece.name}` : name });
    if (typeof made === "string") return `${piece.name} : ${made}`;
    doc = made.doc;
  }
  const boards: string[] = [];
  // Boards cut on the bias (under a staircase): one Finitions of outlines in the plane of the front, when the
  // furniture stands square with the axes; turned otherwise, they are made as their box.
  const lat = Math.abs(u[1]) < 1e-9 ? 0 : Math.abs(u[0]) < 1e-9 ? 1 : null;
  const cut = lat === null ? [] : layout.boards.filter((b) => b.outline);
  if (cut.length && lat !== null) {
    const id = uniqueId(doc, "fi");
    const parts = cut.map((b) => {
      const corners = [at(b.from[0], b.from[1], b.from[2]), at(b.to[0], b.to[1], b.to[2])];
      const from = [0, 1, 2].map((k) => Math.min(corners[0]![k]!, corners[1]![k]!)) as Vec3;
      const to = [0, 1, 2].map((k) => Math.max(corners[0]![k]!, corners[1]![k]!)) as Vec3;
      const pts = b.outline!.map(([x, z]): [number, number] => [corner[lat] + u[lat]! * x, corner[2] + z]);
      // No point twice in a row (a slope coming down to the floor).
      const points = pts.filter((p, i) => Math.hypot(p[0] - pts[(i + pts.length - 1) % pts.length]![0], p[1] - pts[(i + pts.length - 1) % pts.length]![1]) > 0.5);
      return { name: b.name, from, to, outline: { axis: lat as 0 | 1, points } };
    });
    doc = { ...doc, features: [...doc.features, { id, type: "trim", name: `${name} — habillage`, parts } satisfies TrimFeature] };
    doc = setBodyInfo(doc, parts.map((_, i) => `${id}#${i}`), { material });
  }
  for (const board of layout.boards.filter((b) => !cut.includes(b))) {
    const [z0, z1] = [corner[2] + board.from[2], corner[2] + board.to[2]];
    const ends = [at(board.from[0], board.from[1], 0), at(board.to[0], board.from[1], 0), at(board.to[0], board.to[1], 0), at(board.from[0], board.to[1], 0)];
    const xs = ends.map((p) => p[0]);
    const ys = ends.map((p) => p[1]);
    // Square with the axes: a rectangle; turned with a wall, its four corners.
    const outline = square
      ? rectangleAt((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
      : outlineSketch(ends.map((p): [number, number] => [p[0], p[1]]));
    const sketch: Feature = { id: uniqueId(doc, "sk"), type: "sketch", name: uniqueName(doc, "Esquisse"), plane: "XY", offset: z0, hidden: true, ...outline };
    doc = { ...doc, features: [...doc.features, sketch] };
    const id = uniqueId(doc, "ex");
    doc = { ...doc, features: [...doc.features, { id, type: "extrude", name: `${name} — ${board.name}`, sketch: sketch.id, distance: z1 - z0, operation: "new" }] };
    boards.push(id);
  }
  if (boards.length) doc = setBodyInfo(doc, boards, { material });
  const features = doc.features.filter((x) => !known.has(x.id)).map((x) => x.id);
  const record: FurnitureRecord = { name, ask: { ...ask }, material, corner, along: [u[0], u[1]], features };
  doc = { ...doc, furniture: [...(doc.furniture ?? []).filter((r) => r.name !== name), record] };
  return { doc, name, features };
}

/** The furniture of the assistant a feature belongs to. */
export function furnitureOf(doc: CadDocument, featureId: string): FurnitureRecord | null {
  return doc.furniture?.find((r) => r.features.includes(featureId)) ?? null;
}

/**
 * The furniture made again at the sizes and choices asked, where it stands (its back left corner, its way), under its
 * name: its features taken out first — what was changed in it by hand goes with them.
 */
export function withFurnitureRemade(base: CadDocument, record: FurnitureRecord, ask: FurnitureAsk, material: string): { doc: CadDocument; name: string; features: string[] } | string {
  const { next } = deleteFeatures(base, record.features.filter((id) => base.features.some((x) => x.id === id)));
  const cleared = { ...next, furniture: (next.furniture ?? []).filter((r) => r.name !== record.name) };
  return withFurniture(cleared, ask, [0, 0, 0], material, { corner: record.corner, along: record.along }, record.name);
}
