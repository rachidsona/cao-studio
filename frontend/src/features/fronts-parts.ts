/**
 * Façades d'un caisson, en géométrie pure (sans noyau : sert aussi à nommer les corps et à compter la quincaillerie).
 * - En applique (« overlay »), les façades couvrent le chant avant du caisson, devant lui ; encastrées (« inset »),
 *   elles sont dans l'ouverture, au nu du caisson. Un jeu sépare les façades entre elles et du bord.
 * - Une porte, deux portes, ou n tiroirs de même hauteur ; chaque tiroir a son caisson (deux côtés, avant, arrière,
 *   fond) monté sur coulisses de 12,5 mm de chaque côté, sa longueur arrondie aux longueurs de coulisses du commerce.
 * - Quincaillerie : charnières à boîtier Ø35 (2 à 4 selon la hauteur de la porte), poignées entraxe 128 mm.
 * - Porte relevable (charnières en haut, tenue ouverte par une paire de compas choisie selon son poids et sa hauteur)
 *   ou abattant (charnières en bas, retenu par une paire de compas) : une porte seule, ses charnières le long du chant.
 * - Sans poignée (« gorge ») : chaque façade laisse 30 mm de prise de main au-dessus de son chant haut, devant un
 *   profilé alu en retrait, sur toute la largeur du caisson (sous le dessus pour la façade du haut) : les côtés sont
 *   entaillés à l'avant pour le recevoir (gorgeNotches, que le noyau creuse : features/cabinet.ts). Il s'achète au mètre.
 * - Porte à cadre (panneau en retrait, usinée dans la masse), cannelée ou à tasseaux (rainures verticales dans sa face
 *   avant, door-decor.ts) : une seule planche, débitée comme une porte plate.
 * - Porte vitrée : la porte est le cadre en profilé alu, son verre une pièce à part après les façades (« Vitre … »),
 *   au milieu de l'épaisseur, qui pivote avec elle ; charnières pour cadre alu (glass-door.ts).
 * - Une ou deux portes sous un tiroir (`topDrawer` : la hauteur de sa façade, en haut du caisson) ; et des tiroirs à
 *   l'anglaise (`innerDrawers`) derrière les portes, sans façade, en retrait des charnières, en bas du caisson.
 */
import type { CabinetFeature, CabinetNotch, CadDocument, FrontsFeature, Vec3 } from "../document/types";
import { cabinetProblem } from "./cabinet-parts";
import { ALU_HINGE, glassFrame, glassHardware, glassPane, glassProblem, isGlass, woodFrame } from "./glass-door";
import { decorProblem } from "./door-decor";

export interface FrontPart {
  name: string;
  from: Vec3;
  to: Vec3;
  /** Door (hinged on its left or right edge, or along its top or bottom) or drawer front: where its hardware goes. */
  role?: { kind: "door"; hinge: "left" | "right" | "top" | "bottom" } | { kind: "drawer" };
  /** The glass of a glazed door: the index of its door (it turns with it). */
  of?: number;
  /** A gorge profile: bought by the metre, fixed to the cabinet (it does not move with a front). */
  gorge?: boolean;
}

/**
 * A handleless front: the finger space left above its top edge, and the recessed profile behind it — its height
 * (`space` of it in the gap, the rest behind the top of the front) and how deep it sits in the cabinet (mm).
 */
export const GORGE = { space: 30, height: 57, depth: 26 };
export const GORGE_PROFILE = "Profil gorge alu (m)";

/** A door hinged along its top (lift-up) or its bottom (flap), not on a side. */
export const swingsUp = (f: Pick<FrontsFeature, "layout" | "side">) => f.layout === "door" && (f.side === "top" || f.side === "bottom");

/**
 * The stays of a lift-up door, by its power factor — its height (mm) times its weight (kg), as the makers class
 * them: the strongest factor each class holds. Common guides: the maker's sheet rules.
 */
