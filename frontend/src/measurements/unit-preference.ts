/**
 * L'unité d'affichage est une préférence de l'utilisateur, la même pour tous ses projets (retenue par le navigateur) :
 * centimètres par défaut. La géométrie reste en millimètres ; seul l'affichage et la saisie changent.
 */
import type { DisplayUnit } from "../document/types";

const KEY = "cao.units";
const UNITS: readonly DisplayUnit[] = ["mm", "cm", "m", "in"];
export const DEFAULT_UNIT: DisplayUnit = "cm";

export function preferredUnit(): DisplayUnit {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && (UNITS as readonly string[]).includes(stored)) return stored as DisplayUnit;
  } catch {
    // No storage: the default.
  }
  return DEFAULT_UNIT;
}

export function setPreferredUnit(unit: DisplayUnit): void {
  try {
    localStorage.setItem(KEY, unit);
  } catch {
    // Not remembered: only this visit.
  }
}
