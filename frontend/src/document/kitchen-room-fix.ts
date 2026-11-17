/**
 * Corriger une cuisine qui entre dans les murs (Contrôle avant fabrication) : son plan a ses cotes tapées à la main alors
 * que le projet a une Pièce relevée, et les deux ne se recouvrent pas. La cuisine suit la pièce : son plan est posé sur le
 * mur de la pièce qui la déplace le moins (le même choix que « Mur A dans la pièce » du Plan de cuisine), ses longueurs et
 * sa hauteur sous plafond en viennent, et elle est refaite — les meubles posés gardent leur ordre, ce qui ne tient plus
 * est dit. Une seule annulation. Un plan neuf, lui, est posé d'office sur la pièce (planOnRoom). Pur.
 */
import { kitchenPlanIn, kitchenRunOf, withKitchenChanged } from "./kitchen-floor";
import { linkedKitchen, unlinkedKitchen } from "./kitchen-plan-room";
import { planRooms } from "./plan-room";
import { featureOfBody, type CadDocument, type KitchenFloorPlan, type RoomFeature } from "./types";
import { bodyOrigin } from "./operations";
import { wallName } from "../features/room-plan";

export interface KitchenRoomFix {
  /** The sketch « Plan de la cuisine ». */
  plan: string;
  room: RoomFeature;
  /** The room's wall that becomes the kitchen's wall A. */
  wall: number;
  /** What the button says. */
  label: string;
}

const HERE = { quarter: 0, origin: [0, 0] } as const;

/** The wall of the room that moves the kitchen least: same turn first, then the nearest corner. */
function nearestWall(plan: KitchenFloorPlan, room: RoomFeature): number | null {
  const now = plan.place ?? HERE;
  let best: { wall: number; cost: number } | null = null;
  room.walls.forEach((_, wall) => {
    const linked = linkedKitchen(plan, room, wall);
    if (typeof linked === "string") return;
    const place = linked.place ?? HERE;
    const cost = (place.quarter === now.quarter ? 0 : 1e9) + Math.hypot(place.origin[0] - now.origin[0], place.origin[1] - now.origin[1]);
    if (!best || cost < best.cost) best = { wall, cost };
  });
  return (best as { wall: number } | null)?.wall ?? null;
}

/**
 * The kitchens to put on the room: a plan with its sizes typed while the project has a room, one of whose pieces is in
 * `bodies` (the pieces that run into the room). None when every kitchen already follows its room.
 */
export function kitchenRoomFixes(doc: CadDocument, bodies: readonly string[]): KitchenRoomFix[] {
  const rooms = planRooms(doc);
  if (!rooms.length) return [];
  const plans = new Set<string>();
  for (const id of bodies) {
    const run = kitchenRunOf(doc, featureOfBody(bodyOrigin(doc, id)));
    if (run) plans.add(run.plan);
  }
  return [...plans].flatMap((planId): KitchenRoomFix[] => {
    const plan = kitchenPlanIn(doc, planId);
    if (!plan || plan.room) return [];
    for (const room of rooms) {
      const wall = nearestWall(plan, room);
      if (wall !== null) return [{ plan: planId, room, wall, label: `Poser la cuisine sur ${room.name} (mur A de la cuisine sur le ${wallName(wall)})` }];
    }
    return [];
  });
}

/** The document with the kitchen put on the room and made again; a string: why it cannot be. */
export function withKitchenOnRoom(doc: CadDocument, fix: KitchenRoomFix): { doc: CadDocument; problems: string[] } | string {
  const plan = kitchenPlanIn(doc, fix.plan);
  if (!plan) return "Ce plan de cuisine n'existe plus.";
  const linked = linkedKitchen(plan, fix.room, fix.wall);
  if (typeof linked === "string") return linked;
  return withKitchenChanged(doc, fix.plan, linked);
}

/**
 * A plan on the project's surveyed room, as a magnet: its wall A on the wall that moves it least, its sizes the walls'
 * — nothing of it can stand in them. Already on a wall of this project, it is measured again on it (another shape has
 * other walls). As it is, its sizes typed, without a room or when no wall takes this shape.
 */
export function planOnRoom(doc: CadDocument, plan: KitchenFloorPlan): KitchenFloorPlan {
  const rooms = planRooms(doc);
  const known = rooms.find((r) => r.id === plan.room?.id);
  const again = known ? linkedKitchen(plan, known, plan.room!.wall) : null;
  if (again && typeof again !== "string") return again;
  const free = unlinkedKitchen(plan);
  for (const room of rooms) {
    const wall = nearestWall(free, room);
    const linked = wall === null ? null : linkedKitchen(free, room, wall);
    if (linked && typeof linked !== "string") return linked;
  }
  return free;
}
