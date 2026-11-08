/**
 * Un plan de cuisine (kitchen-plan-shapes.ts) et ses linéaires remplis (features/kitchen-run-items.ts) traduits en une
 * implantation, comme celle de l'outil Implantation (features/kitchen-layout.ts) que document/kitchen-plan.ts sait bâtir :
 * caissons tournés selon leur mur, façades, électroménager (évier et plaque découpant le plan, lave-vaisselle et sa façade,
 * fours, hotte et son conduit, micro-ondes), fileurs, angle mort fermé par deux fileurs ou meuble d'angle sur le mur qui
 * passe, plan de travail continu sur chaque zone, crédence, plinthes, murs. Chaque pièce sait de quel linéaire elle vient
 * (`run`). Le triangle d'activité et le reste de l'ergonomie suivent (features/kitchen-appliances.ts). Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { FRONT, kitchenRuns, kitchenSizes, runAt, runGeometry, zoneSpan, CORNER_DOOR, type KitchenRun } from "./kitchen-plan-shapes";
import type { KitchenFloorPlan, Vec3 } from "./types";
import { ergonomics } from "../features/kitchen-appliances";
import { originOf, type KitchenBox, type KitchenLayout, type KitchenUnit } from "../features/kitchen-layout";
import { applianceOf, fillRun, type Placed, type RunFill } from "../features/kitchen-run-items";
import type { RunInfo } from "../features/room-runs";

/** The room's walls behind the runs, by run (spans along them from their left). */
export type KitchenRoomInfo = Partial<Record<string, RunInfo>>;

const WALL_THICKNESS = 100;
const PLINTH = 150;
const OVEN = 595;

