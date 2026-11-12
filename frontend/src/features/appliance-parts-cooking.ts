/**
 * Les pièces des appareils de cuisson : four encastrable (porte en verre noir et son hublot, joint, bandeau de
 * commande avec son écran, son afficheur et ses manettes à jupe, poignée barre), micro-ondes (porte vitrée, colonne de
 * commandes), plaque induction (vitrocéramique noire, foyers cerclés, commandes tactiles) et plaque gaz (plateau,
 * brûleurs et leurs chapeaux émaillés, grilles en fonte sur leurs pieds, manettes). Repère de features/appliance-parts.ts.
 * Pur.
 */
import { box, cyl, handle, knob, ringDisc, topKnob, type AppliancePart, type ApplianceShape, type Looks } from "./appliance-shapes";

/** A built-in oven (60 or 90 cm wide, 45 or 60 cm high). The first seven pieces keep their order (saved documents). */
export function oven(W: number, H: number, D: number, L: Looks): AppliancePart[] {
  const strip = H >= 550 ? 95 : H >= 470 ? 85 : 80;
  // Its box behind the fascia: 560 wide in a 600 niche (860 in a 900 one).
  const side = Math.max(8, Math.min(18, (W - 560) / 2));
  const doorTop = H - strip - 1;
  const mid = H - strip / 2;
  const knobs = W >= 800 ? [100, W - 100] : [92, W - 92];
  return [
    { name: "Caisse", look: L.body, shapes: [box([side, 0, 8], [W - side, D, H - 14])] },
    { name: "Porte", look: L.face, shapes: [box([0, -21, 0], [W, -1, doorTop])] },
    { name: "Vitre", look: L.glass, shapes: [box([70, -22.5, 70], [W - 70, -22, doorTop - 120])] },
    { name: "Bandeau de commande", look: L.face, shapes: [box([0, -22, H - strip], [W, 0, H])] },
    { name: "Écran", look: "glass-lacquered-black", shapes: [box([W / 2 - 80, -23, H - strip * 0.75], [W / 2 + 80, -22, H - strip * 0.25])] },
    { name: "Manettes", look: L.trim, shapes: knobs.flatMap((x) => knob(x, mid, -22, 16, 22)) },
    { name: "Poignée", look: L.trim, shapes: handle("x", 50, W - 50, doorTop - 38, -22, 32, 9) },
    { name: "Verre de porte", look: "glass-lacquered-black", shapes: [box([10, -22, 10], [W - 10, -21, doorTop - 70])] },
    { name: "Afficheur", look: "display-white", shapes: [box([W / 2 - 34, -23.4, mid - 10], [W / 2 + 34, -23, mid + 10])] },
    { name: "Joint", look: "rubber-black", shapes: [box([0, -21.5, doorTop], [W, -1, H - strip])] },
  ];
}

/** A microwave: its door and window on the left, its column of controls on the right (built in, or on the worktop). */
export function microwave(W: number, H: number, D: number, L: Looks, free: boolean): AppliancePart[] {
  const door = Math.round(W * 0.72);
  const panel = (W + door) / 2;
  const inset = free ? 0 : 6;
  const parts: AppliancePart[] = [
    { name: "Caisse", look: free ? L.face : L.body, shapes: [box([inset, 0, free ? 10 : 4], [W - inset, D, H - (free ? 0 : 4)])] },
    { name: "Porte", look: L.face, shapes: [box([0, -18, free ? 10 : 0], [door - 1, 0, H])] },
    { name: "Vitre", look: L.glass, shapes: [box([32, -19, 40], [door - 52, -18, H - 36])] },
    { name: "Commandes", look: "glass-lacquered-black", shapes: [box([door, -18, free ? 10 : 0], [W, 0, H])] },
    { name: "Manette", look: L.trim, shapes: knob(panel, H * 0.4, -18, 17, 20) },
    { name: "Poignée", look: L.trim, shapes: handle("z", 50, H - 50, door - 26, -18, 26, 7) },
    { name: "Afficheur", look: "display-white", shapes: [box([panel - 34, -18.4, H * 0.72], [panel + 34, -18, H * 0.72 + 22])] },
  ];
  if (free) parts.push({ name: "Pieds", look: "rubber-black", shapes: [40, W - 40].flatMap((x) => [60, D - 60].map((y) => cyl([x, y, 0], [x, y, 10], 14))) });
  return parts;
}

