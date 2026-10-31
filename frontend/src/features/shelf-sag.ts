/**
 * Flèche des étagères, en calcul pur : une planche horizontale posée sur ses deux bouts (taquets, côtés) et chargée
 * régulièrement sur toute sa longueur fléchit de 5·q·L⁴ / (384·E·I), I = b·h³ / 12 ; avec le temps, les panneaux de
 * particules et de fibres « fluent » et la flèche grandit (facteur kdef, valeurs courantes de l'Eurocode 5 en
 * intérieur). On compare la flèche à long terme à une limite (portée / 200 par défaut : un creux qu'on ne voit pas), et
 * on propose l'épaisseur du commerce qui suffit et la portée la plus longue à l'épaisseur actuelle.
 */
import type { Vec3 } from "../document/types";

/** Bending stiffness (MPa) and creep factor of the workshop's materials; an unknown one is taken as particleboard. */
export const STIFFNESS: Record<string, { E: number; kdef: number }> = {
  "melamine-white": { E: 2500, kdef: 2.25 },
  "melamine-oak": { E: 2500, kdef: 2.25 },
  "melamine-walnut": { E: 2500, kdef: 2.25 },
  "melamine-anthracite": { E: 2500, kdef: 2.25 },
  mdf: { E: 3000, kdef: 2.25 },
  "lacquer-white": { E: 3000, kdef: 2.25 },
  "birch-plywood": { E: 7000, kdef: 0.8 },
  "solid-oak": { E: 11000, kdef: 0.6 },
  hdf: { E: 4000, kdef: 2.25 },
};
const DEFAULT_STIFFNESS = { E: 2500, kdef: 2.25 };

/** What a shelf carries, per metre of its length. */
export const LOADS = [
  { id: "books", label: "Livres, dossiers (25 kg par mètre)", kgPerM: 25 },
  { id: "dishes", label: "Vaisselle, bocaux (15 kg par mètre)", kgPerM: 15 },
  { id: "clothes", label: "Linge plié (10 kg par mètre)", kgPerM: 10 },
  { id: "light", label: "Objets légers (5 kg par mètre)", kgPerM: 5 },
] as const;

/** Thicknesses found at the timber merchant's (mm). */
export const THICKNESSES = [16, 18, 19, 22, 25, 30, 38];

/** Sag (mm) of a board of span L, depth b, thickness h (mm) under q kg per metre: at once, and in the long run. */
export function sag(L: number, b: number, h: number, material: string | undefined, kgPerM: number): { instant: number; longTerm: number } {
  const { E, kdef } = STIFFNESS[material ?? ""] ?? DEFAULT_STIFFNESS;
  const q = (kgPerM * 9.81) / 1000; // N/mm
  const I = (b * h ** 3) / 12;
  const instant = (5 * q * L ** 4) / (384 * E * I);
  return { instant, longTerm: instant * (1 + kdef) };
}

export interface ShelfCheck {
  span: number;
  depth: number;
  thickness: number;
  /** Long-run sag and its limit (mm). */
  sag: number;
  limit: number;
  ok: boolean;
  /** The thinnest thickness of the trade that holds (null: none up to 38 mm), and the longest span that holds now. */
  thicknessNeeded: number | null;
  maxSpan: number;
}

/** Is this box a horizontal board (thinnest along the height)? */
export function isHorizontalBoard([lo, hi]: [Vec3, Vec3]): boolean {
  const s = [0, 1, 2].map((i) => hi[i]! - lo[i]!);
  return s[2]! > 0 && s[2]! < s[0]! && s[2]! < s[1]!;
}

/** The check of a horizontal board, its span along its longer side, for a load and a limit (span / ratio). */
export function shelfCheck([lo, hi]: [Vec3, Vec3], material: string | undefined, kgPerM: number, ratio = 200): ShelfCheck {
  const [sx, sy] = [hi[0] - lo[0], hi[1] - lo[1]];
  const span = Math.max(sx, sy);
  const depth = Math.min(sx, sy);
  const thickness = hi[2] - lo[2];
  const now = sag(span, depth, thickness, material, kgPerM).longTerm;
  const limit = span / ratio;
  const thicknessNeeded = THICKNESSES.find((h) => sag(span, depth, h, material, kgPerM).longTerm <= limit) ?? null;
  // Sag grows as L⁴ and the limit as L: the span that holds is where they meet.
  const maxSpan = span * Math.cbrt(limit / Math.max(now, 1e-9));
  return { span, depth, thickness, sag: now, limit, ok: now <= limit, thicknessNeeded, maxSpan };
}
