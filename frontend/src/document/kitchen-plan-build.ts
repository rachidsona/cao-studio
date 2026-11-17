/**
 * Un plan de cuisine (kitchen-plan-shapes.ts) et ses linéaires remplis (features/kitchen-run-items.ts) traduits en une
 * implantation, comme celle de l'outil Implantation (features/kitchen-layout.ts) que document/kitchen-plan.ts sait bâtir :
 * caissons tournés selon leur mur, façades, électroménager (évier et plaque découpant le plan, lave-vaisselle et sa façade,
 * fours, hotte et son conduit, micro-ondes), fileurs, angle mort fermé par deux fileurs ou meuble d'angle sur le mur qui
 * passe, plan de travail et crédence au-dessus des meubles seulement (pas sur la place libre), plinthes, murs. Chaque pièce sait de quel linéaire elle vient
 * (`run`). Le triangle d'activité et le reste de l'ergonomie suivent (features/kitchen-appliances.ts). Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { cornerSide, wallCornerSide } from "./kitchen-corners";
import { FRONT, jointOf, kitchenRuns, kitchenSizes, runAt, runGeometry, skewNotes, wallCorner, zoneSpan, type KitchenRun } from "./kitchen-plan-shapes";
import type { KitchenFloorPlan, Vec3 } from "./types";
import { ergonomics } from "../features/kitchen-appliances";
import { originOf, type KitchenBox, type KitchenLayout, type KitchenUnit } from "../features/kitchen-layout";
import { applianceOf, fillRun, isFiller, itemSize, type Placed, type RunFill } from "../features/kitchen-run-items";
import type { RunInfo } from "../features/room-runs";
import { WALL_THICKNESS } from "./joinery-defaults";

/** The room's walls behind the runs, by run (spans along them from their left). */
export type KitchenRoomInfo = Partial<Record<string, RunInfo>>;

const OVEN = 595;

/**
 * The layout of the plan, each piece with its run, and how each run was filled; `kept`: the room kept free, each as the
 * unit it has room for (nothing made: where a caisson furnished by hand goes).
 */
