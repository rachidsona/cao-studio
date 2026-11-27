/**
 * Un plan de cuisine (kitchen-plan-shapes.ts) et ses linéaires remplis (features/kitchen-run-items.ts) traduits en une
 * implantation, comme celle de l'outil Implantation (features/kitchen-layout.ts) que document/kitchen-plan.ts sait bâtir :
 * caissons tournés selon leur mur, façades, électroménager (évier et plaque découpant le plan, lave-vaisselle et sa façade,
 * fours, hotte et son conduit, micro-ondes), fileurs, angle mort fermé par deux fileurs ou meuble d'angle sur le mur qui
 * passe, plan de travail et crédence au-dessus des meubles seulement (pas sur la place libre), plinthes, murs. Chaque pièce sait de quel linéaire elle vient
 * (`run`). Le triangle d'activité et le reste de l'ergonomie suivent (features/kitchen-appliances.ts). Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { cornerNotches, cornerSide, kickOf, wallCornerSide, type CornerSide } from "./kitchen-corners";
import { FRONT, jointOf, kitchenRuns, kitchenSizes, lArm, runAt, runGeometry, skewNotes, wallCorner, zoneSpan, type KitchenRun } from "./kitchen-plan-shapes";
import type { CornerDoorLook, KitchenFloorPlan, Vec3 } from "./types";
import { ergonomics } from "../features/kitchen-appliances";
import { originOf, type KitchenBox, type KitchenLayout, type KitchenUnit } from "../features/kitchen-layout";
import { applianceOf, fillRun, heldUnits, isFiller, itemSize, openRoom, SURROUND, surroundFridge, type Placed, type RunFill } from "../features/kitchen-run-items";
import { diagonalCorner, lCorner, roundTerminal, roundedWorktop } from "./kitchen-shaped";
import type { RunInfo } from "../features/room-runs";
import { WALL_THICKNESS } from "./joinery-defaults";
import { kitchenCap } from "./kitchen-cap";

/** The room's walls behind the runs, by run (spans along them from their left). */
export type KitchenRoomInfo = Partial<Record<string, RunInfo>>;

