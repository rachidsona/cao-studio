/**
 * Un caisson en Répartition d'un Plan de cuisine, choisi dans la 3D, a les poignées d'un meuble du plan
 * (app/cabinet-drag.ts) : « ✥ » le fait glisser le long de son mur — son repère déplacé, le plan lui garde sa place
 * (document/kitchen-sync.ts) — et « ↔ » tire sa largeur : celle de sa place dans le linéaire, le caisson refait à
 * elle, son intérieur adapté (document/caisson-follow.ts).
 */
import { kitchenPlanIn, withKitchenBuilt } from "../../document/kitchen-floor";
import { kitchenFromPlan } from "../../document/kitchen-plan-build";
import { kitchenRoomInfo } from "../../document/kitchen-plan-room";
import { absorbed, pushedOut } from "../../features/kitchen-run-absorb";
import { bodyOrigin, findFeature, updateFeature } from "../../document/operations";
import { featureOfBody, type CabinetFeature, type CadDocument, type SketchFeature, type Vec3 } from "../../document/types";

/** What a caisson furnished by hand may be made to (mm), as on the strip (kitchen-strip-edit.ts). */
const WIDTH: [number, number] = [150, 2400];

export interface Held {
  sketch: SketchFeature;
  plan: string;
  run: string;
  item: string;
  width: number;
}

const sketchOf = (doc: CadDocument, body: string) => (findFeature(doc, featureOfBody(bodyOrigin(doc, body))) as { sketch?: string } | undefined)?.sketch;

/** The caisson in Répartition of a plan all the bodies chosen are pieces of, or null. */
export function selectedHeld(doc: CadDocument, bodies: readonly string[]): Held | null {
  const sketches = new Set(bodies.map((b) => sketchOf(doc, b) ?? ""));
  const id = sketches.size === 1 ? [...sketches][0] : "";
  const sketch = id ? findFeature(doc, id) : undefined;
  if (sketch?.type !== "sketch" || !sketch.frame) return null;
  for (const f of doc.features) {
    const plan = f.type === "sketch" && f.kitchenPlan ? kitchenPlanIn(doc, f.id) : undefined;
    for (const [run, items] of Object.entries(plan?.runs ?? {})) {
      const item = items.find((i) => i.furnished === id);
      if (item) return { sketch, plan: f.id, run, item: item.id, width: item.width };
    }
  }
  return null;
}

/** Its bodies as displayed: its panels, doors, drawers. */
export const heldBodies = (doc: CadDocument, displayed: readonly string[], held: Held): string[] => displayed.filter((b) => sketchOf(doc, b) === held.sketch.id);

/** As a cabinet for the grips: its name, its width, which way its wall runs. */
export function heldAsCabinet(held: Held): CabinetFeature {
  const [x, y] = held.sketch.frame!.xDir;
  const rotation = Math.abs(x) > 0.5 ? (x > 0 ? 0 : 180) : y > 0 ? 90 : 270;
  return { id: held.sketch.id, type: "cabinet", name: held.sketch.name, width: held.width, rotation, origin: held.sketch.frame!.origin } as unknown as CabinetFeature;
}

/** Slid by `delta` along its wall: its frame moved there (the plan then keeps its room there). */
export const heldSlid = (doc: CadDocument, held: Held, delta: Vec3): CadDocument =>
  updateFeature(doc, held.sketch.id, (f) => (f.type === "sketch" && f.frame ? { ...f, frame: { ...f.frame, origin: f.frame.origin.map((v, k) => v + delta[k]!) as Vec3 } } : f));

/** Its room in the run made `width` wide, the kitchen made again round it; or why not. */
export function heldWidened(doc: CadDocument, held: Held, width: number): CadDocument | string {
  if (width < WIDTH[0] || width > WIDTH[1]) return `La largeur d'un caisson va de ${WIDTH[0] / 10} à ${WIDTH[1] / 10} cm.`;
  const plan = kitchenPlanIn(doc, held.plan);
  const items = plan?.runs?.[held.run];
  if (!items) return "Ce caisson n'est plus sur son linéaire.";
  // The room kept free after it takes the difference, what stands after stays; nothing is pushed out of the run.
  const fill = (list: readonly typeof items[number][]) => kitchenFromPlan({ ...plan!, runs: { ...plan!.runs, [held.run]: [...list] } }, kitchenRoomInfo(doc, plan!)).fills[held.run]!;
  const next = absorbed(items, items.map((i) => (i.id === held.item ? { ...i, width: Math.round(width * 10) / 10 } : i)), fill);
  if (pushedOut(fill(items), fill(next)).length || fill(next).missing.some((i) => i.id === held.item)) return `Pas de place pour l'élargir à ${Math.round(width) / 10} cm : un autre meuble sortirait du linéaire. Faites d'abord de la place après lui.`;
  const built = withKitchenBuilt(doc, held.plan, { runs: { ...plan!.runs, [held.run]: next } });
  return typeof built === "string" ? built : built.doc;
}
