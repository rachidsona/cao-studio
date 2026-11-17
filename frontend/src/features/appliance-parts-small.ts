/**
 * Le petit électroménager posé sur le plan de travail, pour une cuisine habitée : bouilloire (socle, corps rond,
 * couvercle, anse, bec, voyant), grille-pain (deux fentes creusées, levier, molette), machine expresso (tête et
 * groupe, porte-filtre, buse vapeur, égouttoir, plateau chauffe-tasses, une tasse) et robot pâtissier (socle, colonne,
 * tête basculante, bol inox, fouet). Repère de features/appliance-parts.ts. Pur.
 */
import { box, cyl, knob, type AppliancePart } from "./appliance-shapes";

/** A kettle: its round body on its base, its spout on the left, its handle on the right. */
export function kettle(W: number, H: number, D: number, body: string, trim: string): AppliancePart[] {
  const [cx, cy] = [W * 0.48, D / 2];
  const r = Math.min(cy - 15, W * 0.35);
  return [
    { name: "Socle", look: "plastic-black", shapes: [cyl([cx, cy, 0], [cx, cy, 18], r + 8)] },
    { name: "Corps", look: body, shapes: [cyl([cx, cy, 18], [cx, cy, H - 25], r)] },
    { name: "Couvercle", look: trim, shapes: [cyl([cx, cy, H - 25], [cx, cy, H - 12], r * 0.7), cyl([cx, cy, H - 12], [cx, cy, H], 14)] },
    { name: "Anse", look: body, shapes: [box([cx + r + 20, cy - 12, 70], [cx + r + 34, cy + 12, H - 40]), box([cx + r - 5, cy - 10, 70], [cx + r + 20, cy + 10, 86]), box([cx + r - 5, cy - 10, H - 56], [cx + r + 20, cy + 10, H - 40])] },
    { name: "Bec", look: body, shapes: [box([cx - r - 25, cy - 12, H - 95], [cx - r + 8, cy + 12, H - 60])] },
    { name: "Voyant", look: "display-red", shapes: [box([cx - 6, cy - r - 2, 30], [cx + 6, cy - r + 4, 42])] },
  ];
}

/** A toaster: two slots dug into its top, its lever on the right side, its browning knob in front. */
export function toaster(W: number, H: number, D: number, body: string, trim: string): AppliancePart[] {
  const right = W - 14;
  const slots: [number, number][] = [[D * 0.25, D * 0.42], [D * 0.58, D * 0.75]];
  return [
    { name: "Corps", look: body, shapes: [box([0, 0, 12], [right, D, H], slots.map(([y0, y1]) => [[40, y0, H - 130], [right - 40, y1, H + 1]]))] },
    { name: "Socle", look: "plastic-black", shapes: [box([0, 0, 0], [right, D, 12])] },
    { name: "Fentes", look: "enamel-black", shapes: slots.map(([y0, y1]) => box([40, y0, H - 130], [right - 40, y1, H - 126])) },
    { name: "Levier", look: trim, shapes: [box([right, D * 0.4, H * 0.5], [W, D * 0.6, H * 0.6])] },
    { name: "Molette", look: trim, shapes: knob(W * 0.72, H * 0.35, 0, 12, 10) },
    { name: "Touches", look: "plastic-grey", shapes: [0, 1].map((k) => box([W * 0.22 + k * 40, -1.5, H * 0.3], [W * 0.22 + k * 40 + 28, 0, H * 0.3 + 10])) },
  ];
}

/** An espresso machine: its head over the drip tray, its group and portafilter, its steam wand, a cup under it. */
export function espresso(W: number, H: number, D: number, body: string, trim: string): AppliancePart[] {
  const head = H * 0.72;
  return [
    { name: "Corps", look: body, shapes: [box([0, 60, 0], [W, D, H - 4]), box([0, 0, head], [W, 60, H - 4])] },
    { name: "Plateau chauffe-tasses", look: "steel-brushed", shapes: [box([10, 10, H - 4], [W - 10, D - 10, H])] },
    { name: "Égouttoir", look: "steel-brushed", shapes: [box([20, 0, 0], [W - 20, 60, 25])] },
    { name: "Groupe", look: "chrome", shapes: [cyl([W / 2, 32, H * 0.66], [W / 2, 32, head], 30), cyl([W / 2, 32, H * 0.6], [W / 2, 32, H * 0.66], 27)] },
    { name: "Porte-filtre", look: "plastic-black", shapes: [box([W / 2 - 10, -55, H * 0.6 + 2], [W / 2 + 10, 4, H * 0.6 + 18])] },
    { name: "Buse vapeur", look: "chrome", shapes: [cyl([W - 35, 30, head], [W - 35, 30, H * 0.42], 5)] },
    { name: "Manettes", look: trim, shapes: [...knob(40, H * 0.86, 0, 13, 14), ...knob(W - 40, H * 0.86, 0, 13, 14)] },
    { name: "Afficheur", look: "display-white", shapes: [box([W / 2 - 30, -0.5, H * 0.84], [W / 2 + 30, 0, H * 0.9])] },
    { name: "Tasse", look: "plastic-white", shapes: [cyl([W / 2, 32, 25], [W / 2, 32, 85], 28)] },
  ];
}

/** A stand mixer: its column at the back, its head over the steel bowl (its rim rolled), the whisk down into it. */
export function mixer(W: number, H: number, D: number, body: string): AppliancePart[] {
  const r = Math.min(50, W / 2 - 15);
  const bowl = Math.min(90, W / 2 - 15);
  const by = 25 + bowl;
  const rim = 180;
  const low = H - 2 * r;
  return [
    { name: "Socle", look: body, shapes: [box([W / 2 - 80, 0, 0], [W / 2 + 80, D, 35])] },
    { name: "Colonne", look: body, shapes: [box([W / 2 - 45, D - 120, 35], [W / 2 + 45, D - 25, H - r])] },
    { name: "Tête", look: body, shapes: [cyl([W / 2, 25, H - r], [W / 2, D - 25, H - r], r)] },
    { name: "Bol", look: "steel-brushed", shapes: [cyl([W / 2, by, 40], [W / 2, by, 70], bowl - 25), cyl([W / 2, by, 70], [W / 2, by, rim - 6], bowl - 5), cyl([W / 2, by, rim - 6], [W / 2, by, rim], bowl)] },
    { name: "Fouet", look: "chrome", shapes: [cyl([W / 2, by, 130], [W / 2, by, 215], 24), cyl([W / 2, by, 215], [W / 2, by, low], 6)] },
    { name: "Manette", look: "chrome", shapes: [box([W / 2 + 45, D - 90, low - 40], [W / 2 + 57, D - 60, low - 10])] },
  ];
}