const OVEN = 595;
/** A chimney hood's underside over the worktop (mm). */
const HOOD = 650;

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
    const box = (name: string, kind: KitchenBox["kind"], at: [Vec3, Vec3], extra: Partial<KitchenBox> = {}) => {
      // A filler set by hand (« Fileurs »): its height, its thickness, its material.
      const look = kind === "filler" ? p.fillerLook?.[name] : undefined;
      const [from, to] = look ? fillerSized(at, look, run.zone.run.normal) : at;
      out.boxes.push({ name, from, to, kind, run: run.id, ...(look?.material ? { material: look.material } : {}), ...extra });
    };
    // An appliance of the library in its box, turned as the run's cabinets.
    const put = (name: string, model: string, at: [Vec3, Vec3], finish = "inox") => box(name, "appliance", at, { appliance: { model, finish, rotation } });
    // A caisson furnished by hand in its room (`asUnits`): all its unit made but its caisson, which it is.
    let holding = false;
    const cabinet = (name: string, u: number, w: number, depth: number, z: number, height: number, rest: Pick<KitchenUnit, "plinth" | "shelves" | "layout"> & Partial<KitchenUnit>) => {
      if (holding) return;
      const [lo, hi] = band(u, u + w, 0, depth, z, z + height);
      out.units.push({ name, origin: originOf(rotation, lo, hi), rotation, width: w, height, depth, run: run.id, ...rest });
    };
    for (const pl of fill.spaces) {
      // A surround's caisson furnished by hand: its room is between the sides, over the fridge; a column's, as high as the column.
      const as = heldUnits({ spaces: [pl] })[0];
      const { height, depth, z } = as?.entry.kind === "tall" ? itemSize(p, as.item, as.entry) : itemSize(p, pl.item, pl.entry);
      const lift = as && applianceOf(as.item)?.role === "fridge-surround" ? surroundFridge(p, as.item) + SURROUND.air : 0;
      const [u0, u1, top] = lift ? [pl.at + FRONT, pl.at + pl.item.width - FRONT, itemSize(p, as!.item, as!.entry).height] : [pl.at, pl.at + pl.item.width, z + height];
      const [lo, hi] = band(u0, u1, 0, depth, lift || z, top);
      out.kept.push({ name: pl.entry.name, origin: originOf(rotation, lo, hi), rotation, width: u1 - u0, height: top - (lift || z), depth, run: run.id, item: pl.item.id, plinth: 0, shelves: 0, layout: "none" });
    }
    if (g.low) out.notes.push(`Pas de meubles hauts sur ${run.label.toLowerCase()} : le plafond y descend à ${Math.round(ceiling)} mm.`);
    let n = 0;
    let fillers = 0;
    const holes: (NonNullable<KitchenBox["holes"]>[number] & { u: number })[] = [];
    const rounds: Rounded[] = [];
    const hole = (pl: Placed, appliance: string, soft = false) => {
      const u = pl.at + pl.item.width / 2;
      const [x, y] = runAt(run, u, run.back + p.depth / 2);
      holes.push({ appliance, at: [x, y, p.worktopHeight], u, ...(soft ? { soft } : {}) });
    };
    const front = (pl: Placed): [number, number] => runAt(run, pl.at + pl.item.width / 2, run.back + D + FRONT);
    const asUnits = heldUnits(fill);
    for (const pl of [...fill.placed, ...asUnits]) {
      holding = asUnits.includes(pl);
      const { entry, at } = pl;
      const w = pl.item.width;
      // A filler put by hand: a panel in front, low between plinth and worktop, or in the wall row.
      if (isFiller(pl.item)) {
        const wall = pl.row === "wall";
        box(`Fileur posé ${wall ? "haut " : ""}${run.id}${++fillers}`, "filler", wall ? band(at, at + w, p.wallDepth, p.wallDepth + FRONT, s.wallBottom, s.wallTop) : band(at, at + w, D, D + FRONT, s.plinth, s.base));
        continue;
      }
      const role = applianceOf(pl.item)?.role;
      // A rounded end unit: built board by board (document/kitchen-shaped.ts), rounded towards the end of its row.
      if (entry.round) {
        const row = fill.placed.filter((o) => o.row === pl.row && o !== pl);
        const round = row.some((o) => o.at > at) && !row.some((o) => o.at < at) ? "left" : "right";
        const { height, depth, z } = itemSize(p, pl.item, entry);
        const base = pl.row === "base";
        roundTerminal(`Terminal arrondi ${run.id}${++n}`, (u, a) => runAt(run, u, run.back + a), [at, at + w], round, depth, base ? [s.plinth, s.base] : [z, z + height], entry.shelves, base ? s.plinth : 0, box);
        if (base) rounds.push({ span: [at, at + w], round });
        continue;
      }
      const name = `${entry.name}${entry.custom ? "" : ` ${w}`} (${run.id}${++n})`;
      // (A sink's unit has its front rail on its edge, as its back one: the bowl has all the room between them.)
      const look = { item: pl.item.id, shelves: entry.shelves, ...(entry.dividers ? { dividers: entry.dividers } : {}), layout: entry.layout, ...(pl.item.side ?? entry.side ? { side: pl.item.side ?? entry.side } : {}), ...(pl.item.grip ? { grip: pl.item.grip } : {}), ...(pl.item.handles === false ? { handles: false as const } : {}), ...(pl.item.facade ?? entry.facade ? { facade: pl.item.facade ?? entry.facade } : {}), ...(entry.drawers ? { drawers: entry.drawers } : {}), ...(entry.drawerShares ? { drawerShares: entry.drawerShares } : {}), ...(entry.railWidth ? { railWidth: entry.railWidth } : {}), ...(entry.topDrawer ? { topDrawer: entry.topDrawer } : {}), ...(entry.innerDrawers ? { innerDrawers: entry.innerDrawers } : {}), ...(entry.top === "rails" ? { top: "rails" as const, ...(pl.item.railFront || role === "sink" ? { railFront: "edge" as const } : {}) } : {}), ...(pl.item.keep ? { keep: pl.item.keep } : {}), ...(pl.item.sideDoor ? { sideDoor: pl.item.sideDoor } : {}) };
      const plinth = entry.plinth ?? s.plinth;
      if (pl.row === "wall") {
        const { height, z, depth } = itemSize(p, pl.item, entry);
        if (role === "hood") {
          // A chimney hood up to the ceiling, 65 cm over the worktop.
          put("Hotte", "hood-chimney", band(at + 1, at + w - 1, 0, 500, p.worktopHeight + HOOD, Math.max(p.worktopHeight + 900, ceiling)));
          continue;
        }
        cabinet(name, at, w, depth, z, height, { plinth: 0, ...look });
        if (role === "microwave") put("Micro-ondes", "microwave-builtin", band(at + (w - 595) / 2, at + (w + 595) / 2, Math.max(0, depth - 400), depth, z + 160, z + 550));
        continue;
      }
      if (role === "fridge-surround") {
        // Two sides to the full height in the fronts' material, a caisson with doors at the top between them, the
        // fridge under it with air round it.
        const { height, depth } = itemSize(p, pl.item, entry);
        const [inner, z] = [w - 2 * FRONT, surroundFridge(p, pl.item) + SURROUND.air];
        box(`Côté gauche habillage (${run.id}${n})`, "panel", band(at, at + FRONT, 0, depth, 0, height), { item: pl.item.id });
        box(`Côté droit habillage (${run.id}${n})`, "panel", band(at + w - FRONT, at + w, 0, depth, 0, height), { item: pl.item.id });
        cabinet(name, at + FRONT, inner, depth, z, height - z, { plinth: 0, shelves: 0, layout: inner > 600 ? "doors" : "door", item: pl.item.id });
        const fw = Math.min(910, inner - 2 * SURROUND.side);
        box("Réfrigérateur américain", "appliance", band(at + (w - fw) / 2, at + (w + fw) / 2, 0, depth, 0, z - SURROUND.air), { appliance: { model: "fridge-american", finish: "inox", rotation }, item: pl.item.id });
        places.fridge ??= front(pl);
        continue;
      }
      if (entry.kind === "tall") {
        const size = itemSize(p, pl.item, entry);
        // An oven column: a door over the oven, its fronts, opening as chosen (a side, lift-up); one under it, on a side.
        const under = look.side === "right" ? ("right" as const) : ("left" as const);
        const oven = role === "oven-column" ? { layout: "door" as const, rise: [903 + OVEN, size.height - 1.5] as [number, number], more: [{ side: under, rise: [plinth + 1.5, 897] as [number, number] }] } : {};
        cabinet(name, at, w, size.depth, 0, size.height, { plinth, ...look, ...oven });
        if (role === "fridge") {
          places.fridge ??= front(pl);
          // The built-in fridge in its column, behind the column's door.
          const fh = size.height - plinth - 36 >= 1770 ? 1770 : 1220;
          put("Réfrigérateur", "fridge-builtin", band(at + (w - 540) / 2, at + (w + 540) / 2, Math.max(0, size.depth - 545), size.depth, plinth + 18, plinth + 18 + fh), "white");
        }
        if (role === "oven-column") {
          put("Four (colonne)", "oven-pyro", band(at + (w - 595) / 2, at + (w + 595) / 2, D - 548, D, 900, 900 + OVEN));
        }
        continue;
      }
      if (role === "washer") continue;
      if (role === "dishwasher") {
        const dw = w >= 598 ? 598 : 448;
        put("Lave-vaisselle", "dishwasher-builtin", band(at + (w - dw) / 2, at + (w + dw) / 2, D - 550, D, s.base - 5 - 815, s.base - 5));
        box("Façade lave-vaisselle", "panel", band(at + 1.5, at + w - 1.5, D, D + FRONT, plinth, s.base - 3));
        continue;
      }
      cabinet(name, at, w, itemSize(p, pl.item, entry).depth, 0, s.base, { plinth, ...look });
      // A sink base of the catalogue, or one's own on two rails: the worktop is cut over it too, for the sink to come
      // (not over drawers on two rails: no sink goes through them).
      if (!role && entry.top === "rails" && entry.layout !== "drawers") hole(pl, w >= 800 ? "sink-1" : "sink-under", true);
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
    holding = false;
    fill.fillers.forEach(([a, b], i) => box(`Fileur ${run.id}${i ? i + 1 : ""}`, "filler", band(a, b, D, D + FRONT, s.plinth, s.base)));
    // The run's corner units, along it: the worktop lies over them as over its units.
    const cornerUnits = (["left", "right"] as const).flatMap((side, i): [number, number][] => {
      const c = cornerSide(p, run, side, fill.walls[i])?.span;
      return c ? [[c[0], c[1]]] : [];
    });
    corners(p, run, fill.walls, g.wall !== null, band, box, cabinet);
    const covered = worktopSpans(run, fill, cornerUnits);
    // Taken away on the run's strip: no worktop (the splashback stays on the wall).
    if (!p.noWorktop?.[run.id]) worktops(p, run, covered, holes, band, box, rounds);
    if (p.endPanels) endPanels(p, run, fill, band, box);
    // The caissons furnished by hand carry it as the units they were.
    kitchenCap(p, run, { ...fill, placed: [...fill.placed, ...heldUnits(fill)] }, g.wall !== null, ceiling, band, box, out.notes, cabinet);
    const full = ceiling >= s.wallTop && !g.low ? s.wallBottom : p.worktopHeight + 600;
    // Under a hood the splashback goes up to it, in one piece; or, as chosen, only there.
    const hoods = fill.placed.filter((x) => x.row === "wall" && applianceOf(x.item)?.role === "hood").map((x): [number, number] => [x.at, x.at + x.item.width]);
    const hoodTop = p.worktopHeight + HOOD;
    if (run.wall && p.splashback !== false) {
      const parts = covered.map((part) => intoCorners(run, part));
      if (p.splashbackHoodOnly) parts.flatMap(([a, b]) => hoods.map(([h0, h1]): [number, number] => [Math.max(a, h0), Math.min(b, h1)]).filter(([u0, u1]) => u1 - u0 >= 1)).forEach((part, i) => splashback(p, run, part, i, g.spans, hoodTop, band, box));
      else parts.forEach((part, i) => splashback(p, run, part, i, g.spans, full, band, box, { hoods, top: hoodTop }));
    }
    // Under the units, the fillers and the furnished caissons (on the same socle) only: the room left open has none.
    let kicks = 0;
    const kick = kickOf(p, run.id);
    const held = fill.spaces.filter((pl) => pl.row === "base" && pl.item.furnished);
    // A rounded end unit stands on its own rounded socle; a fridge's surround on the floor, its sides down to it; a washing machine's place is open to the floor.
    const surrounds = [...fill.placed, ...asUnits].filter((pl) => ["fridge-surround", "washer"].includes(applianceOf(pl.item)?.role ?? "")).map((pl): [number, number] => [pl.at, pl.at + pl.item.width]);
    for (const [a, b] of fill.stretches.flatMap((st) => without(st, [...openRoom(fill, "base"), ...rounds.map((r) => r.span), ...surrounds]))) {
      const used = [...fill.placed, ...held].some((pl) => pl.row === "base" && pl.at >= a - 1e-6 && pl.at < b);
      if (used && kick.on) box(`Plinthe ${run.id}${kicks++ ? kicks : ""}`, "kick", band(a, b, D + FRONT - 16 - kick.back, D + FRONT - kick.back, 0, s.plinth - 3));
    }
    if (run.wall && !room && !p.noWalls) box(`Mur ${run.id}`, "wall", band(run.id === "A" && run.left !== "free" ? -WALL_THICKNESS : 0, run.length + (run.id === "A" && run.right !== "free" ? WALL_THICKNESS : 0), -WALL_THICKNESS, 0, 0, p.height));
  }
  const base = Object.values(out.fills).flatMap((f) => [...f.placed, ...heldUnits(f)].filter((pl) => pl.row === "base"));
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

