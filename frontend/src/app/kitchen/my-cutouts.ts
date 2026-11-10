/**
 * « Mes découpes » : les découpes de plan de travail qu'on garde avec leurs cotes — celles de la notice d'un évier ou
 * d'une plaque (largeur, profondeur, rayon des angles, distance au bord avant) —, sous un nom, pour les reposer d'un
 * clic dans tous les projets. Gardées par le navigateur.
 */
import { APPLIANCES, type Cutout } from "../../features/worktop-cutouts";

const KEY = "cao.my-cutouts";

export interface MyCutout extends Omit<Cutout, "along"> {
  name: string;
}

const mm = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 5000;

/** What is kept, read again: only what is whole. */
export function myCutouts(): MyCutout[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is MyCutout => {
      if (typeof c !== "object" || c === null) return false;
      const { name, appliance, size, diameter, radius, front } = c as Record<string, unknown>;
      return typeof name === "string" && name.length > 0 && name.length <= 80 && APPLIANCES.some((a) => a.id === appliance)
        && (size === undefined || (Array.isArray(size) && size.length === 2 && size.every(mm))) && (diameter === undefined || mm(diameter))
        && (radius === undefined || (typeof radius === "number" && radius >= 0 && radius <= 2500)) && (front === null || typeof front === "number");
    });
  } catch {
    return [];
  }
}

function write(list: MyCutout[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // No storage: kept for nothing.
  }
}

/** Kept under its name (one of that name is replaced). */
export function keepMyCutout(cut: MyCutout): void {
  write([...myCutouts().filter((c) => c.name !== cut.name), cut]);
}

export function forgetMyCutout(name: string): void {
  write(myCutouts().filter((c) => c.name !== name));
}
