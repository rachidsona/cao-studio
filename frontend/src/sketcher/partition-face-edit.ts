/**
 * Ce qu'on fait sur la face d'une Répartition, avant OK (partition-face.ts) : une étagère ou une cloison tirée, au pas
 * de 32 mm du système de perçage ou accrochée à celle d'une case voisine ; dupliquée (une de plus, au même écart) ou
 * alignée sur la plus proche d'à côté ; une niche à sa cote, sa voisine prenant la différence ; un bloc de tiroirs ou
 * une tringle portés dans une autre niche, dupliqués dans la niche libre la plus proche, une tringle montée, descendue
 * ou alignée, un tiroir de plus ou de moins. Tout se fait sur un brouillon de l'historique (`FaceWork` : les étapes
 * des divisions, ce qui équipe les niches) qu'OK enregistre en une fois. Pur : longueurs en mm.
 */
import type { OffsetRecord, ShelfParams, SketchGeometry } from "../document/sketch";
import type { NicheFeature, SketchFeature } from "../document/types";
import { DRILLING_32 } from "../features/joinery";
import { MAX_DRAWERS, nicheGeometry, nicheProblem } from "../features/niche-parts";
import type { PartitionFace } from "./partition-face";
import { isShelves, pathKey, rebuildChain } from "./partition-history";
import { MAX_SHELVES, pieceWord } from "./shelves";

/** The step of the 32 mm system: where shelf pins go. */
export const PITCH = DRILLING_32.spacing;
/** Closer than this to a piece of a case beside, a piece pulled takes its place. */
export const MAGNET = PITCH / 2;

/** The draft of the sketch's history and of what equips its niches, as OK will store them. */
export interface FaceWork {
  offsets: OffsetRecord[];
  niches: NicheFeature[];
}

const shelvesOf = (work: FaceWork, record: string) => {
  const r = work.offsets.find((o) => o.id === record);
  return r && isShelves(r) ? r : null;
};

/** The sizes of the niches of a division along its axis, from the bottom (from the left for cloisons). */
function sizes(g: SketchGeometry, of: string, record: OffsetRecord): number[] | string {
  if (!isShelves(record)) return "Cette étagère n'existe plus.";
  const made = rebuildChain(g, of);
  if (typeof made === "string") return made;
  const vertical = record.step.input.vertical === true;
  const out: number[] = [];
  for (let i = 0; i <= record.step.input.count; i++) {
    const box = made.niches.get(pathKey([...record.step.niche, i]))?.box;
    if (!box) return "Cette étagère n'existe plus.";
    out.push(vertical ? box.x1 - box.x0 : box.y1 - box.y0);
  }
  return out;
}

/** The division with its niches at these sizes (the last one shares what is left), the others as they were. */
function withSizes(work: FaceWork, record: string, next: number[], patch: Partial<ShelfParams> = {}): FaceWork {
  const heights: (number | null)[] = next.map((s) => Math.round(s * 10) / 10);
  heights[heights.length - 1] = null;
  return { ...work, offsets: work.offsets.map((r) => (r.id === record && isShelves(r) ? { ...r, step: { ...r.step, input: { ...r.step.input, ...patch, mode: "set", heights } } } : r)) };
}

/** What is wrong once changed: a division that cannot be made again, or an equipment that no longer fits its niche. */
export function workProblem(g: SketchGeometry, of: string, work: FaceWork, sketch: SketchFeature | null): string | null {
  const made = rebuildChain({ ...g, offsets: work.offsets }, of);
  if (typeof made === "string") return made;
  if (made.problems.length) return made.problems.join(" ");
  if (!sketch) return null;
  const drawn = { ...sketch, offsets: work.offsets };
  for (const f of work.niches) {
    if (f.partition !== of || (f.fill !== "rod" && f.fill !== "drawers")) continue;
    const n = nicheGeometry(f, drawn);
    const problem = typeof n === "string" ? n : nicheProblem(f, n);
    if (problem) return `${f.fill === "rod" ? "Tringle" : "Tiroirs"} : ${problem}`;
  }
  return null;
}

/** The `index`-th piece of a division with its middle at `position` (along its axis, in the sketch): its two niches share the change. */
export function movePiece(g: SketchGeometry, of: string, work: FaceWork, record: string, index: number, position: number): FaceWork | string {
  const r = shelvesOf(work, record);
  if (!r) return "Cette étagère n'existe plus.";
  const s = sizes(g, of, r);
  if (typeof s === "string") return s;
  const made = rebuildChain(g, of);
  const below = typeof made === "string" ? undefined : made.niches.get(pathKey([...r.step.niche, index]))?.box;
  if (!below) return "Cette étagère n'existe plus.";
  const vertical = r.step.input.vertical === true;
  const size = position - r.step.input.thickness / 2 - (vertical ? below.x0 : below.y0);
  const total = s[index]! + s[index + 1]!;
  if (size < 1 || total - size < 1) return `L'${pieceWord(vertical)} touche sa voisine.`;
  return withSizes(work, record, s.map((v, i) => (i === index ? size : i === index + 1 ? total - size : v)));
}