export const LIFT_CLASSES: readonly { upTo: number; name: string }[] = [
  { upTo: 1600, name: "Compas de porte relevable force 1 (paire)" },
  { upTo: 2800, name: "Compas de porte relevable force 2 (paire)" },
  { upTo: 5200, name: "Compas de porte relevable force 3 (paire)" },
  { upTo: 9000, name: "Compas de porte relevable force 4 (paire)" },
];
export const FLAP_STAY = "Compas d'abattant (paire)";

/** The stays a lift-up door of this height (mm) and weight (kg) needs; null: beyond what a pair holds. */
export function liftStay(height: number, mass: number): { name: string; factor: number } | null {
  const factor = Math.round(height * mass);
  const found = LIFT_CLASSES.find((c) => factor <= c.upTo);
  return found ? { name: found.name, factor } : null;
}

/** Commercial slide lengths (mm). */
export const SLIDES = [250, 300, 350, 400, 450, 500, 550, 600];
export const SLIDE_PLAY = 12.5;
export const DRAWER_SIDE = 16;
export const DRAWER_BOTTOM = 8;
/** An English drawer behind a door: narrower than an outer one by this on each side, clear of the hinges' plates (mm). */
export const INNER_CLEAR = 25;
/** And set back by this behind the door, clear of its hinge cups (mm). */
export const INNER_BACK = 20;

export function frontsProblem(f: Pick<FrontsFeature, "layout" | "drawers" | "gap" | "thickness"> & Partial<Pick<FrontsFeature, "mount" | "style" | "frameWidth" | "frameDepth" | "pitch" | "grip" | "hinges" | "hw" | "side" | "topDrawer" | "innerDrawers">>, cabinet: CabinetFeature | undefined): string | null {
  if (!cabinet || cabinet.type !== "cabinet") return "Choisissez le caisson à habiller.";
  const problem = cabinetProblem(cabinet);
  if (problem) return problem;
  if (!(f.thickness > 0)) return "L'épaisseur des façades doit être positive.";
  if (!(f.gap >= 0)) return "Le jeu ne peut pas être négatif.";
  if (f.layout === "drawers" && (!Number.isInteger(f.drawers) || f.drawers < 1 || f.drawers > 8)) return "De 1 à 8 tiroirs.";
  if ((cabinet.dividers ?? 0) > 0 && (f.layout === "drawers" || f.topDrawer !== undefined || f.innerDrawers !== undefined)) return "Des tiroirs ne passent pas à travers les cloisons du caisson : ôtez les cloisons, ou aménagez-le case par case.";
  if (f.layout !== "drawers" && f.topDrawer !== undefined) {
    if (swingsUp(f as Pick<FrontsFeature, "layout" | "side">)) return "Un tiroir au-dessus d'une porte relevable ou d'un abattant ne se fait pas : une porte sur le côté.";
    const a = frontArea(f, cabinet);
    if (!(f.topDrawer >= 80) || a.z1 - a.z0 - f.topDrawer - a.between < 200) return "La façade du tiroir fait 80 mm au moins, et laisse 200 mm de porte dessous.";
  }
  if (f.layout !== "drawers" && f.innerDrawers !== undefined && (!Number.isInteger(f.innerDrawers) || f.innerDrawers < 1 || f.innerDrawers > 5)) return "De 1 à 5 tiroirs à l'anglaise.";
  if (f.grip === "gorge") {
    if (f.mount === "inset") return "Sans poignée, les façades sont en applique : la gorge est derrière leur chant haut.";
    if (isGlass(f)) return f.layout === "drawers" ? "Un tiroir vitré garde sa poignée : la gorge est pour les façades pleines." : "Une porte vitrée garde sa poignée : la gorge est pour les portes pleines.";
    // Every front keeps 80 mm under its finger space.
    const levels = f.layout === "drawers" ? f.drawers : 1;
    const high = cabinet.height - cabinet.plinth - cabinet.thickness - f.gap / 2 - levels * GORGE.space;
    if (high / levels < 80) return "Le caisson est trop bas pour des façades sans poignée (80 mm de façade au moins sous chaque gorge).";
  }
  // Framed, fluted, slatted or glazed: the style's own limits, on each front.
  if (f.style && f.style !== "flat") {
    // The size of each front, as frontsParts lays them out.
    const a = frontArea(f, cabinet);
    const fronts = f.layout === "drawers" ? [{ width: a.x1 - a.x0, height: a.h }] : [{ width: f.layout === "doors" ? (a.x1 - a.x0 - f.gap) / 2 : a.x1 - a.x0, height: a.z1 - a.z0 }];
    const what = f.layout === "drawers" ? "ces façades de tiroir" : "ces portes";
    if (f.style === "frame") {
      const [fw, d] = [f.frameWidth ?? 70, f.frameDepth ?? 6];
      if (fronts.some((front) => Math.min(front.width, front.height) - 2 * fw < 40)) return `Le cadre est trop large pour ${what}.`;
      if (!(d < f.thickness - 3)) return "Le panneau doit rester épais d'au moins 3 mm : réduisez le retrait.";
      return null;
    }
    // Hinge cups behind a door: the grooves keep clear of them when they would meet.
    const cups = f.layout !== "drawers" && f.hinges ? (f.hw?.cupDepth ?? 13) : 0;
    const glass = glassProblem(f, fronts, f.thickness);
    return decorProblem(f, fronts, f.thickness, cups) ?? (f.layout === "drawers" ? (glass?.replace("Une porte vitrée", "Une façade de tiroir vitrée").replace("ces portes", "ces façades") ?? null) : glass);
  }
  return null;
}

