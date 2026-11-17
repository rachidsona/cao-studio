/**
 * « Dupliquer » un meuble de cuisine dans la 3D. Un meuble d'un linéaire du Plan de cuisine : le même est ajouté juste
 * après lui sur son linéaire, s'il y tient, et la cuisine est refaite ; un caisson posé à part (Meubles de cuisine,
 * Caisson) : sa copie, avec ses façades et ses matières, à côté de lui, à sa droite. Une seule annulation. Pur.
 */
import { leavesRoom, roomKeepOuts } from "./cabinet-clear";
import { cabinetAxes, cabinetBox, slideCabinet } from "./kitchen-catalog";
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { kitchenFromPlan } from "./kitchen-plan-build";
import { planItemOf, runCabinets } from "./kitchen-plan-add";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { findFeature, uniqueId, uniqueName } from "./operations";
import { featureOfBody, type CabinetFeature, type CadDocument, type FrontsFeature, type Vec3 } from "./types";
import { insertItem, itemEntry, newItem, rowOf, widestRoom } from "../features/kitchen-run-items";

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;

/** The document with this cabinet duplicated, the copy's cabinet, and what to say; a string: why it cannot be. */
export function withCabinetDuplicated(doc: CadDocument, cabinetId: string): { doc: CadDocument; cabinet: string | null; note: string } | string {
  const c = findFeature(doc, cabinetId);
  if (c?.type !== "cabinet") return "Sélectionnez d'abord un caisson à dupliquer.";
  const owner = planItemOf(doc, cabinetId);
  const plan = owner && kitchenPlanIn(doc, owner.plan);
  if (owner && plan) {
    const items = plan.runs?.[owner.run] ?? [];
    const item = items.find((i) => i.id === owner.item);
    if (!item) return "Ce meuble n'est plus retrouvé dans son linéaire.";
    const { furnished: _held, ...same } = item;
    const copy = { ...same, id: newItem(items, item.model, item.width).id };
    const next = { ...plan, runs: { ...plan.runs, [owner.run]: insertItem(items, copy, item.id) } };
    // No room for one more on its run (it would not stand, or push out one that does): said, with the room left.
    const before = kitchenFromPlan(plan, kitchenRoomInfo(doc, plan)).fills[owner.run];
    const stood = new Set(before?.missing.map((m) => m.id));
    const fill = kitchenFromPlan(next, kitchenRoomInfo(doc, next)).fills[owner.run];
    if (before && fill?.missing.some((m) => !stood.has(m.id))) {
      const row = rowOf(itemEntry(item));
      const room = widestRoom(before, row);
      return `Pas de place pour un autre « ${itemEntry(item).name} » de ${cm(item.width)} sur ce linéaire : ${room >= 1 ? `il reste ${cm(Math.floor(room))} au plus` : `${row === "wall" ? "le haut" : "le bas"} est plein`}.`;
    }
    const built = withKitchenBuilt(doc, owner.plan, { runs: next.runs });
    if (typeof built === "string") return built;
    return { doc: built.doc, cabinet: runCabinets(built.doc, owner.plan, owner.run).find((x) => x.item === copy.id)?.cabinet ?? null, note: `« ${itemEntry(item).name} » dupliqué sur son linéaire, juste après lui.` };
  }
  // On its own: its copy right beside it (its right first), the cabinets in the way on that side pushed along by its
  // width; when they cannot be (a wall, a cabinet of a kitchen plan), the nearest free place — never in another
  // cabinet, nor in a wall, nor out of its room. Its fronts and its materials go with it.
  const pushed = pushBeside(doc, c, 1) ?? pushBeside(doc, c, -1);
  const shift = pushed?.shift ?? freeBeside(doc, c);
  if (shift === null) return `Pas de place à côté de « ${c.name} » pour sa copie : des meubles ou des murs l'entourent des deux côtés. Faites-lui de la place, ou copiez-le puis déplacez la copie.`;
  const id = uniqueId(doc, "cb");
  const copy: CabinetFeature = { ...structuredClone(c), id, name: uniqueName(doc, c.name), origin: [c.origin[0] + shift[0], c.origin[1] + shift[1], c.origin[2]] as Vec3 };
  const moved = new Map(pushed?.moves.map((m) => [m.id, m]) ?? []);
  let next: CadDocument = { ...doc, features: [...doc.features.map((f) => moved.get(f.id) ?? f), copy] };
  const renamed = new Map([[c.id, id]]);
  for (const f of doc.features.filter((x): x is FrontsFeature => x.type === "fronts" && x.cabinet === c.id)) {
    const fid = uniqueId(next, f.id.replace(/\d+$/, "") || "fr");
    renamed.set(f.id, fid);
    next = { ...next, features: [...next.features, { ...structuredClone(f), id: fid, name: uniqueName(next, f.name), cabinet: id }] };
  }
  // What is known of its pieces (material, grain, bands, look) goes with their copies.
  const carried = <T>(record: Record<string, T> | undefined) => Object.fromEntries(Object.entries(record ?? {}).flatMap(([key, value]) => {
    const to = renamed.get(featureOfBody(key));
    return to ? [[to + key.slice(featureOfBody(key).length), structuredClone(value)] as const] : [];
  }));
  next = { ...next, bodyInfo: { ...next.bodyInfo, ...carried(doc.bodyInfo) } };
  const right = shift[0] * cabinetAxes(c.rotation ?? 0).along[0] + shift[1] * cabinetAxes(c.rotation ?? 0).along[1] > 0;
  const beside = Math.abs(Math.hypot(shift[0], shift[1]) - c.width) < 1;
  const push = pushed?.moves.length ? ` ; ${pushed.moves.map((m) => `« ${m.name} »`).join(", ")} ${pushed.moves.length > 1 ? "poussés" : "poussé"} de ${cm(c.width)} pour lui faire la place` : "";
  return { doc: next, cabinet: id, note: `« ${c.name} » dupliqué : sa copie est ${beside ? "" : "plus loin, "}à sa ${right ? "droite" : "gauche"}${beside ? "" : ", à la première place libre"}${push}.` };
}