export type Band = (u0: number, u1: number, a: number, b: number, z0: number, z1: number) => [Vec3, Vec3];
/** A rounded end unit's place along the run, and its rounded side. */
type Rounded = { span: [number, number]; round: "left" | "right" };
export type BoxOf = (name: string, kind: KitchenBox["kind"], at: [Vec3, Vec3], extra?: Partial<KitchenBox>) => void;
/** A cabinet of a run: its name, where along the run, its width, depth, bottom and height, and what it holds. */
export type CabinetOf = (name: string, u: number, w: number, depth: number, z: number, height: number, rest: Pick<KitchenUnit, "plinth" | "shelves" | "layout"> & Partial<KitchenUnit>) => void;

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
    const unit = corner.cabinet || corner.span ? { corner: true } : {};
    const joint = jointOf(run, side);
    const pass = run[side] === "pass";
    const lowEdit = corner.kind === "l" || corner.kind === "carousel" ? { joint, key: "arm" as const, less: pass ? 0 : -D } : { joint, key: "door" as const, less: s.corner };
    // A corner unit's door (beside its panel, or a folding door's leaf): its own fronts (the Façades tool), hung away
    // from the corner; the plan keeps its style and its side (kitchen-sync.ts). Not the one cut at 45°: no cabinet.
    const hung = (c: CornerSide, look?: CornerDoorLook): Pick<KitchenUnit, "layout" | "side" | "span" | "facade"> => {
      const d = c.fronts.find((f) => f.kind === "door");
      if (!c.cabinet || !d) return { layout: "none" };
      const { side: kept, ...style } = look ?? {};
      // A folding door's two leaves share their corner's look: each keeps its own side, away from the corner.
      const hinge = d.name.startsWith("Porte pliante") ? undefined : kept;
      return { layout: "door", side: hinge ?? (side === "left" ? "right" : "left"), span: [d.from - c.cabinet[0], d.to - c.cabinet[0]], ...(style.style ? { facade: style } : {}) };
    };
    const own = p.cornerSizes?.[joint];
    const lowDoor = hung(corner, own?.look);
    // Cut at 45°: its boards, its door and its piece of worktop, on the run that passes.
    if ((corner.kind === "diagonal" || corner.kind === "lcase") && pass) {
      const L = run.length;
      const at = (u: number, a: number) => runAt(run, side === "left" ? u : L - u, run.back + a);
      if (corner.kind === "lcase") lCorner(corner.name, at, lArm(p, joint), D, [s.plinth, s.base], cornerNotches(p, run, side), box);
      else diagonalCorner(corner.name, at, lArm(p, joint), D, [s.plinth, s.base], s.plinth, FRONT, [run.zone.run.depth, p.worktopHeight, p.worktopHeight - s.base], box);
    }
    if (corner.cabinet) cabinet(corner.name, corner.cabinet[0], corner.cabinet[1] - corner.cabinet[0], D, 0, s.base, { plinth: s.plinth, shelves: corner.shelves, ...lowDoor, corner: true, cornerEdit: lowEdit });
    for (const f of corner.fronts) {
      if (f.kind === "door" && lowDoor.layout === "door") continue;
      const inset = f.kind === "door" ? 1.5 : 0;
      box(f.name, f.kind === "filler" ? "filler" : "panel", band(f.from, f.to, D, D + FRONT, s.plinth + inset, s.base - inset), f.kind === "door" ? { ...unit, door: { ...door.door, ...(corner.kind === "lcase" ? { angle: 180 } : {}) } } : unit);
    }
    // The plinth goes on under the corner, to the end of its fronts; the run that passes closes the inner corner,
    // the other one stops against it.
    const kick = kickOf(p, run.id);
    if (kick.on && corner.fronts.length) {
      const L = run.length;
      const end = side === "left" ? Math.max(...corner.fronts.map((f) => f.to)) : L - Math.min(...corner.fronts.map((f) => f.from));
      // Up to the plinth of the run beside, as far back from its fronts as it is set.
      const beside = kickOf(p, run.zone.id === "A" ? (side === "left" ? "B" : "C") : "A").back;
      const start = (pass ? D + FRONT - 16 : D + FRONT) - beside;
      const [a, b] = side === "left" ? [start, end] : [L - end, L - start];
      if (b - a > 1) box(`Plinthe d'angle ${run.id}${side === "right" ? " (droite)" : ""}`, "kick", band(a, b, D + FRONT - 16 - kick.back, D + FRONT - kick.back, 0, s.plinth - 3), unit);
    }
    // Up in the wall row, its corner unit and fronts.
    const high = wallRow ? wallCornerSide(p, run, side) : null;
    if (high) {
      const [W, H] = [p.wallDepth, s.wallTop - s.wallBottom];
      const mark = high.cabinet ? { corner: true } : {};
      const highEdit = high.kind === "l" ? { joint, key: "wallArm" as const, less: pass ? 0 : -W } : { joint, key: "wallDoor" as const, less: wallCorner(p) };
      const highDoor = hung(high, own?.wallLook);
      if (high.cabinet) cabinet(high.name, high.cabinet[0], high.cabinet[1] - high.cabinet[0], W, s.wallBottom, H, { plinth: 0, shelves: high.shelves, ...highDoor, corner: true, cornerEdit: highEdit });
      for (const f of high.fronts) {
        if (f.kind === "door" && highDoor.layout === "door") continue;
        const inset = f.kind === "door" ? 1.5 : 0;
        box(f.name, f.kind === "filler" ? "filler" : "panel", band(f.from, f.to, W, W + FRONT, s.wallBottom + inset, s.wallTop - inset), f.kind === "door" ? { ...mark, ...door } : mark);
      }
    }
    // Two trays, low and half way up, on their fitting.
    // A LeMans's or a carousel's trays, a Magic Corner's baskets (taller): low, then half way up, in turn.
    const fitting = corner.kind === "magic" ? { name: "Panier Magic Corner", height: 120 } : { name: corner.kind === "carousel" ? "Plateau tournant" : "Plateau LeMans", height: 25 };
    const [c0, c1] = corner.across ?? [40, D - 20];
    corner.trays.forEach(([a, b], i) => {
      const z = s.plinth + 60 + (i % 2) * Math.round((s.base - s.plinth) / 2);
      box(`${fitting.name} ${i + 1} ${run.id}${side === "right" ? " (droite)" : ""}`, "fitting", band(a, b, c0, c1, z, z + fitting.height), unit);
    });
  }
}

