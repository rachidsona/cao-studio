/**
 * La bibliothèque d'électroménager de cuisine : fours, micro-ondes, plaques, hottes, réfrigérateurs, caves à vin,
 * lave-vaisselle, lave-linge, éviers, robinets et petit électroménager, chacun à ses cotes du commerce (mm), avec son prix indicatif (MAD TTC, par
 * taille), dans ses finitions (inox, noir, blanc ; chromé, noir mat, laiton pour un robinet), et où il se pose par
 * rapport au caisson cliqué : dedans, sur le plan de travail, au-dessus, dessous, debout devant le mur. Des modèles
 * génériques, sans marque. Les pièces de chacun sont dans features/appliance-parts.ts. Pur.
 */

import type { Looks } from "./appliance-shapes";

export type ApplianceCategory = "oven" | "microwave" | "hob" | "hood" | "fridge" | "wine" | "dishwasher" | "sink" | "tap" | "small";

/**
 * Where it goes from the cabinet clicked: `in` its box (an oven, a built-in fridge), `top` on the worktop over it (a
 * hob, a sink, a microwave on the worktop), `tap` at the back of the worktop, `hood` on the wall over the worktop,
 * `under` a wall cabinet, `stand` on the floor in its place, against the wall (a freestanding fridge).
 */
export type AppliancePlace = "in" | "top" | "tap" | "hood" | "under" | "stand";

export interface ApplianceDef {
  id: string;
  category: ApplianceCategory;
  name: string;
  /** Its sizes, the usual one first (mm): width, height, depth. */
  sizes: [number, number, number][];
  /** Its usual price in the shops, one per size (MAD TTC): for the library only, not counted in the quote. */
  prices: number[];
  place: AppliancePlace;
  finishes: string[];
  /** A word on it, in the library. */
  note: string;
  /** In a cabinet: its fronts taken off (an oven, a built-in microwave, a wine cooler), or kept (a built-in fridge, a dishwasher). */
  open?: boolean;
}

export const CATEGORIES: { id: ApplianceCategory; label: string }[] = [
  { id: "oven", label: "Fours et encastrables" },
  { id: "hob", label: "Plaques" },
  { id: "hood", label: "Hottes" },
  { id: "fridge", label: "Réfrigérateurs" },
  { id: "wine", label: "Caves à vin" },
  { id: "dishwasher", label: "Lave-vaisselle et lave-linge" },
  { id: "microwave", label: "Micro-ondes" },
  { id: "sink", label: "Éviers" },
  { id: "tap", label: "Robinets" },
  { id: "small", label: "Petit électroménager" },
];

const STEEL = ["inox", "black", "white"];
const TAPS = ["chrome", "black", "brass"];

