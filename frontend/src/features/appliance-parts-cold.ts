/**
 * Les pièces des appareils de froid et de lavage : réfrigérateur combiné intégrable (derrière les portes de sa
 * colonne) et sous plan, combiné posable et américain (portes de 55 mm, joint sombre entre elles, poignées barres, afficheur,
 * distributeur d'eau), cave à vin (porte vitrée dans son cadre, clayettes en bois derrière, grille de ventilation),
 * lave-vaisselle tout intégrable (porte à habiller, bandeau et touches sur la tranche) et posable (sa porte, son dessus,
 * son bandeau). Repère de features/appliance-parts.ts. Pur.
 */
import { box, frame, handle, type AppliancePart, type Looks } from "./appliance-shapes";

/** The sides' look of a freestanding appliance from its face's: black steel by black glass, white plastic by white glass. */
export const sidesOf = (L: Looks): string => (L.face === "glass-lacquered-black" ? "steel-black" : L.face === "glass-lacquered-white" ? "plastic-white" : L.face);

/** Thickness of a freestanding fridge's doors (mm). */
const DOOR = 55;

/** A fridge. The first pieces of each model keep their order (saved documents). */
export function fridge(model: string, W: number, H: number, D: number, L: Looks): AppliancePart[] {
  if (model === "fridge-under") {
    // Under the worktop, behind its cabinet's door: one door over its ventilation grille.
    return [
      { name: "Caisse", look: "plastic-white", shapes: [box([0, 40, 0], [W, D, H])] },
      { name: "Porte", look: "plastic-white", shapes: [box([0, 0, 90], [W, 40, H])] },
      { name: "Grille de ventilation", look: "plastic-black", shapes: [box([20, 0, 0], [W - 20, 40, 90])] },
    ];
  }
  if (model === "fridge-builtin") {
    // Its own doors (white), to which the column's doors are fixed; the freezer at the bottom.
    const split = Math.round(H * 0.38);
    return [
      { name: "Caisse", look: "plastic-white", shapes: [box([0, 40, 0], [W, D, H])] },
      { name: "Joint", look: "plastic-grey", shapes: [box([0, 2, split], [W, 40, split + 8])] },
      { name: "Portes", look: "plastic-white", shapes: [box([0, 0, 0], [W, 40, split]), box([0, 0, split + 8], [W, 40, H])] },
    ];
  }
  const sides = sidesOf(L);
  if (model === "fridge-american") {
    const half = W / 2;
    return [
      { name: "Caisse", look: sides, shapes: [box([0, DOOR, 0], [W, D, H])] },
      { name: "Porte congélateur", look: L.face, shapes: [box([0, 0, 40], [half - 2, DOOR, H])] },
      { name: "Porte réfrigérateur", look: L.face, shapes: [box([half + 2, 0, 40], [W, DOOR, H])] },
      { name: "Distributeur d'eau", look: "glass-lacquered-black", shapes: [box([W * 0.1, -1, H * 0.46], [W * 0.38, 0, H * 0.74])] },
      { name: "Poignées", look: L.trim, shapes: [...handle("z", H * 0.3, H * 0.85, half - 45, 0, 34, 10), ...handle("z", H * 0.3, H * 0.85, half + 45, 0, 34, 10)] },
      { name: "Socle", look: "plastic-black", shapes: [box([0, DOOR, 0], [W, DOOR + 50, 40])] },
      { name: "Joint", look: "rubber-black", shapes: [box([half - 2, 4, 40], [half + 2, DOOR, H])] },
      { name: "Afficheur", look: "display-white", shapes: [box([W * 0.17, -1.5, H * 0.69], [W * 0.31, -1, H * 0.72])] },
      { name: "Bec du distributeur", look: "plastic-grey", shapes: [box([W * 0.24 - 18, -14, H * 0.6], [W * 0.24 + 18, -1, H * 0.66]), box([W * 0.13, -26, H * 0.48], [W * 0.35, -1, H * 0.495])] },
    ];
  }
  // A combined fridge: the freezer at the bottom (about 38 % of its height), the fridge above.
  const split = Math.round(H * 0.38);
  return [
    { name: "Caisse", look: sides, shapes: [box([0, DOOR, 0], [W, D, H])] },
    { name: "Porte congélateur", look: L.face, shapes: [box([0, 0, 40], [W, DOOR, split - 3])] },
    { name: "Porte réfrigérateur", look: L.face, shapes: [box([0, 0, split + 3], [W, DOOR, H])] },
    { name: "Poignées", look: L.trim, shapes: [...handle("z", split - 300, split - 60, W - 42, 0, 32, 9), ...handle("z", split + 70, split + 620, W - 42, 0, 32, 9)] },
    { name: "Socle", look: "plastic-black", shapes: [box([0, DOOR, 0], [W, DOOR + 50, 40])] },
    { name: "Joint", look: "rubber-black", shapes: [box([2, 4, split - 3], [W - 2, DOOR, split + 3])] },
    { name: "Afficheur", look: "display-white", shapes: [box([W / 2 - 40, -0.5, H - 240], [W / 2 + 40, 0, H - 205])] },
  ];
}

