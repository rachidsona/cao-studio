/**
 * Façades d'un caisson dans le noyau : chaque pièce de fronts-parts.ts devient une planche ; les portes reçoivent
 * leurs boîtiers de charnière (Ø35, profondeur 13, centre à 22,5 mm du chant côté charnière, à 100 mm du haut et du
 * bas, plus un au milieu pour une grande porte, décalés de 32 mm quand leur embase tomberait sur une étagère), et portes et façades de tiroir leurs trous de poignée (Ø5
 * traversants, entraxe 128 mm). Une porte vitrée est un cadre en profilé alu, ouvert sur toute son épaisseur, sa rainure
 * creusée pour le verre ; ni boîtier de charnière (sa charnière se fixe dans le profilé), ses trous de poignée sur le
 * cadre.
 */
import { makeBox, makeCylinder, type Shape3D } from "replicad";
import type { CabinetFeature, FrontsFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { cabinetParts } from "./cabinet-parts";
import { frontsParts, frontsProblem, hingeCount, hingeHeights, type FrontPart } from "./fronts-parts";
import { glassFrame, glassOpening, glassPane, handleInset, isGlass } from "./glass-door";
import type { OutputLookup } from "./common";
import type { SolidsOutput } from "./outputs";
import { turnedWith } from "./cabinet";

/** Where the drill goes in a front: hinge cups on the inside face, handle holes through. */
function drillings(part: FrontPart, f: FrontsFeature, shelves: [number, number][]): { at: Vec3; radius: number; depth: number }[] {
  const role = part.role;
  if (!role) return [];
  const [x0, y0, z0] = part.from;
  const [x1, y1, z1] = part.to;
  const inside = y1; // the face towards the cabinet (+Y)
  const out: { at: Vec3; radius: number; depth: number }[] = [];
  if (role.kind === "door" && f.hinges && !isGlass(f)) {
    const cup = { edge: f.hw?.cupEdge ?? 22.5, radius: (f.hw?.cupDiameter ?? 35) / 2, depth: f.hw?.cupDepth ?? 13 };
    const x = role.hinge === "left" ? x0 + cup.edge : x1 - cup.edge;
    // Kept clear of the shelves: a hinge's plate on the side cannot sit on one.
    for (const z of hingeHeights(z0, z1, hingeCount(z1 - z0), shelves).heights) out.push({ at: [x, inside, z], radius: cup.radius, depth: cup.depth });
  }
  if (f.handles) {
    // The chosen handle's spacing (one hole for a knob) and hole.
    const spacing = f.hw?.handleSpacing ?? 128;
    const pair = spacing > 0 ? [-spacing / 2, spacing / 2] : [0];
    const radius = (f.hw?.handleHole ?? 5) / 2;
    if (role.kind === "door") {
      // Vertical pair near the opening edge, in the upper part of the door.
      const x = role.hinge === "left" ? x1 - handleInset(f) : x0 + handleInset(f);
      const zc = Math.max(z0 + 100, z1 - 150);
      for (const dz of pair) out.push({ at: [x, inside, zc + dz], radius, depth: y1 - y0 });
    } else {
      // Horizontal pair in the middle of the drawer front.
      const [xc, zc] = [(x0 + x1) / 2, (z0 + z1) / 2];
      for (const dx of pair) out.push({ at: [xc + dx, inside, zc], radius, depth: y1 - y0 });
    }
  }
  return out;
}

export function buildFronts(feature: FrontsFeature, lookup: OutputLookup, cabinet: CabinetFeature | undefined): SolidsOutput {
  void lookup;
  const problem = frontsProblem(feature, cabinet);
  if (problem) throw new GeometryError(`${feature.name} : ${problem}`);
  const shapes: Shape3D[] = [];
  const shelves = (cabinet ? cabinetParts(cabinet) : []).filter((p) => p.name.startsWith("Étagère")).map((p): [number, number] => [Math.min(p.from[2], p.to[2]), Math.max(p.from[2], p.to[2])]);
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