export function kitchenFromPlan(p: KitchenFloorPlan, room?: KitchenRoomInfo): KitchenLayout & { fills: Record<string, RunFill>; kept: KitchenUnit[] } {
  const s = kitchenSizes(p);
  const out: KitchenLayout & { fills: Record<string, RunFill>; kept: KitchenUnit[] } = { units: [], boxes: [], notes: skewNotes(p), ergonomics: { ok: [], warn: [] }, fills: {}, kept: [] };
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
    // An appliance of the library in its box, turned as the run's cabinets.
    const put = (name: string, model: string, at: [Vec3, Vec3], finish = "inox") => box(name, "appliance", at, { appliance: { model, finish, rotation } });
    const cabinet = (name: string, u: number, w: number, depth: number, z: number, height: number, rest: Pick<KitchenUnit, "plinth" | "shelves" | "layout"> & Partial<KitchenUnit>) => {
      const [lo, hi] = band(u, u + w, 0, depth, z, z + height);
      out.units.push({ name, origin: originOf(rotation, lo, hi), rotation, width: w, height, depth, run: run.id, ...rest });
    };
    for (const pl of fill.spaces) {
      const { height, depth, z } = itemSize(p, pl.item, pl.entry);
      const [lo, hi] = band(pl.at, pl.at + pl.item.width, 0, depth, z, z + height);
      out.kept.push({ name: pl.entry.name, origin: originOf(rotation, lo, hi), rotation, width: pl.item.width, height, depth, run: run.id, item: pl.item.id, plinth: 0, shelves: 0, layout: "none" });
    }
    if (g.low) out.notes.push(`Pas de meubles hauts sur ${run.label.toLowerCase()} : le plafond y descend à ${Math.round(ceiling)} mm.`);
    let n = 0;
    let fillers = 0;
    const holes: (NonNullable<KitchenBox["holes"]>[number] & { u: number })[] = [];
    const hole = (pl: Placed, appliance: string, soft = false) => {
      const u = pl.at + pl.item.width / 2;
      const [x, y] = runAt(run, u, run.back + p.depth / 2);
      holes.push({ appliance, at: [x, y, p.worktopHeight], u, ...(soft ? { soft } : {}) });
    };
    const front = (pl: Placed): [number, number] => runAt(run, pl.at + pl.item.width / 2, run.back + D + FRONT);
    for (const pl of fill.placed) {
      const { entry, at } = pl;
      const w = pl.item.width;
      // A filler put by hand: a panel in front, low between plinth and worktop, or in the wall row.
      if (isFiller(pl.item)) {
        const wall = pl.row === "wall";
        box(`Fileur posé ${wall ? "haut " : ""}${run.id}${++fillers}`, "filler", wall ? band(at, at + w, p.wallDepth, p.wallDepth + FRONT, s.wallBottom, s.wallTop) : band(at, at + w, D, D + FRONT, s.plinth, s.base));
        continue;
      }
      const role = applianceOf(pl.item)?.role;
      const name = `${entry.name}${entry.custom ? "" : ` ${w}`} (${run.id}${++n})`;
      const look = { item: pl.item.id, shelves: entry.shelves, layout: entry.layout, ...(pl.item.side ? { side: pl.item.side } : {}), ...(pl.item.grip ? { grip: pl.item.grip } : {}), ...(pl.item.facade ? { facade: pl.item.facade } : {}), ...(entry.drawers ? { drawers: entry.drawers } : {}), ...(entry.top === "rails" ? { top: "rails" as const } : {}) };
      const plinth = entry.plinth ?? s.plinth;
      if (pl.row === "wall") {
        const { height, z, depth } = itemSize(p, pl.item, entry);
        if (role === "hood") {
          // A chimney hood up to the ceiling, 65 cm over the worktop.
          put("Hotte", "hood-chimney", band(at + 1, at + w - 1, 0, 500, p.worktopHeight + 650, Math.max(p.worktopHeight + 900, ceiling)));
          continue;
        }
        cabinet(name, at, w, depth, z, height, { plinth: 0, ...look });
        if (role === "microwave") put("Micro-ondes", "microwave-builtin", band(at + (w - 595) / 2, at + (w + 595) / 2, Math.max(0, depth - 400), depth, z + 160, z + 550));
        continue;
      }
      if (entry.kind === "tall") {
        const size = itemSize(p, pl.item, entry);
        cabinet(name, at, w, size.depth, 0, size.height, { plinth, ...look });
        if (role === "fridge") {
          places.fridge ??= front(pl);
          // The built-in fridge in its column, behind the column's door.
          const fh = size.height - plinth - 36 >= 1770 ? 1770 : 1220;
          put("Réfrigérateur", "fridge-builtin", band(at + (w - 540) / 2, at + (w + 540) / 2, Math.max(0, size.depth - 545), size.depth, plinth + 18, plinth + 18 + fh), "white");
        }
        if (role === "oven-column") {
          put("Four (colonne)", "oven-pyro", band(at + (w - 595) / 2, at + (w + 595) / 2, D - 548, D, 900, 900 + OVEN));
          box("Porte basse colonne four", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, plinth, 897));
          box("Porte haute colonne four", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, 903 + OVEN, s.wallTop - 1.5));
        }
        continue;
      }
      if (role === "dishwasher") {
        const dw = w >= 598 ? 598 : 448;
        put("Lave-vaisselle", "dishwasher-builtin", band(at + (w - dw) / 2, at + (w + dw) / 2, D - 550, D, s.base - 5 - 815, s.base - 5));
        box("Façade lave-vaisselle", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, plinth, s.base - 3));
        continue;
      }
      cabinet(name, at, w, itemSize(p, pl.item, entry).depth, 0, s.base, { plinth, ...look });
      // A sink base of the catalogue, or one's own on two rails: the worktop is cut over it too, for the sink to come.
      if (!role && entry.top === "rails") hole(pl, w >= 800 ? "sink-1" : "sink-under", true);
      if (role === "sink") {
        hole(pl, w >= 800 ? "sink-1" : "sink-under");
        places.sink ??= front(pl);
        // The sink over its cut, its tap behind.
        const mid = at + w / 2;
        const [sw, model] = w >= 800 ? [860, "sink-steel"] : [580, "sink-granite"];
        put("Évier", model, band(mid - sw / 2, mid + sw / 2, p.depth / 2 - 250, p.depth / 2 + 250, p.worktopHeight - (model === "sink-steel" ? 178.5 : 190), p.worktopHeight + (model === "sink-steel" ? 1.5 : 10)), model === "sink-steel" ? "inox" : "black");
        put("Robinet", "tap-gooseneck", band(mid - (w >= 800 ? sw * 0.21 : 0) - 30, mid - (w >= 800 ? sw * 0.21 : 0) + 30, 25, 255, p.worktopHeight, p.worktopHeight + 360), "chrome");
      }
      if (role === "hob" || role === "hob-oven") {
        const mid = at + w / 2;
        hole(pl, w >= 900 ? "hob-90" : w >= 800 ? "hob-80" : "hob-60");
        const hw = w >= 900 ? 900 : w >= 800 ? 780 : 590;
        put("Plaque de cuisson", "hob-induction", band(mid - hw / 2, mid + hw / 2, p.depth / 2 - 260, p.depth / 2 + 260, p.worktopHeight - 49, p.worktopHeight + 6), "black");
        places.hob ??= front(pl);
      }
      if (role === "oven" || role === "hob-oven") {
        const top = s.base - 20;
        put("Four", "oven-pyro", band(at + (w - 595) / 2, at + (w + 595) / 2, D - 548, D, top - OVEN, top));
        box("Bandeau sous four", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, plinth, top - OVEN - 2));
      }
    }
    fill.fillers.forEach(([a, b], i) => box(`Fileur ${run.id}${i ? i + 1 : ""}`, "filler", band(a, b, D, D + FRONT, s.plinth, s.base)));
    corners(p, run, fill.walls, g.wall !== null, band, box, cabinet);
    const covered = worktopSpans(run, fill);
    // Taken away on the run's strip: no worktop (the splashback stays on the wall).
    if (!p.noWorktop?.[run.id]) worktops(p, run, covered, holes, band, box);
    if (run.wall && p.splashback !== false) for (const [i, part] of covered.entries()) splashback(p, run, part, i, g.spans, ceiling >= s.wallTop && !g.low ? s.wallBottom : p.worktopHeight + 600, band, box);
    // Under the units and fillers only: the room left open has none.
    let kicks = 0;
    for (const [a, b] of fill.stretches.flatMap((st) => without(st, fill.free))) {
      const used = fill.placed.some((pl) => pl.row === "base" && pl.at >= a - 1e-6 && pl.at < b);
      if (used && p.kick !== false) box(`Plinthe ${run.id}${kicks++ ? kicks : ""}`, "kick", band(a, b, D + FRONT - 16, D + FRONT, 0, s.plinth - 3));
    }
    if (run.wall && !room) box(`Mur ${run.id}`, "wall", band(run.id === "A" && run.left !== "free" ? -WALL_THICKNESS : 0, run.length + (run.id === "A" && run.right !== "free" ? WALL_THICKNESS : 0), -WALL_THICKNESS, 0, 0, p.height));
  }
  const base = Object.values(out.fills).flatMap((f) => f.placed.filter((pl) => pl.row === "base"));
  const role = (pl: Placed) => applianceOf(pl.item)?.role;
  if (base.some((pl) => role(pl) === "dishwasher")) checks.dishwasherBySink = !Object.values(out.fills).some((f) => f.problems.includes("Le lave-vaisselle n'est pas à côté de l'évier."));
  out.ergonomics = ergonomics(places, checks);
  return out;
}

