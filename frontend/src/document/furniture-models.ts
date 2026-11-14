/**
 * Les meubles de l'« Assistant meuble », en calcul pur : meuble TV, bibliothèque, bureau, bureau d'angle, banc
 * d'entrée, tête de lit et lit. Chacun, à la largeur, la hauteur et la profondeur demandées, est fait de caissons — des Répartitions, avec
 * leurs étagères, leurs tiroirs et leurs portes (document/caisson-spec.ts), qui se retouchent ensuite avec les outils
 * du dressing — et de planches libres (le plateau d'un bureau, le panneau d'une tête de lit). Le nombre de cases et
 * d'étagères suit les cotes. Tout est dit dans le repère du meuble : x en largeur depuis sa gauche, y en profondeur
 * depuis son dos, z depuis le sol ; il regarde vers l'avant (y croissant).
 */
import type { CaissonSpec } from "./caisson-spec";
import { DOOR_DEFAULTS } from "./joinery-defaults";
import type { NicheRecipe } from "./niche-recipe";
import type { DividerKind, PartitionParams, ShelfParams } from "./sketch";
import type { Vec3 } from "./types";

export type FurnitureKind = "tv" | "bookcase" | "desk" | "corner" | "bench" | "headboard" | "bed";

export interface FurnitureAsk {
  kind: FurnitureKind;
  width: number;
  height: number;
  depth: number;
  /** Thickness of its panels (mm). */
  thickness: number;
  /** The variant chosen among the model's (FurnitureModel.options). */
  option: string;
}

export interface FurnitureModel {
  kind: FurnitureKind;
  label: string;
  /** Its usual size, and the sizes it can be made at (mm). */
  size: { width: number; height: number; depth: number };
  limits: { width: [number, number]; height: [number, number]; depth: [number, number] };
  /** What the variants are about, and each of them (the first is the usual one). */
  choice: string;
  options: [string, string][];
  what: string;
}

export const FURNITURE: FurnitureModel[] = [
  { kind: "tv", label: "Meuble TV", size: { width: 1800, height: 450, depth: 400 }, limits: { width: [900, 3000], height: [300, 700], depth: [300, 600] }, choice: "Extrémités", options: [["doors", "Portes"], ["drawers", "Tiroirs"], ["open", "Ouvertes"]], what: "Un meuble bas : une case tous les 60 cm environ, celles des extrémités fermées, celles du milieu ouvertes avec une étagère." },
  { kind: "bookcase", label: "Bibliothèque", size: { width: 1600, height: 2000, depth: 300 }, limits: { width: [400, 3600], height: [700, 2700], depth: [200, 500] }, choice: "Bas du meuble", options: [["open", "Ouvert"], ["drawers", "Tiroirs en bas"], ["doors", "Portes sur tout"]], what: "Une colonne tous les 80 cm environ, une étagère tous les 35 cm environ." },
  { kind: "desk", label: "Bureau", size: { width: 1400, height: 750, depth: 600 }, limits: { width: [900, 2400], height: [650, 800], depth: [450, 900] }, choice: "Caisson à tiroirs", options: [["left", "À gauche"], ["right", "À droite"]], what: "Un plateau sur un caisson de trois tiroirs et un pied plein, avec un voile de fond." },
  { kind: "corner", label: "Bureau d'angle", size: { width: 1600, height: 750, depth: 1400 }, limits: { width: [1200, 2400], height: [650, 800], depth: [1000, 2000] }, choice: "Retour", options: [["right", "À droite"], ["left", "À gauche"]], what: "Un plateau en L contre deux murs (la profondeur est la longueur du retour) : un caisson de trois tiroirs au bout du retour, un pied plein à l'autre bout, un voile de fond." },
  { kind: "bench", label: "Banc d'entrée", size: { width: 1000, height: 450, depth: 380 }, limits: { width: [600, 2000], height: [380, 550], depth: [300, 500] }, choice: "Cases", options: [["open", "Ouvertes (chaussures)"], ["drawers", "Tiroirs"], ["doors", "Portes"]], what: "Un banc où s'asseoir : une case tous les 40 cm environ, avec une étagère pour les chaussures." },
  { kind: "headboard", label: "Tête de lit", size: { width: 2400, height: 1100, depth: 350 }, limits: { width: [900, 3200], height: [800, 1500], depth: [250, 500] }, choice: "Chevets", options: [["with", "Deux chevets"], ["without", "Sans chevet"]], what: "Un panneau derrière le lit, coiffé d'une tablette, et deux chevets à un tiroir à ses extrémités (la profondeur est celle des chevets)." },
  { kind: "bed", label: "Lit", size: { width: 1640, height: 400, depth: 2040 }, limits: { width: [900, 2000], height: [300, 550], depth: [1900, 2250] }, choice: "Dessous", options: [["plain", "Simple"], ["drawers", "Tiroirs au pied"]], what: "Un cadre de lit (deux côtés, une traverse de tête et une de pied) et un fond pour le sommier, 6 cm sous le haut du cadre ; ou des tiroirs au pied, sous le fond (la largeur et la longueur sont celles du cadre)." },
];