/**
 * Where the fronts of a cabinet go, relative to its origin: the area they cover across (x) and up (z), the height of
 * each drawer front and what lies between two of them (the gap, or a handleless front's finger space).
 */
export function frontArea(f: Pick<FrontsFeature, "layout" | "drawers" | "gap"> & Partial<Pick<FrontsFeature, "mount" | "grip">>, cabinet: CabinetFeature): { x0: number; x1: number; z0: number; z1: number; h: number; between: number } {
  const { width: W, height: H, thickness: t, plinth: p } = cabinet;
  const g = f.gap;
  const gorge = f.grip === "gorge";
  // Handleless: the fronts stop under the top board, a finger space under it.
  const [x0, x1, z0, z1] = f.mount === "inset" ? [t + g, W - t - g, p + t + g, H - t - g] : [g / 2, W - g / 2, p + g / 2, gorge ? H - t - GORGE.space : H - g / 2];
  const between = gorge ? GORGE.space : g;
  const n = f.layout === "drawers" ? f.drawers : 1;
  return { x0, x1, z0, z1, h: (z1 - z0 - (n - 1) * between) / n, between };
}

/** Hinges a door of this height needs. */
export function hingeCount(height: number): number {
  return height < 900 ? 2 : height < 1600 ? 3 : 4;
}

/** What one Ø35 hinge carries, as a common guide (kg). */
export const HINGE_LOAD = 4.5;

/** Hinges a door needs: by its height, and by its weight (kg) when it is known. */
export function hingesFor(height: number, mass = 0): number {
  return Math.max(hingeCount(height), Math.ceil(mass / HINGE_LOAD));
}

/** Half the height of a hinge's mounting plate on the cabinet's side, which a shelf must leave free (mm). */
const PLATE = 25;

/**
 * Heights of the `n` hinges of a door from `z0` to `z1`: 100 mm from its ends and evenly between, each moved by 32 mm
 * steps (the drilling system's) off a shelf (`shelves`: the heights the shelves take) when it would fall on one;
 * `blocked`: those that could not be cleared.
 */
export function hingeHeights(z0: number, z1: number, n: number, shelves: readonly [number, number][] = []): { heights: number[]; blocked: number[] } {
  const free = (z: number) => z >= z0 + 60 && z <= z1 - 60 && shelves.every(([a, b]) => z + PLATE <= a || z - PLATE >= b);
  const blocked: number[] = [];
  const heights = Array.from({ length: n }, (_, k) => z0 + 100 + ((z1 - z0 - 200) * k) / Math.max(1, n - 1)).map((z, k) => {
    if (free(z)) return z;
    const moved = [32, -32, 64, -64, 96, -96].map((d) => z + d).find(free);
    if (moved === undefined) blocked.push(k);
    return moved ?? z;
  });
  return { heights, blocked };
}