/** Room open narrower than this (mm) does not break the worktop: it runs over it. */
const NARROW = 50;

/**
 * Where the worktop of a run lies, along it: it follows the units — none over the room left open, nor over a room
 * kept free that no furnished caisson holds, nor through a column, which stands from the floor to the top of the wall
 * units. Only over what stands: a stretch with no unit, no furnished caisson and no corner unit (`corners`, along the
 * run) has none — nothing over the rest of a run beside a place kept free. The splashback follows it.
 */
export function worktopSpans(run: KitchenRun, fill: RunFill, corners: [number, number][] = []): [number, number][] {
  // A column furnished by hand is a column still: no worktop over it.
  const tall = new Set(heldUnits(fill).filter((pl) => pl.entry.kind === "tall").map((pl) => pl.item.id));
  const held = fill.spaces.filter((pl) => pl.row === "base" && pl.item.furnished && !tall.has(pl.item.id)).map((pl): [number, number] => [pl.at, pl.at + pl.item.width]);
  const open = fill.free.flatMap((gap) => without(gap, held)).filter(([a, b]) => b - a >= NARROW);
  const columns = [...fill.placed, ...heldUnits(fill)].filter((pl) => pl.row === "base" && pl.entry.kind === "tall").map((pl): [number, number] => [pl.at, pl.at + pl.item.width]);
  const units = [...fill.placed.filter((pl) => pl.row === "base" && pl.entry.kind !== "tall").map((pl): [number, number] => [pl.at, pl.at + pl.item.width]), ...held];
  const [z0, z1] = zoneSpan(run);
  // Against a column or open room, it stops at the caisson's side, not over the filler beside it; at the run's ends it goes on to the wall or the corner.
  return without([z0, z1], [...open, ...columns]).flatMap(([a, b]): [number, number][] => {
    const inside = [...units, ...corners].filter(([u0, u1]) => u1 > a + 1e-6 && u0 < b - 1e-6);
    if (!inside.length) return [];
    return [[a > z0 + 1e-6 ? Math.max(a, Math.min(...inside.map(([u0]) => u0))) : a, b < z1 - 1e-6 ? Math.min(b, Math.max(...inside.map(([, u1]) => u1))) : b]];
  }).filter(([a, b]) => b - a >= 1);
}

