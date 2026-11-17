/**
 * Le plan de cuisine posé sur la Pièce relevée, comme le Plan de dressing (plan-room.ts) : un mur de la pièce devient le
 * mur A, ses voisins les murs B et C ; les longueurs et la hauteur sous plafond en viennent, et le plan se tourne et se
 * déplace dessus ; un mur B ou C hors d'équerre (5° au plus) est pris, les meubles restant d'équerre au mur A. Ce que ses murs ont — portes, fenêtres, prises, retombées et rampants — se marque sur le schéma, et se lit
 * linéaire par linéaire pour laisser libres les portes et les fenêtres et ôter les meubles hauts sous un plafond bas. Pur.
 */
import type { KitchenRoomInfo } from "./kitchen-plan-build";
import { planObstacles, planRooms, type PlanObstacle } from "./plan-room";
import { SKEW_MAX } from "./kitchen-plan-shapes";
import { PLAN, type Point } from "./plan-shapes";
import type { CadDocument, DressingPlan, KitchenFloorPlan, RoomFeature } from "./types";
import { wallName } from "../features/room-plan";
import { roomRuns, type RunInfo } from "../features/room-runs";

/** Which of the room's walls it stands against: A, the one before it (B) and the one after it (C). */
function layoutOf(p: KitchenFloorPlan): "I" | "L" | "R" | "U" {
  if (p.model === "U") return "U";
  if (p.model === "L-left" || p.model === "G-left") return "L";
  return p.model === "L-right" || p.model === "G-right" ? "R" : "I";
}

export const kitchenRoomOf = (doc: CadDocument, p: KitchenFloorPlan): RoomFeature | undefined => planRooms(doc).find((r) => r.id === p.room?.id);

/** This plan on this wall of the room: its sizes and its place; a string: why it cannot be. */
export function linkedKitchen(p: KitchenFloorPlan, room: RoomFeature, wall: number): KitchenFloorPlan | string {
  const runs = roomRuns(room, wall, layoutOf(p), SKEW_MAX);
  if (typeof runs === "string") return runs;
  // Its side walls out of square: the units stay square to wall A (kitchen-plan-shapes.ts skewShift, skewNotes).
  const skew = Object.fromEntries((["B", "C"] as const).flatMap((w) => (runs.walls[w]?.skew ? [[w, runs.walls[w]!.skew!]] : [])));
  const { skew: _old, ...rest } = p;
  return {
    ...rest, room: { id: room.id, wall }, place: runs.place, lengthA: runs.walls.A!.length, height: room.height, ...(Object.keys(skew).length ? { skew } : {}),
    ...(runs.walls.B ? { lengthB: runs.walls.B.length } : {}), ...(runs.walls.C ? { lengthC: runs.walls.C.length } : {}),
  };
}

export function unlinkedKitchen(p: KitchenFloorPlan): KitchenFloorPlan {
  const { room: _room, place: _place, skew: _skew, ...free } = p;
  return free;
}

/** The walls of its room behind its runs, measured from their left as the runs are (wall B is measured from its corner). */
export function kitchenRoomInfo(doc: CadDocument, p: KitchenFloorPlan): KitchenRoomInfo | undefined {
  const room = kitchenRoomOf(doc, p);
  if (!room || p.room === undefined) return undefined;
  const runs = roomRuns(room, p.room.wall, layoutOf(p), SKEW_MAX);
  if (typeof runs === "string") return undefined;
  const info: KitchenRoomInfo = {};
  if (runs.walls.A) info.A = runs.walls.A;
  if (runs.walls.C) info.C = runs.walls.C;
  const b = runs.walls.B;
  if (b) info.B = { ...b, spans: b.spans.map((sp) => ({ ...sp, from: b.length - sp.to, to: b.length - sp.from })).sort((x, y) => x.from - y.from) } satisfies RunInfo;
  return info;
}

export interface KitchenMark extends Omit<PlanObstacle, "kind"> {
  kind: PlanObstacle["kind"] | "beam";
}

/** The doors, windows and sockets of its walls, and their drops and slopes as the line where the ceiling comes down. */
export function kitchenMarks(doc: CadDocument, p: KitchenFloorPlan): KitchenMark[] {
  const room = kitchenRoomOf(doc, p);
  const a = p.room?.wall;
  if (!room || a === undefined) return [];
  const layout = layoutOf(p);
  const model = ({ I: "I", L: "L-left", R: "L-right", U: "U" } as const)[layout];
  const proxy: DressingPlan = { ...PLAN, model, lengthA: p.lengthA, room: p.room };
  const count = room.walls.length;
  const sides: [number, (x: number, length: number) => Point][] = [[a, (x, into) => [x, -into]]];
  if (layout === "L" || layout === "U") sides.push([(a - 1 + count) % count, (into, x) => [into, x]]);
  if (layout === "R" || layout === "U") sides.push([(a + 1) % count, (into, x) => [p.lengthA - into, x]]);
  const drops = sides.flatMap(([wall, at], k): KitchenMark[] => {
    const length = room.walls[wall]?.length ?? 0;
    return room.obstacles.flatMap((o): KitchenMark[] => {
      if (o.wall !== wall || (o.kind !== "beam" && o.kind !== "slope")) return [];
      const what = `${o.kind === "beam" ? "la retombée" : "le rampant"} du ${wallName(wall)}`;
      const [bottom, top] = o.kind === "beam" ? [room.height - o.drop, room.height] : [o.knee, room.height];
      if (k === 0) return [{ kind: "beam", what, from: at(0, o.depth), to: at(length, o.depth), bottom, top }];
      return [{ kind: "beam", what, from: at(o.depth, 0), to: at(o.depth, -length), bottom, top }];
    });
  });
  return [...planObstacles(proxy, room), ...drops];
}
