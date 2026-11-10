/**
 * Un caisson de cuisine aménagé à la main (document/cabinet-furnish.ts) suit sa place dans le linéaire : la cuisine
 * refaite (un voisin élargi, un meuble ajouté avant lui, le mur allongé, le plan tourné), il va où va l'« Espace libre »
 * qui lui est gardé, tourné comme lui ; cette place élargie ou rétrécie, il est refait à sa nouvelle largeur, son
 * intérieur (étagères, cloisons, penderie, tiroirs) adapté, comme un caisson de « Mes caissons » reposé. Pur.
 */
import { caissonSpecOf, withCaissonPlaced } from "./caisson-spec";
import { cabinetAxes } from "./kitchen-catalog";
import { deleteFeatures, findFeature, updateFeature } from "./operations";
import type { CadDocument, KitchenFloorPlan, PlaneFrame, Vec3 } from "./types";
import type { KitchenUnit } from "../features/kitchen-layout";
import { placePoint } from "../features/room-runs";
import { nearestPlane } from "../sketcher/frame";

/**
 * The frame of a caisson's panels in a cabinet's place: `set` behind its front (mm), at its bottom; x along its width,
 * y up, the front towards the normal.
 */
export function panelsFrame(c: { origin: Vec3; rotation?: number }, set: number): PlaneFrame {
  const { along, back: inwards } = cabinetAxes(c.rotation ?? 0);
  const origin: Vec3 = [c.origin[0] + inwards[0] * set, c.origin[1] + inwards[1] * set, c.origin[2]];
  return { origin, xDir: [along[0], along[1], 0], normal: [-inwards[0], -inwards[1], 0] };
}

const near = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);
const sameFrame = (a: PlaneFrame, b: PlaneFrame) => near(a.origin, b.origin) && near(a.xDir, b.xDir) && near(a.normal, b.normal);

/**
 * The caissons furnished in the plan's runs set in their room as the plan now has it (`kept`: kitchen-plan-build.ts):
 * moved and turned with it, made again at its width when it changed. The plan, its rooms linked to the caissons made again.
 */
export function withCaissonsFollowing(base: CadDocument, plan: KitchenFloorPlan, kept: readonly KitchenUnit[]): { doc: CadDocument; plan: KitchenFloorPlan } {
  let doc = base;
  let runs = plan.runs;
  for (const u of kept) {
    const item = u.run ? runs?.[u.run]?.find((i) => i.id === u.item) : undefined;
    const sketch = item?.furnished ? findFeature(doc, item.furnished) : undefined;
    if (!item || !u.run || sketch?.type !== "sketch" || !sketch.frame) continue;
    const spec = caissonSpecOf(doc, sketch.id);
    if (typeof spec === "string") continue;
    // Where the plan stands in the room, as its cabinets are (kitchen-plan.ts).
    const at = plan.place ? { origin: placePoint(plan.place, u.origin), rotation: (u.rotation + plan.place.quarter * 90) % 360 } : u;
    // Its front where the room's front is.
    const frame = panelsFrame(at, spec.depth);
    if (Math.abs(spec.input.length - u.width) < 0.05) {
      if (!sameFrame(frame, sketch.frame)) doc = updateFeature(doc, sketch.id, (f) => (f.type === "sketch" ? { ...f, frame, plane: nearestPlane(frame.normal) } : f));
      continue;
    }
    const made = withCaissonPlaced(deleteFeatures(doc, [sketch.id]).next, spec, { frame, width: u.width, height: spec.input.height, name: sketch.name });
    if (typeof made === "string") continue;
    doc = made.doc;
    const run = u.run;
    runs = { ...runs, [run]: runs![run]!.map((i) => (i === item ? { ...i, furnished: made.sketch } : i)) };
  }
  return { doc, plan: runs === plan.runs ? plan : { ...plan, runs } };
}
