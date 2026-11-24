/**
 * Implantation d'une cuisine, en nombres : le long d'un mur (I), de deux murs en angle (L) ou de trois (U), des
 * meubles bas aux largeurs du commerce (600 d'abord, puis le plus grand module qui tient, et un fileur pour le dernier
 * jeu), leurs façades, le plan de travail, les meubles hauts au-dessus si on veut, un îlot face au mur A, et les murs.
 * Lue sur une Pièce relevée (features/room-runs.ts), chaque mur laisse libres ses portes (et ses fenêtres pour les
 * meubles hauts), et un plafond bas (retombée, rampant) ôte les meubles hauts. L'électroménager (évier, lave-vaisselle,
 * plaque et four, hotte, colonnes) se place tout seul (features/kitchen-appliances.ts), avec la découpe du plan.
 *
 * Repère : le mur A a sa face intérieure dans le plan Y = 0 et va vers +X ; les meubles sont devant lui (Y < 0).
 * Le mur B (L, U) a sa face dans le plan X = 0 et va vers −Y, ses meubles tournés de 90° (face vers +X) ; le mur C
 * (U) a sa face dans le plan X = longueur de A, vers −Y, ses meubles face à −X. Un angle est mort, fermé par deux
 * fileurs, ou occupé par un meuble d'angle (une porte de 45 cm, un panneau fixe dans l'angle).
 */
import type { FrontStyle, Vec3 } from "../document/types";
import { ergonomics, placeAppliances, type Slot } from "./kitchen-appliances";
import { freeStretches, type RunInfo, type RunWall } from "./room-runs";
import { CORNER_GAP, WALL_THICKNESS } from "../document/joinery-defaults";

export interface KitchenSettings {
  layout: "I" | "L" | "U";
  /** Inner length of walls A, B and C (mm). */
  lengthA: number;
  lengthB: number;
  lengthC?: number;
  wallHeight: number;
  /** Base units: total height (plinth included), depth, plinth. */
  baseHeight: number;
  baseDepth: number;
  plinth: number;
  fronts: "doors" | "drawers" | "mixed";
  worktopThickness: number;
  wallUnits: boolean;
  /** Fronts' thickness (mm), for the corner and the worktop overhang. */
  frontThickness: number;
  /** The corners of an L or a U: dead (closed by fillers) or a corner unit. */
  corner?: "dead" | "unit";
  /** An island facing wall A: its length (0: none), and the passage between it and the run of wall A (mm). */
  island?: number;
  passage?: number;
  /** Sink, dishwasher, hob with the oven under it (or in a column) and the hood; a fridge column. */
  appliances?: boolean;
  fridge?: boolean;
  ovenColumn?: boolean;
  /** A splashback on the wall over the worktop, and kick boards under the fronts. */
  splashback?: boolean;
  kick?: boolean;
}

export const KITCHEN: KitchenSettings = {
  layout: "I", lengthA: 3000, lengthB: 2400, lengthC: 2400, wallHeight: 2500, baseHeight: 870, baseDepth: 560, plinth: 150,
  fronts: "mixed", worktopThickness: 38, wallUnits: true, frontThickness: 19,
};

/** Commercial widths of the units (mm). */
export const MODULES = [300, 400, 450, 500, 600, 800, 900];
const PREFERRED = 600;
/** Gap left at the corner so the fronts of both runs open (mm). */
const CORNER_DOOR = 450;
const OVERHANG = 20;
export const WALL_UNIT = { height: 700, depth: 350, bottom: 1450 };
const MIN_FILLER = 3;
const COLUMN = 600;
/** Kept free on both sides of a door's frame (mm). */
const DOOR_MARGIN = 50;

