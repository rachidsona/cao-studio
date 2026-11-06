/**
 * Le style d'un dressing : une matière pour la carcasse et les étagères, une pour les façades, une poignée, un socle,
 * appliqués d'un coup à tout le projet. Les fonds gardent la leur, les murs et l'électroménager aussi. Pur.
 */
import { bodyFamily } from "./display-families";
import { setBodyInfo } from "./materials";
import type { CadDocument } from "./types";

export interface DressingStyle {
  name: string;
  carcass: string;
  fronts: string;
  /** A handle of the catalogue, or the one of the project. */
  handle?: string;
}

export const STYLES: DressingStyle[] = [
  { name: "Blanc mat", carcass: "melamine-white", fronts: "lacquer-white" },
  { name: "Chêne clair", carcass: "melamine-oak", fronts: "melamine-oak" },
  { name: "Chêne et blanc", carcass: "melamine-white", fronts: "melamine-oak" },
  { name: "Chêne et noir", carcass: "melamine-anthracite", fronts: "melamine-oak" },
  { name: "Noyer", carcass: "melamine-walnut", fronts: "melamine-walnut" },
  { name: "Anthracite", carcass: "melamine-anthracite", fronts: "melamine-anthracite" },
];

/** These bodies in this style, with the handle of the project if it names one. */
export function withStyle(base: CadDocument, bodies: readonly string[], style: DressingStyle): CadDocument {
  const of = (...families: string[]) => bodies.filter((id) => families.includes(bodyFamily(base, id)));
  const doc = setBodyInfo(setBodyInfo(base, of("carcass", "shelves", "plinths"), { material: style.carcass }), of("fronts"), { material: style.fronts });
  return style.handle ? { ...doc, hardware: { ...doc.hardware, handle: style.handle } } : doc;
}