export const furnitureModel = (kind: FurnitureKind): FurnitureModel => FURNITURE.find((m) => m.kind === kind)!;

/** One caisson of the furniture: where its bottom-left-back corner stands, its outside size, what it is made of. */
export interface FurniturePiece {
  name: string;
  at: Vec3;
  width: number;
  height: number;
  spec: CaissonSpec;
}

/** A free board: a box between two corners. */
export interface FurnitureBoard {
  name: string;
  from: Vec3;
  to: Vec3;
}

export interface FurnitureLayout {
  pieces: FurniturePiece[];
  boards: FurnitureBoard[];
}

/** Thickness of the backs, in HDF (mm). */
export const BACK = 8;
/** The top of a desk, at least this thick (mm). */
const DESK_TOP = 25;
const PEDESTAL = 420;
const BEDSIDE = { width: 450, height: 450, drawer: 150 };
/** A corner desk's tops (mm deep); the drawers' caisson stands this deep under the end of its return. */
const CORNER_TOP = 600;
const PEDESTAL_DEPTH = 470;
/** The bed's base sits this far under the top of its frame (the mattress in it); its drawers this deep. */
const SINK = 60;
const BED_DRAWERS = 600;
const SHELF = 150;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Why this furniture cannot be made at these sizes, or null. */
export function furnitureProblem(ask: FurnitureAsk): string | null {
  const m = furnitureModel(ask.kind);
  if (!m) return "Ce meuble n'existe pas.";
  const cm = (v: number) => `${v / 10} cm`;
  for (const [key, name] of [["width", "largeur"], ["height", "hauteur"], ["depth", "profondeur"]] as const) {
    const [lo, hi] = m.limits[key];
    if (!(ask[key] >= lo && ask[key] <= hi)) return `${m.label} : la ${name} va de ${cm(lo)} à ${cm(hi)}.`;
  }
  if (!(ask.thickness >= 12 && ask.thickness <= 40)) return "L'épaisseur des panneaux va de 12 à 40 mm.";
  if (!m.options.some(([id]) => id === ask.option)) return `${m.label} : choix inconnu.`;
  if (ask.kind === "headboard" && ask.option === "with" && ask.width < 2 * BEDSIDE.width + 800) return `Tête de lit : avec deux chevets, la largeur est d'au moins ${cm(2 * BEDSIDE.width + 800)}.`;
  return null;
}

const shelves = (count: number, thickness: number, mode: ShelfParams["mode"] = "equal", fixed = 300): ShelfParams => ({ count, thickness, mode, fixed });
const drawers = (count: number, thickness: number): NicheRecipe["equipment"][number]["feature"] => ({ type: "niche", fill: "drawers", diameter: 25, drop: 60, drawers: count, gap: 3, bottomGap: 3, betweenGap: 3, sideGap: 3, thickness, handles: true });
const EMPTY: NicheRecipe = { steps: [], equipment: [] };

/** A caisson of `cases` cases (one: two with no side between them), its sides running through. */
function carcass(length: number, height: number, thickness: number, cases: number, plinth: number): PartitionParams {
  const one = cases < 2;
  return { length, height, thickness, cases: one ? 2 : cases, dividers: Array.from({ length: one ? 1 : cases - 1 }, (): DividerKind => (one ? "none" : "single")), boards: true, plinth, outer: "side", single: "board", double: "side" };
}