/**
 * The worktop of the run: over its units only (`covered`, along the run), one piece per stretch of them — the first
 * keeps the run's name —, each with the cut-outs of the sinks and hobs under it.
 */
function worktops(p: KitchenFloorPlan, run: KitchenRun, covered: [number, number][], holes: (NonNullable<KitchenBox["holes"]>[number] & { u: number })[], band: Band, box: BoxOf, rounds: Rounded[] = []): void {
  const xs = run.zone.outline.map((q) => q[0]);
  const ys = run.zone.outline.map((q) => q[1]);
  const base = kitchenSizes(p).base;
  const [nx, ny] = run.zone.run.normal;
  // Along the run: the axis its normal is not on. Across it, the zone as it is (its corner, an island's depth).
  const along = Math.abs(nx) > 0.5 ? 1 : 0;
  const whole: [Vec3, Vec3] = [[Math.min(...xs), Math.min(...ys), base], [Math.max(...xs), Math.max(...ys), p.worktopHeight]];
  const T = p.worktopHeight - base;
  const [z0, z1] = zoneSpan(run);
  covered.forEach(([a, b], i) => {
    const [lo, hi] = band(a, b, 0, 1, base, p.worktopHeight);
    const from: Vec3 = [...whole[0]];
    const to: Vec3 = [...whole[1]];
    from[along] = Math.max(whole[0][along]!, lo[along]!);
    to[along] = Math.min(whole[1][along]!, hi[along]!);
    if (to[along]! - from[along]! < 1) return;
    // A return down to the floor at a free end of the run the piece reaches: the worktop over it, it up the worktop's
    // end, or both cut at 45°.
    const joint = p.worktopJoint === "side" || p.worktopJoint === "miter" ? p.worktopJoint : "top";
    // Over a rounded end unit at an end of the piece: that end rounded as it, no return there.
    const round = rounds.find((r) => (r.round === "right" ? Math.abs(r.span[1] - b) < 1 : Math.abs(r.span[0] - a) < 1));
    const ends = p.worktopEnds ? (["left", "right"] as const).filter((side) => run[side] === "free" && side !== round?.round && (side === "left" ? a <= z0 + 1e-6 : b >= z1 - 1e-6)) : [];
    const [f0, t0] = [from[along]!, to[along]!];
    // The worktop's outline from the front (along, up): its low end then its high end, bottom and top.
    const ends0 = { low: [f0, f0], high: [t0, t0] };
    const returns = ends.map((side) => {
      const [rlo, rhi] = side === "left" ? band(a - T, a, 0, 1, 0, base) : band(b, b + T, 0, 1, 0, base);
      const [rFrom, rTo]: [Vec3, Vec3] = [[...from], [...to]];
      [rFrom[along], rTo[along], rFrom[2], rTo[2]] = [rlo[along]!, rhi[along]!, 0, joint === "top" ? base : p.worktopHeight];
      const high = rFrom[along]! >= t0 - 1e-6;
      const [inner, outer] = high ? [rFrom[along]!, rTo[along]!] : [rTo[along]!, rFrom[along]!];
      if (joint !== "side") {
        from[along] = Math.min(from[along]!, rFrom[along]!);
        to[along] = Math.max(to[along]!, rTo[along]!);
      }
      if (joint === "miter") ends0[high ? "high" : "low"] = [inner, outer];
      const profile = joint === "miter" ? { along: along as 0 | 1, points: [[inner, 0], [outer, 0], [outer, p.worktopHeight], [inner, base]] as [number, number][] } : undefined;
      return { side, at: [rFrom, rTo] as [Vec3, Vec3], profile };
    });
    const own = holes.filter((h) => h.u >= a - 1e-6 && h.u <= b + 1e-6).map(({ u: _u, ...h }) => h);
    const mitered = returns.some((r) => r.profile);
    const profile = mitered ? { along: along as 0 | 1, points: [[ends0.low[0], base], [ends0.high[0], base], [ends0.high[1], p.worktopHeight], [ends0.low[1], p.worktopHeight]] as [number, number][] } : undefined;
    const outline = round ? roundedWorktop((u, v) => runAt(run, u, v), [a, b], round.span, round.round, run.zone.run.depth) : undefined;
    box(`Plan de travail ${run.id}${i ? i + 1 : ""}`, "worktop", [from, to], { holes: own, front: [nx, ny, 0], ...(profile ? { profile } : {}), ...(outline ? { outline } : {}) });
    // In the worktop's material (as a splashback), out of the worktop's cut-outs and bars.
    for (const r of returns) box(`Retour de plan ${run.id}${r.side === "right" ? " (droite)" : " (gauche)"}`, "splashback", r.at, r.profile ? { profile: r.profile } : {});
  });
}