/** The cooking zones of an induction hob: x, y, radius (mm). */
function zones(W: number, D: number): [number, number, number][] {
  if (W < 400) return [[W / 2, D * 0.3, 95], [W / 2, D * 0.72, 80]];
  if (W >= 780) return [[W * 0.18, D * 0.3, 95], [W * 0.18, D * 0.72, 80], [W * 0.82, D * 0.3, 80], [W * 0.82, D * 0.72, 95], [W / 2, D * 0.52, W >= 880 ? 140 : 120]];
  return [[W * 0.27, D * 0.3, 105], [W * 0.27, D * 0.72, 85], [W * 0.73, D * 0.3, 85], [W * 0.73, D * 0.72, 105]];
}

/** The burners of a gas hob: x, y, radius of its cap (mm) — a wok burner in the middle from 75 cm. */
function burners(W: number, D: number): [number, number, number][] {
  if (W >= 700) return [[W * 0.17, D * 0.36, 36], [W * 0.17, D * 0.78, 28], [W / 2, D * 0.57, 55], [W * 0.83, D * 0.36, 44], [W * 0.83, D * 0.78, 36]];
  return [[W * 0.27, D * 0.36, 44], [W * 0.27, D * 0.78, 28], [W * 0.73, D * 0.36, 36], [W * 0.73, D * 0.78, 36]];
}

/** A cast-iron grid over x0…x1, y0…y1: its frame and its cross on four feet, its top at z1. */
function grid(x0: number, x1: number, y0: number, y1: number, top: number, z1: number): ApplianceShape[] {
  const bar = 9;
  const z0 = z1 - 8;
  const [xm, ym] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const frameBars: ApplianceShape[] = [box([x0, y0, z0], [x1, y0 + bar, z1]), box([x0, y1 - bar, z0], [x1, y1, z1]), box([x0, y0 + bar, z0], [x0 + bar, y1 - bar, z1]), box([x1 - bar, y0 + bar, z0], [x1, y1 - bar, z1])];
  const cross = [box([x0 + bar, ym - bar / 2, z0], [x1 - bar, ym + bar / 2, z1]), box([xm - bar / 2, y0 + bar, z0], [xm + bar / 2, y1 - bar, z1])];
  const feet = [x0, x1 - bar].flatMap((x) => [y0, y1 - bar].map((y) => box([x, y, top], [x + bar, y + bar, z0])));
  return [...frameBars, ...cross, ...feet];
}

/** A hob: its body under the worktop, its top on it (the worktop's face at z = H − its top's thickness). */
export function hob(W: number, H: number, D: number, L: Looks, gas: boolean): AppliancePart[] {
  const top = gas ? 8 : 6;
  const z = H - top;
  const body: AppliancePart = { name: "Corps", look: "plastic-black", shapes: [box([20, 20, 0], [W - 20, D - 20, z])] };
  if (!gas) {
    const zs = zones(W, D);
    const slider = Math.min(120, W * 0.3);
    return [
      { name: "Verre vitrocéramique", look: "glass-ceramic", shapes: [box([0, 0, z], [W, D, H])] },
      body,
      { name: "Foyers", look: "plastic-grey", shapes: zs.map(([x, y, r]) => ringDisc(x, y, H, r)) },
      { name: "Commandes tactiles", look: "plastic-grey", shapes: [box([W / 2 - slider, 16, H], [W / 2 + slider, 20, H + 0.3]), ...[-1, 1].map((s) => ringDisc(W / 2 + s * (slider + 16), 26, H, 7))] },
      { name: "Centres des foyers", look: "glass-ceramic", shapes: zs.map(([x, y, r]) => ringDisc(x, y, H, r - 3, 0.45)) },
      { name: "Afficheur", look: "display-red", shapes: [box([W / 2 - 14, 28, H], [W / 2 + 14, 40, H + 0.35])] },
    ];
  }
  const bs = burners(W, D);
  // The grids over the burners, side by side from the front band (the knobs') to the back.
  const n = W >= 700 ? 3 : 2;
  const [g0, g1] = [D * 0.14, D - 12];
  const step = (W - 20) / n;
  const grids = Array.from({ length: n }, (_, k) => grid(10 + k * step + 3, 10 + (k + 1) * step - 3, g0, g1, H, H + 32)).flat();
  const knobY = D * 0.07;
  return [
    { name: "Plateau", look: L.face, shapes: [box([0, 0, z], [W, D, H])] },
    body,
    { name: "Brûleurs", look: "aluminium-brushed", shapes: bs.map(([x, y, r]) => cyl([x, y, H], [x, y, H + 10], r + 8)) },
    { name: "Grilles en fonte", look: "cast-iron", shapes: grids },
    { name: "Manettes", look: L.trim, shapes: bs.flatMap((_, k) => topKnob((W * (k + 1)) / (bs.length + 1), knobY, H, 15, 22)) },
    { name: "Chapeaux de brûleurs", look: "enamel-black", shapes: bs.map(([x, y, r]) => cyl([x, y, H + 10], [x, y, H + 17], r)) },
  ];
}
