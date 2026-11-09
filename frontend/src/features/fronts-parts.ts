/**
 * Façades d'un caisson, en géométrie pure (sans noyau : sert aussi à nommer les corps et à compter la quincaillerie).
 * - En applique (« overlay »), les façades couvrent le chant avant du caisson, devant lui ; encastrées (« inset »),
 *   elles sont dans l'ouverture, au nu du caisson. Un jeu sépare les façades entre elles et du bord.
 * - Une porte, deux portes, ou n tiroirs de même hauteur ; chaque tiroir a son caisson (deux côtés, avant, arrière,
 *   fond) monté sur coulisses de 12,5 mm de chaque côté, sa longueur arrondie aux longueurs de coulisses du commerce.
 * - Quincaillerie : charnières à boîtier Ø35 (2 à 4 selon la hauteur de la porte), poignées entraxe 128 mm.
 */
import type { CabinetFeature, FrontsFeature, Vec3 } from "../document/types";
import { cabinetProblem } from "./cabinet-parts";

export interface FrontPart {
  name: string;
  from: Vec3;
  to: Vec3;
  /** Door (hinged on its left or right edge) or drawer front: where its hardware goes. */
  role?: { kind: "door"; hinge: "left" | "right" } | { kind: "drawer" };
}

/** Commercial slide lengths (mm). */
export const SLIDES = [250, 300, 350, 400, 450, 500, 550, 600];
export const SLIDE_PLAY = 12.5;
export const DRAWER_SIDE = 16;
export const DRAWER_BOTTOM = 8;

export function frontsProblem(f: Pick<FrontsFeature, "layout" | "drawers" | "gap" | "thickness">, cabinet: CabinetFeature | undefined): string | null {
  if (!cabinet || cabinet.type !== "cabinet") return "Choisissez le caisson à habiller.";
  const problem = cabinetProblem(cabinet);
  if (problem) return problem;
  if (!(f.thickness > 0)) return "L'épaisseur des façades doit être positive.";
  if (!(f.gap >= 0)) return "Le jeu ne peut pas être négatif.";
  if (f.layout === "drawers" && (!Number.isInteger(f.drawers) || f.drawers < 1 || f.drawers > 8)) return "De 1 à 8 tiroirs.";
  return null;
}

/** Hinges a door of this height needs. */
export function hingeCount(height: number): number {
  return height < 900 ? 2 : height < 1600 ? 3 : 4;
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
  // The area the fronts cover, and where they sit in depth.
  const [x0, x1, z0, z1] = inset ? [t + g, W - t - g, p + t + g, H - t - g] : [g / 2, W - g / 2, p + g / 2, H - g / 2];
  const [y0, y1] = inset ? [0, T] : [-T, 0];
  const parts: FrontPart[] = [];
  const box = (name: string, a: [number, number, number], b: [number, number, number], role?: FrontPart["role"]) =>
    parts.push({ name, from: [ox + a[0], oy + a[1], oz + a[2]], to: [ox + b[0], oy + b[1], oz + b[2]], ...(role ? { role } : {}) });

  if (f.layout === "door") box("Porte", [x0, y0, z0], [x1, y1, z1], { kind: "door", hinge: f.side ?? "left" });
  else if (f.layout === "doors") {
    const mid = (x0 + x1) / 2;
    box("Porte gauche", [x0, y0, z0], [mid - g / 2, y1, z1], { kind: "door", hinge: "left" });
    box("Porte droite", [mid + g / 2, y0, z0], [x1, y1, z1], { kind: "door", hinge: "right" });
  } else {
    const n = f.drawers;
    const h = (z1 - z0 - (n - 1) * g) / n;
    const bt = cabinet.back === "none" ? 0 : cabinet.backThickness;
    const room = D - bt - (inset ? T : 0) - 10;
    const length = [...SLIDES].reverse().find((l) => l <= room) ?? Math.max(100, Math.floor(room / 10) * 10);
    const [bx0, bx1] = [t + SLIDE_PLAY, W - t - SLIDE_PLAY];
    for (let i = 0; i < n; i++) {
      // Drawers numbered from the top.
      const top = z1 - i * (h + g);
      const bottom = top - h;
      const k = i + 1;
      box(`Façade tiroir ${k}`, [x0, y0, bottom], [x1, y1, top], { kind: "drawer" });
      // The box behind: 20 mm above the lower edge of the opening it uses, 30 mm lower than the front.
      const zb = Math.max(bottom, p + t) + 10;
      const height = Math.max(60, Math.min(h - 30, top - 15 - zb));
      const [ya, yb] = [inset ? T + 2 : 2, (inset ? T + 2 : 2) + length];
      box(`Tiroir ${k} — côté gauche`, [bx0, ya, zb], [bx0 + DRAWER_SIDE, yb, zb + height]);
      box(`Tiroir ${k} — côté droit`, [bx1 - DRAWER_SIDE, ya, zb], [bx1, yb, zb + height]);
      box(`Tiroir ${k} — avant`, [bx0 + DRAWER_SIDE, ya, zb + DRAWER_BOTTOM], [bx1 - DRAWER_SIDE, ya + DRAWER_SIDE, zb + height]);
      box(`Tiroir ${k} — arrière`, [bx0 + DRAWER_SIDE, yb - DRAWER_SIDE, zb + DRAWER_BOTTOM], [bx1 - DRAWER_SIDE, yb, zb + height]);
      box(`Tiroir ${k} — fond`, [bx0 + DRAWER_SIDE, ya + DRAWER_SIDE, zb], [bx1 - DRAWER_SIDE, yb - DRAWER_SIDE, zb + DRAWER_BOTTOM]);
    }
  }
  return parts;
}

export function frontsPartNames(f: FrontsFeature, cabinet: CabinetFeature | undefined): string[] {
  return frontsParts(f, cabinet).map((p) => p.name);
}

/** Default material of each part: the cabinet's for the fronts, birch plywood for the drawer boxes, HDF bottoms. */
export function frontsMaterials(f: FrontsFeature, cabinet: CabinetFeature | undefined, cabinetMaterial = "melamine-white"): string[] {
  return frontsParts(f, cabinet).map((p) => (p.role ? cabinetMaterial : p.name.endsWith("fond") ? "hdf" : "birch-plywood"));
}

/** Hardware of the fronts: hinges, slide pairs, handles (to buy, and in the quote). */
export function frontsHardware(f: FrontsFeature, cabinet: CabinetFeature | undefined): { name: string; quantity: number }[] {
  const parts = frontsParts(f, cabinet);
  const doors = parts.filter((p) => p.role?.kind === "door");
  const drawers = parts.filter((p) => p.role?.kind === "drawer");
  const out: { name: string; quantity: number }[] = [];
  const hinges = f.hinges ? doors.reduce((n, d) => n + hingeCount(d.to[2] - d.from[2]), 0) : 0;
  if (hinges) out.push({ name: "Charnière à boîtier Ø35", quantity: hinges });
  if (drawers.length) out.push({ name: "Coulisse de tiroir (paire)", quantity: drawers.length });
  if (f.handles && doors.length + drawers.length) out.push({ name: "Poignée entraxe 128 mm", quantity: doors.length + drawers.length });
  return out;
}