/**
 * At a free end of the run, a finishing side in the fronts' material against the side that shows: of the last column
 * of the base row, and of the last wall unit — the side of a base unit is left to the worktop's return.
 */
function endPanels(p: KitchenFloorPlan, run: KitchenRun, fill: RunFill, band: Band, box: BoxOf): void {
  for (const side of ["left", "right"] as const) {
    if (run[side] !== "free") continue;
    for (const row of ["base", "wall"] as const) {
      const units = [...fill.placed, ...heldUnits(fill)].filter((pl) => pl.row === row && !isFiller(pl.item) && applianceOf(pl.item)?.role !== "hood");
      if (!units.length) continue;
      const last = units.reduce((a, b) => (side === "left" ? (b.at < a.at ? b : a) : (b.at + b.item.width > a.at + a.item.width ? b : a)));
      if (row === "base" && last.entry.kind !== "tall") continue;
      // A wall unit beside a column: its side is against the column.
      const beyond = (pl: Placed) => (side === "left" ? pl.at < last.at : pl.at + pl.item.width > last.at + last.item.width);
      if (row === "wall" && fill.placed.some((pl) => pl.row === "base" && pl.entry.kind === "tall" && beyond(pl))) continue;
      const { height, depth, z } = itemSize(p, last.item, last.entry);
      const u = side === "left" ? last.at - FRONT : last.at + last.item.width;
      box(`Joue de finition ${row === "wall" ? "haute " : ""}${run.id}${side === "right" ? " (droite)" : " (gauche)"}`, "panel", band(u, u + FRONT, 0, depth + FRONT, z, z + height));
    }
  }
}