/** The furniture as caissons and boards, or why it cannot be made. */
export function furnitureLayout(ask: FurnitureAsk): FurnitureLayout | string {
  const problem = furnitureProblem(ask);
  if (problem) return problem;
  const { width: W, height: H, depth: D, thickness: t, option } = ask;
  const doors = { ...DOOR_DEFAULTS, thickness: t };
  const back = { thickness: BACK, split: "whole" as const };
  /** A caisson as deep as the furniture, its back behind its panels. */
  const spec = (input: PartitionParams, cases: NicheRecipe[], more: Partial<CaissonSpec> = {}, depth = D): CaissonSpec => ({ input, depth: depth - BACK, back, cases, ...more });
  switch (ask.kind) {
    case "tv": {
      const n = clamp(Math.round(W / 600), 2, 5);
      // The ends closed (one end only when there are two cases), the middle open.
      const closed = (i: number) => option !== "open" && (i === 0 || (n > 2 && i === n - 1));
      const cases = Array.from({ length: n }, (_, i): NicheRecipe => (closed(i) && option === "drawers" ? { steps: [], equipment: [{ at: [], title: "Tiroirs", feature: drawers(2, t) }] } : { steps: [{ at: [], input: shelves(1, t) }], equipment: [] }));
      const open = Array.from({ length: n }, (_, i) => i).filter((i) => !closed(i));
      const fronts = option === "doors" ? { doors: { ...doors, skipped: open, hinges: Array.from({ length: n }, (_, i): "left" | "right" => (i === 0 ? "left" : "right")) } } : {};
      return { pieces: [{ name: "Meuble TV", at: [0, 0, 0], width: W, height: H, spec: spec(carcass(W, H, t, n, 60), cases, fronts) }], boards: [] };
    }
    case "bookcase": {
      const n = Math.max(1, Math.round(W / 800));
      const plinth = 80;
      const inner = H - plinth - 2 * t;
      const count = Math.max(1, Math.round(inner / 350) - 1);
      const zone = 380;
      const column: NicheRecipe = option === "drawers" && inner > zone + 400
        ? { steps: [{ at: [], input: shelves(1, t, "bottom", zone) }, ...(count > 1 ? [{ at: [1], input: shelves(count - 1, t) }] : [])], equipment: [{ at: [0], title: "Tiroirs", feature: drawers(2, t) }] }
        : { steps: [{ at: [], input: shelves(count, t) }], equipment: [] };
      return { pieces: [{ name: "Bibliothèque", at: [0, 0, 0], width: W, height: H, spec: spec(carcass(W, H, t, n, plinth), Array.from({ length: n }, () => structuredClone(column)), option === "doors" ? { doors } : {}) }], boards: [] };
    }
    case "desk": {
      const top = Math.max(t, DESK_TOP);
      const under = H - top;
      const wide = Math.min(PEDESTAL, W / 2 - t);
      // The pedestal and the leg 20 mm behind the front edge of the top.
      const deep = D - 20;
      const left = option !== "right";
      const [px, lx] = left ? [0, W - t] : [W - wide, 0];
      const [vx0, vx1] = left ? [wide, W - t] : [t, W - wide];
      return {
        pieces: [{ name: "Caisson du bureau", at: [px, 0, 0], width: wide, height: under, spec: spec(carcass(wide, under, t, 1, 0), [{ steps: [], equipment: [{ at: [], title: "Tiroirs", feature: drawers(3, t) }] }], {}, deep) }],
        boards: [
          { name: "Plateau", from: [0, 0, under], to: [W, D, H] },
          { name: "Pied", from: [lx, 0, 0], to: [lx + t, deep, under] },
          { name: "Voile de fond", from: [vx0, 0, under - Math.min(350, under / 2)], to: [vx1, t, under] },
        ],
      };
    }
    case "corner": {
      const top = Math.max(t, DESK_TOP);
      const under = H - top;
      const T = CORNER_TOP;
      const right = option !== "left";
      const wide = Math.min(PEDESTAL, T - 2 * 20);
      // The return along the side wall, out to the depth asked; its drawers at its far end, facing the front.
      const [rx0, rx1] = right ? [W - T, W] : [0, T];
      const px = rx0 + (T - wide) / 2;
      const lx = right ? 0 : W - t;
      const [vx0, vx1] = right ? [t, W - T] : [T, W - t];
      return {
        pieces: [{ name: "Caisson du bureau", at: [px, D - 20 - PEDESTAL_DEPTH, 0], width: wide, height: under, spec: spec(carcass(wide, under, t, 1, 0), [{ steps: [], equipment: [{ at: [], title: "Tiroirs", feature: drawers(3, t) }] }], {}, PEDESTAL_DEPTH) }],
        boards: [
          { name: "Plateau", from: [0, 0, under], to: [W, T, H] },
          { name: "Retour", from: [rx0, T, under], to: [rx1, D, H] },
          { name: "Pied", from: [lx, 0, 0], to: [lx + t, T - 20, under] },
          { name: "Voile de fond", from: [vx0, 0, under - Math.min(350, under / 2)], to: [vx1, t, under] },
        ],
      };
    }
    case "bed": {
      const base = H - SINK;
      const boards: FurnitureBoard[] = [
        { name: "Côté gauche", from: [0, 0, 0], to: [t, D, H] },
        { name: "Côté droit", from: [W - t, 0, 0], to: [W, D, H] },
        { name: "Traverse de tête", from: [t, 0, 0], to: [W - t, t, H] },
        ...(option === "drawers" ? [] : [{ name: "Traverse de pied", from: [t, D - t, 0] as Vec3, to: [W - t, D, H] as Vec3 }]),
        { name: "Fond du sommier", from: [t, t, base - t], to: [W - t, option === "drawers" ? D : D - t, base] },
      ];
      if (option !== "drawers") return { pieces: [], boards };
      // Under the base at the foot, their fronts flush with it.
      const n = clamp(Math.round((W - 2 * t) / 800), 1, 3);
      const inside: NicheRecipe = { steps: [], equipment: [{ at: [], title: "Tiroirs", feature: drawers(1, t) }] };
      return { pieces: [{ name: "Tiroirs du lit", at: [t, D - BED_DRAWERS, 0], width: W - 2 * t, height: base - t, spec: spec(carcass(W - 2 * t, base - t, t, n, 0), Array.from({ length: n }, () => structuredClone(inside)), {}, BED_DRAWERS) }], boards };
    }
    case "bench": {
      const n = clamp(Math.round(W / 400), 2, 5);
      const inside: NicheRecipe = option === "drawers" ? { steps: [], equipment: [{ at: [], title: "Tiroirs", feature: drawers(1, t) }] } : { steps: [{ at: [], input: shelves(1, t) }], equipment: [] };
      return { pieces: [{ name: "Banc d'entrée", at: [0, 0, 0], width: W, height: H, spec: spec(carcass(W, H, t, n, 0), Array.from({ length: n }, () => structuredClone(inside)), option === "doors" ? { doors } : {}) }], boards: [] };
    }
    case "headboard": {
      const boards: FurnitureBoard[] = [
        { name: "Panneau de tête de lit", from: [0, 0, 0], to: [W, t, H - t] },
        { name: "Tablette", from: [0, 0, H - t], to: [W, SHELF, H] },
      ];
      if (option !== "with") return { pieces: [], boards };
      // A drawer over an open niche, in front of the panel, at each end.
      const bedside: NicheRecipe = { steps: [{ at: [], input: shelves(1, t, "top", BEDSIDE.drawer) }], equipment: [{ at: [1], title: "Tiroirs", feature: drawers(1, t) }] };
      const piece = (name: string, x: number): FurniturePiece => ({ name, at: [x, t, 0], width: BEDSIDE.width, height: BEDSIDE.height, spec: spec(carcass(BEDSIDE.width, BEDSIDE.height, t, 1, 0), [structuredClone(bedside)]) });
      return { pieces: [piece("Chevet gauche", 0), piece("Chevet droit", W - BEDSIDE.width)], boards };
    }
  }
  return EMPTY && "Ce meuble n'existe pas.";
}

/** How deep the furniture stands from its back to its front, and how wide and high (mm). */
export function furnitureSize(ask: FurnitureAsk): Vec3 {
  return [ask.width, ask.kind === "headboard" && ask.option === "with" ? ask.thickness + ask.depth : ask.kind === "headboard" ? SHELF : ask.depth, ask.height];
}
