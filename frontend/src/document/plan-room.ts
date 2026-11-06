/**
 * Le plan de dressing posé sur la Pièce relevée : un mur de la pièce devient le mur A, ses voisins les murs B et C. Les
 * longueurs et la hauteur en viennent, le plan se tourne et se déplace dessus, et ses portes, fenêtres et prises se
 * retrouvent sur le schéma, dans le repère du plan. Pur.
 */
import { PLAN_MODELS, type Point } from "./plan-shapes";
import type { CadDocument, DressingPlan, RoomFeature } from "./types";
import { WALL_NAMES, wallName } from "../features/room-plan";
import { freeStretches, roomRuns, type RunInfo, type RunWall } from "../features/room-runs";

export const planRooms = (doc: CadDocument): RoomFeature[] => doc.features.filter((f): f is RoomFeature => f.type === "room" && !f.suppressed);
export const roomOf = (doc: CadDocument, plan: DressingPlan): RoomFeature | undefined => planRooms(doc).find((r) => r.id === plan.room?.id);

/** Which of the room's neighbouring walls this model stands against. */
function layoutOf(plan: DressingPlan): "I" | "L" | "R" | "U" {
  const { fields } = PLAN_MODELS[plan.model];
  const [b, c] = [plan.model !== "T" && "lengthB" in fields, "lengthC" in fields];
  return b && c ? "U" : b ? "L" : c ? "R" : "I";
}

/** This plan on this wall of the room: its sizes and its place; a string: why it cannot be. */
export function linkedPlan(plan: DressingPlan, room: RoomFeature, wall: number): DressingPlan | string {
  if (plan.model === "back") return "Un dos à dos ne s'appuie sur aucun mur.";
  const runs = roomRuns(room, wall, layoutOf(plan));
  if (typeof runs === "string") return runs;
  const linked: DressingPlan = {
    ...plan, room: { id: room.id, wall }, place: runs.place, lengthA: runs.walls.A!.length, height: Math.min(plan.height, room.height),
    ...(runs.walls.B ? { lengthB: runs.walls.B.length } : {}), ...(runs.walls.C ? { lengthC: runs.walls.C.length } : {}),
  };
  return plan.avoid ? avoidingPlan(linked, room) : linked;
}

export function unlinkedPlan(plan: DressingPlan): DressingPlan {
  const { room: _room, place: _place, spans: _spans, low: _low, ...free } = plan;
  return free;
}

/** What is kept clear of a door or a window (mm). */
const CLEARANCE = 50;

/** This plan on what its walls leave free: the longest free stretch of wall A, the one at the corner on B and C, and the height under a low ceiling. */
export function avoidingPlan(plan: DressingPlan, room: RoomFeature): DressingPlan | string {
  const wall = plan.room?.wall;
  if (wall === undefined) return plan;
  const runs = roomRuns(room, wall, layoutOf(plan));
  if (typeof runs === "string") return runs;
  const spans: NonNullable<DressingPlan["spans"]> = {};
  const low: NonNullable<DressingPlan["low"]> = {};
  for (const [name, run] of Object.entries(runs.walls) as [RunWall, RunInfo][]) {
    const under = Math.floor(Math.min(run.ceiling(0), run.ceiling(plan.depth))) - 10;
    if (under < plan.height) low[name] = under;
    const start = name === "A" ? 0 : plan.depth;
    const stretches = freeStretches(run.spans, start, run.length, 0, Math.min(plan.height, low[name] ?? plan.height), CLEARANCE);
    const longest = [...stretches].sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
    const chosen = name === "A" ? longest : (stretches.find((s) => s[0] <= start + 1) ?? longest);
    if (!chosen) return `Le ${wallName(run.index)} n'a pas de place libre.`;
    spans[name] = chosen;
  }
  return { ...plan, spans, low };
}

export interface PlanObstacle {
  kind: "door" | "window" | "socket";
  what: string;
  /** Its two ends along its wall, in the plan. */
  from: Point;
  to: Point;
  bottom: number;
  top: number;
}

const SOCKET = 80;

/** The doors, windows and sockets of the walls this plan stands against. */
export function planObstacles(plan: DressingPlan, room: RoomFeature): PlanObstacle[] {
  const a = plan.room?.wall;
  if (a === undefined) return [];
  const count = room.walls.length;
  const layout = layoutOf(plan);
  const sides: [number, (x: number, length: number) => Point][] = [[a, (x) => [x, 0]]];
  if (layout === "L" || layout === "U") sides.push([(a - 1 + count) % count, (x, length) => [0, x - length]]);
  if (layout === "R" || layout === "U") sides.push([(a + 1) % count, (x) => [plan.lengthA, -x]]);
  return sides.flatMap(([wall, at]) => {
    const length = room.walls[wall]?.length ?? 0;
    const name = `du ${wallName(wall)}`;
    return room.obstacles.flatMap((o): PlanObstacle[] => {
      if (o.wall !== wall) return [];
      if (o.kind === "door") return [{ kind: "door", what: `la porte ${name}`, from: at(o.at, length), to: at(o.at + o.width, length), bottom: 0, top: o.height }];
      if (o.kind === "window") return [{ kind: "window", what: `la fenêtre ${name}`, from: at(o.at, length), to: at(o.at + o.width, length), bottom: o.sill, top: o.sill + o.height }];
      if (o.kind === "socket") return [{ kind: "socket", what: `la prise ${name}`, from: at(o.at - SOCKET / 2, length), to: at(o.at + SOCKET / 2, length), bottom: o.height, top: o.height }];
      return [];
    });
  });
}

/** Where the ceiling of the room is lower than this plan, along the walls it stands against. */
export function lowCeilings(plan: DressingPlan, room: RoomFeature): string[] {
  const a = plan.room?.wall;
  if (a === undefined) return [];
  const runs = roomRuns(room, a, layoutOf(plan));
  if (typeof runs === "string") return [];
  return (Object.entries(runs.walls) as [RunWall, RunInfo][]).flatMap(([name, run]) => {
    const low = Math.min(run.ceiling(0), run.ceiling(plan.depth));
    return low < Math.min(plan.height, plan.low?.[name] ?? plan.height) ? [`Plafond bas sur le mur ${WALL_NAMES[run.index] ?? run.index + 1} : ${Math.round(low / 10)} cm, pour ${Math.round(Math.min(plan.height, plan.low?.[name] ?? plan.height) / 10)} cm de dressing.`] : [];
  });
}