/** The layout of the plan, each piece with its run, and how each run was filled. */
export function kitchenFromPlan(p: KitchenFloorPlan, room?: KitchenRoomInfo): KitchenLayout & { fills: Record<string, RunFill> } {
  const s = kitchenSizes(p);
  const out: KitchenLayout & { fills: Record<string, RunFill> } = { units: [], boxes: [], notes: [], ergonomics: { ok: [], warn: [] }, fills: {} };
  const places: Parameters<typeof ergonomics>[0] = {};
  const checks: Parameters<typeof ergonomics>[1] = p.island ? { islandPassage: p.passage } : {};
  for (const run of kitchenRuns(p)) {
    const info = room?.[run.id];
    const g = runGeometry(p, run, info);
    const fill = fillRun(g, p.runs?.[run.id] ?? [], { worktop: p.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop });
    out.fills[run.id] = fill;
    const D = s.cabinet;
    const ceiling = Math.min(p.height, info?.ceiling(0) ?? p.height);
    /** A box between `u0` and `u1` along the run, `a` to `b` off its units' backs, `z0` to `z1` (plan frame). */
    const band = (u0: number, u1: number, a: number, b: number, z0: number, z1: number): [Vec3, Vec3] => {
      const [[x0, y0], [x1, y1]] = [runAt(run, u0, run.back + a), runAt(run, u1, run.back + b)];
      return [[Math.min(x0, x1), Math.min(y0, y1), z0], [Math.max(x0, x1), Math.max(y0, y1), z1]];
    };
    const back: [number, number] = [-run.zone.run.normal[0], -run.zone.run.normal[1]];
    const rotation = ([0, 90, 180, 270] as const).find((r) => cabinetAxes(r).back.every((c, i) => Math.abs(c - back[i]!) < 1e-9)) ?? 0;
    const box = (name: string, kind: KitchenBox["kind"], [from, to]: [Vec3, Vec3], extra: Partial<KitchenBox> = {}) => out.boxes.push({ name, from, to, kind, run: run.id, ...extra });
    const cabinet = (name: string, u: number, w: number, depth: number, z: number, height: number, rest: Pick<KitchenUnit, "plinth" | "shelves" | "layout"> & Partial<KitchenUnit>) => {
      const [lo, hi] = band(u, u + w, 0, depth, z, z + height);
      out.units.push({ name, origin: originOf(rotation, lo, hi), rotation, width: w, height, depth, run: run.id, ...rest });
    };
    if (g.low) out.notes.push(`Pas de meubles hauts sur ${run.label.toLowerCase()} : le plafond y descend à ${Math.round(ceiling)} mm.`);
    let n = 0;
    const holes: { appliance: string; at: Vec3 }[] = [];
    const hole = (pl: Placed, appliance: string) => {
      const [x, y] = runAt(run, pl.at + pl.item.width / 2, run.back + p.depth / 2);
      holes.push({ appliance, at: [x, y, p.worktopHeight] });
    };
    const front = (pl: Placed): [number, number] => runAt(run, pl.at + pl.item.width / 2, run.back + D + FRONT);
    for (const pl of fill.placed) {
      const { entry, at } = pl;
      const w = pl.item.width;
      const role = applianceOf(pl.item)?.role;
      const name = `${entry.name}${entry.custom ? "" : ` ${w}`} (${run.id}${++n})`;
      const look = { shelves: entry.shelves, layout: entry.layout, ...(entry.drawers ? { drawers: entry.drawers } : {}), ...(entry.top === "rails" ? { top: "rails" as const } : {}) };
      const plinth = entry.plinth ?? PLINTH;
      if (pl.row === "wall") {
        const height = entry.height ?? s.wallTop - s.wallBottom;
        const z = s.wallTop - height;
        const depth = entry.custom && entry.depth ? entry.depth : p.wallDepth;
        if (role === "hood") {
          const mid = at + w / 2;
          box("Hotte", "appliance", band(at, at + w, 0, 500, p.worktopHeight + 650, p.worktopHeight + 750));
          box("Conduit de hotte", "appliance", band(mid - 125, mid + 125, 50, 300, p.worktopHeight + 750, ceiling));
          continue;
        }
        cabinet(name, at, w, depth, z, height, { plinth: 0, ...look });
        if (role === "microwave") box("Micro-ondes", "appliance", band(at + 20, at + w - 20, Math.max(0, depth - 330), depth, z + 160, z + 550));
        continue;
      }
      if (entry.kind === "tall") {
        cabinet(name, at, w, D, 0, s.wallTop, { plinth, ...look });
        if (role === "fridge") places.fridge ??= front(pl);
        if (role === "oven-column") {
          box("Four (colonne)", "appliance", band(at + 20, at + w - 20, D + FRONT - 560, D + FRONT, 900, 900 + OVEN));
          box("Porte basse colonne four", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, plinth, 897));
          box("Porte haute colonne four", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, 903 + OVEN, s.wallTop - 1.5));
        }
        continue;
      }
      if (role === "dishwasher") {
        box("Lave-vaisselle", "appliance", band(at + 2, at + w - 2, 20, D, plinth, s.base - 5));
        box("Façade lave-vaisselle", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, plinth, s.base - 3));
        continue;
      }
      const depth = entry.custom && entry.depth ? entry.depth : D;
      cabinet(name, at, w, depth, 0, s.base, { plinth, ...look });
      if (role === "sink") {
        hole(pl, w >= 800 ? "sink-1" : "sink-under");
        places.sink ??= front(pl);
      }
      if (role === "hob" || role === "hob-oven") {
        const mid = at + w / 2;
        const half = Math.min(290, w / 2 - 10);
        hole(pl, w >= 900 ? "hob-90" : w >= 800 ? "hob-80" : "hob-60");
        box("Plaque de cuisson", "appliance", band(mid - half, mid + half, p.depth / 2 - 255, p.depth / 2 + 255, p.worktopHeight, p.worktopHeight + 5));
        places.hob ??= front(pl);
      }
      if (role === "oven" || role === "hob-oven") {
        const top = s.base - 20;
        box("Four", "appliance", band(at + 20, at + w - 20, D + FRONT - 560, D + FRONT, top - OVEN, top));
        box("Bandeau sous four", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, plinth, top - OVEN - 2));
      }
    }
    fill.fillers.forEach(([a, b], i) => box(`Fileur ${run.id}${i ? i + 1 : ""}`, "filler", band(a, b, D, D + FRONT, PLINTH, s.base)));
    corners(p, run, band, box, cabinet);
    worktop(p, run, holes, box);
    if (run.wall) splashback(p, run, g.spans, ceiling >= s.wallTop && !g.low ? s.wallBottom : p.worktopHeight + 600, band, box);
    fill.stretches.forEach(([a, b], i) => {
      const used = fill.placed.some((pl) => pl.row === "base" && pl.at >= a - 1e-6 && pl.at < b);
      if (used) box(`Plinthe ${run.id}${i ? i + 1 : ""}`, "kick", band(a, b, D + FRONT - 16, D + FRONT, 0, PLINTH - 3));
    });
    if (run.wall && !room) box(`Mur ${run.id}`, "wall", band(run.id === "A" && run.left !== "free" ? -WALL_THICKNESS : 0, run.length + (run.id === "A" && run.right !== "free" ? WALL_THICKNESS : 0), -WALL_THICKNESS, 0, 0, p.height));
  }
  const base = Object.values(out.fills).flatMap((f) => f.placed.filter((pl) => pl.row === "base"));
  const role = (pl: Placed) => applianceOf(pl.item)?.role;
  if (base.some((pl) => role(pl) === "dishwasher")) checks.dishwasherBySink = !Object.values(out.fills).some((f) => f.problems.includes("Le lave-vaisselle n'est pas à côté de l'évier."));
  out.ergonomics = ergonomics(places, checks);
  return out;
}

