/**
 * Les angles d'un plan de cuisine, comme un cuisiniste les propose, choisis angle par angle :
 * - l'angle mort, fermé par deux fileurs : la place de l'angle est perdue ;
 * - le meuble d'angle à étagère, sur le linéaire qui passe : un panneau devant l'angle et une porte de 45 cm ;
 * - le meuble d'angle LeMans : le même caisson, ses deux plateaux pivotent et sortent, tout l'angle sert ;
 * - le meuble d'angle en L, 90 × 90 : un caisson sur chaque mur, une porte pliante qui ouvre l'angle en grand.
 * La porte du meuble d'angle et les côtés du L se règlent, angle par angle. En haut, dans la rangée des meubles hauts :
 * rien, un haut d'angle à porte (un panneau devant l'angle, une porte de 30 cm) ou un haut d'angle en L (60 × 60), réglables
 * de même.
 * Pour chaque bout de linéaire dans un angle : son caisson, ses façades (fileur, panneau, porte) et les plateaux, le long
 * du linéaire depuis sa gauche, que la cuisine 3D (kitchen-plan-build.ts) et la bande de face (app/kitchen-run-strip.ts)
 * dessinent. Pur.
 */
import { FRONT, cornerDoor, cornerKind, jointOf, kitchenSizes, lArm, wallArm, wallCorner, wallCornerDoor, wallCornerKind, type CornerKind, type Joint, type KitchenRun, type WallCornerKind } from "./kitchen-plan-shapes";
import type { KitchenFloorPlan } from "./types";

export const CORNER_KINDS: Record<CornerKind, { label: string; summary: string }> = {
  dead: { label: "Angle mort", summary: "Fermé par deux fileurs. Le moins cher ; la place de l'angle est perdue." },
  unit: { label: "Meuble d'angle à étagère", summary: "Une porte (45 cm d'origine) et une étagère ; le fond de l'angle se range de loin." },
  lemans: { label: "Meuble d'angle LeMans", summary: "Une porte (45 cm d'origine), deux plateaux qui pivotent et sortent : tout l'angle sert." },
  l: { label: "Meuble d'angle en L", summary: "Un caisson sur chaque mur (90 cm d'origine), porte pliante : l'angle s'ouvre en grand." },
};

export const WALL_CORNER_KINDS: Record<WallCornerKind, { label: string; summary: string }> = {
  none: { label: "Rien en haut", summary: "Les meubles hauts s'arrêtent avant l'angle." },
  unit: { label: "Haut d'angle à porte", summary: "Un panneau devant l'angle et une porte (30 cm d'origine), sur le mur qui passe." },
  l: { label: "Haut d'angle en L", summary: "Un caisson sur chaque mur (60 cm d'origine), porte pliante." },
};

/** A corner's settings, as the plan keeps them. */
/** What a run's editor sets beside its units: the corners, and whether the run keeps its worktop. */
export type CornerSetting = Pick<KitchenFloorPlan, "corners" | "wallCorners" | "cornerSizes" | "noWorktop">;
export interface CornerChange {
  kind?: CornerKind;
  wall?: WallCornerKind;
  door?: number;
  arm?: number;
  wallDoor?: number;
  wallArm?: number;
}

/** The corner settings with this corner changed. */
export function withCorner(p: CornerSetting, joint: Joint, c: CornerChange): CornerSetting {
  const sizes = { ...p.cornerSizes?.[joint], ...(c.door !== undefined ? { door: c.door } : {}), ...(c.arm !== undefined ? { arm: c.arm } : {}), ...(c.wallDoor !== undefined ? { wallDoor: c.wallDoor } : {}), ...(c.wallArm !== undefined ? { wallArm: c.wallArm } : {}) };
  return {
    corners: { ...p.corners, ...(c.kind ? { [joint]: c.kind } : {}) },
    wallCorners: { ...p.wallCorners, ...(c.wall ? { [joint]: c.wall } : {}) },
    cornerSizes: { ...p.cornerSizes, [joint]: sizes },
  };
}

