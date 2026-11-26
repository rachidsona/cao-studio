/**
 * Accessoires intérieurs achetés, posés dans une niche de « Répartition » : pour la cuisine (range-couverts, poubelle
 * coulissante, panier fil, range-bouteilles, égouttoir, et pour un meuble d'angle : plateaux tournants, demi-lunes
 * pivotantes, « magic corner ») et pour le dressing (porte-pantalons, panier, porte-chaussures,
 * porte-cravates, miroir pivotant, penderie escamotable), et la tablette coulissante (une planche débitée sur une
 * paire de coulisses). Chaque modèle dit la largeur de niche qu'il accepte, la profondeur qu'il lui faut et la hauteur
 * qu'il prend : l'outil refuse une niche où il ne tient pas. Les pièces sont dessinées simplement, dans le repère de
 * la niche (niche-parts.ts : u en largeur, v vers le haut, w en profondeur, l'avant des panneaux à w = profondeur) ;
 * achetées, elles vont au devis à leur prix indicatif et restent hors du débit — sauf la tablette. Les cotes sont des
 * repères courants du commerce : la fiche du fabricant fait foi. Pur.
 */
import { mad } from "../document/quote";
import type { NicheFeature, Vec3 } from "../document/types";
import type { NicheGeometry, NichePart } from "./niche-parts";

type Shape = "tray" | "basket" | "bins" | "bottles" | "drainer" | "carousel" | "halfmoon" | "magic" | "trousers" | "shoes" | "ties" | "mirror" | "pulldown" | "shelf" | "rails";

export interface AccessoryModel {
  id: string;
  /** Its name, in the lists and in the quote. */
  label: string;
  room: "kitchen" | "dressing";
  shape: Shape;
  /** The clear width of the niche it fits: from, to (mm). */
  width: [number, number];
  /** The depth it needs and the height it takes (mm). */
  depth: number;
  height: number;
  /** Hung under the top of the niche (else it stands `lift` above its bottom). */
  hung?: boolean;
  /** How many bins, levels or pegs it has. */
  count?: number;
  /** Indicative price, noted in euros as the rest of the hardware; none: made in the workshop, its hardware is quoted. */
  euros?: number;
}

const model = (m: AccessoryModel): AccessoryModel => m;

/** Its indicative price in the quote's currency (MAD HT), or undefined. */
export const accessoryPrice = (m: AccessoryModel): number | undefined => (m.euros === undefined ? undefined : mad(m.euros));