/** Every part of the fronts, in body order; none when the cabinet or the settings are impossible. */
export function frontsParts(f: FrontsFeature, cabinet: CabinetFeature | undefined): FrontPart[] {
  if (frontsProblem(f, cabinet) || !cabinet) return [];
  const [ox, oy, oz] = cabinet.origin;
  const { width: W, height: H, depth: D, thickness: t, plinth: p } = cabinet;
  const g = f.gap;
  const T = f.thickness;
  const inset = f.mount === "inset";
  const gorge = f.grip === "gorge";
  // The area the fronts cover, and where they sit in depth.
  const { x0, x1, z0, z1, h, between } = frontArea(f, cabinet);
  const [y0, y1] = inset ? [0, T] : [-T, 0];
  /** The tops of the fronts that have a gorge behind them, from the top one. */
  const gorges: number[] = gorge ? [z1] : [];
  const parts: FrontPart[] = [];
  const box = (name: string, a: [number, number, number], b: [number, number, number], role?: FrontPart["role"]) =>
    parts.push({ name, from: [ox + a[0], oy + a[1], oz + a[2]], to: [ox + b[0], oy + b[1], oz + b[2]], ...(role ? { role } : {}) });

  const bt = cabinet.back === "none" ? 0 : cabinet.backThickness;
  const room = D - bt - (inset ? T : 0) - 10;
  const length = [...SLIDES].reverse().find((l) => l <= room) ?? Math.max(100, Math.floor(room / 10) * 10);
  /** A drawer's box, `k` its name, from `zb` up `height`, between `bx0` and `bx1` across, `back` mm behind the fronts. */
  const drawerBox = (k: string, zb: number, height: number, [bx0, bx1]: [number, number], back = 0) => {
    const [ya, yb] = [(inset ? T + 2 : 2) + back, (inset ? T + 2 : 2) + back + Math.min(length, room - back)];
    box(`Tiroir ${k} — côté gauche`, [bx0, ya, zb], [bx0 + DRAWER_SIDE, yb, zb + height]);
    box(`Tiroir ${k} — côté droit`, [bx1 - DRAWER_SIDE, ya, zb], [bx1, yb, zb + height]);
    box(`Tiroir ${k} — avant`, [bx0 + DRAWER_SIDE, ya, zb + DRAWER_BOTTOM], [bx1 - DRAWER_SIDE, ya + DRAWER_SIDE, zb + height]);
    box(`Tiroir ${k} — arrière`, [bx0 + DRAWER_SIDE, yb - DRAWER_SIDE, zb + DRAWER_BOTTOM], [bx1 - DRAWER_SIDE, yb, zb + height]);
    box(`Tiroir ${k} — fond`, [bx0 + DRAWER_SIDE, ya + DRAWER_SIDE, zb], [bx1 - DRAWER_SIDE, yb - DRAWER_SIDE, zb + DRAWER_BOTTOM]);
  };
  const slides: [number, number] = [t + SLIDE_PLAY, W - t - SLIDE_PLAY];
  // Under a drawer, the doors stop below it.
  const doorTop = f.layout !== "drawers" && f.topDrawer ? z1 - f.topDrawer - between : z1;
  if (f.layout === "door") box(f.side === "top" ? "Porte relevable" : f.side === "bottom" ? "Abattant" : "Porte", [x0, y0, z0], [x1, y1, doorTop], { kind: "door", hinge: f.side ?? "left" });
  else if (f.layout === "doors") {
    const mid = (x0 + x1) / 2;
    box("Porte gauche", [x0, y0, z0], [mid - g / 2, y1, doorTop], { kind: "door", hinge: "left" });
    box("Porte droite", [mid + g / 2, y0, z0], [x1, y1, doorTop], { kind: "door", hinge: "right" });
  }
  if (f.layout !== "drawers") {
    // The glass of each glazed door, after the doors: in the middle of its thickness (along Y).
    if (isGlass(f)) parts.slice().forEach((door, i) => {
      const [from, to] = glassPane(door.from, door.to, 1, glassFrame(f));
      parts.push({ name: `Vitre ${door.name.toLowerCase()}`, from, to, of: i });
    });
    // The drawer over the doors, its finger space between them when handleless.
    if (f.topDrawer) {
      if (gorge) gorges.push(doorTop);
      box("Façade tiroir 1", [x0, y0, doorTop + between], [x1, y1, z1], { kind: "drawer" });
      const zb = doorTop + between + 10;
      drawerBox("1", zb, Math.max(60, Math.min(f.topDrawer - 30, z1 - 15 - zb, gorge ? z1 - (GORGE.height - GORGE.space) - 5 - zb : Infinity)), slides);
    }
    // English drawers: behind the doors, clear of the hinges, from the bottom up.
    const n = f.innerDrawers ?? 0;
    const [zi0, zi1] = [p + t + 10, (f.topDrawer ? doorTop + between : z1) - t - 10];
    for (let i = 0; i < n; i++) {
      const step = (zi1 - zi0) / n;
      drawerBox(`intérieur ${i + 1}`, zi0 + i * step, Math.max(60, Math.min(160, step - 40)), [slides[0] + INNER_CLEAR, slides[1] - INNER_CLEAR], f.hinges ? INNER_BACK : 0);
    }
  } else {
    const n = f.drawers;
    for (let i = 0; i < n; i++) {
      // Drawers numbered from the top.
      const top = z1 - i * (h + between);
      const bottom = top - h;
      const k = i + 1;
      if (gorge && i > 0) gorges.push(top);
      box(`Façade tiroir ${k}`, [x0, y0, bottom], [x1, y1, top], { kind: "drawer" });
      // The box behind: 20 mm above the lower edge of the opening it uses, 30 mm lower than the front.
      const zb = Math.max(bottom, p + t) + 10;
      // Under the profile behind the top of a handleless front.
      const height = Math.max(60, Math.min(h - 30, top - 15 - zb, gorge ? top - (GORGE.height - GORGE.space) - 5 - zb : Infinity));
      drawerBox(String(k), zb, height, slides);
    }
  }
  // The profiles last (the other bodies keep their numbers): the whole width, in the notches of the sides, recessed
  // behind each finger space.
  gorges.forEach((top, i) => parts.push({ name: `Profil gorge ${i + 1}`, from: [ox, oy, oz + top + GORGE.space - GORGE.height], to: [ox + W, oy + GORGE.depth, oz + top + GORGE.space], gorge: true }));
  // The glass of each glazed drawer front, at the very end: in the middle of its thickness, it slides out with its drawer.
  if (f.layout === "drawers" && isGlass(f)) parts.slice().forEach((front, i) => {
    if (front.role?.kind !== "drawer") return;
    const [from, to] = glassPane(front.from, front.to, 1, glassFrame(f));
    parts.push({ name: `Vitre ${front.name.replace(/^Façade /, "")}`, from, to, of: i });
  });
  return parts;
}