export interface KitchenUnit {
  name: string;
  origin: Vec3;
  rotation: 0 | 90 | 180 | 270;
  width: number;
  height: number;
  depth: number;
  plinth: number;
  shelves: number;
  /** The fronts it gets (none: an appliance or panels in front). */
  layout: "door" | "doors" | "drawers" | "none";
  drawers?: number;
  drawerShares?: number[];
  /** Two rails for a top (« rails »): their width (mm) when not 100. */
  railWidth?: number;
  /** A drawer over the door(s): its front's height; English drawers behind them: how many (features/fronts-parts.ts). */
  topDrawer?: number;
  innerDrawers?: number;
  /** Upright boards inside (features/cabinet-parts.ts). */
  dividers?: number;
  /** One door: the side of its hinges (missing: left; « top »: a lift-up door, « bottom »: a flap). */
  side?: "left" | "right" | "top" | "bottom";
  /** Its fronts without handles, on gorge profiles. */
  grip?: "gorge";
  /** Its fronts without handles at all. */
  handles?: false;
  /** The style of its fronts (missing: plain). */
  facade?: FrontStyle;
  /** Its door on part of its width only, from and to across it (a corner unit's, beside its panel: features/fronts-parts.ts). */
  span?: [number, number];
  /** Its door on part of its height only (an oven column's, over its oven). */
  rise?: [number, number];
  /** More doors on the same cabinet, each its own fronts (an oven column's, under its oven). */
  more?: Pick<KitchenUnit, "side" | "span" | "rise">[];
  /** Two rails instead of a top: the sink goes through. */
  top?: "rails";
  /** The run of a kitchen plan it belongs to (document/kitchen-plan-build.ts), and the item of the run it is. */
  run?: string;
  item?: string;
  /** A corner unit chosen for its corner: made even on a run with nothing else. */
  corner?: boolean;
  /** Which size of the plan a corner unit's width is: its corner, the size, and what the width has over it (mm). */
  cornerEdit?: { joint: "left" | "right"; key: "door" | "arm" | "wallDoor" | "wallArm"; less: number };
}

export interface KitchenBox {
  name: string;
  from: Vec3;
  to: Vec3;
  kind: "wall" | "worktop" | "filler" | "panel" | "appliance" | "splashback" | "kick" | "fitting";
  /** Part of a corner unit chosen for its corner. */
  corner?: boolean;
  /**
   * A worktop's cut-outs (features/worktop-cutouts.ts): the appliance and the middle of the cut (kitchen frame).
   * `soft`: cut because the unit under it is made for it (a sink base), with no appliance of the plan's — left out when
   * a sink or a hob placed by hand (Électroménager) already cuts the worktop there.
   */
  holes?: { appliance: string; at: Vec3; soft?: boolean }[];
  /** Which way a worktop's front faces (kitchen frame). */
  front?: Vec3;
  /**
   * An appliance of the library (features/appliance-library.ts) filling the box, as a cabinet fills its own: its
   * model, finish and turn (kitchen frame).
   */
  appliance?: { model: string; finish: string; rotation: number };
  /** A board that opens as a door (a corner unit's): toward its hinge edge, the way it faces (kitchen frame). */
  door?: { hinge: Vec3; out: Vec3 };
  run?: string;
  /** Its own material (a filler set by hand: KitchenFloorPlan.fillerLook), else the fronts'. */
  material?: string;
  /** Not square at its ends (a worktop and its return cut at 45°): its outline seen from the front, along axis `along` and up (kitchen frame), drawn through the box's depth. */
  profile?: { along: 0 | 1; points: [number, number][] };
  /** Not square seen from above (a rounded end, a corner unit cut at 45°): its outline (kitchen frame, x y), up its height. */
  outline?: [number, number][];
  /** A board of the carcass (a corner unit cut at 45°, a rounded end): the carcass's material, not the fronts'. */
  carcass?: boolean;
}

export interface KitchenLayout {
  units: KitchenUnit[];
  boxes: KitchenBox[];
  /** What was left out for the room (a door, a low ceiling) and the advice on the work triangle. */
  notes: string[];
  ergonomics: { ok: string[]; warn: string[] };
}

/** The units of a run of `length`: as many 600 as fit, then the widest module that fits, and the rest (filler). */
export function splitRun(length: number): { widths: number[]; filler: number } {
  const widths: number[] = Array.from({ length: Math.max(0, Math.floor(length / PREFERRED)) }, () => PREFERRED);
  let rest = length - widths.length * PREFERRED;
  const fits = [...MODULES].reverse().find((w) => w <= rest + 1e-9);
  if (fits) {
    widths.push(fits);
    rest -= fits;
  }
  return { widths, filler: Number(rest.toFixed(3)) };
}