/** What each size of a corner may be (mm). */
export function cornerLimits(p: KitchenFloorPlan): Record<"door" | "arm" | "wallDoor" | "wallArm", [number, number]> {
  const s = kitchenSizes(p);
  return { door: [300, 600], arm: [s.cabinet + 150, 1200], wallDoor: [250, 600], wallArm: [p.wallDepth + 150, 1000] };
}

export interface CornerFront {
  kind: "filler" | "blind" | "door";
  name: string;
  from: number;
  to: number;
}

/** What an end of a run in a corner has: its cabinet (none: a dead corner), its fronts, the trays of a LeMans. */
export interface CornerSide {
  kind: CornerKind | WallCornerKind;
  name: string;
  cabinet: [number, number] | null;
  shelves: number;
  fronts: CornerFront[];
  trays: [number, number][];
}

/** The corner at this end of the run, or null at a free end; a corner unit `off` the wall, a wall filler between. */
export function cornerSide(p: KitchenFloorPlan, run: KitchenRun, side: Joint, off = 0): CornerSide | null {
  const end = run[side];
  if (end === "free") return null;
  const s = kitchenSizes(p);
  const [D, c, L] = [s.cabinet, s.corner, run.length];
  const joint = jointOf(run, side);
  const kind = cornerKind(p, joint);
  const door = cornerDoor(p, joint);
  /** From the corner's wall into the run, mirrored at its right end. */
  const span = (a: number, b: number): [number, number] => (side === "left" ? [a, b] : [L - b, L - a]);
  const tag = `${run.id}${side === "right" ? " (droite)" : ""}`;
  const front = (k: CornerFront["kind"], name: string, a: number, b: number): CornerFront => {
    const [from, to] = span(a, b);
    return { kind: k, name: `${name} ${tag}`, from, to };
  };
  const out: CornerSide = { kind, name: `${CORNER_KINDS[kind].label} ${tag}`, cabinet: null, shelves: 0, fronts: [], trays: [] };
  if (kind === "l") {
    const arm = lArm(p, joint);
    out.cabinet = span(end === "pass" ? 0 : D, arm);
    out.name = `Meuble d'angle en L ${tag}`;
    out.shelves = 1;
    out.fronts.push(front("door", "Porte pliante", D + FRONT + 1.5, arm - 1.5));
  } else if (end === "pass" && kind !== "dead") {
    const o = off >= 1 ? off : 0;
    if (o) out.fronts.push(front("filler", "Fileur mural", 0, o));
    out.cabinet = span(o, o + c + door);
    out.name = `${kind === "lemans" ? "Meuble d'angle LeMans" : "Meuble d'angle"} ${tag}`;
    out.shelves = kind === "lemans" ? 0 : 1;
    out.fronts.push(front("blind", "Panneau d'angle", o, o + c), front("door", "Porte d'angle", o + c + 1.5, o + c + door - 1.5));
    if (kind === "lemans") out.trays.push(span(o + c - 300, o + c + door - 30), span(o + c - 300, o + c + door - 30));
  } else {
    out.fronts.push(front("filler", "Fileur d'angle", end === "pass" ? D : D + FRONT, c));
  }
  return out;
}

