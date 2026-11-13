/**
 * Les lignes de « Accessoire intérieur » dans le panneau des niches (niche-tool.ts) : le modèle du catalogue
 * (features/accessory-parts.ts), rangé par pièce, la hauteur de son bas dans la niche — ou le tiroir qui le reçoit,
 * pour un range-couverts dans une niche à tiroirs —, l'épaisseur d'une tablette coulissante, et ce que le modèle
 * demande à la niche. Les réglages se changent sur place dans `settings`.
 */
import type { DisplayUnit, NicheFeature } from "../../document/types";
import { money } from "../../document/quote";
import { ACCESSORIES, accessoryModel, accessoryPrice, ROOMS, SET_BACK, type AccessoryModel } from "../../features/accessory-parts";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import { FIELD, ROW } from "./module-options";

type Settings = Pick<NicheFeature, "accessory" | "thickness">;

export interface AccessoryRows {
  settings: Settings;
  unit: DisplayUnit;
  /** A row with a field of a length (the panel's own). */
  number: (label: string, mm: number, set: (mm: number) => void, allowZero?: boolean) => HTMLElement;
  changed(): void;
  /** The drawers of the niche chosen: the top of the bottom of each, above the bottom of the niche, from the top one. */
  drawers: number[];
}

const chosen = (settings: Settings): { model: AccessoryModel; lift: number } | null => {
  const model = accessoryModel(settings.accessory?.model);
  return model && settings.accessory ? { model, lift: settings.accessory.lift } : null;
};

export function accessoryRows(o: AccessoryRows): (HTMLElement | null)[] {
  const now = chosen(o.settings);
  const lift = now?.lift ?? 0;
  const set = (change: Partial<NonNullable<Settings["accessory"]>>) => {
    o.settings.accessory = { model: now?.model.id ?? ACCESSORIES[0]!.id, lift, ...change };
    o.changed();
  };
  const list = el(
    "select",
    { class: FIELD, "aria-label": "Accessoire", "data-accessory-model": "" },
    ...(Object.keys(ROOMS) as AccessoryModel["room"][]).map((room) => el("optgroup", { label: ROOMS[room] }, ...ACCESSORIES.filter((m) => m.room === room).map((m) => el("option", { value: m.id, selected: m.id === now?.model.id }, m.label)))),
  );
  // Another model starts on the bottom of the niche.
  list.addEventListener("change", () => set({ model: list.value, lift: 0 }));
  const inDrawer = o.drawers.findIndex((top) => Math.abs(top - lift) < 0.5);
  const drawer = el(
    "select",
    { class: FIELD, "aria-label": "Dans le tiroir", "data-accessory-drawer": "" },
    el("option", { value: "", selected: inDrawer < 0 }, "Aucun (hauteur libre)"),
    ...o.drawers.map((_, i) => el("option", { value: String(i), selected: i === inDrawer }, `Tiroir ${i + 1}`)),
  );
  drawer.addEventListener("change", () => set({ lift: drawer.value === "" ? 0 : o.drawers[Number(drawer.value)]! }));
  const m = now?.model;
  const wide = m ? (m.width[1] >= 3000 ? `${formatLength(m.width[0], o.unit)} de large au moins` : `de ${formatLength(m.width[0], o.unit)} à ${formatLength(m.width[1], o.unit)} de large`) : "";
  return [
    el("label", { class: ROW }, "Accessoire", list),
    m?.shape === "tray" && o.drawers.length ? el("label", { class: ROW }, "Dans le tiroir", drawer) : null,
    m && !m.hung ? o.number("Bas à (du bas de la niche)", lift, (v) => set({ lift: v }), true) : null,
    m?.shape === "shelf" ? o.number("Épaisseur tablette", o.settings.thickness, (v) => ((o.settings.thickness = v), o.changed())) : null,
    m ? el("p", { class: "text-[11px] text-gray-500", "data-accessory-needs": "" }, `Il lui faut une niche ${wide}, ${formatLength(m.depth + SET_BACK, o.unit)} de profondeur et ${formatLength(m.height, o.unit)} de hauteur.`) : null,
  ];
}

/** What OK will put in the niche, in one line. */
export function accessoryResult(settings: Settings, unit: DisplayUnit): string | null {
  const now = chosen(settings);
  if (!now) return null;
  const { model: m, lift } = now;
  const where = m.hung ? "sous le haut de la niche" : lift > 0 ? `à ${formatLength(lift, unit)} du bas de la niche` : "sur le bas de la niche";
  const cost = accessoryPrice(m);
  const price = cost === undefined ? "Débitée ; sa paire de coulisses va au devis." : `Prix indicatif : ${money(cost)} HT.`;
  return `« ${m.label} », ${where}. ${price}`;
}