type Band = (u0: number, u1: number, a: number, b: number, z0: number, z1: number) => [Vec3, Vec3];
type BoxOf = (name: string, kind: KitchenBox["kind"], at: [Vec3, Vec3], extra?: Partial<KitchenBox>) => void;

/** The corners of a run: on the run that passes, a filler or a corner unit; on the one that stops, a filler. */
function corners(p: KitchenFloorPlan, run: KitchenRun, band: Band, box: BoxOf, cabinet: (name: string, u: number, w: number, depth: number, z: number, height: number, rest: Pick<KitchenUnit, "plinth" | "shelves" | "layout">) => void): void {
  const s = kitchenSizes(p);
  const [D, c, L] = [s.cabinet, s.corner, run.length];
  for (const side of ["left", "right"] as const) {
    const end = run[side];
    if (end === "free") continue;
    /** From the corner's wall into the run, mirrored at its right end. */
    const span = (a: number, b: number): [number, number] => (side === "left" ? [a, b] : [L - b, L - a]);
    const tag = side === "right" ? " (droite)" : "";
    if (end === "pass" && p.corner === "unit") {
      const [u0, u1] = span(0, c + CORNER_DOOR);
      cabinet(`Meuble d'angle ${run.id}${tag}`, u0, u1 - u0, D, 0, s.base, { plinth: PLINTH, shelves: 1, layout: "none" });
      box(`Panneau d'angle ${run.id}${tag}`, "panel", band(...span(0, c), D, D + FRONT, PLINTH, s.base));
      box(`Porte d'angle ${run.id}${tag}`, "panel", band(...span(c + 1.5, c + CORNER_DOOR - 1.5), D, D + FRONT, PLINTH + 1.5, s.base - 1.5));
    } else box(`Fileur d'angle ${run.id}${tag}`, "filler", band(...span(end === "pass" ? D : D + FRONT, c), D, D + FRONT, PLINTH, s.base));
  }
}

/** One worktop over the zone of the run, with the cut-outs of its sink and hob. */
function worktop(p: KitchenFloorPlan, run: KitchenRun, holes: { appliance: string; at: Vec3 }[], box: BoxOf): void {
  const xs = run.zone.outline.map((q) => q[0]);
  const ys = run.zone.outline.map((q) => q[1]);
  const base = kitchenSizes(p).base;
  const [nx, ny] = run.zone.run.normal;
  box(`Plan de travail ${run.id}`, "worktop", [[Math.min(...xs), Math.min(...ys), base], [Math.max(...xs), Math.max(...ys), p.worktopHeight]], { holes, front: [nx, ny, 0] });
}

/** Up to the wall units (or 60 cm), and only up to the sill under a window: one piece per height. */
function splashback(p: KitchenFloorPlan, run: KitchenRun, spans: RunInfo["spans"], full: number, band: Band, box: BoxOf): void {
  const [from, to] = zoneSpan(run);
  const top = p.worktopHeight;
  const windows = spans.filter((sp) => sp.bottom > 0 && sp.from < to && sp.to > from);
  const doors = spans.filter((sp) => sp.bottom <= 0 && sp.from < to && sp.to > from);
  const cuts = [...new Set([from, to, ...[...windows, ...doors].flatMap((sp) => [sp.from, sp.to]).filter((x) => x > from && x < to)])].sort((a, b) => a - b);
  let n = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i]!, cuts[i + 1]!];
    if (doors.some((d) => d.from < b && d.to > a)) continue;
    const z1 = Math.min(full, ...windows.filter((sp) => sp.from < b && sp.to > a).map((sp) => sp.bottom));
    if (z1 - top >= 20) box(`Crédence ${run.id}${n++ ? `-${n}` : ""}`, "splashback", band(a, b, 0, 10, top, z1));
  }
}
