/**
 * Les pièces des appareils ajoutés à la bibliothèque : machine à café encastrable (façade en verre noir, niche à tasses
 * creusée avec ses buses et son égouttoir, afficheur et touches), tiroir chauffe-plat, plaque induction aspirante
 * (grille d'aspiration au milieu des foyers) et lave-linge, intégrable (derrière la porte de son caisson) ou posable
 * (hublot cerclé, bandeau, bac à lessive, programmateur). Repère de features/appliance-parts.ts. Pur.
 */
import { box, cyl, handle, knob, ringDisc, type AppliancePart, type Looks } from "./appliance-shapes";

/** A built-in coffee machine (60 cm wide, 45 cm high, in a column): its cup recess dug into its glass front. */
export function coffee(W: number, H: number, D: number, L: Looks): AppliancePart[] {
  const [x0, x1, z0, z1] = [W / 2 - 110, W / 2 + 110, 40, Math.round(H * 0.55)];
  return [
    { name: "Caisse", look: L.body, shapes: [box([18, 0, 8], [W - 18, D, H - 14], [[[x0, -1, z0], [x1, 90, z1]]])] },
    { name: "Façade", look: L.face, shapes: [box([0, -21, 0], [W, -1, H], [[[x0, -22, z0], [x1, 0, z1]]])] },
    { name: "Verre", look: "glass-lacquered-black", shapes: [box([10, -22, z1 + 10], [W - 10, -21, H - 10])] },
    { name: "Afficheur", look: "display-white", shapes: [box([W / 2 - 70, -22.5, H - 95], [W / 2 + 70, -22, H - 55])] },
    { name: "Touches", look: "plastic-grey", shapes: [-2, -1, 1, 2].map((k) => cyl([W / 2 + k * 60 - Math.sign(k) * 30, -22, z1 + 40], [W / 2 + k * 60 - Math.sign(k) * 30, -22.6, z1 + 40], 7)) },
    { name: "Buses", look: "chrome", shapes: [-14, 14].map((dx) => cyl([W / 2 + dx, 40, z1 - 34], [W / 2 + dx, 40, z1], 7)) },
    { name: "Égouttoir", look: "steel-brushed", shapes: [box([x0 + 5, -20, z0], [x1 - 5, 85, z0 + 12])] },
  ];
}

/** A warming drawer (14 cm high, under an oven): its front and its bar handle. */
export function warmingDrawer(W: number, H: number, D: number, L: Looks): AppliancePart[] {
  return [
    { name: "Caisse", look: L.body, shapes: [box([18, 0, 4], [W - 18, D, H - 4])] },
    { name: "Façade", look: L.face, shapes: [box([0, -21, 0], [W, -1, H])] },
    { name: "Poignée", look: L.trim, shapes: handle("x", 60, W - 60, H * 0.62, -21, 26, 7) },
    { name: "Témoin", look: "display-white", shapes: [box([W - 60, -21.4, H - 24], [W - 36, -21, H - 18])] },
  ];
}

/** An induction hob with its downdraft: four zones in pairs on each side, the extraction grille between them. */
export function hobExtract(W: number, H: number, D: number): AppliancePart[] {
  const z = H - 6;
  const zs: [number, number, number][] = [0.2, 0.8].flatMap((k) => [[W * k, D * 0.3, 90], [W * k, D * 0.72, 90]] as [number, number, number][]);
  const [g0, g1] = [W / 2 - 55, W / 2 + 55];
  return [
    { name: "Verre vitrocéramique", look: "glass-ceramic", shapes: [box([0, 0, z], [W, D, H])] },
    { name: "Corps", look: "plastic-black", shapes: [box([20, 20, 0], [W - 20, D - 20, z])] },
    { name: "Foyers", look: "plastic-grey", shapes: zs.map(([x, y, r]) => ringDisc(x, y, H, r)) },
    { name: "Commandes tactiles", look: "plastic-grey", shapes: [box([W / 2 - 100, 16, H], [W / 2 + 100, 20, H + 0.3])] },
    { name: "Centres des foyers", look: "glass-ceramic", shapes: zs.map(([x, y, r]) => ringDisc(x, y, H, r - 3, 0.45)) },
    { name: "Grille d'aspiration", look: "steel-black", shapes: Array.from({ length: 7 }, (_, k) => box([g0 + k * 17, D * 0.2, H], [g0 + k * 17 + 8, D * 0.85, H + 0.5])).concat([box([g0 - 6, D * 0.2 - 6, H], [g1, D * 0.2, H + 0.5])]) },
    { name: "Afficheur", look: "display-red", shapes: [box([W / 2 - 14, 28, H], [W / 2 + 14, 40, H + 0.35])] },
  ];
}

/** A washing machine: built in (behind its cabinet's door, everything behind its front) or freestanding. */
export function washer(model: string, W: number, H: number, D: number, L: Looks, sides: string): AppliancePart[] {
  const zc = H * 0.45;
  if (model === "washer-builtin") {
    // Behind the cabinet's door: its own white front 30 mm back, its porthole and its controls in front of it.
    return [
      { name: "Caisse", look: "plastic-white", shapes: [box([0, 50, 0], [W, D, H])] },
      { name: "Façade", look: "plastic-white", shapes: [box([0, 30, 0], [W, 50, H - 100])] },
      { name: "Bandeau", look: "plastic-grey", shapes: [box([0, 30, H - 100], [W, 50, H])] },
      { name: "Hublot", look: "chrome", shapes: [cyl([W / 2, 30, zc], [W / 2, 14, zc], 170)] },
      { name: "Vitre", look: "glass-oven", shapes: [cyl([W / 2, 14, zc], [W / 2, 12, zc], 130)] },
      { name: "Bac à lessive", look: "plastic-white", shapes: [box([30, 26, H - 90], [200, 30, H - 20])] },
      { name: "Programmateur", look: "chrome", shapes: knob(W - 120, H - 50, 30, 24, 14) },
    ];
  }
  const top = 20;
  return [
    { name: "Caisse", look: sides, shapes: [box([0, 0, 0], [W, D, H - top])] },
    { name: "Dessus", look: sides, shapes: [box([0, 0, H - top], [W, D, H])] },
    { name: "Bandeau", look: L.face, shapes: [box([0, -6, H - top - 110], [W, 0, H - top])] },
    { name: "Hublot", look: L.trim, shapes: [cyl([W / 2, 0, zc], [W / 2, -22, zc], 175)] },
    { name: "Vitre", look: "glass-oven", shapes: [cyl([W / 2, -22, zc], [W / 2, -24, zc], 135)] },
    { name: "Bac à lessive", look: sides, shapes: [box([20, -8, H - top - 100], [200, -6, H - top - 15])] },
    { name: "Programmateur", look: L.trim, shapes: knob(W / 2 + 40, H - top - 55, -6, 26, 18) },
    { name: "Afficheur", look: "display-white", shapes: [box([W - 200, -6.5, H - top - 75], [W - 110, -6, H - top - 40])] },
  ];
}
