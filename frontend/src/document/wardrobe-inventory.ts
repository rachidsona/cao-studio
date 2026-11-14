/**
 * L'inventaire du client, en calcul pur : ce qu'il faut ranger (chemises, vestes, pantalons, robes, manteaux, pulls
 * pliés, paires de chaussures, tiroirs voulus) devient des mètres de penderie courte et longue, de tablettes et un
 * nombre de tiroirs — avec des repères d'usage (une chemise prend 3 cm de tringle, un manteau 8, une pile de 6 pulls
 * 35 cm de tablette, une paire de chaussures 20 cm). Comparé à ce que le dressing dessiné offre, avec 10 % de marge,
 * il dit ce qui manque et propose les modules à ajouter (document/dressing-modules.ts), et la largeur qu'ils prennent.
 * Pur.
 */
import { MODULES, type ModuleKind } from "./dressing-modules";

export interface Wardrobe {
  shirts: number;
  jackets: number;
  trousers: number;
  dresses: number;
  coats: number;
  knits: number;
  shoes: number;
  drawers: number;
}

export const WARDROBE_ITEMS: [keyof Wardrobe, string][] = [
  ["shirts", "Chemises, chemisiers"],
  ["jackets", "Vestes"],
  ["trousers", "Pantalons (pendus)"],
  ["dresses", "Robes longues"],
  ["coats", "Manteaux"],
  ["knits", "Pulls et t-shirts pliés"],
  ["shoes", "Paires de chaussures"],
  ["drawers", "Tiroirs voulus (linge, accessoires)"],
];

export const EMPTY_WARDROBE: Wardrobe = { shirts: 0, jackets: 0, trousers: 0, dresses: 0, coats: 0, knits: 0, shoes: 0, drawers: 0 };

/** What the dressing offers, or what is needed: mm of short and long hanging, mm of shelves, drawers. */
export interface Storage {
  shortRod: number;
  longRod: number;
  shelves: number;
  drawers: number;
}

/** Repères (mm per item): on the rod, and on the shelves. */
const ON_ROD = { shirts: 30, jackets: 60, trousers: 30, dresses: 40, coats: 80 };
const PILE = { items: 6, width: 350 };
const PAIR = 200;
const MARGIN = 1.1;

export function needs(w: Wardrobe): Storage {
  const n = (v: number) => Math.max(0, Math.round(v || 0));
  return {
    shortRod: n(w.shirts) * ON_ROD.shirts + n(w.jackets) * ON_ROD.jackets + n(w.trousers) * ON_ROD.trousers,
    longRod: n(w.dresses) * ON_ROD.dresses + n(w.coats) * ON_ROD.coats,
    shelves: Math.ceil(n(w.knits) / PILE.items) * PILE.width + n(w.shoes) * PAIR,
    drawers: n(w.drawers),
  };
}

/** What one module of a kind gives (its usual width, panels taken off), as a repère. */
const GIVES: Partial<Record<ModuleKind, Partial<Storage>>> = {
  double: { shortRod: 2 * 860 },
  long: { longRod: 860 },
  shelves: { shelves: 5 * 560 },
  drawers: { drawers: 4, shelves: 2 * 660 },
};
const FOR: [keyof Storage, ModuleKind, string][] = [
  ["shortRod", "double", "de penderie courte"],
  ["longRod", "long", "de penderie longue"],
  ["shelves", "shelves", "de tablettes"],
  ["drawers", "drawers", "tiroirs"],
];

export interface Gap {
  what: keyof Storage;
  need: number;
  have: number;
  /** What is missing (mm, or drawers), 0: enough. */
  missing: number;
  module?: { kind: ModuleKind; label: string; count: number; width: number };
}

/** Need against what is there (10 % more wanted), and for what is missing, the modules to add. */
export function compare(need: Storage, have: Storage): { gaps: Gap[]; width: number } {
  const gaps = FOR.map(([what, kind]): Gap => {
    const wanted = what === "drawers" ? need[what] : Math.round(need[what] * MARGIN);
    const missing = Math.max(0, wanted - have[what]);
    if (!missing) return { what, need: wanted, have: have[what], missing: 0 };
    const each = GIVES[kind]?.[what] ?? 1;
    const count = Math.ceil(missing / each);
    return { what, need: wanted, have: have[what], missing, module: { kind, label: MODULES[kind].label, count, width: count * MODULES[kind].share } };
  });
  return { gaps, width: gaps.reduce((s, g) => s + (g.module?.width ?? 0), 0) };
}

export const STORAGE_LABELS: Record<keyof Storage, string> = { shortRod: "Penderie courte", longRod: "Penderie longue", shelves: "Tablettes", drawers: "Tiroirs" };
