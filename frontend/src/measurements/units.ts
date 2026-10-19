/** Length units. The model is always stored in millimetres; units only affect display and input. */
import type { DisplayUnit } from "../document/types";

export const MM_PER_UNIT: Record<DisplayUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };

export const UNIT_LABELS: Record<DisplayUnit, string> = { mm: "mm", cm: "cm", m: "m", in: "po" };

export function toDisplay(mm: number, unit: DisplayUnit): number {
  return mm / MM_PER_UNIT[unit];
}

export function fromDisplay(value: number, unit: DisplayUnit): number {
  return value * MM_PER_UNIT[unit];
}

/** Formats a length for display with a precision adapted to the unit. */
export function formatLength(mm: number, unit: DisplayUnit): string {
  const digits = unit === "mm" ? 3 : unit === "m" ? 6 : 4;
  return `${trim(toDisplay(mm, unit), digits)} ${UNIT_LABELS[unit]}`;
}

export function formatArea(mm2: number, unit: DisplayUnit): string {
  const factor = MM_PER_UNIT[unit] ** 2;
  return `${trim(mm2 / factor, 3)} ${UNIT_LABELS[unit]}²`;
}

export function formatVolume(mm3: number, unit: DisplayUnit): string {
  const factor = MM_PER_UNIT[unit] ** 3;
  return `${trim(mm3 / factor, 3)} ${UNIT_LABELS[unit]}³`;
}

/** Rounds to `digits` decimals and strips trailing zeros (French decimal comma). */
export function trim(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  return rounded.toLocaleString("fr-FR", { maximumFractionDigits: digits, useGrouping: false });
}

/** Parses user input such as "12,5" or "12.5"; returns null when not a finite number. */
export function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