const runsOf = (s: KitchenSettings): RunWall[] => (s.layout === "I" ? ["A"] : s.layout === "L" ? ["A", "B"] : ["A", "B", "C"]);
const cornerOf = (s: KitchenSettings) => s.baseDepth + s.frontThickness + CORNER_GAP;
const lengthOf = (s: KitchenSettings, r: RunWall) => (r === "A" ? s.lengthA : r === "B" ? s.lengthB : (s.lengthC ?? s.lengthB));
/** Where the columns go: the free end of wall A, or of wall B in a U. */
const columnRun = (s: KitchenSettings): RunWall => (s.layout === "U" ? "B" : "A");
const columns = (s: KitchenSettings) => (s.appliances ? (s.fridge ? 1 : 0) + (s.ovenColumn ? 1 : 0) : 0);

/** The usable stretch of a run, between its corners (and a corner unit) and its columns. */
function bounds(s: KitchenSettings, r: RunWall): [number, number] {
  const c = cornerOf(s);
  const unit = s.corner === "unit" ? CORNER_DOOR : 0;
  const L = lengthOf(s, r);
  const start = r === "A" ? (s.layout === "I" ? 0 : c + unit) : c;
  const end = (r === "A" && s.layout === "U" ? L - c - unit : L) - (r === columnRun(s) ? columns(s) * COLUMN : 0);
  return [start, end];
}

export function kitchenProblem(s: KitchenSettings): string | null {
  for (const r of runsOf(s)) {
    const [a, b] = bounds(s, r);
    if (!(b - a >= MODULES[0]!)) return `Le mur ${r} est trop court pour un meuble (au moins ${Math.ceil(MODULES[0]! + a + lengthOf(s, r) - b)} mm).`;
  }
  if (!(s.baseDepth >= 300 && s.baseDepth <= 700)) return "La profondeur des meubles bas va de 300 à 700 mm.";
  if (!(s.plinth >= 0 && s.baseHeight - s.plinth >= 300)) return "Les meubles bas doivent avoir au moins 300 mm au-dessus du socle.";
  if (!(s.worktopThickness > 0)) return "L'épaisseur du plan de travail doit être positive.";
  if (s.wallUnits && !(s.wallHeight >= WALL_UNIT.bottom + WALL_UNIT.height)) return `Le plafond est trop bas pour des meubles hauts (au moins ${WALL_UNIT.bottom + WALL_UNIT.height} mm).`;
  if (s.island && !(s.island >= MODULES[0]! && s.island <= s.lengthA)) return "L'îlot va de 30 cm à la longueur du mur A.";
  if (s.appliances && (s.fridge || s.ovenColumn) && s.wallHeight < WALL_UNIT.bottom + WALL_UNIT.height) return "Le plafond est trop bas pour une colonne.";
  return null;
}

function frontsFor(style: KitchenSettings["fronts"], width: number, index: number): KitchenUnit["layout"] {
  const doors = width > PREFERRED ? "doors" : "door";
  if (style === "doors") return doors;
  if (style === "drawers") return "drawers";
  return index % 2 === 0 ? "drawers" : doors;
}

/** The front-left-bottom corner a cabinet turned this way has, from its footprint (low and high corners). */
export function originOf(rotation: KitchenUnit["rotation"], lo: Vec3, hi: Vec3): Vec3 {
  if (rotation === 0) return [lo[0], lo[1], lo[2]];
  if (rotation === 90) return [hi[0], lo[1], lo[2]];
  if (rotation === 180) return [hi[0], hi[1], lo[2]];
  return [lo[0], hi[1], lo[2]];
}