/** Thickness of a splashback (mm). */
const SPLASH = 10;

/**
 * A stretch of splashback, on into the corners where the run stops against the run that passes (whose worktop covers
 * the corner): up to that run's splashback, the corner's wall covered too.
 */
function intoCorners(run: KitchenRun, [a, b]: [number, number]): [number, number] {
  const [z0, z1] = zoneSpan(run);
  return [run.left === "stop" && a <= z0 + 1e-6 ? SPLASH : a, run.right === "stop" && b >= z1 - 1e-6 ? run.length - SPLASH : b];
}

/**
 * Over a stretch of worktop (`part`: which), up to the wall units (or 60 cm), and only up to the sill under a window:
 * one piece per height. Under a hood (`raise`), the piece goes on up to it: one piece still, its outline stepped up
 * there (drawn upright through its thickness, document/kitchen-plan.ts).
 */
function splashback(p: KitchenFloorPlan, run: KitchenRun, [from, to]: [number, number], part: number, spans: RunInfo["spans"], full: number, band: Band, box: BoxOf, raise?: { hoods: [number, number][]; top: number }): void {
  const top = p.worktopHeight;
  const windows = spans.filter((sp) => sp.bottom > 0 && sp.from < to && sp.to > from);
  const doors = spans.filter((sp) => sp.bottom <= 0 && sp.from < to && sp.to > from);
  const cuts = [...new Set([from, to, ...[...windows, ...doors].flatMap((sp) => [sp.from, sp.to]).filter((x) => x > from && x < to)])].sort((a, b) => a - b);
  let n = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i]!, cuts[i + 1]!];
    if (doors.some((d) => d.from < b && d.to > a)) continue;
    const z1 = Math.min(full, ...windows.filter((sp) => sp.from < b && sp.to > a).map((sp) => sp.bottom));
    if (z1 - top < 20) continue;
    const name = `Crédence ${run.id}${part ? part + 1 : ""}${n++ ? `-${n}` : ""}`;
    const under = raise && raise.top - z1 >= 20 ? raise.hoods.map(([h0, h1]): [number, number] => [Math.max(a, h0), Math.min(b, h1)]).filter(([u0, u1]) => u1 - u0 >= 1).sort((x, y) => x[0] - y[0]) : [];
    if (!under.length) {
      box(name, "splashback", band(a, b, 0, SPLASH, top, z1));
      continue;
    }
    // Its outline from the front: the bottom, then along the top from the far end, up under each hood.
    const along = Math.abs(run.zone.run.normal[0]) > 0.5 ? 1 : 0;
    const at = (u: number) => band(u, u, 0, 0, 0, 0)[0][along]!;
    const outline: [number, number][] = [[a, top], [b, top], [b, z1], ...[...under].reverse().flatMap(([u0, u1]): [number, number][] => [[u1, z1], [u1, raise!.top], [u0, raise!.top], [u0, z1]]), [a, z1]];
    box(name, "splashback", band(a, b, 0, SPLASH, top, raise!.top), { profile: { along, points: outlineCorners(outline).map(([u, z]): [number, number] => [at(u), z]) } });
  }
}

