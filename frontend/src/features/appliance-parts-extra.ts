/**
 * Les pièces d'autres gros appareils : piano de cuisson posable (four large sous son dessus gaz, grilles en fonte,
 * bandeau de manettes, tiroir à pousser), réfrigérateur multi-portes (deux portes en haut, deux tiroirs congélateur), congélateur
 * intégrable en colonne, sèche-linge posable (grand hublot, bac à eau, trappe du condenseur) et domino teppanyaki
 * (plaque de cuisson en acier poli dans son cadre). Repère de features/appliance-parts.ts. Pur.
 */
import { hob } from "./appliance-parts-cooking";
import { box, cyl, handle, knob, ringDisc, type AppliancePart, type ApplianceShape, type Looks } from "./appliance-shapes";

/** A shape moved up by `dz`. */
function lift(s: ApplianceShape, dz: number): ApplianceShape {
  if (s.kind === "cyl") return { ...s, a: [s.a[0], s.a[1], s.a[2] + dz], b: [s.b[0], s.b[1], s.b[2] + dz] };
  if (s.kind === "prism") return { ...s, yz: s.yz.map(([y, z]) => [y, z + dz] as [number, number]) };
  return { ...s, from: [s.from[0], s.from[1], s.from[2] + dz], to: [s.to[0], s.to[1], s.to[2] + dz] };
}

/** A range cooker (90 cm, freestanding): a gas hob's top on its body, its grids up to its height. */
export function range(W: number, H: number, D: number, L: Looks, sides: string): AppliancePart[] {
  // The gas top as a hob 45 mm high whose grids rise 32 above it: its plate's top at H − 32.
  const plate = H - 32;
  const top = hob(W, 45, D, L, true).filter((p) => ["Plateau", "Brûleurs", "Grilles en fonte", "Chapeaux de brûleurs"].includes(p.name));
  const gas = top.map((p) => ({ ...p, shapes: p.shapes.map((s) => lift(s, plate - 45)) }));
  const panel = [plate - 8 - 100, plate - 8];
  const doorTop = panel[0]! - 10;
  const knobs = Array.from({ length: 6 }, (_, k) => 90 + ((W - 180) * k) / 5);
  return [
    { name: "Caisse", look: sides, shapes: [box([0, 0, 20], [W, D, plate - 8])] },
    { name: "Porte du four", look: L.face, shapes: [box([0, -22, 130], [W, 0, doorTop])] },
    { name: "Vitre", look: "glass-oven", shapes: [box([90, -23, 200], [W - 90, -22, doorTop - 90])] },
    { name: "Bandeau de commande", look: sides, shapes: [box([0, -6, panel[0]!], [W, 0, panel[1]!])] },
    { name: "Manettes", look: L.trim, shapes: knobs.flatMap((x) => knob(x, (panel[0]! + panel[1]!) / 2, -6, 18, 24)) },
    { name: "Poignée", look: L.trim, shapes: handle("x", 60, W - 60, doorTop - 40, -22, 34, 9) },
    // Its storage drawer opens by a push (no handle: the shapes stay few).
    { name: "Tiroir", look: L.face, shapes: [box([0, -22, 20], [W, 0, 120])] },
    { name: "Socle", look: "plastic-black", shapes: [box([20, 10, 0], [W - 20, D, 20])] },
    ...gas,
  ];
}

