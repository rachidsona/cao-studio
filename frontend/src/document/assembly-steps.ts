/**
 * Notice de montage, en géométrie pure : les pièces rangées en étapes dans l'ordre où l'on monte un meuble — le bâti
 * (dessous, côtés, dessus, cloisons, avec les vis et tourillons des usinages), le fond, les étagères, les penderies,
 * les tiroirs, les portes, puis le reste — chacune avec sa quincaillerie ; et, pour la vue éclatée, la direction où
 * chaque pièce s'écarte du meuble (le long de l'axe où elle est le plus en dehors ; une pièce du milieu vient vers
 * l'œil).
 */
import { frontsHardware } from "../features/fronts-parts";
import { nicheHardware } from "../features/niche-parts";
import { CONFIRMAT_SCREW, DOWEL } from "./hardware";
import { catalogItems } from "./hardware-catalog";
import { bodyLabel } from "./operations";
import { featureOfBody, type CadDocument, type Vec3 } from "./types";

export type Box = [Vec3, Vec3];
export type StepKind = "carcass" | "back" | "shelves" | "rods" | "drawers" | "doors" | "other";

export interface AssemblyStep {
  kind: StepKind;
  title: string;
  bodies: string[];
  hardware: { name: string; quantity: number; unit?: string }[];
}

const TITLES: Record<StepKind, string> = {
  carcass: "Le bâti : dessous, côtés, dessus et cloisons",
  back: "Le fond",
  shelves: "Les étagères",
  rods: "Les penderies",
  drawers: "Les tiroirs",
  doors: "Les portes",
  other: "Les autres pièces",
};
const ORDER: StepKind[] = ["carcass", "back", "shelves", "rods", "drawers", "doors", "other"];

/** The step a body belongs to: by the equipment that made it, else by its name. */
export function stepOf(doc: CadDocument, bodyId: string): StepKind {
  const f = doc.features.find((x) => x.id === featureOfBody(bodyId));
  if (f?.type === "niche") return f.fill === "back" ? "back" : f.fill === "doors" ? "doors" : f.fill === "rod" ? "rods" : "drawers";
  const name = bodyLabel(doc, bodyId).toLowerCase();
  if (/tiroir/.test(name)) return "drawers";
  if (/porte|façade|abattant/.test(name)) return /tiroir/.test(name) ? "drawers" : "doors";
  if (/\bfond\b/.test(name)) return "back";
  if (/étagère|tablette/.test(name)) return "shelves";
  if (/dessous|dessus|côté|joue|cloison|séparation|socle|plinthe|traverse|montant/.test(name)) return "carcass";
  if (f?.type === "extrude" || f?.type === "cabinet") return "carcass";
  return "other";
}

/** The steps of the bodies, in the order of assembly (empty ones left out), with their hardware. */
export function assemblySteps(doc: CadDocument, bodies: readonly string[]): AssemblyStep[] {
  const steps = new Map<StepKind, AssemblyStep>(ORDER.map((kind) => [kind, { kind, title: TITLES[kind], bodies: [], hardware: [] }]));
  for (const id of bodies) steps.get(stepOf(doc, id))!.bodies.push(id);
  const add = (kind: StepKind, h: { name: string; quantity: number; unit?: string }) => {
    if (!(h.quantity > 0)) return;
    const list = steps.get(kind)!.hardware;
    const same = list.find((x) => x.name === h.name);
    if (same) same.quantity = Math.round((same.quantity + h.quantity) * 100) / 100;
    else list.push({ ...h });
  };
  let screws = 0;
  let dowels = 0;
  for (const f of doc.features) {
    if (f.suppressed) continue;
    if (f.type === "niche") {
      const kind: StepKind = f.fill === "doors" ? "doors" : f.fill === "rod" ? "rods" : f.fill === "back" ? "back" : "drawers";
      for (const h of nicheHardware(doc.features, f)) add(kind, h);
    } else if (f.type === "fronts") {
      const cabinet = doc.features.find((c) => c.id === f.cabinet);
      for (const h of frontsHardware(f, cabinet?.type === "cabinet" ? cabinet : undefined)) add(/coulisse/i.test(h.name) || f.layout === "drawers" ? "drawers" : "doors", h);
    } else if (f.type === "trim") {
      add("carcass", { name: "Pied réglable", quantity: f.parts.filter((p) => p.hardware && !p.item).length });
    } else if (f.type === "machining") {
      const holes = f.ops.filter((op) => op.kind === "hole").length;
      if (f.kind === "confirmat") screws += holes;
      if (f.kind === "dowel") dowels += holes;
    }
  }
  // Each screw or dowel makes a hole in each of the two boards it joins.
  add("carcass", { name: CONFIRMAT_SCREW, quantity: Math.floor(screws / 2) });
  add("carcass", { name: DOWEL, quantity: Math.floor(dowels / 2) });
  return [...steps.values()].filter((s) => s.bodies.length > 0).map((s) => ({ ...s, hardware: catalogItems(doc, s.hardware) }));
}

/**
 * The direction a piece moves away from the furniture in an exploded view: along the axis where it lies the most
 * outside (measured in half sizes of the furniture), or towards the eye for a piece of the middle.
 */
export function explodeDirection(box: Box, model: Box, toEye: Vec3): Vec3 {
  const centre = (b: Box, i: number) => (b[0][i]! + b[1][i]!) / 2;
  const reach = [0, 1, 2].map((i) => (centre(box, i) - centre(model, i)) / Math.max((model[1][i]! - model[0][i]!) / 2, 1));
  const axis = [0, 1, 2].reduce((best, i) => (Math.abs(reach[i]!) > Math.abs(reach[best]!) ? i : best), 0);
  if (Math.abs(reach[axis]!) < 0.5) {
    const l = Math.hypot(...toEye) || 1;
    return [toEye[0] / l, toEye[1] / l, toEye[2] / l];
  }
  const d: Vec3 = [0, 0, 0];
  d[axis] = Math.sign(reach[axis]!);
  return d;
}

/** The box around all these boxes. */
export function unionBox(boxes: readonly Box[]): Box {
  return [0, 1].map((k) => [0, 1, 2].map((i) => (k === 0 ? Math.min : Math.max)(...boxes.map((b) => b[k as 0 | 1][i]!)))) as Box;
}