export const APPLIANCE_LIBRARY: ApplianceDef[] = [
  { id: "oven-pyro", category: "oven", name: "Four encastrable pyrolyse", sizes: [[595, 595, 548]], prices: [6490], place: "in", finishes: STEEL, open: true, note: "60 cm, niche 560 × 585, sous le plan ou en colonne." },
  { id: "oven-90", category: "oven", name: "Four encastrable 90 cm", sizes: [[898, 480, 550]], prices: [12900], place: "in", finishes: STEEL, open: true, note: "Grande largeur, sous une plaque de 90." },
  { id: "oven-compact", category: "oven", name: "Four compact combiné", sizes: [[595, 455, 548]], prices: [7990], place: "in", finishes: STEEL, open: true, note: "45 cm de haut, en colonne." },
  { id: "oven-steam", category: "oven", name: "Four vapeur", sizes: [[595, 455, 567]], prices: [9490], place: "in", finishes: STEEL, open: true, note: "45 cm, à côté d'un four." },
  { id: "coffee-builtin", category: "oven", name: "Machine à café encastrable", sizes: [[595, 455, 470]], prices: [14900], place: "in", finishes: STEEL, open: true, note: "45 cm, en colonne au-dessus d'un four ; niche à tasses, buses et égouttoir." },
  { id: "drawer-warming", category: "oven", name: "Tiroir chauffe-plat", sizes: [[595, 140, 535]], prices: [3990], place: "in", finishes: STEEL, open: true, note: "14 cm, sous un four compact ou une machine à café." },
  { id: "range-90", category: "oven", name: "Piano de cuisson 90 cm", sizes: [[900, 900, 600]], prices: [16900], place: "stand", finishes: ["inox", "black"], note: "Posable : four large sous un dessus gaz 5 feux, grilles en fonte ; à la place d'un caisson de 90." },
  { id: "hob-induction", category: "hob", name: "Plaque induction", sizes: [[590, 55, 520], [780, 55, 520], [900, 55, 520]], prices: [4990, 6990, 8990], place: "top", finishes: ["black"], note: "Vitrocéramique noire, 4 ou 5 foyers ; découpe 560, 750 ou 880 × 490." },
  { id: "hob-gas", category: "hob", name: "Plaque gaz", sizes: [[580, 45, 500], [750, 45, 510], [860, 45, 510]], prices: [2990, 3990, 4990], place: "top", finishes: ["inox", "black"], note: "Brûleurs et grilles en fonte, 4 ou 5 feux." },
  { id: "hob-domino", category: "hob", name: "Domino induction", sizes: [[288, 55, 520]], prices: [2490], place: "top", finishes: ["black"], note: "30 cm, deux foyers." },
  { id: "hob-extract", category: "hob", name: "Plaque induction aspirante", sizes: [[780, 199, 520], [830, 199, 520]], prices: [17900, 21900], place: "top", finishes: ["black"], note: "Hotte intégrée au milieu des foyers : pas de hotte au-dessus, moteur sous le plan." },
  { id: "hob-teppan", category: "hob", name: "Domino teppanyaki", sizes: [[380, 100, 520]], prices: [7490], place: "top", finishes: ["inox"], note: "38 cm, plaque en acier poli : grillades sans poêle." },
  { id: "hood-chimney", category: "hood", name: "Hotte murale cheminée", sizes: [[598, 900, 500], [898, 900, 500]], prices: [3490, 4490], place: "hood", finishes: STEEL, note: "Au mur, casquette et cheminée télescopique." },
  { id: "hood-glass", category: "hood", name: "Hotte inclinée verre", sizes: [[598, 900, 380], [898, 900, 380]], prices: [3990, 4990], place: "hood", finishes: ["black", "white"], note: "Façade en verre inclinée." },
  { id: "hood-island", category: "hood", name: "Hotte îlot", sizes: [[898, 900, 598], [1198, 900, 698]], prices: [7990, 9990], place: "hood", finishes: ["inox", "black"], note: "Au plafond, au-dessus d'une plaque d'îlot." },
  { id: "hood-box", category: "hood", name: "Hotte box", sizes: [[598, 900, 500], [898, 900, 500]], prices: [4290, 5290], place: "hood", finishes: STEEL, note: "Un bloc net, sans pente, cheminée au-dessus." },
  { id: "hood-vertical", category: "hood", name: "Hotte verticale verre", sizes: [[598, 900, 380], [898, 900, 380]], prices: [4990, 5990], place: "hood", finishes: ["black", "white"], note: "Verre droit contre le mur, aspiration tout autour du bas." },
  { id: "hood-pendant", category: "hood", name: "Hotte îlot suspendue", sizes: [[420, 900, 420], [500, 900, 500]], prices: [8990, 10990], place: "hood", finishes: ["inox", "black", "white"], note: "Un cylindre pendu au plafond par des câbles, au-dessus d'une plaque d'îlot ; sans cheminée." },
  { id: "hood-builtin", category: "hood", name: "Groupe filtrant intégré", sizes: [[560, 180, 280], [860, 180, 280]], prices: [1890, 2390], place: "under", finishes: ["inox", "black"], note: "Hotte intégrée sous un meuble haut, visière tirable." },
  { id: "fridge-builtin", category: "fridge", name: "Réfrigérateur combiné intégrable", sizes: [[540, 1770, 545], [540, 1220, 545]], prices: [8990, 5990], place: "in", finishes: ["white"], note: "Niche 1780 ou 1225, derrière les portes de la colonne." },
  { id: "fridge-combi", category: "fridge", name: "Réfrigérateur combiné posable", sizes: [[595, 1860, 650], [600, 2030, 670]], prices: [6990, 8490], place: "stand", finishes: STEEL, note: "Congélateur en bas." },
  { id: "fridge-american", category: "fridge", name: "Réfrigérateur américain", sizes: [[910, 1780, 720]], prices: [14900], place: "stand", finishes: ["inox", "black"], note: "Deux portes, distributeur d'eau et de glaçons." },
  { id: "fridge-french", category: "fridge", name: "Réfrigérateur multi-portes", sizes: [[910, 1820, 730]], prices: [19900], place: "stand", finishes: ["inox", "black"], note: "Deux portes en haut, deux tiroirs congélateur en bas." },
  { id: "freezer-builtin", category: "fridge", name: "Congélateur intégrable", sizes: [[556, 1772, 545]], prices: [7990], place: "in", finishes: ["white"], note: "Niche 1780, derrière la porte d'une colonne, à côté du réfrigérateur." },
  { id: "fridge-under", category: "fridge", name: "Réfrigérateur sous plan intégrable", sizes: [[598, 820, 550]], prices: [5490], place: "in", finishes: ["white"], note: "Au sol sous le plan, derrière la porte du caisson ; niche 820." },
  { id: "wine-builtin", category: "wine", name: "Cave à vin sous plan", sizes: [[595, 818, 570], [295, 818, 570]], prices: [9900, 6900], place: "in", finishes: ["black", "inox"], open: true, note: "Porte vitrée, 40 ou 20 bouteilles, sous le plan." },
  { id: "wine-column", category: "wine", name: "Cave à vin en colonne", sizes: [[595, 1772, 560]], prices: [16900], place: "in", finishes: ["black", "inox"], open: true, note: "Porte vitrée, 90 bouteilles, dans une colonne." },
  { id: "dishwasher-builtin", category: "dishwasher", name: "Lave-vaisselle tout intégrable", sizes: [[598, 815, 550], [448, 815, 550]], prices: [5990, 5490], place: "in", finishes: ["inox"], note: "Porte à habiller : derrière la façade du caisson." },
  { id: "dishwasher-free", category: "dishwasher", name: "Lave-vaisselle posable", sizes: [[598, 850, 600], [450, 850, 600]], prices: [4490, 4190], place: "stand", finishes: STEEL, note: "Sa propre porte et son dessus, sous le plan ou seul." },
  { id: "washer-builtin", category: "dishwasher", name: "Lave-linge intégrable", sizes: [[596, 818, 544]], prices: [7990], place: "in", finishes: ["inox"], note: "8 kg, sous le plan derrière la porte du caisson." },
  { id: "washer-free", category: "dishwasher", name: "Lave-linge posable", sizes: [[598, 850, 600]], prices: [4990], place: "stand", finishes: ["white", "black"], note: "8 kg, hublot à l'avant, sous le plan ou seul." },
  { id: "dryer-free", category: "dishwasher", name: "Sèche-linge posable", sizes: [[598, 850, 615]], prices: [5990], place: "stand", finishes: ["white", "black"], note: "Pompe à chaleur, 8 kg ; posé seul ou sur un lave-linge." },
  { id: "microwave-builtin", category: "microwave", name: "Micro-ondes encastrable", sizes: [[595, 390, 400], [595, 455, 550]], prices: [3990, 6990], place: "in", finishes: STEEL, open: true, note: "38 ou 45 cm, en meuble haut ou en colonne." },
  { id: "microwave-free", category: "microwave", name: "Micro-ondes posable", sizes: [[485, 280, 370]], prices: [1190], place: "top", finishes: STEEL, note: "Sur le plan de travail." },
  { id: "sink-steel", category: "sink", name: "Évier inox 1 bac et égouttoir", sizes: [[860, 180, 500], [790, 180, 500]], prices: [1090, 950], place: "top", finishes: ["inox"], note: "À poser, bac à gauche." },
  { id: "sink-steel-2", category: "sink", name: "Évier inox 2 bacs", sizes: [[1160, 180, 500]], prices: [1590], place: "top", finishes: ["inox"], note: "Pour un caisson de 120." },
  { id: "sink-granite", category: "sink", name: "Évier granit 1 bac", sizes: [[780, 200, 500], [580, 200, 500]], prices: [2390, 1890], place: "top", finishes: ["black", "white"], note: "Résine et quartz." },
  { id: "tap-gooseneck", category: "tap", name: "Mitigeur col de cygne", sizes: [[60, 360, 230]], prices: [650], place: "tap", finishes: TAPS, note: "Bec haut orientable." },
  { id: "tap-pull", category: "tap", name: "Mitigeur douchette", sizes: [[60, 300, 210]], prices: [950], place: "tap", finishes: TAPS, note: "Douchette extractible." },
  { id: "tap-pro", category: "tap", name: "Mitigeur semi-pro à ressort", sizes: [[70, 500, 240]], prices: [1390], place: "tap", finishes: TAPS, note: "Ressort et douchette." },
  { id: "kettle", category: "small", name: "Bouilloire électrique", sizes: [[230, 260, 190]], prices: [490], place: "top", finishes: ["inox", "black", "white"], note: "1,7 l, sur son socle, au fond du plan." },
  { id: "toaster", category: "small", name: "Grille-pain 2 fentes", sizes: [[310, 195, 180]], prices: [590], place: "top", finishes: ["inox", "black", "white"], note: "Deux fentes larges, levier et molette de dorage." },
  { id: "espresso", category: "small", name: "Machine expresso", sizes: [[280, 330, 380]], prices: [3490], place: "top", finishes: ["inox", "black"], note: "Porte-filtre, buse vapeur, plateau chauffe-tasses." },
  { id: "mixer", category: "small", name: "Robot pâtissier", sizes: [[220, 350, 360]], prices: [4990], place: "top", finishes: ["white", "black", "inox"], note: "Tête basculante, bol inox de 4,8 l." },
];

