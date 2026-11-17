/**
 * Les pièces d'un appareil de la bibliothèque (features/appliance-library.ts), dans son repère : x le long de sa
 * largeur depuis sa gauche, y depuis sa face avant (0) vers le mur, z depuis son dessous (une plaque, un évier : le
 * dessous de leur corps, sous le plan de travail ; leur plateau en haut, posé dessus). Chaque pièce est une ou plusieurs
 * formes simples (features/appliance-shapes.ts) avec son apparence, pour qu'un four ait sa porte en verre noir, son
 * hublot, sa poignée et ses manettes, une plaque gaz ses grilles en fonte, un robinet son col de cygne. Les pièces de
 * chaque famille sont dans appliance-parts-cooking.ts (fours, micro-ondes, plaques), appliance-parts-cold.ts
 * (réfrigérateurs, caves à vin, lave-vaisselle), appliance-parts-water.ts (hottes, éviers, robinets) et
 * appliance-parts-more.ts (machine à café, tiroir chauffe-plat, plaque aspirante, lave-linge),
 * appliance-parts-extra.ts (piano de cuisson, multi-portes, congélateur, sèche-linge, teppanyaki) et
 * appliance-parts-small.ts (bouilloire, grille-pain, expresso, robot pâtissier).
 *
 * Chaque pièce est le corps « <id>#n » de l'appareil, son apparence gardée par son rang : les premières pièces de chaque
 * modèle restent dans leur ordre, celles ajoutées depuis viennent après (document/appliance-looks.ts les habille dans
 * un projet enregistré avant elles). Toutes tiennent dans son encombrement : sa boîte, plus ce qui dépasse devant sa
 * face (porte, poignée, manettes) et au-dessus d'un plateau (grilles d'une plaque gaz). Pur.
 */
import type { Vec3 } from "../document/types";
import { applianceDef, finishLooks, type ApplianceCategory } from "./appliance-library";
import { hob, microwave, oven } from "./appliance-parts-cooking";
import { dishwasher, fridge, sidesOf, wine } from "./appliance-parts-cold";
import { coffee, hobExtract, warmingDrawer, washer } from "./appliance-parts-more";
import { dryer, freezer, fridgeFrench, range, teppan } from "./appliance-parts-extra";
import { espresso, kettle, mixer, toaster } from "./appliance-parts-small";
import { hood, sink, tap } from "./appliance-parts-water";
import type { AppliancePart } from "./appliance-shapes";

export type { AppliancePart, ApplianceShape } from "./appliance-shapes";

export interface ApplianceSpec {
  model: string;
  width: number;
  height: number;
  depth: number;
  finish: string;
}

/** How far its door, its handles and its knobs stand out in front of its box (mm). */
const FRONT: Record<ApplianceCategory, number> = { oven: 70, microwave: 60, hob: 0, hood: 10, fridge: 50, wine: 65, dishwasher: 60, sink: 0, tap: 0, small: 60 };

/** The space its pieces take in its own frame: its box, with what stands out in front and on top. */
export function applianceEnvelope(f: ApplianceSpec): [Vec3, Vec3] {
  const category = applianceDef(f.model)?.category;
  const front = category ? FRONT[category] : 0;
  // On top of its plate: a gas hob's grids and knobs, an induction hob's printed zones, a sink's drainer.
  const above = f.model === "hob-gas" ? 35 : category === "hob" ? 1 : category === "sink" ? 3 : 0;
  return [[0, -front, 0], [f.width, f.depth, f.height + above]];
}

/** Every piece of an appliance, in its own frame; none when its model is unknown. */
export function applianceParts(f: ApplianceSpec): AppliancePart[] {
  const def = applianceDef(f.model);
  if (!def) return [];
  const L = finishLooks(f.finish, def.category);
  const [W, H, D] = [f.width, f.height, f.depth];
  const by: Record<ApplianceCategory, () => AppliancePart[]> = {
    oven: () => (f.model === "range-90" ? range(W, H, D, L, sidesOf(L)) : f.model === "coffee-builtin" ? coffee(W, H, D, L) : f.model === "drawer-warming" ? warmingDrawer(W, H, D, L) : oven(W, H, D, L)),
    microwave: () => microwave(W, H, D, L, f.model === "microwave-free"),
    hob: () => (f.model === "hob-extract" ? hobExtract(W, H, D) : f.model === "hob-teppan" ? teppan(W, H, D) : hob(W, H, D, L, f.model === "hob-gas")),
    hood: () => hood(f.model, W, H, D, L),
    fridge: () => (f.model === "fridge-french" ? fridgeFrench(W, H, D, L, sidesOf(L)) : f.model === "freezer-builtin" ? freezer(W, H, D) : fridge(f.model, W, H, D, L)),
    wine: () => wine(W, H, D, L),
    dishwasher: () => (f.model === "dryer-free" ? dryer(W, H, D, L, sidesOf(L)) : f.model.startsWith("washer") ? washer(f.model, W, H, D, L, sidesOf(L)) : dishwasher(f.model, W, H, D, L)),
    sink: () => sink(f.model, W, H, D, L),
    tap: () => tap(f.model, W, H, D, L),
    small: () => {
      const body = sidesOf(L);
      return f.model === "kettle" ? kettle(W, H, D, body, L.trim) : f.model === "toaster" ? toaster(W, H, D, body, L.trim) : f.model === "espresso" ? espresso(W, H, D, body, L.trim) : mixer(W, H, D, body);
    },
  };
  return by[def.category]();
}

/** The names of its pieces, in body order. */
export const appliancePartNames = (f: ApplianceSpec): string[] => applianceParts(f).map((p) => p.name);