/**
 * One more piece in a division, right above the one chosen (right of it, for a cloison), as far from it as it is from
 * the one under it — halfway up the niche above when there is not the room. What was in the niche above goes on in its
 * upper part: the paths after it move up by one.
 */
export function duplicatePiece(g: SketchGeometry, of: string, work: FaceWork, record: string, index: number): FaceWork | string {
  const r = shelvesOf(work, record);
  if (!r) return "Cette étagère n'existe plus.";
  const { count, thickness: t, vertical } = r.step.input;
  const word = pieceWord(vertical);
  if (count >= MAX_SHELVES) return `Pas plus de ${MAX_SHELVES} ${word}s dans une niche.`;
  const s = sizes(g, of, r);
  if (typeof s === "string") return s;
  const room = s[index + 1]!;
  let gap = s[index]!;
  if (gap + t > room - 1) gap = (room - t) / 2;
  if (gap < 1) return `Pas la place d'une ${word} de plus au-dessus : agrandissez la niche.`;
  const next = [...s.slice(0, index + 1), gap, room - gap - t, ...s.slice(index + 2)];
  const root = r.step.niche;
  const depth = root.length;
  const shifted = (path: number[]) => (path.length > depth && pathKey(path.slice(0, depth)) === pathKey(root) && path[depth]! > index ? [...root, path[depth]! + 1, ...path.slice(depth + 1)] : path);
  const moved = withSizes(work, record, next, { count: count + 1 });
  return {
    offsets: moved.offsets.map((o) => (isShelves(o) && o.step.of === of && o.id !== record ? { ...o, step: { ...o.step, niche: shifted(o.step.niche) } } : o)),
    niches: work.niches.map((f) => (f.partition === of ? { ...f, niche: shifted(f.niche), ...(f.span ? { span: f.span.map(shifted) } : {}) } : f)),
  };
}

/**
 * The `index`-th piece of a division taken away: the two niches it parted make one, the other pieces stay where they
 * are. The niche made keeps what the lower one held (the left one, for a cloison) — or the upper one's when the lower
 * one held nothing —; what the other held (divisions, drawers, rod, a door over it) goes. The last piece takes its
 * step with it. The paths after it move down by one.
 */
export function deletePiece(g: SketchGeometry, of: string, work: FaceWork, record: string, index: number): FaceWork | string {
  const r = shelvesOf(work, record);
  if (!r) return "Cette étagère n'existe plus.";
  const s = sizes(g, of, r);
  if (typeof s === "string") return s;
  const { count, thickness: t } = r.step.input;
  const root = r.step.niche;
  const d = root.length;
  const under = (path: number[], k: number) => path.length > d && pathKey(path.slice(0, d)) === pathKey(root) && path[d] === k;
  const holds = (k: number) => work.offsets.some((o) => isShelves(o) && o.step.of === of && o.id !== record && under(o.step.niche, k)) || work.niches.some((f) => f.partition === of && [f.niche, ...(f.span ?? [])].some((p) => under(p, k)));
  const keep = holds(index) || !holds(index + 1) ? index : index + 1;
  const moved = (path: number[]): number[] | null => {
    if (path.length <= d || pathKey(path.slice(0, d)) !== pathKey(root)) return path;
    const j = path[d]!;
    if ((j === index || j === index + 1) && j !== keep) return null;
    const at = j > index + 1 ? j - 1 : Math.min(j, index);
    return count === 1 ? [...root, ...path.slice(d + 1)] : [...root, at, ...path.slice(d + 1)];
  };
  const merged = s[index]! + t + s[index + 1]!;
  const rest = count === 1 ? { ...work, offsets: work.offsets.filter((o) => o.id !== record) } : withSizes(work, record, [...s.slice(0, index), merged, ...s.slice(index + 2)], { count: count - 1 });
  const offsets = rest.offsets.flatMap((o) => {
    if (!isShelves(o) || o.step.of !== of || o.id === record) return [o];
    const niche = moved(o.step.niche);
    return niche ? [{ ...o, step: { ...o.step, niche } }] : [];
  });
  const niches = work.niches.flatMap((f) => {
    if (f.partition !== of) return [f];
    const niche = moved(f.niche);
    const span = f.span?.map(moved);
    if (!niche || span?.some((p) => !p)) return [];
    return [{ ...f, niche, ...(span ? { span: span as number[][] } : {}) }];
  });
  return { offsets, niches };
}

