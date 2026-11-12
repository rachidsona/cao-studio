/**
 * Où les façades d'un caisson sont percées : boîtiers de charnière des portes, trous de poignée des portes et des
 * façades de tiroir. Calcul pur, partagé par le noyau qui les perce (fronts.ts) et par le devis qui les compte
 * (audit d'architecture du 11/11/2026 : le devis ne comptait que les usinages, pas ces perçages).
 */
import type { CabinetFeature, FrontsFeature, Vec3 } from "../document/types";
import { cabinetParts } from "./cabinet-parts";
import { frontsParts, frontsProblem, hingeCount, hingeHeights, type FrontPart } from "./fronts-parts";
import { handleInset, isGlass } from "./glass-door";

/** The shelves of the cabinet (their bottom and top), which the hinges keep clear of. */
export function shelvesOf(cabinet: CabinetFeature | undefined): [number, number][] {
  return (cabinet ? cabinetParts(cabinet) : []).filter((p) => p.name.startsWith("Étagère")).map((p): [number, number] => [Math.min(p.from[2], p.to[2]), Math.max(p.from[2], p.to[2])]);
}

/** Where the drill goes in a front: hinge cups on the inside face, handle holes through. */
export function drillings(part: FrontPart, f: FrontsFeature, shelves: [number, number][]): { at: Vec3; radius: number; depth: number }[] {
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


/** How many holes the fronts drill (hinge cups and handle holes), none when they cannot be made. */
export function frontsHoleCount(feature: FrontsFeature, cabinet: CabinetFeature | undefined): number {
  if (frontsProblem(feature, cabinet)) return 0;
  const shelves = shelvesOf(cabinet);
  return frontsParts(feature, cabinet).reduce((n, part) => n + drillings(part, feature, shelves).length, 0);
}