export const ACCESSORIES: AccessoryModel[] = [
  model({ id: "cutlery", label: "Range-couverts à recouper", room: "kitchen", shape: "tray", width: [250, 1150], depth: 400, height: 55, euros: 18 }),
  model({ id: "bin-2", label: "Poubelle coulissante 2 bacs", room: "kitchen", shape: "bins", width: [330, 480], depth: 450, height: 420, count: 2, euros: 75 }),
  model({ id: "bin-3", label: "Poubelle coulissante 3 bacs", room: "kitchen", shape: "bins", width: [480, 900], depth: 450, height: 420, count: 3, euros: 110 }),
  model({ id: "basket-kitchen", label: "Panier coulissant fil chromé", room: "kitchen", shape: "basket", width: [260, 870], depth: 450, height: 150, euros: 32 }),
  model({ id: "bottles", label: "Range-bouteilles coulissant", room: "kitchen", shape: "bottles", width: [110, 270], depth: 450, height: 480, count: 2, euros: 60 }),
  model({ id: "drainer", label: "Égouttoir de meuble haut", room: "kitchen", shape: "drainer", width: [360, 870], depth: 250, height: 300, euros: 28 }),
  // For a corner base unit: round trays turning on a pole, half-moons swinging out, baskets pulled from the blind corner.
  model({ id: "carousel", label: "Plateaux tournants d'angle (2 niveaux)", room: "kitchen", shape: "carousel", width: [700, 1000], depth: 480, height: 600, count: 2, euros: 95 }),
  model({ id: "halfmoon", label: "Demi-lunes pivotantes (2 plateaux)", room: "kitchen", shape: "halfmoon", width: [400, 600], depth: 450, height: 600, count: 2, euros: 120 }),
  model({ id: "magic-corner", label: "Magic corner (paniers d'angle coulissants)", room: "kitchen", shape: "magic", width: [450, 600], depth: 480, height: 650, count: 2, euros: 380 }),
  model({ id: "trousers", label: "Porte-pantalons coulissant", room: "dressing", shape: "trousers", width: [400, 1000], depth: 450, height: 100, euros: 45 }),
  model({ id: "basket-wardrobe", label: "Panier coulissant de dressing", room: "dressing", shape: "basket", width: [360, 970], depth: 400, height: 180, euros: 38 }),
  model({ id: "shoes", label: "Porte-chaussures coulissant", room: "dressing", shape: "shoes", width: [460, 970], depth: 400, height: 160, euros: 42 }),
  model({ id: "ties", label: "Porte-cravates et ceintures coulissant", room: "dressing", shape: "ties", width: [120, 3000], depth: 400, height: 90, count: 6, euros: 22 }),
  model({ id: "mirror", label: "Miroir pivotant coulissant", room: "dressing", shape: "mirror", width: [120, 3000], depth: 400, height: 1000, euros: 85 }),
  model({ id: "pulldown", label: "Penderie escamotable", room: "dressing", shape: "pulldown", width: [450, 1150], depth: 450, height: 900, hung: true, euros: 90 }),
  model({ id: "shelf", label: "Tablette coulissante", room: "dressing", shape: "shelf", width: [200, 1200], depth: 300, height: 60 }),
  // In place of the top of a sink's caisson (its top open): two rails of its panels' board, 10 cm wide, made in the workshop.
  model({ id: "sink-rails", label: "Traverses d'évier (à la place du dessus)", room: "kitchen", shape: "rails", width: [150, 2400], depth: 150, height: 100, hung: true }),
];

export const ROOMS: Record<AccessoryModel["room"], string> = { kitchen: "Cuisine", dressing: "Dressing" };

export const accessoryModel = (id: string | undefined): AccessoryModel | undefined => ACCESSORIES.find((m) => m.id === id);

/** How far its front stands behind the front of the panels, the thickness and height of a slide (mm). */
export const SET_BACK = 20;
const SLIDE = 12;
const SLIDE_HEIGHT = 35;
/** The slides of a pull-out shelf: the quote's own (the model chosen for the project names and prices them). */
export const SHELF_SLIDES = "Coulisse de tiroir (paire)";

type Settings = Pick<NicheFeature, "accessory" | "thickness">;

/** Why this accessory cannot go in this niche, or null. */
export function accessoryProblem(f: Settings, n: Pick<NicheGeometry, "box" | "depth" | "cut">): string | null {
  const m = accessoryModel(f.accessory?.model);
  if (!m || !f.accessory) return "Cet accessoire n'est plus au catalogue : choisissez-en un autre.";
  if (n.cut) return "Pas d'accessoire coulissant dans un angle coupé : il sortirait par le pan coupé.";
  const [width, height] = [n.box.x1 - n.box.x0, n.box.y1 - n.box.y0];
  const lift = m.hung ? 0 : f.accessory.lift;
  if (!(lift >= 0)) return "La hauteur du bas ne peut pas être négative.";
  if (width < m.width[0] - 1e-6) return `La niche est trop étroite pour « ${m.label} » : ${m.width[0]} mm de large au moins.`;
  if (width > m.width[1] + 1e-6) return `La niche est trop large pour « ${m.label} » : ${m.width[1]} mm au plus.`;
  if (n.depth < m.depth + SET_BACK) return `La niche n'est pas assez profonde pour « ${m.label} » : ${m.depth + SET_BACK} mm au moins.`;
  if (lift + m.height > height + 1e-6) return m.hung || lift === 0 ? `La niche est trop basse pour « ${m.label} » : ${m.height} mm de haut au moins.` : `« ${m.label} » dépasse le haut de la niche : descendez-le ou choisissez une niche plus haute.`;
  if (m.shape === "shelf" && !(f.thickness > 0)) return "L'épaisseur de la tablette doit être positive.";
  return null;
}