/** Drawers or a rod taken away. */
export function deleteEquip(work: FaceWork, id: string): FaceWork | string {
  if (!feature(work, id)) return "Cet équipement n'existe plus.";
  return { ...work, niches: work.niches.filter((f) => f.id !== id) };
}

/** The division that makes a niche's size along an axis: the last on its way to it, and which of its niches it is. */
export function divisionOn(work: FaceWork, of: string, path: number[], axis: "x" | "y"): { record: string; index: number } | null {
  for (let k = path.length - 1; k > 0; k--) {
    const at = pathKey(path.slice(0, k));
    const r = work.offsets.find((o) => isShelves(o) && o.step.of === of && (o.step.input.vertical === true) === (axis === "x") && pathKey(o.step.niche) === at);
    if (r) return { record: r.id, index: path[k]! };
  }
  return null;
}

/** A niche at `value` mm along an axis: the niches of the same size as the next one share the difference, the others stay. */
export function resizeNiche(g: SketchGeometry, of: string, work: FaceWork, path: number[], axis: "x" | "y", value: number): FaceWork | string {
  const on = divisionOn(work, of, path, axis);
  if (!on) return axis === "y" ? "Cette niche va du dessous au dessus : posez d'abord une étagère pour la découper." : "Cette niche a toute la largeur de sa case : changez la largeur de la case.";
  const r = shelvesOf(work, on.record)!;
  const s = sizes(g, of, r);
  if (typeof s === "string") return s;
  // The difference is shared by the next niche (the one under it, for the last) and every other one of the same size
  // as it: niches that were equal stay equal; one of its own size (a top niche set apart) keeps it.
  const other = on.index < s.length - 1 ? on.index + 1 : on.index - 1;
  const alike = s.map((v, i) => i).filter((i) => i !== on.index && Math.abs(s[i]! - s[other]!) < SAME);
  const each = (s[on.index]! - value) / alike.length;
  if (!(value >= 1) || alike.some((i) => s[i]! + each < 1)) return "Les autres niches n'ont pas la place.";
  return withSizes(work, on.record, s.map((v, i) => (i === on.index ? value : alike.includes(i) ? v + each : v)));
}

/** Niches closer than this (mm) are of the same size. */
const SAME = 0.5;

/** Every piece of a division at this thickness: the niches keep their sizes, the last one gives or takes the difference. */
export function pieceThickness(work: FaceWork, record: string, thickness: number): FaceWork | string {
  const r = shelvesOf(work, record);
  if (!r) return "Cette étagère n'existe plus.";
  if (!(thickness > 0)) return `Donnez une épaisseur de ${pieceWord(r.step.input.vertical)} positive.`;
  return { ...work, offsets: work.offsets.map((o) => (o.id === record && isShelves(o) ? { ...o, step: { ...o.step, input: { ...o.step.input, thickness } } } : o)) };
}

/**
 * Where a piece pulled to `raw` (its middle, in the face's frame) goes: on the piece of a case beside when it passes
 * close to it (aligned), else on the 32 mm steps from the bottom of its niche (from its left, a cloison); `free`
 * (Alt held): to the millimetre. Always inside its travel.
 */
export function snapPiece(face: PartitionFace, k: number, raw: number, free = false): number {
  const p = face.pieces[k];
  if (!p) return raw;
  const [low, high] = p.travel;
  const inside = (v: number) => Math.min(Math.max(v, low + 1), high - 1);
  if (free) return inside(Math.round(raw));
  const near = beside(face, k).filter((c) => Math.abs(c - raw) <= MAGNET && c > low && c < high).sort((a, b) => Math.abs(a - raw) - Math.abs(b - raw))[0];
  if (near !== undefined) return near;
  // Whole steps from the start, at least one, none past the far end: never a niche thinner than a step.
  const way = p.start === low ? 1 : -1;
  const most = Math.floor((high - low - 1) / PITCH);
  if (most < 1) return inside(Math.round(raw));
  const steps = Math.min(Math.max(Math.round((way * (raw - p.start)) / PITCH), 1), most);
  return p.start + way * steps * PITCH;
}

/** The middles of the pieces of the same kind elsewhere on the face (another division, or another case). */
function beside(face: PartitionFace, k: number): number[] {
  const p = face.pieces[k]!;
  return face.pieces.filter((q, j) => j !== k && q.vertical === p.vertical && q.record !== p.record).map((q) => q.centre);
}

/** Where to align a piece: the closest piece of the same kind beside it that it can reach; null: none. */
export function alignPiece(face: PartitionFace, k: number): number | null {
  const p = face.pieces[k];
  if (!p) return null;
  const reach = beside(face, k).filter((c) => c > p.travel[0] && c < p.travel[1] && Math.abs(c - p.centre) > 0.05);
  return reach.sort((a, b) => Math.abs(a - p.centre) - Math.abs(b - p.centre))[0] ?? null;
}