/** An outline rid of the points it passes twice and of those on a straight line between their neighbours. */
function outlineCorners(points: [number, number][]): [number, number][] {
  const same = (p: [number, number], q: [number, number]) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
  let pts = points.filter((q, i) => !same(q, points[(i + 1) % points.length]!));
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    pts = pts.filter((q, i) => {
      const [p0, p1] = [pts[(i + pts.length - 1) % pts.length]!, pts[(i + 1) % pts.length]!];
      const flat = Math.abs((q[0] - p0[0]) * (p1[1] - p0[1]) - (q[1] - p0[1]) * (p1[0] - p0[0])) < 1e-6;
      if (flat) changed = true;
      return !flat;
    });
  }
  return pts;
}

/**
 * A filler box at the height and thickness set (mm, read from the saved document: numbers in range only): its top
 * kept (under the worktop, at the wall units' top), its front kept (the face towards the room, along `normal`).
 */
export function fillerSized([from, to]: [Vec3, Vec3], look: { height?: number; thickness?: number }, normal: readonly number[]): [Vec3, Vec3] {
  const [a, b]: [Vec3, Vec3] = [[...from], [...to]];
  const ok = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (ok(look.height, 10, 3000)) a[2] = b[2] - look.height;
  if (ok(look.thickness, 3, 100)) {
    const axis = Math.abs(normal[0]!) >= Math.abs(normal[1]!) ? 0 : 1;
    if (normal[axis]! > 0) a[axis] = b[axis]! - look.thickness;
    else b[axis] = a[axis]! + look.thickness;
  }
  return [a, b];
}