/** The corner at this end of the run up in the wall row, or null: nothing there, a free end, no wall behind. */
export function wallCornerSide(p: KitchenFloorPlan, run: KitchenRun, side: Joint): CornerSide | null {
  const end = run[side];
  if (end === "free" || !run.wall) return null;
  const joint = jointOf(run, side);
  const kind = wallCornerKind(p, joint);
  if (kind === "none") return null;
  const [W, wc, L] = [p.wallDepth, wallCorner(p), run.length];
  const span = (a: number, b: number): [number, number] => (side === "left" ? [a, b] : [L - b, L - a]);
  const tag = `${run.id}${side === "right" ? " (droite)" : ""}`;
  const front = (k: CornerFront["kind"], name: string, a: number, b: number): CornerFront => {
    const [from, to] = span(a, b);
    return { kind: k, name: `${name} ${tag}`, from, to };
  };
  const out: CornerSide = { kind, name: `${WALL_CORNER_KINDS[kind].label} ${tag}`, cabinet: null, shelves: 2, fronts: [], trays: [] };
  if (kind === "l") {
    const arm = wallArm(p, joint);
    out.cabinet = span(end === "pass" ? 0 : W, arm);
    out.name = `Haut d'angle en L ${tag}`;
    out.fronts.push(front("door", "Porte pliante haute", W + FRONT + 1.5, arm - 1.5));
  } else if (end === "pass") {
    const door = wallCornerDoor(p, joint);
    out.cabinet = span(0, wc + door);
    out.name = `Haut d'angle ${tag}`;
    out.fronts.push(front("blind", "Panneau d'angle haut", 0, wc), front("door", "Porte d'angle haute", wc + 1.5, wc + door - 1.5));
  } else out.fronts.push(front("filler", "Fileur d'angle haut", W + FRONT, wc));
  return out;
}

const WALL = 'class="stroke-gray-500 dark:stroke-gray-400" stroke-width="5" stroke-linecap="square"';
const UNIT = 'class="fill-gray-100 stroke-gray-400 dark:fill-gray-700 dark:stroke-gray-500" stroke-width="1"';
const PICK = 'fill="var(--corner, #b08d57)" fill-opacity="0.35" stroke="var(--corner, #b08d57)" stroke-width="1.5"';
const DOOR = 'fill="none" stroke="var(--corner, #b08d57)" stroke-width="1.5" stroke-dasharray="3 2"';

/** The corner seen from above, walls at the top and on the left (SVG, 64 × 64): what each kind looks like. */
export function cornerSketch(kind: CornerKind): string {
  const d = 22;
  const parts = [`<path d="M2 62 V2 H62" fill="none" ${WALL}/>`];
  // The other units of both runs, past the corner.
  const reach = kind === "l" ? 40 : 26;
  const top = kind === "unit" || kind === "lemans" ? 44 : reach;
  parts.push(`<rect x="${top}" y="4" width="${60 - top}" height="${d}" ${UNIT}/>`, `<rect x="4" y="${reach}" width="${d}" height="${60 - reach}" ${UNIT}/>`);
  if (kind === "dead") parts.push(`<rect x="4" y="4" width="${d}" height="${d}" class="fill-gray-300 dark:fill-gray-600"/>`, `<path d="M6 6 L${d + 2} ${d + 2} M${d + 2} 6 L6 ${d + 2}" class="stroke-gray-500" stroke-width="1"/>`);
  if (kind === "unit" || kind === "lemans") {
    parts.push(`<rect x="4" y="4" width="40" height="${d}" ${PICK}/>`, `<path d="M26 ${d + 4} A18 18 0 0 0 44 ${d + 22}" ${DOOR}/>`);
    if (kind === "lemans") parts.push(`<ellipse cx="33" cy="15" rx="9" ry="6" fill="none" stroke="var(--corner, #b08d57)" stroke-width="1.2"/>`, `<ellipse cx="33" cy="${d + 16}" rx="9" ry="6" fill="none" stroke="var(--corner, #b08d57)" stroke-width="1.2" stroke-dasharray="2 2"/>`);
    else parts.push(`<line x1="8" y1="15" x2="40" y2="15" stroke="var(--corner, #b08d57)" stroke-width="1"/>`);
  }
  if (kind === "l") {
    parts.push(`<path d="M4 4 H40 V${d + 4} H${d + 4} V40 H4 Z" ${PICK}/>`, `<path d="M${d + 4} ${d + 4} L40 ${d + 16} M${d + 4} ${d + 4} L${d + 16} 40" ${DOOR}/>`);
  }
  return `<svg viewBox="0 0 64 64" class="size-11 shrink-0" aria-hidden="true">${parts.join("")}</svg>`;
}
