/**
 * La bibliothèque d'électroménager de cuisine : fours, micro-ondes, plaques, hottes, réfrigérateurs, lave-vaisselle,
 * éviers et robinets, chacun à ses cotes du commerce (mm) et dans ses finitions (inox, noir, blanc ; chromé, noir mat,
 * laiton pour un robinet), et où il se pose par rapport au caisson cliqué : dedans, sur le plan de travail, au-dessus,
 * dessous, debout devant le mur. Les pièces de chacun sont dans features/appliance-parts.ts. Pur.
 */

export type ApplianceCategory = "oven" | "microwave" | "hob" | "hood" | "fridge" | "dishwasher" | "sink" | "tap";

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
  place: AppliancePlace;
  finishes: string[];
  /** A word on it, in the library. */
  note: string;
  /** In a cabinet: its fronts taken off (an oven, a built-in microwave), or kept (a built-in fridge, a dishwasher). */
  open?: boolean;
}

export const CATEGORIES: { id: ApplianceCategory; label: string }[] = [
  { id: "oven", label: "Fours" },
  { id: "hob", label: "Plaques" },
  { id: "hood", label: "Hottes" },
  { id: "fridge", label: "Réfrigérateurs" },
  { id: "dishwasher", label: "Lave-vaisselle" },
  { id: "microwave", label: "Micro-ondes" },
  { id: "sink", label: "Éviers" },
  { id: "tap", label: "Robinets" },
];

const STEEL = ["inox", "black", "white"];
const TAPS = ["chrome", "black", "brass"];

