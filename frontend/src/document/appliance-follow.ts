/**
 * Un appareil posé (Électroménager) suit son caisson : poussé (Pousser), déplacé, ou mis ailleurs quand la cuisine est
 * refaite, le caisson emporte l'appareil qui est dedans, dessus (une plaque, un évier, un robinet sur le plan de travail
 * au-dessus), dessous (un groupe filtrant) ou au-dessus (une hotte), et la découpe du plan de travail faite pour lui.
 * Un caisson suit quand il est le même (son nom, ses tailles, son orientation) et seulement déplacé. Pur.
 */
import { cabinetBox, cabinetAxes } from "./kitchen-catalog";
import { PART_SEPARATOR, type ApplianceFeature, type CabinetFeature, type CadDocument, type MachiningFeature, type MachiningOp, type Vec3 } from "./types";
import { cabinetPartNames } from "../features/cabinet-parts";

type Box = [Vec3, Vec3];
/** Less than this (mm): not moved. */
const STILL = 0.5;
/** Touching its cabinet, above or below (mm). */
const NEAR = 50;
/** Around the appliance, where its cut is (mm). */
const AROUND = 60;

/** The appliance's box, in the model. */
function applianceBox(a: ApplianceFeature): Box {
  const { along, back } = cabinetAxes(a.rotation ?? 0);
  const xs = [0, a.width].flatMap((u) => [0, a.depth].map((v) => a.origin[0] + along[0] * u + back[0] * v));
  const ys = [0, a.width].flatMap((u) => [0, a.depth].map((v) => a.origin[1] + along[1] * u + back[1] * v));
  return [[Math.min(...xs), Math.min(...ys), a.origin[2]], [Math.max(...xs), Math.max(...ys), a.origin[2] + a.height]];
}

/** The cabinets still in the model: some of their pieces not deleted. */
export function shownCabinets(doc: CadDocument): CabinetFeature[] {
  const gone = new Set(doc.removedBodies ?? []);
  return doc.features.filter((f): f is CabinetFeature => f.type === "cabinet" && cabinetPartNames(f).some((_, i) => !gone.has(`${f.id}${PART_SEPARATOR}${i}`)));
}

/** The cabinet an appliance belongs to: the one it is in, else the one it touches from below, else the one under it. */
export function cabinetOfAppliance(cabinets: readonly CabinetFeature[], a: ApplianceFeature): CabinetFeature | undefined {
  const [lo, hi] = applianceBox(a);
  const [mx, my] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  const over = cabinets.map((c) => ({ c, box: cabinetBox(c) })).filter(({ box }) => mx >= box[0][0] - 1 && mx <= box[1][0] + 1 && my >= box[0][1] - 1 && my <= box[1][1] + 1);
  const size = ({ box }: { box: Box }) => (box[1][0] - box[0][0]) * (box[1][1] - box[0][1]) * (box[1][2] - box[0][2]);
  const inside = over.filter(({ box }) => lo[2] < box[1][2] - 1e-6 && hi[2] > box[0][2] + 1e-6).sort((p, q) => size(p) - size(q))[0];
  if (inside) return inside.c;
  const under = over.find(({ box }) => Math.abs(box[0][2] - hi[2]) <= NEAR);
  if (under) return under.c;
  return over.filter(({ box }) => box[1][2] <= lo[2] + 1e-6).sort((p, q) => q.box[1][2] - p.box[1][2])[0]?.c;
}

const shifted = (v: Vec3, d: Vec3): Vec3 => [v[0] + d[0], v[1] + d[1], v[2] + d[2]];
const opAt = (op: MachiningOp): Vec3 => (op.kind === "hole" ? op.at : ([0, 1, 2].map((i) => (op.from[i]! + op.to[i]!) / 2) as Vec3));

/**
 * `next` with each appliance whose cabinet only moved since `prev` moved with it, its cut too; and, with `own`, the
 * cut of an appliance moved by itself (Pousser) following it. Once only: after the plan made the kitchen again, `own`
 * is false, for what already went.
 */
export function appliancesFollow(prev: CadDocument, next: CadDocument, own = true): CadDocument {
  const before = shownCabinets(prev);
  const now = new Map(next.features.filter((f): f is CabinetFeature => f.type === "cabinet").map((c) => [c.id, c]));
  // Each cabinet only moved: by how much.
  const moves = new Map<string, Vec3>();
  for (const c of before) {
    const n = now.get(c.id);
    if (!n || n.name !== c.name || n.width !== c.width || n.depth !== c.depth || n.height !== c.height || (n.rotation ?? 0) !== (c.rotation ?? 0)) continue;
    const d: Vec3 = [n.origin[0] - c.origin[0], n.origin[1] - c.origin[1], n.origin[2] - c.origin[2]];
    if (Math.hypot(...d) > STILL) moves.set(c.id, d);
  }
  const was = new Map(prev.features.filter((f): f is ApplianceFeature => f.type === "appliance").map((a) => [a.id, a]));
  const going = new Map<string, Vec3>();
  /** Those moved by themselves: their cut only. */
  const went = new Map<string, Vec3>();
  for (const f of next.features) {
    const old = f.type === "appliance" ? was.get(f.id) : undefined;
    if (f.type !== "appliance" || !old) continue;
    const d: Vec3 = [f.origin[0] - old.origin[0], f.origin[1] - old.origin[1], f.origin[2] - old.origin[2]];
    // Moved by itself in this change: it is where it was put.
    if (Math.hypot(...d) > STILL) {
      if (own && f.model === old.model && f.width === old.width && f.depth === old.depth && (f.rotation ?? 0) === (old.rotation ?? 0)) went.set(f.id, d);
      continue;
    }
    const by = moves.get(cabinetOfAppliance(before, old)?.id ?? "");
    if (by) going.set(f.id, by);
  }
  if (!going.size && !went.size) return next;
  // Its cut: named for it, under it.
  const cuts = new Map<string, Vec3>();
  for (const [id, d] of [...going, ...went]) {
    const a = was.get(id)!;
    const [lo, hi] = applianceBox(a);
    for (const f of next.features) {
      if (f.type !== "machining" || f.name !== `Découpe ${a.name}` || cuts.has(f.id)) continue;
      if (f.ops.every((op) => { const p = opAt(op); return p[0] >= lo[0] - AROUND && p[0] <= hi[0] + AROUND && p[1] >= lo[1] - AROUND && p[1] <= hi[1] + AROUND; })) cuts.set(f.id, d);
    }
  }
  const features = next.features.map((f) => {
    if (f.type === "appliance" && going.has(f.id)) return { ...f, origin: shifted(f.origin, going.get(f.id)!) };
    if (f.type !== "machining" || !cuts.has(f.id)) return f;
    // Along the worktop only: the worktop does not rise with its cabinet.
    const [dx, dy] = cuts.get(f.id)!;
    const d: Vec3 = [dx, dy, 0];
    return { ...f, ops: f.ops.map((op): MachiningOp => (op.kind === "hole" ? { ...op, at: shifted(op.at, d) } : { ...op, from: shifted(op.from, d), to: shifted(op.to, d) })) } satisfies MachiningFeature;
  });
  return { ...next, features };
}
