/**
 * Une largeur cliquée sur la bande d'un linéaire, changée dans la calculatrice (ui/calculator.ts) : celle d'un meuble,
 * dans ses limites ; celle de la porte d'un meuble d'angle, en bas ou en haut — la porte d'un angle à étagère, ou la
 * porte pliante d'un angle en L, dont le bras suit. Une valeur hors limites est refusée, avec ses bornes. Pur, hors la
 * calculatrice.
 */
import { cornerLimits, withCorner, type CornerSetting } from "../../document/kitchen-corners";
import { cornerKind, FRONT, jointOf, kitchenSizes, wallCornerKind, type KitchenRun } from "../../document/kitchen-plan-shapes";
import type { DisplayUnit, KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import { itemEntry, sizeLimits } from "../../features/kitchen-run-items";
import { formatLength } from "../../measurements/units";
import { openCalculator } from "../../ui/calculator";
import type { StripEdit } from "./kitchen-run-strip";

/** What a caisson furnished by hand may be made to on the strip (mm): its Répartition is made again at that width. */
const HELD_WIDTH: [number, number] = [150, 2400];
/** The gaps around a corner door (mm): its front is its size less them. */
const DOOR_GAPS = 3;

export interface StripEditHost {
  plan: KitchenFloorPlan;
  run: KitchenRun;
  items: KitchenRunItem[];
  unit: DisplayUnit;
  /** The run's items changed. */
  setItems(items: KitchenRunItem[]): void;
  /** A corner's sizes changed. */
  setCorners(c: CornerSetting): void;
}

/** What a width typed makes: the items or the corner settings, or why not. */
export function stripWidth(host: Omit<StripEditHost, "setItems" | "setCorners">, what: StripEdit, mm: number): { items: KitchenRunItem[] } | { corners: CornerSetting } | string {
  const { plan, run, unit } = host;
  const range = ([lo, hi]: [number, number]) => `de ${formatLength(lo, unit)} à ${formatLength(hi, unit)}`;
  if (what.kind === "item") {
    const item = host.items.find((i) => i.id === what.id);
    if (!item) return "Ce meuble n'est plus sur le linéaire.";
    const limits = item.furnished ? HELD_WIDTH : sizeLimits(plan, itemEntry(item)).width;
    if (mm < limits[0] - 0.05 || mm > limits[1] + 0.05) return `La largeur va ${range(limits)}.`;
    return { items: host.items.map((i) => (i.id === item.id ? { ...i, width: Math.round(mm * 10) / 10 } : i)) };
  }
  const joint = jointOf(run, what.side);
  const s = kitchenSizes(plan);
  const ell = what.row === "base" ? ["l", "lcase"].includes(cornerKind(plan, joint)) : wallCornerKind(plan, joint) === "l";
  // An L's folding door (a caisson in L's too): its arm is the door and the depth before it; another corner: its door, less its gaps.
  const key = what.row === "base" ? (ell ? "arm" : "door") : ell ? "wallArm" : "wallDoor";
  const extra = ell ? (what.row === "base" ? s.cabinet : plan.wallDepth) + FRONT + DOOR_GAPS : DOOR_GAPS;
  const limits = cornerLimits(plan)[key];
  const size = Math.round((mm + extra) * 10) / 10;
  if (size < limits[0] - 0.05 || size > limits[1] + 0.05) return `La porte va ${range([limits[0] - extra, limits[1] - extra])}.`;
  return { corners: withCorner(plan, joint, { [key]: size }) };
}

/** The calculator beside the width clicked; a refusal says why, and leaves it open. */
export function editStripWidth(host: StripEditHost, what: StripEdit, label: Element): void {
  const { left, top, width, height } = label.getBoundingClientRect();
  openCalculator({
    container: document.body,
    anchor: { x: left + width / 2, y: top + height / 2 },
    value: what.width,
    unit: host.unit,
    title: what.kind === "item" ? "Largeur du meuble" : "Largeur de la porte d'angle",
    locked: false,
    noLock: true,
    inputAttrs: { "data-strip-width": "" },
    onSubmit: (mm) => {
      const made = stripWidth(host, what, mm);
      if (typeof made === "string") return made;
      if ("items" in made) host.setItems(made.items);
      else host.setCorners(made.corners);
      return true;
    },
  });
}