/**
 * The notches a cabinet's sides need for the gorge profiles of its fronts: from `z0` to `z1` above its origin, `depth`
 * back from its front. None without handleless fronts (or when they cannot be made).
 */
export function gorgeNotches(f: FrontsFeature, cabinet: CabinetFeature): CabinetNotch[] {
  if (f.grip !== "gorge" || f.suppressed) return [];
  const oz = cabinet.origin[2];
  return frontsParts(f, cabinet).filter((p) => p.gorge).map((p) => ({ z0: p.from[2] - oz, z1: p.to[2] - oz, depth: p.to[1] - p.from[1] }));
}

/** The document with each cabinet carrying the notches of its gorge profiles, for the kernel only. */
export function stampGorges(doc: CadDocument): CadDocument {
  let changed = false;
  const features = doc.features.map((c) => {
    if (c.type !== "cabinet") return c;
    const notches = doc.features.flatMap((f) => (f.type === "fronts" && f.cabinet === c.id ? gorgeNotches(f, c) : []));
    if (!notches.length && !c.notches) return c;
    changed = true;
    const { notches: _old, ...rest } = c;
    return notches.length ? { ...rest, notches } : rest;
  });
  return changed ? { ...doc, features } : doc;
}

export function frontsPartNames(f: FrontsFeature, cabinet: CabinetFeature | undefined): string[] {
  return frontsParts(f, cabinet).map((p) => p.name);
}