/** The parts of the accessory, in body order (none when it does not fit). */
export function accessoryParts(f: Settings, n: Pick<NicheGeometry, "box" | "depth" | "cut">): NichePart[] {
  const m = accessoryModel(f.accessory?.model);
  if (!m || accessoryProblem(f, n)) return [];
  const { x0: a, x1: b, y0, y1 } = n.box;
  const h = m.height;
  // Its bottom, its front and its back.
  const z = m.hung ? y1 - h : y0 + (f.accessory?.lift ?? 0);
  const fw = n.depth - SET_BACK;
  const bw = fw - m.depth;
  const mid = (a + b) / 2;
  const parts: NichePart[] = [];
  const box = (name: string, from: Vec3, to: Vec3, cut = false) => parts.push({ name, kind: "box", from, to, ...(cut ? {} : { role: "hardware" as const }) });
  const bar = (name: string, from: Vec3, to: Vec3, radius: number) => parts.push({ name, kind: "rod", from, to, radius, role: "hardware" });
  const slides = (at: number) => {
    box("Coulisse gauche", [a, at, bw], [a + SLIDE, at + SLIDE_HEIGHT, fw]);
    box("Coulisse droite", [b - SLIDE, at, bw], [b, at + SLIDE_HEIGHT, fw]);
  };
  /** An open box of thin walls between u0 and u1, from `at` up by `up`: bottom, front, back, left, right. */
  const basket = (name: string, u0: number, u1: number, at: number, up: number, w0 = bw, w1 = fw, wall = 4) => {
    box(`${name} — fond`, [u0, at, w0], [u1, at + wall, w1]);
    box(`${name} — avant`, [u0, at + wall, w1 - wall], [u1, at + up, w1]);
    box(`${name} — arrière`, [u0, at + wall, w0], [u1, at + up, w0 + wall]);
    box(`${name} — côté gauche`, [u0, at + wall, w0 + wall], [u0 + wall, at + up, w1 - wall]);
    box(`${name} — côté droit`, [u1 - wall, at + wall, w0 + wall], [u1, at + up, w1 - wall]);
  };
  switch (m.shape) {
    case "tray": {
      basket("Range-couverts", a + 2, b - 2, z, h, bw, fw, 3);
      // Compartments about 120 mm wide.
      const cells = Math.max(2, Math.min(8, Math.round((b - a) / 120)));
      for (let i = 1; i < cells; i++) {
        const u = a + ((b - a) * i) / cells;
        box(`Séparation ${i}`, [u - 1.5, z + 3, bw + 3], [u + 1.5, z + h - 8, fw - 3]);
      }
      break;
    }
    case "basket":
      slides(z + h - SLIDE_HEIGHT);
      basket("Panier", a + SLIDE + 2, b - SLIDE - 2, z, h - 10);
      break;
    case "bins": {
      const count = m.count ?? 2;
      box("Châssis coulissant", [a + 10, z, bw], [b - 10, z + 25, fw]);
      const [u0, u1] = [Math.max(a + 25, mid - 170), Math.min(b - 25, mid + 170)];
      const each = (m.depth - 20) / count;
      for (let i = 0; i < count; i++) box(`Bac ${i + 1}`, [u0, z + 25, bw + 10 + i * each], [u1, z + h, bw + i * each + each]);
      break;
    }
    case "bottles": {
      box("Coulisse basse", [a + 8, z, bw], [b - 8, z + 25, fw]);
      box("Montant arrière", [mid - 8, z + 25, bw], [mid + 8, z + h, bw + 12]);
      box("Montant avant", [mid - 8, z + 25, fw - 12], [mid + 8, z + h, fw]);
      const levels = m.count ?? 2;
      for (let i = 0; i < levels; i++) basket(`Panier ${i + 1}`, a + 8, b - 8, z + 25 + (i * (h - 25)) / levels, 70, bw + 12, fw - 12);
      break;
    }
    case "drainer":
      box("Bac de récupération", [a + 2, z, bw], [b - 2, z + 8, fw]);
      box("Égouttoir à assiettes", [a, z + 40, bw], [b, z + 55, fw]);
      box("Égouttoir à verres", [a, z + h - 15, bw], [b, z + h, fw]);
      break;
    case "carousel": {
      // Round trays on a pole in the middle of the niche, the biggest that turns in it.
      const r = Math.min(b - a, m.depth) / 2 - 15;
      const w = bw + m.depth / 2;
      bar("Axe", [mid, z, w], [mid, z + h, w], 12);
      const levels = m.count ?? 2;
      for (let i = 0; i < levels; i++) {
        const at = z + 20 + (i * (h - 60)) / Math.max(1, levels - 1);
        bar(`Plateau ${i + 1}`, [mid, at, w], [mid, at + 8, w], r);
        bar(`Rebord ${i + 1}`, [mid, at + 8, w], [mid, at + 40, w], r - 2);
      }
      // A grip on the rim of each tray, at the front: it shows them turning (after the rest, the bodies keep their order).
      for (let i = 0; i < levels; i++) {
        const at = z + 20 + (i * (h - 60)) / Math.max(1, levels - 1);
        box(`Poignée ${i + 1}`, [mid - 50, at + 14, w + r - 4], [mid + 50, at + 36, w + r + 8]);
      }
      break;
    }
    case "halfmoon": {
      // Trays as wide as the niche, swung on a post at the hinge side: drawn closed.
      box("Montant pivot", [a + 10, z, fw - 60], [a + 40, z + h, fw - 30]);
      const levels = m.count ?? 2;
      for (let i = 0; i < levels; i++) {
        const at = z + 30 + (i * (h - 90)) / Math.max(1, levels - 1);
        basket(`Plateau demi-lune ${i + 1}`, a + 40, b - 10, at, 50, bw + 20, fw - 10, 5);
      }
      break;
    }
    case "magic": {
      // A frame pulled out with the door, and baskets behind it fetched from the blind corner.
      box("Châssis coulissant", [a + 10, z, bw], [a + 30, z + h, fw]);
      slides(z);
      const levels = m.count ?? 2;
      for (let i = 0; i < levels; i++) {
        const at = z + 40 + (i * (h - 200)) / Math.max(1, levels - 1);
        basket(`Panier avant ${i + 1}`, a + 30, b - SLIDE - 5, at, 110, fw - m.depth / 2 + 5, fw - 5);
        basket(`Panier arrière ${i + 1}`, a + 30, b - SLIDE - 5, at, 110, bw + 5, fw - m.depth / 2 - 5);
      }
      break;
    }
    case "trousers": {
      slides(z + h - SLIDE_HEIGHT);
      box("Traverse avant", [a + SLIDE, z + h - 60, fw - 20], [b - SLIDE, z + h - 40, fw]);
      box("Traverse arrière", [a + SLIDE, z + h - 60, bw], [b - SLIDE, z + h - 40, bw + 20]);
      const bars = Math.max(3, Math.min(9, Math.round((b - a - 60) / 100)));
      for (let i = 0; i < bars; i++) {
        const u = a + 40 + ((b - a - 80) * i) / (bars - 1);
        bar(`Barre ${i + 1}`, [u, z + h - 50, bw + 20], [u, z + h - 50, fw - 20], 6);
      }
      break;
    }
    case "shoes":
      slides(z + h - SLIDE_HEIGHT);
      box("Flasque gauche", [a + SLIDE, z, bw], [a + SLIDE + 4, z + h, fw]);
      box("Flasque droite", [b - SLIDE - 4, z, bw], [b - SLIDE, z + h, fw]);
      bar("Barre avant", [a + SLIDE + 4, z + 40, fw - 60], [b - SLIDE - 4, z + 40, fw - 60], 6);
      bar("Barre arrière", [a + SLIDE + 4, z + 110, bw + 60], [b - SLIDE - 4, z + 110, bw + 60], 6);
      break;
    case "ties": {
      box("Coulisse", [a, z + h - 40, bw], [a + 15, z + h, fw]);
      bar("Barre", [a + 45, z + h - 20, bw + 20], [a + 45, z + h - 20, fw - 20], 5);
      const pegs = m.count ?? 6;
      for (let i = 0; i < pegs; i++) {
        const w = bw + 40 + ((m.depth - 80) * i) / (pegs - 1);
        bar(`Patère ${i + 1}`, [a + 15, z + h - 20, w], [a + 95, z + h - 20, w], 3);
      }
      break;
    }
    case "mirror":
      box("Coulisse", [a, z + h - 45, bw], [a + 20, z + h, fw]);
      box("Miroir", [a + 26, z, bw + 10], [a + 31, z + h - 50, fw - 10]);
      break;
    case "pulldown": {
      const w = n.depth / 2;
      box("Bras gauche", [a + 6, y1 - 320, w - 12], [a + 26, y1 - 20, w + 12]);
      box("Bras droit", [b - 26, y1 - 320, w - 12], [b - 6, y1 - 20, w + 12]);
      bar("Tringle", [a + 26, y1 - 300, w], [b - 26, y1 - 300, w], 12.5);
      bar("Tige de tirage", [mid, z, w], [mid, y1 - 300, w], 5);
      break;
    }
    case "rails": {
      // As a sink unit's (features/cabinet-parts.ts): the front one lying flat, the back one on its edge — where the top
      // board would be, over the niche (its caisson's top is open: document/cabinet-furnish.ts), level with the sides' top.
      const t = f.thickness > 0 ? f.thickness : 18;
      box("Traverse avant", [a, y1, n.depth - h], [b, y1 + t, n.depth], true);
      box("Traverse arrière", [a, y1 + t - h, 0], [b, y1 + t, t], true);
      break;
    }
    case "shelf":
      slides(z);
      box("Tablette coulissante", [a + SLIDE + 1, z + SLIDE_HEIGHT, bw], [b - SLIDE - 1, z + SLIDE_HEIGHT + f.thickness, fw], true);
      break;
  }
  return parts;
}