export const FINISH_LABELS: Record<string, string> = { inox: "Inox", black: "Noir", white: "Blanc", chrome: "Chromé", brass: "Laiton" };

export const applianceDef = (id: string): ApplianceDef | undefined => APPLIANCE_LIBRARY.find((d) => d.id === id);

/** Its usual price at this size (MAD TTC), if known. */
export const appliancePrice = (def: ApplianceDef, size: readonly number[]): number | undefined => def.prices[Math.max(0, def.sizes.findIndex((s) => s[0] === size[0] && s[1] === size[1]))];

/** A price in dirhams, as written in the library: « 6 490 MAD ». */
export const priceText = (mad: number): string => `${mad.toLocaleString("fr-FR").replace(/\s/g, " ")} MAD`;

/** The looks (appearance/library.ts) of a finish: its face, its body, its glass, its trim (handles, knobs). */
export function finishLooks(finish: string, category: ApplianceCategory): Looks {
  if (category === "tap") {
    const metal = finish === "black" ? "steel-black" : finish === "brass" ? "brass-brushed" : "chrome";
    return { face: metal, body: metal, glass: "chrome", trim: "chrome" };
  }
  if (category === "sink") return finish === "inox" ? { face: "steel-brushed", body: "steel-brushed", glass: "steel-brushed", trim: "chrome" } : { face: finish === "white" ? "quartz-white" : "granite-black", body: finish === "white" ? "quartz-white" : "granite-black", glass: "chrome", trim: "chrome" };
  if (finish === "black") return { face: "glass-lacquered-black", body: "plastic-black", glass: "glass-oven", trim: "steel-black" };
  if (finish === "white") return { face: "glass-lacquered-white", body: "plastic-white", glass: "glass-oven", trim: "aluminium-brushed" };
  return { face: "steel-brushed", body: "plastic-black", glass: "glass-oven", trim: "steel-brushed" };
}