/**
 * Default material of each part: the cabinet's for the fronts (and the glass of a glazed door, which is bought and
 * looks like glass all the same), birch plywood for the drawer boxes, HDF bottoms.
 */
export function frontsMaterials(f: FrontsFeature, cabinet: CabinetFeature | undefined, cabinetMaterial = "melamine-white"): string[] {
  return frontsParts(f, cabinet).map((p) => (p.role || p.of !== undefined || p.gorge ? cabinetMaterial : p.name.endsWith("fond") ? "hdf" : "birch-plywood"));
}

/**
 * Hardware of the fronts: hinges, slide pairs, handles, the stays of a lift-up door or of a flap, the gorge profile
 * by the metre (to buy, and in the quote). `mass`: the weight of a door (kg), by its part number, to choose the stays
 * of a lift-up door (missing: the lightest).
 */
export function frontsHardware(f: FrontsFeature, cabinet: CabinetFeature | undefined, mass?: (part: number) => number): { name: string; quantity: number; unit?: string }[] {
  const parts = frontsParts(f, cabinet);
  const doors = parts.filter((p) => p.role?.kind === "door");
  const drawers = parts.filter((p) => p.role?.kind === "drawer");
  const out: { name: string; quantity: number; unit?: string }[] = [];
  const up = swingsUp(f);
  // Along the top or the bottom edge: counted by the width of the door.
  // By the height of each door (its width along the top or the bottom) and by its weight when it is known.
  const hinges = f.hinges ? doors.reduce((n, d) => n + hingesFor(up ? d.to[0] - d.from[0] : d.to[2] - d.from[2], mass?.(parts.indexOf(d)) ?? 0), 0) : 0;
  // A glazed door hangs on hinges made for its aluminium frame; its glass and its profile are bought.
  if (hinges) out.push({ name: isGlass(f) && !woodFrame(f) ? ALU_HINGE : "Charnière à boîtier Ø35", quantity: hinges });
  if (up && doors[0]) {
    const door = doors[0];
    const stay = f.side === "bottom" ? FLAP_STAY : (liftStay(door.to[2] - door.from[2], mass?.(parts.indexOf(door)) ?? 0)?.name ?? LIFT_CLASSES.at(-1)!.name);
    out.push({ name: stay, quantity: 1 });
  }
  // The English drawers behind the doors run on slides too (no front, no handle).
  const inner = f.layout !== "drawers" ? (f.innerDrawers ?? 0) : 0;
  if (drawers.length + inner) out.push({ name: "Coulisse de tiroir (paire)", quantity: drawers.length + inner });
  if (f.handles && f.grip !== "gorge" && doors.length + drawers.length) out.push({ name: "Poignée entraxe 128 mm", quantity: doors.length + drawers.length });
  const profiles = parts.filter((p) => p.gorge);
  if (profiles.length) out.push({ name: GORGE_PROFILE, quantity: Math.round(profiles.reduce((m, p) => m + (p.to[0] - p.from[0]), 0) / 10) / 100, unit: "m" });
  // The glass and the aluminium frame of glazed doors, or of glazed drawer fronts.
  out.push(...glassHardware(f, [...doors, ...drawers].map((d) => ({ from: d.from, to: d.to, depth: 1 as const }))));
  return out;
}