/** Everything of the kitchen: units (base, wall, island), boxes, and what was said about the room. */
export function kitchenLayout(s: KitchenSettings, room?: Partial<Record<RunWall, RunInfo>>): KitchenLayout {
  const out: KitchenLayout = { units: [], boxes: [], notes: [], ergonomics: { ok: [], warn: [] } };
  if (kitchenProblem(s)) return out;
  const D = s.baseDepth;
  const T = s.frontThickness;
  const H = s.baseHeight;
  const LA = s.lengthA;
  const top = H + s.worktopThickness;
  const depthTop = D + T + OVERHANG;
  const corner = cornerOf(s);
  const WB = WALL_UNIT.bottom;
  const WT = WB + WALL_UNIT.height;
  /** Wall units, with their run and where they start along it (the hood takes the place of one). */
  const highs: { u: KitchenUnit; run: RunWall; at: number }[] = [];
  /** A box between `p` and `q` along run r, from `a` to `b` off its wall, from z0 to z1 (kitchen frame). */
  const band = (r: RunWall, p: number, q: number, a: number, b: number, z0: number, z1: number): [Vec3, Vec3] =>
    r === "A" ? [[p, -b, z0], [q, -a, z1]] : r === "B" ? [[a, -q, z0], [b, -p, z1]] : [[LA - b, -q, z0], [LA - a, -p, z1]];
  const rotation: Record<RunWall, KitchenUnit["rotation"]> = { A: 0, B: 90, C: 270 };
  const unit = (r: RunWall, name: string, p: number, w: number, depth: number, z: number, height: number, rest: Pick<KitchenUnit, "plinth" | "shelves" | "layout"> & Partial<Pick<KitchenUnit, "drawers" | "side" | "span">>): KitchenUnit => {
    const [lo, hi] = band(r, p, p + w, 0, depth, z, z + height);
    return { name, origin: originOf(rotation[r], lo, hi), rotation: rotation[r], width: w, height, depth, ...rest };
  };
  const box = (name: string, kind: KitchenBox["kind"], [from, to]: [Vec3, Vec3], extra: Partial<KitchenBox> = {}) => out.boxes.push({ name, from, to, kind, ...extra });
  /** An appliance of the library filling its box, turned as the cabinets of its run. */
  const put = (r: RunWall, name: string, model: string, at: [Vec3, Vec3], finish = "inox") => box(name, "appliance", at, { appliance: { model, finish, rotation: rotation[r] } });
  const slots: (Slot & { unit: KitchenUnit; stretch: number })[] = [];
  const worktops: { run: RunWall; box: KitchenBox }[] = [];

  for (const r of runsOf(s)) {
    const info = room?.[r];
    const spans = info?.spans ?? [];
    const ceiling = info?.ceiling ?? (() => s.wallHeight);
    const L = lengthOf(s, r);
    const [start, end] = bounds(s, r);
    const cornerStart = r !== "A" || s.layout !== "I";
    const cornerEnd = r === "A" && s.layout === "U";
    for (const sp of spans) if (sp.to > start && sp.from < end) out.notes.push(sp.bottom < top ? `Rien devant ${sp.what} (de ${Math.round(sp.from)} à ${Math.round(sp.to)} mm sur le mur ${r}).` : `Pas de meuble haut devant ${sp.what}.`);
    if (ceiling(0) < top) out.notes.push(`Le plafond du mur ${r} est trop bas près du mur pour des meubles bas.`);
    // Base units, stretch by stretch between the doors (and the windows that come down under the worktop).
    const stretches = ceiling(0) < top ? [] : freeStretches(spans, start, end, 0, top, DOOR_MARGIN);
    stretches.forEach(([p0, q0], k) => {
      const run = splitRun(q0 - p0);
      let p = p0;
      run.widths.forEach((w) => {
        const n = out.units.filter((u) => u.name.startsWith(`Bas ${r}`)).length;
        const u = unit(r, `Bas ${r}${n + 1}`, p, w, D, 0, H, { plinth: s.plinth, shelves: 1, layout: frontsFor(s.fronts, w, n) });
        out.units.push(u);
        const mid = band(r, p + w / 2, p + w / 2, D + T, D + T, 0, 0)[0];
        const first = p === p0;
        const last = p + w >= q0 - run.filler - 1e-6;
        slots.push({ run: r, at: p, width: w, middle: [mid[0], mid[1]], unit: u, stretch: k, window: spans.some((sp) => sp.bottom > 0 && Math.min(sp.to, p + w) - Math.max(sp.from, p) > w / 2), edge: (first && !(p0 === start && cornerStart)) || (last && !(q0 === end && cornerEnd)) });
        p += w;
      });
      if (run.filler >= MIN_FILLER) box(`Fileur ${r}${k ? k + 1 : ""}`, "filler", band(r, p, p + run.filler, D, D + T, s.plinth, H));
      // The worktop over the stretch, on to the corner (wall A's covers the corners, B's and C's stop at its edge).
      const from = p0 === start && cornerStart ? (r === "A" ? 0 : depthTop) : p0;
      const to = q0 === end && cornerEnd ? L : q0;
      const [wFrom, wTo] = band(r, from, to, 0, depthTop, H, top);
      const wt: KitchenBox = { name: `Plan de travail ${r}${k ? k + 1 : ""}`, from: wFrom, to: wTo, kind: "worktop", holes: [], front: r === "A" ? [0, -1, 0] : r === "B" ? [1, 0, 0] : [-1, 0, 0] };
      out.boxes.push(wt);
      worktops.push({ run: r, box: wt });
      if (s.splashback) {
        // Up to the wall units (or 60 cm), and only up to the sill under a window: one piece per height.
        const windows = spans.filter((sp) => sp.bottom > 0 && sp.from < to && sp.to > from);
        const cuts = [...new Set([from, to, ...windows.flatMap((sp) => [sp.from, sp.to]).filter((x) => x > from && x < to)])].sort((a, b) => a - b);
        const full = s.wallUnits && ceiling(0) >= WT ? WB : top + 600;
        let n = 0;
        for (let i = 0; i + 1 < cuts.length; i++) {
          const [a, b] = [cuts[i]!, cuts[i + 1]!];
          const z1 = Math.min(full, ...windows.filter((sp) => sp.from < b && sp.to > a).map((sp) => sp.bottom));
          if (z1 - top >= 20) box(`Crédence ${r}${k ? k + 1 : ""}${n++ ? `-${n}` : ""}`, "splashback", band(r, a, b, 0, 10, top, z1));
        }
      }
      if (s.kick && s.plinth > 3) box(`Plinthe ${r}${k ? k + 1 : ""}`, "kick", band(r, p0, q0, D + T - 16, D + T, 0, s.plinth - 3));
    });
    // Wall units, stretch by stretch between the windows and doors, under a ceiling high enough.
    if (s.wallUnits && ceiling(0) < WT) out.notes.push(`Pas de meubles hauts sur le mur ${r} : le plafond y descend à ${Math.round(ceiling(0))} mm (retombée ou rampant).`);
    else if (s.wallUnits) {
      // Wall units run on into a corner unit's place (they are not as deep).
      freeStretches(spans, cornerStart ? corner : start, end, WB, WT, DOOR_MARGIN).forEach(([p0, q0]) => {
        let p = p0;
        for (const w of splitRun(q0 - p0).widths) {
          const n = highs.filter((h) => h.run === r).length;
          highs.push({ run: r, at: p, u: unit(r, `Haut ${r}${n + 1}`, p, w, WALL_UNIT.depth, WB, WALL_UNIT.height, { plinth: 0, shelves: 1, layout: w > PREFERRED ? "doors" : "door" }) });
          p += w;
        }
      });
    }
    if (!room) {
      const t = WALL_THICKNESS;
      const wall: Record<RunWall, [Vec3, Vec3]> = {
        A: [[s.layout === "I" ? 0 : -t, 0, 0], [LA + (s.layout === "U" ? t : 0), t, s.wallHeight]],
        B: [[-t, -s.lengthB, 0], [0, 0, s.wallHeight]],
        C: [[LA, -lengthOf(s, "C"), 0], [LA + t, 0, s.wallHeight]],
      };
      box(`Mur ${r}`, "wall", wall[r]);
    }
  }

  // The corners: dead and closed in the planes of both runs' fronts, or a corner unit along wall A.
  const corners: { at: "start" | "end"; other: RunWall }[] = s.layout === "I" ? [] : s.layout === "L" ? [{ at: "start", other: "B" }] : [{ at: "start", other: "B" }, { at: "end", other: "C" }];
  for (const c of corners) {
    const [p, q] = c.at === "start" ? [0, corner] : [LA - corner, LA];
    if (s.corner === "unit") {
      const [u0, u1] = c.at === "start" ? [0, corner + CORNER_DOOR] : [LA - corner - CORNER_DOOR, LA];
      const [d0, d1] = c.at === "start" ? [corner + 1.5, corner + CORNER_DOOR - 1.5] : [LA - corner - CORNER_DOOR + 1.5, LA - corner - 1.5];
      // Its door beside the panel, its fronts, hung on its edge away from the corner (wall A runs along X, its fronts face −Y).
      out.units.push(unit("A", `Meuble d'angle ${c.other}`, u0, u1 - u0, D, 0, H, { plinth: s.plinth, shelves: 1, layout: "door", side: c.at === "start" ? "right" : "left", span: [d0 - u0, d1 - u0] }));
      box(`Panneau d'angle ${c.other}`, "panel", band("A", p, q, D, D + T, s.plinth, H));
    } else box(`Fileur d'angle A${c.at === "end" ? " (droite)" : ""}`, "filler", band("A", c.at === "start" ? D : LA - corner, c.at === "start" ? corner : LA - D, D, D + T, s.plinth, H));
    box(`Fileur d'angle ${c.other}`, "filler", band(c.other, D + T, corner, D, D + T, s.plinth, H));
  }

  // The island, facing wall A across the passage, centred on it.
  if (s.island) {
    const passage = s.passage ?? 1000;
    const yFront = -(D + T) - passage;
    const x0 = (LA - s.island) / 2;
    const run = splitRun(s.island);
    let x = x0 + run.filler / 2;
    run.widths.forEach((w, i) => {
      out.units.push({ name: `Îlot ${i + 1}`, origin: [x + w, yFront - T, 0], rotation: 180, width: w, height: H, depth: D, plinth: s.plinth, shelves: 1, layout: frontsFor(s.fronts, w, i) });
      x += w;
    });
    box("Plan de travail îlot", "worktop", [[x0 - OVERHANG, yFront - T - D - OVERHANG, H], [x0 + s.island + OVERHANG, yFront + OVERHANG, top]]);
    if (s.kick && s.plinth > 3) box("Plinthe îlot", "kick", [[x0 + run.filler / 2, yFront - 16, 0], [x0 + s.island - run.filler / 2, yFront, s.plinth - 3]]);
  }

  // Appliances: sink, dishwasher, hob (oven under it), hood; the columns at the free end.
  const places: { sink?: [number, number]; hob?: [number, number]; fridge?: [number, number] } = {};
  const checks: Parameters<typeof ergonomics>[1] = s.island ? { islandPassage: s.passage ?? 1000 } : {};
  if (s.appliances) {
    const roles = placeAppliances(slots);
    const hole = (slot: (typeof slots)[number], appliance: string) => {
      const wt = worktops.find((w) => w.run === slot.run && band(slot.run, slot.at + slot.width / 2, slot.at + slot.width / 2, depthTop / 2, depthTop / 2, 0, 0)[0].every((c, i) => i === 2 || (c >= w.box.from[i]! - 1e-6 && c <= w.box.to[i]! + 1e-6)));
      wt?.box.holes?.push({ appliance, at: band(slot.run, slot.at + slot.width / 2, slot.at + slot.width / 2, depthTop / 2, depthTop / 2, top, top)[0] });
    };
    if (roles.sink !== undefined) {
      const sl = slots[roles.sink]!;
      Object.assign(sl.unit, { name: `Évier ${sl.unit.name}`, shelves: 0, top: "rails", layout: sl.width > PREFERRED ? "doors" : "door" });
      hole(sl, sl.width >= 800 ? "sink-1" : "sink-under");
      places.sink = sl.middle;
    }
    if (roles.dishwasher !== undefined) {
      const sl = slots[roles.dishwasher]!;
      out.units.splice(out.units.indexOf(sl.unit), 1);
      const dw = sl.width >= 598 ? 598 : 448;
      put(sl.run, "Lave-vaisselle", "dishwasher-builtin", band(sl.run, sl.at + (sl.width - dw) / 2, sl.at + (sl.width + dw) / 2, D - 550, D, H - 5 - 815, H - 5));
      box("Façade lave-vaisselle", "panel", band(sl.run, sl.at + 1.5, sl.at + sl.width - 1.5, D, D + T, s.plinth, H - 3));
      checks.dishwasherBySink = true;
    } else if (roles.sink !== undefined) checks.dishwasherBySink = false;
    if (roles.hob !== undefined) {
      const sl = slots[roles.hob]!;
      const mid = sl.at + sl.width / 2;
      hole(sl, sl.width >= 900 ? "hob-90" : sl.width >= 800 ? "hob-80" : "hob-60");
      const hw = sl.width >= 900 ? 900 : sl.width >= 800 ? 780 : 590;
      put(sl.run, "Plaque de cuisson", "hob-induction", band(sl.run, mid - hw / 2, mid + hw / 2, depthTop / 2 - 260, depthTop / 2 + 260, top - 49, top + 6), "black");
      places.hob = sl.middle;
      [checks.hobAtEdge, checks.hobUnderWindow] = [sl.edge, sl.window];
      const ovenTop = H - 20;
      if (!s.ovenColumn && ovenTop - 595 >= s.plinth + 18) {
        Object.assign(sl.unit, { name: `Four ${sl.unit.name}`, shelves: 0, layout: "none" });
        put(sl.run, "Four", "oven-pyro", band(sl.run, sl.at + (sl.width - 595) / 2, sl.at + (sl.width + 595) / 2, D - 548, D, ovenTop - 595, ovenTop));
        box("Bandeau sous four", "panel", band(sl.run, sl.at + 1.5, sl.at + sl.width - 1.5, D, D + T, s.plinth, ovenTop - 597));
      } else Object.assign(sl.unit, { name: `Plaque ${sl.unit.name}`, layout: "drawers" });
      // The hood instead of the wall unit over the hob, its duct up to the ceiling.
      const ceiling = room?.[sl.run]?.ceiling(0) ?? s.wallHeight;
      const over = highs.find((h) => h.run === sl.run && mid > h.at && mid < h.at + h.u.width);
      if (over) highs.splice(highs.indexOf(over), 1);
      put(sl.run, "Hotte", "hood-chimney", band(sl.run, sl.at + 1, sl.at + sl.width - 1, 0, 500, top + 650, Math.max(top + 900, ceiling)));
    }
    // The columns, side by side at the free end of their run.
    const cr = columnRun(s);
    let p = bounds(s, cr)[1];
    const colH = WT;
    if (s.fridge) {
      out.units.push(unit(cr, "Colonne réfrigérateur", p, COLUMN, D, 0, colH, { plinth: s.plinth, shelves: 0, layout: "door" }));
      const m = band(cr, p + COLUMN / 2, p + COLUMN / 2, D + T, D + T, 0, 0)[0];
      places.fridge = [m[0], m[1]];
      p += COLUMN;
    }
    if (s.ovenColumn) {
      out.units.push(unit(cr, "Colonne four", p, COLUMN, D, 0, colH, { plinth: s.plinth, shelves: 0, layout: "none" }));
      put(cr, "Four (colonne)", "oven-pyro", band(cr, p + (COLUMN - 595) / 2, p + (COLUMN + 595) / 2, D - 548, D, 900, 1495));
      box("Porte basse colonne four", "panel", band(cr, p + 1.5, p + COLUMN - 1.5, D, D + T, s.plinth, 897));
      box("Porte haute colonne four", "panel", band(cr, p + 1.5, p + COLUMN - 1.5, D, D + T, 1498, colH - 1.5));
    }
    if (!s.fridge) out.notes.push("Sans colonne réfrigérateur, le triangle d'activité n'est pas vérifié.");
  }
  out.ergonomics = ergonomics(places, checks);
  out.units.push(...highs.map((h) => h.u));
  return out;
}