/** A wine cooler: a glass door in its frame, wooden shelves behind it, a ventilation grille at its foot. */
export function wine(W: number, H: number, D: number, L: Looks): AppliancePart[] {
  const kick = 90;
  const rail = Math.min(45, W * 0.12);
  // Its box: open at the front (no boolean), so the shelves show through the glass.
  const t = 12;
  const shelves = Math.max(2, Math.floor((H - kick - 140) / 105));
  const pitch = (H - kick - 2 * t - 60) / shelves;
  return [
    { name: "Caisse", look: "plastic-black", shapes: [box([0, D - t, kick], [W, D, H]), box([0, 0, kick], [t, D - t, H]), box([W - t, 0, kick], [W, D - t, H]), box([t, 0, H - t], [W - t, D - t, H]), box([t, 0, kick], [W - t, D - t, kick + t]), box([0, 15, 0], [W, D, kick])] },
    { name: "Porte", look: L.face, shapes: frame(0, W, kick, H, -20, 0, rail) },
    { name: "Vitre", look: "glass-smoked", shapes: [box([rail, -12, kick + rail], [W - rail, -8, H - rail])] },
    { name: "Clayettes", look: "wood-beech", shapes: Array.from({ length: shelves }, (_, k) => box([t, 30, kick + t + 40 + k * pitch], [W - t, D - 40, kick + t + 52 + k * pitch])) },
    { name: "Poignée", look: L.trim, shapes: handle("z", kick + (H - kick) * 0.3, kick + (H - kick) * 0.75, W - rail / 2, -20, 28, 8) },
    { name: "Grille de ventilation", look: "plastic-black", shapes: [box([0, -15, 0], [W, 15, kick])] },
    { name: "Afficheur", look: "display-white", shapes: [box([W / 2 - 22, -20.5, H - rail * 0.75], [W / 2 + 22, -20, H - rail * 0.25])] },
  ];
}

/** A dishwasher. The first pieces of each model keep their order (saved documents). */
export function dishwasher(model: string, W: number, H: number, D: number, L: Looks): AppliancePart[] {
  if (model === "dishwasher-builtin") {
    // Fully integrated: its door (a steel plate) gets the cabinet's front, its controls on the door's top edge.
    const foot = 110;
    return [
      { name: "Cuve", look: "steel-brushed", shapes: [box([0, 20, 0], [W, D, H])] },
      { name: "Bandeau", look: "plastic-black", shapes: [box([0, 0, H - 45], [W, 20, H - 1])] },
      { name: "Porte", look: "steel-raw", shapes: [box([0, 0, foot], [W, 20, H - 45])] },
      { name: "Socle", look: "plastic-black", shapes: [box([20, 0, 0], [W - 20, 20, foot])] },
      { name: "Touches", look: "display-white", shapes: [0, 1, 2, 3, 4].map((k) => box([W - 180 + k * 30, 6, H - 1.5], [W - 166 + k * 30, 14, H]))},
    ];
  }
  const sides = sidesOf(L);
  const top = 20;
  const panel = 110;
  return [
    { name: "Caisse", look: sides, shapes: [box([0, 0, 0], [W, D, H - top])] },
    { name: "Porte", look: L.face, shapes: [box([0, -20, 90], [W, 0, H - top - panel])] },
    { name: "Bandeau de commande", look: "glass-lacquered-black", shapes: [box([0, -20, H - top - panel], [W, 0, H - top])] },
    { name: "Poignée", look: L.trim, shapes: handle("x", 70, W - 70, H - top - panel - 40, -20, 26, 7) },
    { name: "Socle", look: "plastic-black", shapes: [box([20, -5, 0], [W - 20, 0, 90])] },
    { name: "Dessus", look: sides, shapes: [box([0, -20, H - top], [W, D, H])] },
    { name: "Afficheur", look: "display-white", shapes: [box([W - 170, -20.5, H - top - 70], [W - 100, -20, H - top - 45])] },
  ];
}