/** What to buy for it: the accessory at its indicative price; for a pull-out shelf, its pair of slides. */
export function accessoryHardware(f: Settings, parts: readonly NichePart[]): { name: string; quantity: number; price?: number }[] {
  const m = accessoryModel(f.accessory?.model);
  if (!m || !parts.length) return [];
  const price = accessoryPrice(m);
  // Rails are boards of the caisson: nothing to buy.
  if (m.shape === "rails") return [];
  return m.shape === "shelf" ? [{ name: SHELF_SLIDES, quantity: 1 }] : [{ name: m.label, quantity: 1, ...(price === undefined ? {} : { price }) }];
}

/**
 * How a part looks until the body is given a look of its own: the mirror a mirror, bins and trays grey plastic, the
 * rest chromed steel; the board of a pull-out shelf as its material (none here).
 */
export function accessoryLook(part: Pick<NichePart, "name" | "role">): string | undefined {
  if (part.role !== "hardware") return undefined;
  if (part.name === "Miroir") return "mirror";
  return /^(Bac|Range-couverts|Séparation|Plateau [0-9]|Rebord)/.test(part.name) ? "plastic-grey" : "chrome";
}

/** A part as a box of the niche's frame: a bar by the square around it. */
export function partBounds(part: Pick<NichePart, "kind" | "from" | "to" | "radius">): { from: Vec3; to: Vec3 } {
  if (part.kind === "box") return { from: part.from, to: part.to };
  const r = part.radius ?? 1;
  const along = [0, 1, 2].map((i) => Math.abs(part.to[i]! - part.from[i]!) > 1e-9);
  return {
    from: [0, 1, 2].map((i) => Math.min(part.from[i]!, part.to[i]!) - (along[i] ? 0 : r)) as Vec3,
    to: [0, 1, 2].map((i) => Math.max(part.from[i]!, part.to[i]!) + (along[i] ? 0 : r)) as Vec3,
  };
}