export const APPLIANCE_LIBRARY: ApplianceDef[] = [
  { id: "oven-pyro", category: "oven", name: "Four encastrable pyrolyse", sizes: [[595, 595, 548]], place: "in", finishes: STEEL, open: true, note: "60 cm, sous le plan ou en colonne." },
  { id: "oven-compact", category: "oven", name: "Four compact combiné", sizes: [[595, 455, 548]], place: "in", finishes: STEEL, open: true, note: "45 cm de haut, en colonne." },
  { id: "oven-steam", category: "oven", name: "Four vapeur", sizes: [[595, 455, 567]], place: "in", finishes: STEEL, open: true, note: "45 cm, à côté d'un four." },
  { id: "hob-induction", category: "hob", name: "Plaque induction", sizes: [[590, 55, 520], [780, 55, 520], [900, 55, 520]], place: "top", finishes: ["black"], note: "Verre vitrocéramique, 4 ou 5 foyers." },
  { id: "hob-gas", category: "hob", name: "Plaque gaz", sizes: [[580, 45, 500], [750, 45, 510]], place: "top", finishes: ["inox", "black"], note: "Brûleurs et grilles en fonte." },
  { id: "hob-domino", category: "hob", name: "Domino induction", sizes: [[288, 55, 520]], place: "top", finishes: ["black"], note: "30 cm, deux foyers." },
  { id: "hood-chimney", category: "hood", name: "Hotte murale cheminée", sizes: [[598, 900, 500], [898, 900, 500]], place: "hood", finishes: STEEL, note: "Au mur, au-dessus de la plaque." },
  { id: "hood-glass", category: "hood", name: "Hotte inclinée verre", sizes: [[598, 900, 380], [898, 900, 380]], place: "hood", finishes: ["black", "white"], note: "Façade en verre inclinée." },
  { id: "hood-builtin", category: "hood", name: "Groupe filtrant intégré", sizes: [[560, 180, 280], [860, 180, 280]], place: "under", finishes: ["inox", "black"], note: "Sous un meuble haut." },
  { id: "fridge-builtin", category: "fridge", name: "Réfrigérateur intégrable", sizes: [[540, 1770, 545], [540, 1220, 545]], place: "in", finishes: ["white"], note: "Dans une colonne, derrière sa porte." },
  { id: "fridge-combi", category: "fridge", name: "Réfrigérateur combiné posable", sizes: [[595, 1860, 650], [600, 2030, 670]], place: "stand", finishes: STEEL, note: "Congélateur en bas." },
  { id: "fridge-american", category: "fridge", name: "Réfrigérateur américain", sizes: [[910, 1780, 720]], place: "stand", finishes: ["inox", "black"], note: "Deux portes, distributeur d'eau." },
  { id: "dishwasher-builtin", category: "dishwasher", name: "Lave-vaisselle tout intégrable", sizes: [[598, 815, 550], [448, 815, 550]], place: "in", finishes: ["inox"], note: "Derrière la façade du caisson." },
  { id: "dishwasher-free", category: "dishwasher", name: "Lave-vaisselle posable", sizes: [[598, 850, 600], [450, 850, 600]], place: "stand", finishes: STEEL, note: "Sa propre façade, sous le plan." },
  { id: "microwave-builtin", category: "microwave", name: "Micro-ondes encastrable", sizes: [[595, 390, 400], [595, 455, 550]], place: "in", finishes: STEEL, open: true, note: "En meuble haut ou en colonne." },
  { id: "microwave-free", category: "microwave", name: "Micro-ondes posable", sizes: [[485, 280, 370]], place: "top", finishes: STEEL, note: "Sur le plan de travail." },
  { id: "sink-steel", category: "sink", name: "Évier inox 1 bac et égouttoir", sizes: [[860, 180, 500], [790, 180, 500]], place: "top", finishes: ["inox"], note: "À poser, bac à gauche." },
  { id: "sink-steel-2", category: "sink", name: "Évier inox 2 bacs", sizes: [[1160, 180, 500]], place: "top", finishes: ["inox"], note: "Pour un caisson de 120." },
  { id: "sink-granite", category: "sink", name: "Évier granit 1 bac", sizes: [[780, 200, 500], [580, 200, 500]], place: "top", finishes: ["black", "white"], note: "Résine et quartz." },
  { id: "tap-gooseneck", category: "tap", name: "Mitigeur col de cygne", sizes: [[60, 360, 230]], place: "tap", finishes: TAPS, note: "Bec haut orientable." },
  { id: "tap-pull", category: "tap", name: "Mitigeur douchette", sizes: [[60, 300, 210]], place: "tap", finishes: TAPS, note: "Douchette extractible." },
  { id: "tap-pro", category: "tap", name: "Mitigeur semi-pro à ressort", sizes: [[70, 500, 240]], place: "tap", finishes: TAPS, note: "Ressort et douchette." },
];

export const FINISH_LABELS: Record<string, string> = { inox: "Inox", black: "Noir", white: "Blanc", chrome: "Chromé", brass: "Laiton" };

export const applianceDef = (id: string): ApplianceDef | undefined => APPLIANCE_LIBRARY.find((d) => d.id === id);

/** The looks (appearance/library.ts) of a finish: its face, its body, its glass, its trim (handles, knobs). */
export function finishLooks(finish: string, category: ApplianceCategory): { face: string; body: string; glass: string; trim: string } {
  if (category === "tap") return { face: finish === "black" ? "steel-black" : finish === "brass" ? "brass-brushed" : "chrome", body: finish === "black" ? "steel-black" : finish === "brass" ? "brass-brushed" : "chrome", glass: "chrome", trim: "chrome" };
  if (category === "sink") return finish === "inox" ? { face: "steel-brushed", body: "steel-brushed", glass: "steel-brushed", trim: "chrome" } : { face: finish === "white" ? "quartz-white" : "granite-black", body: finish === "white" ? "quartz-white" : "granite-black", glass: "chrome", trim: "chrome" };
  if (finish === "black") return { face: "glass-lacquered-black", body: "plastic-black", glass: "glass-smoked", trim: "steel-black" };
  if (finish === "white") return { face: "glass-lacquered-white", body: "plastic-white", glass: "glass-smoked", trim: "aluminium-brushed" };
  return { face: "steel-brushed", body: "plastic-black", glass: "glass-smoked", trim: "steel-brushed" };
}
