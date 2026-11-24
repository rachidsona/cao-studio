/**
 * Les meubles d'un linéaire qui ne trouvent pas de place : un meuble ajouté qui ne tient pas est refusé, avec la place
 * qui reste ; ceux qui sont déjà dans le linéaire sans y tenir (ajoutés avant, ou le mur raccourci depuis) sont listés
 * sous « À revoir », chacun avec son bouton pour le retirer — on ne les voit pas sur la bande, ils ne sont pas bâtis.
 */
import type { DisplayUnit, KitchenRunItem } from "../../document/types";
import { isSpace, itemEntry, rowOf, widestRoom, type RunFill } from "../../features/kitchen-run-items";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";

const SMALL = "h-6 border border-gray-300 px-1.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/**
 * Why this unit, just put on the run (`fill`: the run with it, `before`: without), finds no room there: it does not
 * stand, or it pushes out one that stood. Null when all is well.
 */
export function noRoomFor(fill: RunFill, item: KitchenRunItem, unit: DisplayUnit, before: RunFill): string | null {
  const was = new Set(before.missing.map((i) => i.id));
  // Room kept free left over (a run grown shorter since): no unit, nothing lost.
  if (!fill.missing.some((i) => !was.has(i.id) && !isSpace(i))) return null;
  const entry = itemEntry(item);
  const row = rowOf(entry);
  const room = widestRoom(before, row);
  const left = room >= 1 ? `il reste ${formatLength(Math.floor(room), unit)} au plus ${row === "wall" ? "en haut" : "en bas"}` : row === "wall" ? "le haut est plein" : "le bas est plein";
  return `« ${entry.name} » de ${formatLength(item.width, unit)} ne tient pas sur ce linéaire : ${left}. Choisissez une largeur plus petite (« Autre… », « Place libre ») ou retirez un meuble.`;
}

/** The units of the run that find no room, each with its button to take it off the run, and one for them all. */
export function missingRows(given: RunFill, unit: DisplayUnit, remove: (ids: string[]) => void): HTMLElement[] {
  // Room kept free that no longer fits is no unit to look at.
  const fill = { ...given, missing: given.missing.filter((i) => !isSpace(i)) };
  if (!fill.missing.length) return [];
  const rows = fill.missing.map((item) => {
    const b = el("button", { type: "button", class: SMALL, "data-missing-remove": item.id, title: "Retirer ce meuble du linéaire" }, "Retirer");
    b.addEventListener("click", () => remove([item.id]));
    return el("div", { class: "flex items-center gap-1" }, el("span", { class: "flex-1" }, `${itemEntry(item).name} · ${formatLength(item.width, unit)} : sans place, pas bâti`), b);
  });
  if (fill.missing.length < 2) return rows;
  const all = el("button", { type: "button", class: `${SMALL} w-full`, "data-missing-remove-all": "" }, `Retirer les ${fill.missing.length} meubles sans place`);
  all.addEventListener("click", () => remove(fill.missing.map((i) => i.id)));
  return [...rows, all];
}
