/**
 * Catalogue de quincaillerie réelle : charnières, coulisses et poignées du commerce (Blum, Hettich, Grass, Häfele),
 * avec ce qui compte pour l'atelier — cuvette (diamètre, profondeur, bord → centre), entraxe et trou des poignées,
 * charge et sortie des coulisses — et un prix indicatif. Le choix du projet (`doc.hardware`) donne leur nom et leur
 * prix aux listes de quincaillerie (devis, notice) et leurs cotes aux perçages des façades et des portes : il est
 * recopié dans les équipements et façades envoyés au noyau (`stampHardware`). Les cotes sont les valeurs courantes de
 * chaque gamme : à vérifier sur la fiche du fabricant avant d'usiner une série. Les prix, notés en euros, sont donnés en
 * dirhams (MAD, à 10,8 MAD l'euro, document/quote.ts).
 */
import { mad } from "./quote";
import type { CadDocument, Feature, HardwareSizes } from "./types";

/** The prices below are noted in euros: in dirhams. */
const inMad = <T extends { price: number }>(models: T[]): T[] => models.map((m) => ({ ...m, price: mad(m.price) }));

export interface HingeModel {
  id: string;
  label: string;
  reference?: string;
  /** Cup: diameter and depth, and the distance from the door's edge to its centre (mm). */
  cup: { diameter: number; depth: number; edge: number };
  opening: number;
  softClose: boolean;
  price: number;
}

export interface SlideModel {
  id: string;
  label: string;
  reference?: string;
  /** Load (kg), full extension, soft close. */
  load: number;
  full: boolean;
  softClose: boolean;
  /** Price of a pair. */
  price: number;
}

export interface HandleModel {
  id: string;
  label: string;
  reference?: string;
  /** Distance between the two holes (mm); 0: a knob, one hole. */
  spacing: number;
  /** Diameter of the holes (mm). */
  hole: number;
  price: number;
}

export const HINGE_MODELS: HingeModel[] = inMad([
  { id: "generic", label: "Charnière à boîtier Ø35", cup: { diameter: 35, depth: 13, edge: 22.5 }, opening: 110, softClose: false, price: 3.5 },
  { id: "blum-cliptop-blumotion", label: "Blum CLIP top BLUMOTION 110°", reference: "71B3550", cup: { diameter: 35, depth: 13, edge: 22.5 }, opening: 110, softClose: true, price: 9 },
  { id: "blum-cliptop-155", label: "Blum CLIP top 155° (grand angle)", cup: { diameter: 35, depth: 13, edge: 22.5 }, opening: 155, softClose: false, price: 12 },
  { id: "hettich-sensys", label: "Hettich Sensys 110° amortie", cup: { diameter: 35, depth: 13.5, edge: 22.5 }, opening: 110, softClose: true, price: 7.5 },
  { id: "grass-tiomos", label: "Grass Tiomos 110° amortie", cup: { diameter: 35, depth: 13, edge: 22.5 }, opening: 110, softClose: true, price: 8 },
  { id: "hafele-metalla", label: "Häfele Metalla 510 110°", cup: { diameter: 35, depth: 12.5, edge: 22.5 }, opening: 110, softClose: false, price: 3 },
  { id: "small-26", label: "Charnière petit boîtier Ø26 (portes fines)", cup: { diameter: 26, depth: 11.5, edge: 18 }, opening: 95, softClose: false, price: 4 },
]);

export const SLIDE_MODELS: SlideModel[] = inMad([
  { id: "generic", label: "Coulisse de tiroir (paire)", load: 25, full: true, softClose: false, price: 18 },
  { id: "blum-tandem", label: "Blum TANDEM plus BLUMOTION 550H (paire)", reference: "550H", load: 30, full: true, softClose: true, price: 42 },
  { id: "blum-movento", label: "Blum MOVENTO 760H (paire)", reference: "760H", load: 40, full: true, softClose: true, price: 58 },
  { id: "hettich-actro", label: "Hettich Actro 5D (paire)", load: 40, full: true, softClose: true, price: 55 },
  { id: "hettich-quadro", label: "Hettich Quadro V6 (paire)", load: 30, full: false, softClose: true, price: 32 },
  { id: "grass-dynapro", label: "Grass Dynapro (paire)", load: 40, full: true, softClose: true, price: 50 },
  { id: "ball-45", label: "Coulisse à billes 45 mm, sortie totale (paire)", load: 45, full: true, softClose: false, price: 14 },
]);

