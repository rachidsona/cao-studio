/**
 * Ce dans quoi un caisson ne doit pas entrer, lu dans le document : les murs des Pièces relevées — et tout ce qui est
 * derrière eux : un caisson ne traverse pas un mur, il reste du côté d'où il vient — et les autres caissons. Sert aux
 * gestes de la vue (la poignée « ✥ », Coller, Déplacer) et aux cotes changées à la main (la barre du caisson, l'outil
 * Caisson) : un caisson agrandi contre un mur ou un voisin est décalé d'autant, au ras ; sans place, la cote est
 * refusée avec sa raison. Un mur hors d'équerre n'a pas de boîte d'axe à lui : ce qui était dans la pièce y reste, son
 * plancher vu de dessus (keepInRoom) — rien ne passe derrière un mur de biais non plus. Pur.
 */
import { cabinetBox } from "./kitchen-catalog";
import { planRooms } from "./plan-room";
import type { CabinetFeature, CadDocument, Vec3 } from "./types";
import { clearGrown } from "../features/box-clear";
import { wallFrames, wallName, type P2 } from "../features/room-plan";
import type { Box } from "../features/smart-align";

/** Behind a wall, as far as anything goes (mm). */
const DEEP = 1e6;

/** The walls square to the axes of every surveyed room, each with all that lies behind it, and their names. */
export function wallKeepOuts(doc: CadDocument): { box: Box; name: string }[] {
  return planRooms(doc).flatMap((room) =>
    wallFrames(room).flatMap((f, i) => {
      const square = [0, 1].find((k) => Math.abs(f.n[k]!) > 1 - 1e-6);
      if (square === undefined) return [];
      const axis = square as 0 | 1;
      const lo: Vec3 = [Math.min(...f.outline.map((p) => p[0])), Math.min(...f.outline.map((p) => p[1])), 0];
      const hi: Vec3 = [Math.max(...f.outline.map((p) => p[0])), Math.max(...f.outline.map((p) => p[1])), room.height];
      // Outwards (away from the room): as deep as it gets.
      if (f.n[axis] > 0) hi[axis] = hi[axis] + DEEP;
      else lo[axis] = lo[axis] - DEEP;
      return [{ box: [lo, hi] as Box, name: `le ${wallName(i)}` }];
    }),
  );
}

/** The floors of the surveyed rooms seen from above: the room side of their walls, corner after corner. */
const floors = (doc: CadDocument): P2[][] => planRooms(doc).map((room) => wallFrames(room).map((f) => f.start));

/** On the floor: inside it, or on one of its sides (within a quarter of a millimetre: the check counts half a one). */
function onFloor([x, y]: P2, floor: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = floor.length - 1; i < floor.length; j = i++) {
    const [a, b] = [floor[i]!, floor[j]!];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) <= 0.25) return true;
  }
  return inside;
}
const footprintOn = ([lo, hi]: Box, floor: readonly P2[]) => ([[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]] as P2[]).every((p) => onFloor(p, floor));
const shifted = ([lo, hi]: Box, by: Vec3, s = 1): Box => [lo.map((v, i) => v + by[i]! * s) as Vec3, hi.map((v, i) => v + by[i]! * s) as Vec3];

/**
 * A move of what stands in a room kept in it, walls out of square included: as asked when it ends in the room, else
 * cut short along its way where it reaches a wall, flush. What stands in no room is free.
 */
export function keepInRoom(doc: CadDocument, box: Box, move: Vec3): Vec3 {
  const rooms = floors(doc).filter((floor) => footprintOn(box, floor));
  if (!rooms.length || rooms.some((floor) => footprintOn(shifted(box, move), floor))) return move;
  let [ok, out] = [0, 1];
  for (let k = 0; k < 24; k++) {
    const s = (ok + out) / 2;
    if (rooms.some((floor) => footprintOn(shifted(box, move, s), floor))) ok = s;
    else out = s;
  }
  return move.map((v) => Math.trunc(v * ok)) as Vec3;
}

/** Whether a box stood in a room and no longer does. */
export const leavesRoom = (doc: CadDocument, before: Box, after: Box): boolean => {
  const rooms = floors(doc).filter((floor) => footprintOn(before, floor));
  return rooms.length > 0 && !rooms.some((floor) => footprintOn(after, floor));
};

/**
 * The bodies of the rooms' walls: not obstacles by their boxes (a wall out of square has a box much larger than itself,
 * it would stop a cabinet short of it) — their keep-outs and the floor do that, exactly.
 */
export function wallBody(doc: CadDocument): (bodyId: string) => boolean {
  const walls = new Set(planRooms(doc).flatMap((room) => room.walls.map((_, i) => `${room.id}#${i}`)));
  return (id) => walls.has(id);
}

/** The walls (and beyond) as boxes, for a move in the view (features/box-clear.ts). */
export const roomKeepOuts = (doc: CadDocument): Box[] => wallKeepOuts(doc).map((w) => w.box);

/**
 * A cabinet whose sizes changed by hand, kept out of the walls and of the other cabinets: as asked when it stands in
 * nothing new; slid along the floor by what it took, flush, when there is room; a string: why this size cannot be.
 */
export function cabinetKeptClear(doc: CadDocument, next: CabinetFeature): CabinetFeature | string {
  const before = doc.features.find((f): f is CabinetFeature => f.id === next.id && f.type === "cabinet");
  if (!before) return next;
  const walls = wallKeepOuts(doc);
  const cabinets = doc.features.filter((f): f is CabinetFeature => f.type === "cabinet" && f.id !== next.id && !f.suppressed && !f.hidden);
  const others = [...walls.map((w) => w.box), ...cabinets.map(cabinetBox)];
  const [was, now] = [cabinetBox(before), cabinetBox(next)];
  const shift = clearGrown(was, now, others, [0, 1]);
  if (shift && leavesRoom(doc, was, shifted(now, shift))) return `${next.name} : à cette cote, il sortirait de la pièce par un mur.`;
  if (shift) return shift.some((v) => v !== 0) ? { ...next, origin: next.origin.map((v, i) => v + shift[i]!) as Vec3 } : next;
  const overlaps = (o: Box) => [0, 1, 2].every((i) => now[0][i]! < o[1][i]! - 1 && now[1][i]! > o[0][i]! + 1);
  const into = walls.find((w) => overlaps(w.box))?.name ?? `« ${cabinets.find((c) => overlaps(cabinetBox(c)))?.name ?? "un meuble voisin"} »`;
  return `${next.name} : à cette cote, il entrerait dans ${into}, et il n'y a pas la place de le décaler.`;
}
