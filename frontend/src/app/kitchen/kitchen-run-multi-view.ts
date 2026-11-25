/**
 * « Meubles choisis (n) » dans l'éditeur de linéaire : plusieurs meubles choisis sur la bande (Maj, Ctrl ou ⌘ + clic, ou
 * « Tous les bas » / « Tous les hauts ») et réglés ensemble — une largeur, une hauteur ou une profondeur commune, la
 * même largeur pour tous, la place libre partagée entre eux, un autre modèle, leur double, ou les retirer
 * (features/kitchen-run-multi.ts). Rien ne change dans le projet avant OK, comme le reste du linéaire.
 */
import { withRoomLeft } from "./kitchen-strip-actions";
import type { DisplayUnit, KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import { applianceOf, isFiller, itemEntry, openRoom, rowOf, runModels, type RunFill } from "../../features/kitchen-run-items";
import { withCommonSize, withDuplicated, withEqualWidths, withModel, withRoomShared } from "../../features/kitchen-run-multi";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";

const SMALL = "h-7 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const SELECT = "h-7 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr_auto] items-center gap-1.5";

export interface MultiHost {
  plan: KitchenFloorPlan;
  items: KitchenRunItem[];
  picked: string[];
  fill: RunFill;
  unit: DisplayUnit;
  /** The items changed; `picked`: those chosen after (default: the same). */
  change(items: KitchenRunItem[], picked?: string[]): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

/** The buttons choosing every unit of a row at once. */
export function pickAllRow(items: readonly KitchenRunItem[], wall: boolean, pick: (ids: string[]) => void): HTMLElement {
  const of = (row: "base" | "wall") => items.filter((i) => !isFiller(i) && rowOf(itemEntry(i)) === row).map((i) => i.id);
  const button = (row: "base" | "wall", text: string) => {
    const ids = of(row);
    const b = el("button", { type: "button", class: `${SMALL} flex-1`, disabled: ids.length < 2, "data-pick-all": row }, text);
    b.addEventListener("click", () => pick(ids));
    return b;
  };
  return el("div", { class: "flex gap-1" }, button("base", "Choisir tous les bas"), ...(wall ? [button("wall", "Tous les hauts")] : []));
}

/** The rows of the units chosen together. */
export function multiRows(host: MultiHost): (HTMLElement | null)[] {
  const { plan, items, picked, unit } = host;
  const chosen = items.filter((i) => picked.includes(i.id));
  const names = (ids: string[]) => ids.map((id) => itemEntry(items.find((i) => i.id === id)!).name).join(", ");
  // A size typed for all: Entrée or the button gives it.
  const common = (label: string, key: "width" | "height" | "depth", value: number) => {
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(value, unit), 4), "aria-label": `${label} commune (${UNIT_LABELS[unit]})`, "data-common": key });
    const apply = () => {
      const parsed = parseNumber(input.value);
      if (parsed === null || parsed <= 0) return input.setAttribute("aria-invalid", "true");
      const made = withCommonSize(plan, items, picked, key, Math.round(fromDisplay(parsed, unit) * 10) / 10);
      host.change(made.items);
      if (made.kept.length) host.notify(`${names(made.kept)} : ${key === "width" ? "un appareil garde ses largeurs" : key === "height" ? "la hauteur d'un bas est celle du plan de travail" : "pas de profondeur à régler"}.`, "info");
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") apply();
    });
    const go = el("button", { type: "button", class: SMALL, title: `Donner cette ${label.toLowerCase()} à tous`, "data-common-apply": key }, "À tous");
    go.addEventListener("click", apply);
    return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input, go);
  };
  const first = chosen[0]!;
  const size = (key: "width" | "height" | "depth") => chosen.map((i) => i[key]).find((v): v is number => typeof v === "number") ?? (key === "width" ? first.width : key === "height" ? 720 : 580);
  const button = (text: string, attr: string, go: () => void, disabled = false) => {
    const b = el("button", { type: "button", class: `${SMALL} w-full`, disabled, [attr]: "" }, text);
    b.addEventListener("click", go);
    return b;
  };
  // The room left on each row: its free stretches and its fillers.
  const has = (r: "base" | "wall") => chosen.some((i) => !applianceOf(i) && !isFiller(i) && rowOf(itemEntry(i)) === r);
  const room = { base: has("base") ? openRoom(host.fill, "base", [...host.fill.free, ...host.fill.fillers]).reduce((s, [a, b]) => s + b - a, 0) : 0, wall: has("wall") ? openRoom(host.fill, "wall").reduce((s, [a, b]) => s + b - a, 0) : 0 };
  const share = () => {
    let next = items;
    let given = 0;
    for (const row of ["base", "wall"] as const) {
      const made = withRoomShared(plan, next, picked, row, room[row]);
      next = made.items;
      given += made.given;
    }
    if (!given) return host.notify("Pas de place libre à partager sur leur rangée.", "info");
    host.change(next);
    host.notify(`${formatLength(given, unit)} partagés entre eux.`, "success");
  };
  // Another model for all, among those of the row of the first (they must all be of it).
  const row = rowOf(itemEntry(first));
  const sameRow = chosen.every((i) => rowOf(itemEntry(i)) === row) && !chosen.some((i) => applianceOf(i) || isFiller(i));
  const models = runModels().filter((m) => !m.appliance && (m.kind === "wall") === (row === "wall"));
  const swap = el("select", { class: SELECT, "aria-label": "Échanger tous contre", disabled: !sameRow, "data-multi-swap": "" }, el("option", { value: "" }, sameRow ? "Échanger tous contre…" : "Échanger : même rangée, sans appareil"), ...models.map((m) => el("option", { value: m.model }, m.name)));
  swap.addEventListener("change", () => {
    const m = models.find((x) => x.model === swap.value);
    if (m) host.change(withModel(items, picked, m.model, m.widths));
  });
  const total = chosen.reduce((s, i) => s + i.width, 0);
  return [
    el("p", { class: "text-gray-600 dark:text-gray-300" }, `${chosen.length} meubles, ${formatLength(total, unit)} en tout. Maj + clic sur la bande en ajoute ou en retire un.`),
    common("Largeur", "width", size("width")),
    // A height for wall and tall units only: a base unit's is the worktop's.
    chosen.some((i) => !isFiller(i) && (rowOf(itemEntry(i)) === "wall" || itemEntry(i).kind === "tall")) ? common("Hauteur", "height", size("height")) : null,
    common("Profondeur", "depth", size("depth")),
    button("Même largeur pour tous", "data-multi-equal", () => host.change(withEqualWidths(plan, items, picked))),
    button(`Leur partager la place libre (${formatLength(room.base + room.wall, unit)})`, "data-multi-share", share, room.base + room.wall < 1),
    swap,
    button("Dupliquer après eux", "data-multi-copy", () => {
      const made = withDuplicated(items, picked);
      host.change(made.items, made.copies);
    }),
    button(`Retirer les ${chosen.length} meubles`, "data-multi-remove", () => host.change(withRoomLeft(items, picked), [])),
  ];
}