/** A stretch less the room left open in it. */
function without([a, b]: [number, number], open: [number, number][]): [number, number][] {
  const parts: [number, number][] = [];
  let at = a;
  for (const [f0, f1] of [...open].sort((x, y) => x[0] - y[0])) {
    if (f1 <= at || f0 >= b) continue;
    if (f0 - at > 1e-6) parts.push([at, f0]);
    at = Math.max(at, f1);
  }
  if (b - at > 1e-6) parts.push([at, b]);
  return parts;
}

type Band = (u0: number, u1: number, a: number, b: number, z0: number, z1: number) => [Vec3, Vec3];
type BoxOf = (name: string, kind: KitchenBox["kind"], at: [Vec3, Vec3], extra?: Partial<KitchenBox>) => void;

/** The corners of a run (kitchen-corners.ts): a filler, or a corner unit, its panel and door, a LeMans's trays. */
function corners(p: KitchenFloorPlan, run: KitchenRun, off: [number, number], wallRow: boolean, band: Band, box: BoxOf, cabinet: (name: string, u: number, w: number, depth: number, z: number, height: number, rest: Pick<KitchenUnit, "plinth" | "shelves" | "layout"> & Partial<KitchenUnit>) => void): void {
  const s = kitchenSizes(p);
  const D = s.cabinet;
  // Along the run, and out of it: a corner door is hung on its edge away from the corner, its handle by the corner.
  const [o, e] = [runAt(run, 0, 0), runAt(run, 1, 0)];
  const along: Vec3 = [e[0] - o[0], e[1] - o[1], 0];
  const out: Vec3 = [run.zone.run.normal[0], run.zone.run.normal[1], 0];
  for (const side of ["left", "right"] as const) {
    const corner = cornerSide(p, run, side, off[side === "left" ? 0 : 1]);
    const door = { door: { hinge: (side === "left" ? along : along.map((c) => -c)) as Vec3, out } };
    if (!corner) continue;
    const unit = corner.cabinet ? { corner: true } : {};
    const joint = jointOf(run, side);
    const pass = run[side] === "pass";
    const lowEdit = corner.kind === "l" ? { joint, key: "arm" as const, less: pass ? 0 : -D } : { joint, key: "door" as const, less: s.corner };
    if (corner.cabinet) cabinet(corner.name, corner.cabinet[0], corner.cabinet[1] - corner.cabinet[0], D, 0, s.base, { plinth: s.plinth, shelves: corner.shelves, layout: "none", corner: true, cornerEdit: lowEdit });
    for (const f of corner.fronts) {
      const inset = f.kind === "door" ? 1.5 : 0;
      box(f.name, f.kind === "filler" ? "filler" : "panel", band(f.from, f.to, D, D + FRONT, s.plinth + inset, s.base - inset), f.kind === "door" ? { ...unit, ...door } : unit);
    }
    // The plinth goes on under the corner, to the end of its fronts; the run that passes closes the inner corner,
    // the other one stops against it.
    if (p.kick !== false && corner.fronts.length) {
      const L = run.length;
      const end = side === "left" ? Math.max(...corner.fronts.map((f) => f.to)) : L - Math.min(...corner.fronts.map((f) => f.from));
      const start = pass ? D + FRONT - 16 : D + FRONT;
      const [a, b] = side === "left" ? [start, end] : [L - end, L - start];
      if (b - a > 1) box(`Plinthe d'angle ${run.id}${side === "right" ? " (droite)" : ""}`, "kick", band(a, b, D + FRONT - 16, D + FRONT, 0, s.plinth - 3), unit);
    }
    // Up in the wall row, its corner unit and fronts.
    const high = wallRow ? wallCornerSide(p, run, side) : null;
    if (high) {
      const [W, H] = [p.wallDepth, s.wallTop - s.wallBottom];
      const mark = high.cabinet ? { corner: true } : {};
      const highEdit = high.kind === "l" ? { joint, key: "wallArm" as const, less: pass ? 0 : -W } : { joint, key: "wallDoor" as const, less: wallCorner(p) };
      if (high.cabinet) cabinet(high.name, high.cabinet[0], high.cabinet[1] - high.cabinet[0], W, s.wallBottom, H, { plinth: 0, shelves: high.shelves, layout: "none", corner: true, cornerEdit: highEdit });
      for (const f of high.fronts) {
        const inset = f.kind === "door" ? 1.5 : 0;
        box(f.name, f.kind === "filler" ? "filler" : "panel", band(f.from, f.to, W, W + FRONT, s.wallBottom + inset, s.wallTop - inset), f.kind === "door" ? { ...mark, ...door } : mark);
      }
    }
    // Two trays, low and half way up, on their fitting.
    corner.trays.forEach(([a, b], i) => {
      const z = s.plinth + 60 + i * Math.round((s.base - s.plinth) / 2);
      box(`Plateau LeMans ${i + 1} ${run.id}${side === "right" ? " (droite)" : ""}`, "fitting", band(a, b, 40, D - 20, z, z + 25), unit);
    });
  }
}