export const HANDLE_MODELS: HandleModel[] = inMad([
  { id: "generic", label: "Poignée entraxe 128 mm", spacing: 128, hole: 5, price: 6 },
  { id: "bar-96", label: "Poignée barre entraxe 96 mm", spacing: 96, hole: 5, price: 5 },
  { id: "bar-160", label: "Poignée barre entraxe 160 mm", spacing: 160, hole: 5, price: 7 },
  { id: "bar-192", label: "Poignée barre entraxe 192 mm", spacing: 192, hole: 5, price: 8 },
  { id: "bar-320", label: "Poignée barre entraxe 320 mm", spacing: 320, hole: 5, price: 12 },
  { id: "knob", label: "Bouton (un trou)", spacing: 0, hole: 5, price: 3 },
]);

export interface HardwareChoice {
  hinge: HingeModel;
  slide: SlideModel;
  handle: HandleModel;
}

const pick = <T extends { id: string }>(list: T[], id: string | undefined): T => list.find((m) => m.id === id) ?? list[0]!;

/** The hardware chosen for the project (the generic models when nothing is chosen). */
export function chosenHardware(doc: Pick<CadDocument, "hardware">): HardwareChoice {
  return { hinge: pick(HINGE_MODELS, doc.hardware?.hinge), slide: pick(SLIDE_MODELS, doc.hardware?.slide), handle: pick(HANDLE_MODELS, doc.hardware?.handle) };
}

/** The display name of a model: "Blum CLIP top BLUMOTION 110° (réf. 71B3550)". */
export const modelName = (m: { label: string; reference?: string }) => (m.reference ? `${m.label} (réf. ${m.reference})` : m.label);

/** Names used by the hardware lists for the generic parts. */
export const GENERIC = { hinge: "Charnière à boîtier Ø35", slide: "Coulisse de tiroir (paire)", handle: "Poignée entraxe 128 mm" } as const;

/** A hardware list with the chosen models' names and their prices (indicative, MAD HT each). */
export function catalogItems<T extends { name: string; quantity: number; unit?: string }>(doc: Pick<CadDocument, "hardware">, items: readonly T[]): (T & { price?: number })[] {
  const choice = chosenHardware(doc);
  const byName: Record<string, HingeModel | SlideModel | HandleModel> = { [GENERIC.hinge]: choice.hinge, [GENERIC.slide]: choice.slide, [GENERIC.handle]: choice.handle };
  return items.map((item) => {
    const model = byName[item.name];
    // The generic models keep their name, priced by the quote's own rates.
    return model && model.id !== "generic" ? { ...item, name: modelName(model), price: model.price } : { ...item };
  });
}

/** What the chosen hardware sets in the drillings of fronts and doors. */
export function hardwareGeometry(doc: Pick<CadDocument, "hardware">): HardwareSizes {
  const { hinge, handle } = chosenHardware(doc);
  return { handleSpacing: handle.spacing, handleHole: handle.hole, cupDiameter: hinge.cup.diameter, cupDepth: hinge.cup.depth, cupEdge: hinge.cup.edge };
}

/**
 * The document the kernel builds: the chosen hardware's sizes copied into the drawers, doors and fronts (so a change
 * of model rebuilds them). Without a choice, the document as it is.
 */
export function stampHardware(doc: CadDocument): CadDocument {
  if (!doc.hardware) return doc;
  const hw = hardwareGeometry(doc);
  const stamp = (f: Feature): Feature => (f.type === "fronts" || (f.type === "niche" && (f.fill === "drawers" || f.fill === "doors" || f.fill === "door")) ? { ...f, hw } : f);
  return { ...doc, features: doc.features.map(stamp) };
}
