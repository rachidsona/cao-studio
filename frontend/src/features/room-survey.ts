/**
 * Un relevé de pièce collé tel qu'un télémètre laser le donne (son application exporte du texte ou un CSV) : un mur par
 * ligne, sa longueur, et l'angle de son coin si l'appareil l'a mesuré (90° sinon). Les longueurs se lisent en mètres
 * (« 3,452 m », « 3.452 »), en centimètres (« 345,2 cm ») ou en millimètres (« 3452 », « 3452 mm ») ; une valeur sans
 * unité sous 50 est prise en mètres, au-delà en millimètres. Les colonnes peuvent être séparées par un point-virgule,
 * une tabulation, une virgule (si les décimales ont un point) ou des espaces ; les lignes sans nombre (en-têtes, noms)
 * sont laissées. Pur.
 */
import type { RoomInput } from "./room-plan";

/** Below this, a length with no unit is in metres (mm). */
const METRES_BELOW = 50;
const LENGTH_MIN = 100;
const LENGTH_MAX = 50_000;

/** The numbers of a line with their unit, if any: « 3,452 m » → 3.452 m. */
function values(line: string): { value: number; unit: string }[] {
  // Columns: by semicolons or tabs; by commas when the decimals have a point; else by spaces (a comma is then decimal).
  const fields = /[;\t]/.test(line) ? line.split(/[;\t]/) : line.includes(",") && line.includes(".") ? line.split(",") : line.split(/\s+(?=[-\d])/);
  const out: { value: number; unit: string }[] = [];
  for (const field of fields) {
    const m = field.match(/(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m|°|deg)?(?![a-z])/i);
    if (m) out.push({ value: Number(m[1]!.replace(",", ".")), unit: (m[2] ?? "").toLowerCase() });
  }
  return out;
}

/** A length read as mm, from its unit or its size. */
function millimetres({ value, unit }: { value: number; unit: string }): number {
  if (unit === "m") return value * 1000;
  if (unit === "cm") return value * 10;
  if (unit === "mm") return value;
  return value < METRES_BELOW ? value * 1000 : value;
}

/** The walls of a pasted survey, or why it cannot be read. */
export function parseSurvey(text: string): RoomInput["walls"] | string {
  const walls: RoomInput["walls"] = [];
  for (const raw of text.split(/\r?\n/)) {
    const found = values(raw.trim());
    if (!found.length) continue;
    // A wall's number in front (« 1 ; 3,452 ; 90 », « Mur 2 3452 »): a small whole number before a length.
    const start = found.length >= 2 && Number.isInteger(found[0]!.value) && !found[0]!.unit && found[0]!.value <= 50 && millimetres(found[1]!) >= LENGTH_MIN ? 1 : 0;
    const [length, angle] = [found[start], found[start + 1]];
    if (!length) continue;
    const mm = millimetres(length);
    if (!(mm >= LENGTH_MIN && mm <= LENGTH_MAX)) return `Ligne « ${raw.trim()} » : une longueur de mur va de 10 cm à 50 m.`;
    const deg = angle && (angle.unit === "°" || angle.unit === "deg" || (angle.value > 20 && angle.value < 340 && !angle.unit)) ? angle.value : 90;
    if (!(deg > 0 && deg < 360)) return `Ligne « ${raw.trim()} » : un angle va de 0 à 360°.`;
    walls.push({ length: Math.round(mm), angle: deg });
  }
  if (walls.length < 1) return "Aucune longueur de mur dans ce relevé : une ligne par mur, sa longueur puis l'angle de son coin.";
  if (walls.length > 40) return "40 murs au plus.";
  return walls;
}