/** A French-door fridge: two doors over two freezer drawers. */
export function fridgeFrench(W: number, H: number, D: number, L: Looks, sides: string): AppliancePart[] {
  const door = 55;
  const half = W / 2;
  const split = Math.round(H * 0.42);
  const mid = Math.round(40 + (split - 40) / 2);
  return [
    { name: "Caisse", look: sides, shapes: [box([0, door, 0], [W, D, H])] },
    { name: "Porte gauche", look: L.face, shapes: [box([0, 0, split + 3], [half - 2, door, H])] },
    { name: "Porte droite", look: L.face, shapes: [box([half + 2, 0, split + 3], [W, door, H])] },
    { name: "Tiroirs congélateur", look: L.face, shapes: [box([0, 0, mid + 2], [W, door, split - 3]), box([0, 0, 40], [W, door, mid - 2])] },
    { name: "Poignées", look: L.trim, shapes: [...handle("z", split + 80, H - 120, half - 40, 0, 32, 9), ...handle("z", split + 80, H - 120, half + 40, 0, 32, 9), ...handle("x", 120, W - 120, split - 50, 0, 30, 8), ...handle("x", 120, W - 120, mid - 50, 0, 30, 8)] },
    { name: "Socle", look: "plastic-black", shapes: [box([0, door, 0], [W, door + 50, 40])] },
    { name: "Joint", look: "rubber-black", shapes: [box([half - 2, 4, split + 3], [half + 2, door, H]), box([2, 4, split - 3], [W - 2, door, split + 3])] },
    { name: "Afficheur", look: "display-white", shapes: [box([half - 120, -0.5, H - 260], [half - 40, 0, H - 225])] },
  ];
}

/** A built-in freezer column: its own white door, behind the column's door. */
export function freezer(W: number, H: number, D: number): AppliancePart[] {
  return [
    { name: "Caisse", look: "plastic-white", shapes: [box([0, 40, 0], [W, D, H])] },
    { name: "Porte", look: "plastic-white", shapes: [box([0, 0, 0], [W, 40, H])] },
    { name: "Afficheur", look: "display-white", shapes: [box([W / 2 - 30, 0, H - 2], [W / 2 + 30, 20, H])] },
  ];
}

/** A tumble dryer: a large porthole, its water tank top left, its condenser's flap at its foot. */
export function dryer(W: number, H: number, D: number, L: Looks, sides: string): AppliancePart[] {
  const top = 20;
  const zc = H * 0.47;
  return [
    { name: "Caisse", look: sides, shapes: [box([0, 0, 0], [W, D, H - top])] },
    { name: "Dessus", look: sides, shapes: [box([0, 0, H - top], [W, D, H])] },
    { name: "Bandeau", look: L.face, shapes: [box([0, -6, H - top - 110], [W, 0, H - top])] },
    { name: "Hublot", look: L.trim, shapes: [cyl([W / 2, 0, zc], [W / 2, -24, zc], 200)] },
    { name: "Vitre", look: "glass-smoked", shapes: [cyl([W / 2, -24, zc], [W / 2, -26, zc], 150)] },
    { name: "Bac à eau", look: sides, shapes: [box([20, -8, H - top - 100], [220, -6, H - top - 15])] },
    { name: "Programmateur", look: L.trim, shapes: knob(W / 2 + 40, H - top - 55, -6, 26, 18) },
    { name: "Trappe du condenseur", look: sides, shapes: [box([30, -3, 20], [W - 30, 0, 110])] },
    { name: "Afficheur", look: "display-white", shapes: [box([W - 200, -6.5, H - top - 75], [W - 110, -6, H - top - 40])] },
  ];
}

/** A teppanyaki domino: a polished steel plate in its steel frame, touch controls at the front. */
export function teppan(W: number, H: number, D: number): AppliancePart[] {
  const z = H - 6;
  return [
    { name: "Cadre", look: "steel-brushed", shapes: [box([0, 0, z], [W, D, H])] },
    { name: "Corps", look: "plastic-black", shapes: [box([20, 20, 0], [W - 20, D - 20, z])] },
    { name: "Plaque de cuisson", look: "chrome", shapes: [box([25, 90, H], [W - 25, D - 25, H + 0.4])] },
    { name: "Commandes tactiles", look: "plastic-grey", shapes: [box([W / 2 - 70, 30, H], [W / 2 + 70, 36, H + 0.3]), ringDisc(W / 2 + 95, 33, H, 7)] },
    { name: "Afficheur", look: "display-red", shapes: [box([W / 2 - 14, 46, H], [W / 2 + 14, 58, H + 0.35])] },
  ];
}