/** A face position of a piece's middle, in the sketch (y up from the origin, x from it). */
export const toSketch = (face: PartitionFace, vertical: boolean, at: number) => (vertical ? face.origin[0] + at : face.origin[1] + face.height - at);

// ---- what equips the niches ------------------------------------------------------------------------------------

const feature = (work: FaceWork, id: string) => work.niches.find((f) => f.id === id);
const withFeature = (work: FaceWork, id: string, patch: Partial<NicheFeature>): FaceWork => ({ ...work, niches: work.niches.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

/** The niches already holding drawers or a rod, by path. */
const taken = (work: FaceWork, of: string) => new Set(work.niches.filter((f) => f.partition === of && (f.fill === "rod" || f.fill === "drawers")).map((f) => pathKey(f.niche)));

/** Drawers or a rod carried into another niche (an empty one). */
export function moveEquip(work: FaceWork, id: string, path: number[]): FaceWork | string {
  const f = feature(work, id);
  if (!f) return "Cet équipement n'existe plus.";
  if (pathKey(path) === pathKey(f.niche)) return work;
  if (taken(work, f.partition).has(pathKey(path))) return "Cette niche est déjà équipée : choisissez une niche vide.";
  return withFeature(work, id, { niche: [...path] });
}

/** A copy of drawers or a rod in another niche; `id`: the copy's (a new one). */
export function duplicateEquip(work: FaceWork, from: string, path: number[], id: string): FaceWork | string {
  const f = feature(work, from);
  if (!f) return "Cet équipement n'existe plus.";
  if (taken(work, f.partition).has(pathKey(path))) return "Cette niche est déjà équipée : choisissez une niche vide.";
  return { ...work, niches: [...work.niches, { ...structuredClone(f), id, niche: [...path] }] };
}

/** One drawer more or less in the block (they share the niche's height). */
export function drawerCount(work: FaceWork, id: string, count: number): FaceWork | string {
  const f = feature(work, id);
  if (!f || f.fill !== "drawers") return "Ces tiroirs n'existent plus.";
  if (!Number.isInteger(count) || count < 1 || count > MAX_DRAWERS) return `De 1 à ${MAX_DRAWERS} tiroirs.`;
  return withFeature(work, id, { drawers: count });
}

/** A rod lowered (positive) or raised (negative) by `by` mm under the top of its niche. */
export function dropRod(work: FaceWork, id: string, by: number): FaceWork | string {
  const f = feature(work, id);
  if (!f || f.fill !== "rod") return "Cette tringle n'existe plus.";
  return withFeature(work, id, { drop: Math.round((f.drop + by) * 10) / 10 });
}

/** Where a rod pulled to `raw` (face's frame) goes: on a rod of another niche close by, else to the centimetre from the floor. */
export function snapRod(face: PartitionFace, id: string, raw: number, free = false): number {
  if (free) return Math.round(raw);
  const near = face.rods.filter((r) => r.id !== id && Math.abs(r.y - raw) <= MAGNET).sort((a, b) => Math.abs(a.y - raw) - Math.abs(b.y - raw))[0];
  return near ? near.y : face.height - Math.round((face.height - raw) / 10) * 10;
}

/** The height of the closest rod of another niche (face's frame); null: no other rod. */
export function alignRod(face: PartitionFace, id: string): number | null {
  const own = face.rods.find((r) => r.id === id);
  if (!own) return null;
  return face.rods.filter((r) => r.id !== id && Math.abs(r.y - own.y) > 0.05).sort((a, b) => Math.abs(a.y - own.y) - Math.abs(b.y - own.y))[0]?.y ?? null;
}

/** The niche under a point of the face; null: none (a panel, outside). */
export function nicheUnder(face: PartitionFace, x: number, y: number): number[] | null {
  return face.niches.find((n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h)?.path ?? null;
}

/** The empty niche closest to an equipment, for its copy: on the same row first, to its right first. Null: none. */
export function freeNicheNear(face: PartitionFace, work: FaceWork, of: string, id: string): number[] | null {
  const e = face.equips.find((q) => q.id === id);
  if (!e) return null;
  const full = taken(work, of);
  const [cx, cy] = [e.niche.x + e.niche.w / 2, e.niche.y + e.niche.h / 2];
  const score = (n: PartitionFace["niches"][number]) => {
    const [x, y] = [n.x + n.w / 2, n.y + n.h / 2];
    const row = Math.min(n.y + n.h, e.niche.y + e.niche.h) - Math.max(n.y, e.niche.y) > 0 ? 0 : 1;
    return row * 1e7 + Math.abs(x - cx) + Math.abs(y - cy) + (x < cx ? 1 : 0);
  };
  return [...face.niches].filter((n) => !full.has(pathKey(n.path))).sort((a, b) => score(a) - score(b))[0]?.path ?? null;
}