/** Room open narrower than this (mm) does not break the worktop: it runs over it. */
const NARROW = 50;

/**
 * Where the worktop of a run lies, along it: it follows the units — none over the room left open, nor over a room
 * kept free that no furnished caisson holds, nor through a column, which stands from the floor to the top of the wall
 * units. The splashback follows it.
 */
export function worktopSpans(run: KitchenRun, fill: RunFill): [number, number][] {
  const held = fill.spaces.filter((pl) => pl.row === "base" && pl.item.furnished).map((pl): [number, number] => [pl.at, pl.at + pl.item.width]);
  const open = fill.free.flatMap((gap) => without(gap, held)).filter(([a, b]) => b - a >= NARROW);
  const columns = fill.placed.filter((pl) => pl.row === "base" && pl.entry.kind === "tall").map((pl): [number, number] => [pl.at, pl.at + pl.item.width]);
  return without(zoneSpan(run), [...open, ...columns]).filter(([a, b]) => b - a >= 1);
}

/**
 * The worktop of the run: over its units only (`covered`, along the run), one piece per stretch of them — the first
 * keeps the run's name —, each with the cut-outs of the sinks and hobs under it.
 */
function worktops(p: KitchenFloorPlan, run: KitchenRun, covered: [number, number][], holes: (NonNullable<KitchenBox["holes"]>[number] & { u: number })[], band: Band, box: BoxOf): void {
  const xs = run.zone.outline.map((q) => q[0]);
  const ys = run.zone.outline.map((q) => q[1]);
  const base = kitchenSizes(p).base;
  const [nx, ny] = run.zone.run.normal;
  // Along the run: the axis its normal is not on. Across it, the zone as it is (its corner, an island's depth).
  const along = Math.abs(nx) > 0.5 ? 1 : 0;
  const whole: [Vec3, Vec3] = [[Math.min(...xs), Math.min(...ys), base], [Math.max(...xs), Math.max(...ys), p.worktopHeight]];
  covered.forEach(([a, b], i) => {
    const [lo, hi] = band(a, b, 0, 1, base, p.worktopHeight);
    const from: Vec3 = [...whole[0]];
    const to: Vec3 = [...whole[1]];
    from[along] = Math.max(whole[0][along]!, lo[along]!);
    to[along] = Math.min(whole[1][along]!, hi[along]!);
    if (to[along]! - from[along]! < 1) return;
    const own = holes.filter((h) => h.u >= a - 1e-6 && h.u <= b + 1e-6).map(({ u: _u, ...h }) => h);
    box(`Plan de travail ${run.id}${i ? i + 1 : ""}`, "worktop", [from, to], { holes: own, front: [nx, ny, 0] });
  });
}

/** Over a stretch of worktop (`part`: which), up to the wall units (or 60 cm), and only up to the sill under a window: one piece per height. */
function splashback(p: KitchenFloorPlan, run: KitchenRun, [from, to]: [number, number], part: number, spans: RunInfo["spans"], full: number, band: Band, box: BoxOf): void {
  const top = p.worktopHeight;
  const windows = spans.filter((sp) => sp.bottom > 0 && sp.from < to && sp.to > from);
  const doors = spans.filter((sp) => sp.bottom <= 0 && sp.from < to && sp.to > from);
  const cuts = [...new Set([from, to, ...[...windows, ...doors].flatMap((sp) => [sp.from, sp.to]).filter((x) => x > from && x < to)])].sort((a, b) => a - b);
  let n = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i]!, cuts[i + 1]!];
    if (doors.some((d) => d.from < b && d.to > a)) continue;
    const z1 = Math.min(full, ...windows.filter((sp) => sp.from < b && sp.to > a).map((sp) => sp.bottom));
    if (z1 - top >= 20) box(`Crédence ${run.id}${part ? part + 1 : ""}${n++ ? `-${n}` : ""}`, "splashback", band(a, b, 0, 10, top, z1));
  }
}