/**
 * The copy right beside the cabinet on one side (1: along its width, its right; −1: its left), and the cabinets in its
 * lane on that side pushed along, each as far as needed and no further (a gap between two absorbs the push). Null when a
 * pushed cabinet would go into a wall or out of its room, or when one of a kitchen plan is in the way (its run owns it).
 */
function pushBeside(doc: CadDocument, c: CabinetFeature, side: 1 | -1): { shift: Vec3; moves: CabinetFeature[] } | null {
  const { along } = cabinetAxes(c.rotation ?? 0);
  const axis = Math.abs(along[0]) > 0.5 ? 0 : 1;
  const dir = (along[axis]! > 0 ? 1 : -1) * side;
  const box = cabinetBox(c);
  const lane = (o: [Vec3, Vec3]) => [0, 1, 2].filter((i) => i !== axis).every((i) => box[0][i]! < o[1][i]! - 1 && box[1][i]! > o[0][i]! + 1);
  // Along the push: where each cabinet in the lane on that side starts and ends, nearest first.
  const ahead = (b: [Vec3, Vec3]) => (dir > 0 ? b[0][axis]! >= box[1][axis]! - 1 : b[1][axis]! <= box[0][axis]! + 1);
  const cabinets = doc.features.filter((f): f is CabinetFeature => f.type === "cabinet" && !f.suppressed && !f.hidden && f.id !== c.id);
  const inLane = cabinets.filter((o) => lane(cabinetBox(o)) && ahead(cabinetBox(o))).sort((a, b) => dir * (cabinetBox(a)[0][axis]! - cabinetBox(b)[0][axis]!));
  let front = dir > 0 ? box[1][axis]! + c.width : box[0][axis]! - c.width;
  const moves: CabinetFeature[] = [];
  for (const o of inLane) {
    const [lo, hi] = cabinetBox(o);
    const near = dir > 0 ? lo[axis]! : hi[axis]!;
    const by = dir > 0 ? front - near : near - front;
    if (by <= 1) break;
    if (planItemOf(doc, o.id)) return null;
    const delta: Vec3 = [0, 0, 0];
    delta[axis] = dir * by;
    const slid = slideCabinet(o, delta);
    const was = cabinetBox(o);
    const now = cabinetBox(slid);
    if (roomKeepOuts(doc).some((k) => [0, 1, 2].every((i) => now[0][i]! < k[1][i]! - 1 && now[1][i]! > k[0][i]! + 1)) || leavesRoom(doc, was, now)) return null;
    moves.push(slid);
    front = dir > 0 ? now[1][axis]! : now[0][axis]!;
  }
  // The copy itself must stand in the room, out of the walls.
  const shift: Vec3 = [0, 0, 0];
  shift[axis] = dir * c.width;
  const copyBox: [Vec3, Vec3] = [box[0].map((v, i) => v + shift[i]!) as Vec3, box[1].map((v, i) => v + shift[i]!) as Vec3];
  if (roomKeepOuts(doc).some((k) => [0, 1, 2].every((i) => copyBox[0][i]! < k[1][i]! - 1 && copyBox[1][i]! > k[0][i]! + 1)) || leavesRoom(doc, box, copyBox)) return null;
  return { shift, moves };
}

/**
 * Where the copy of a cabinet goes, as a move along its width: the nearest place beside it that no cabinet and no wall
 * takes, and that keeps it in its room — its right first when both sides are as near; null when there is none.
 */
function freeBeside(doc: CadDocument, c: CabinetFeature): Vec3 | null {
  const { along } = cabinetAxes(c.rotation ?? 0);
  const axis = Math.abs(along[0]) > 0.5 ? 0 : 1;
  const box = cabinetBox(c);
  const others: [Vec3, Vec3][] = [
    ...doc.features.filter((f): f is CabinetFeature => f.type === "cabinet" && !f.suppressed && !f.hidden && f.id !== c.id).map(cabinetBox),
    ...roomKeepOuts(doc),
  ];
  const at = (d: number): [Vec3, Vec3] => [box[0].map((v, i) => (i === axis ? v + d : v)) as Vec3, box[1].map((v, i) => (i === axis ? v + d : v)) as Vec3];
  const into = (a: [Vec3, Vec3], b: [Vec3, Vec3]) => [0, 1, 2].every((i) => a[0][i]! < b[1][i]! - 1 && a[1][i]! > b[0][i]! + 1);
  // Beside the original, or flush against one of the others in its lane.
  const candidates = [c.width, -c.width, ...others.flatMap((o) => [o[1][axis]! - box[0][axis]!, o[0][axis]! - box[1][axis]!])].filter((d) => Math.abs(d) >= c.width - 1e-6);
  const free = (d: number) => !into(at(d), box) && !others.some((o) => into(at(d), o)) && !leavesRoom(doc, box, at(d));
  const sign = along[axis]! > 0 ? 1 : -1;
  const best = candidates.filter(free).sort((a, b) => Math.abs(a) - Math.abs(b) || (b * sign > 0 ? 1 : 0) - (a * sign > 0 ? 1 : 0))[0];
  if (best === undefined) return null;
  const out: Vec3 = [0, 0, 0];
  out[axis] = best;
  return out;
}
