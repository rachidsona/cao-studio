/**
 * Façades d'un caisson dans le noyau : chaque pièce de fronts-parts.ts devient une planche ; les portes reçoivent
 * leurs boîtiers de charnière (Ø35, profondeur 13, centre à 22,5 mm du chant côté charnière, à 100 mm du haut et du
 * bas, plus un au milieu pour une grande porte, décalés de 32 mm quand leur embase tomberait sur une étagère), et portes et façades de tiroir leurs trous de poignée (Ø5
 * traversants, entraxe 128 mm). Une porte vitrée est un cadre en profilé alu, ouvert sur toute son épaisseur, sa rainure
 * creusée pour le verre ; ni boîtier de charnière (sa charnière se fixe dans le profilé), ses trous de poignée sur le
 * cadre.
 */
import { makeBox, makeCylinder, type Shape3D } from "replicad";
import type { CabinetFeature, FrontsFeature } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { frontsParts, frontsProblem } from "./fronts-parts";
import { drillings, shelvesOf } from "./fronts-drillings";
import { glassFrame, glassOpening, glassPane, isGlass } from "./glass-door";
import type { OutputLookup } from "./common";
import type { SolidsOutput } from "./outputs";
import { turnedWith } from "./cabinet";

export function buildFronts(feature: FrontsFeature, lookup: OutputLookup, cabinet: CabinetFeature | undefined): SolidsOutput {
  void lookup;
  const problem = frontsProblem(feature, cabinet);
  if (problem) throw new GeometryError(`${feature.name} : ${problem}`);
  const shapes: Shape3D[] = [];
  const shelves = shelvesOf(cabinet);
  try {
    for (const part of frontsParts(feature, cabinet)) {
      let solid = makeBox(part.from, part.to) as unknown as Shape3D;
      // A glass door: the opening through its aluminium frame, and the groove the glass sits in.
      const glass = part.role?.kind === "door" && isGlass(feature) ? [glassOpening(part.from, part.to, 1, glassFrame(feature)), glassPane(part.from, part.to, 1, glassFrame(feature))] : [];
      for (const [a, b] of glass) {
        const tool = makeBox(a, b) as unknown as Shape3D;
        const cut = solid.cut(tool) as Shape3D;
        solid.delete();
        tool.delete();
        solid = cut;
      }
      for (const d of drillings(part, feature, shelves)) {
        // Drilled from the inside face towards the outside (−Y).
        const tool = makeCylinder(d.radius, d.depth + 0.01, [d.at[0], d.at[1] + 0.005, d.at[2]], [0, -1, 0]) as unknown as Shape3D;
        const cut = solid.cut(tool) as Shape3D;
        solid.delete();
        tool.delete();
        solid = cut;
      }
      if (!isShapeValid(solid)) {
        solid.delete();
        throw new GeometryError(`${feature.name} : la pièce « ${part.name} » est invalide.`);
      }
      shapes.push(cabinet ? turnedWith(solid, cabinet) : solid);
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}
