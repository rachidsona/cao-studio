/**
 * Façades d'un caisson dans le noyau : chaque pièce de fronts-parts.ts devient une planche ; les portes reçoivent
 * leurs boîtiers de charnière (Ø35, profondeur 13, centre à 22,5 mm du chant côté charnière, à 100 mm du haut et du
 * bas, plus un au milieu pour une grande porte, décalés de 32 mm quand leur embase tomberait sur une étagère), et portes et façades de tiroir leurs trous de poignée (Ø5
 * traversants, entraxe 128 mm). Une porte vitrée est un cadre en profilé alu, ouvert sur toute son épaisseur, sa rainure
 * creusée pour le verre ; ni boîtier de charnière (sa charnière se fixe dans le profilé), ses trous de poignée sur le
 * cadre.
 */
import { makeBox, makeCompound, makeCylinder, type Shape3D } from "replicad";
import type { CabinetFeature, FrontsFeature } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { frontsParts, frontsProblem } from "./fronts-parts";
import { drillings, shelvesOf } from "./fronts-drillings";
import { glassFrame, glassOpening, glassPane, isGlass } from "./glass-door";
import { cutGrooves } from "./decor-cut";
import { decorClear, decorGrooves, isDecor } from "./door-decor";
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
      // The hinge cups and handle holes, cut at once: one boolean, not one each. They never meet one another (tools that
      // overlap, as the glass opening and its groove, would give a wrong solid in one cut).
      const tools: Shape3D[] = [];
      const door = part.role?.kind === "door";
      const front = !!part.role;
      // A frame door or drawer front: the panel set back inside the frame, routed from the front face (−Y).
      if (front && feature.style === "frame") {
        const [w, d] = [feature.frameWidth ?? 70, feature.frameDepth ?? 6];
        const pocket = makeBox([part.from[0] + w, part.from[1] - 1, part.from[2] + w], [part.to[0] - w, part.from[1] + d, part.to[2] - w]) as unknown as Shape3D;
        const cut = solid.cut(pocket) as Shape3D;
        solid.delete();
        pocket.delete();
        solid = cut;
      }
      // A fluted or slatted front: its grooves in its front face, clear of a door's hinge cups when they would meet.
      if (front && isDecor(feature)) {
        const cups = door && feature.hinges ? (feature.hw?.cupDepth ?? 13) : 0;
        const clear = decorClear(feature, feature.thickness, cups);
        // The door's frame [across, up, through] is the world's [x, z, y].
        solid = cutGrooves(solid, decorGrooves(feature, part.from[0], part.to[0], part.from[2], part.to[2], clear), part.from[1], 1, ([u, v, w]) => [u, w, v]);
      }
      for (const d of drillings(part, feature, shelves)) {
        // Drilled from the inside face towards the outside (−Y).
        tools.push(makeCylinder(d.radius, d.depth + 0.01, [d.at[0], d.at[1] + 0.005, d.at[2]], [0, -1, 0]) as unknown as Shape3D);
      }
      if (tools.length) {
        // makeCompound takes the tools in: deleting the compound releases them.
        const tool = (tools.length === 1 ? tools[0]! : makeCompound(tools)) as Shape3D;
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
