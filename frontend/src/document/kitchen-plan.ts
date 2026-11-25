/**
 * Une implantation de cuisine (features/kitchen-layout.ts) traduite en opérations du document : caissons et façades,
 * esquisses et extrusions des murs, plans de travail (avec la découpe de l'évier et de la plaque), fileurs, panneaux,
 * crédence, plinthes et électroménager, avec la matière de chaque corps ; les murs sur le calque « Pièce » et
 * l'électroménager sur le calque « Électroménager », hors débit et devis. Posée dans une Pièce relevée, elle est
 * tournée et placée contre son mur A (features/room-runs.ts). Utilisé par l'outil Implantation et par l'assistant.
 */
import { cabinetPartNames } from "../features/cabinet-parts";
import { frontsMaterials, frontsPartNames } from "../features/fronts-parts";
import { kitchenLayout, originOf, type KitchenLayout, type KitchenSettings } from "../features/kitchen-layout";
import { applianceDef } from "../features/appliance-library";
import { applianceParts } from "../features/appliance-parts";
import { placeBox, placePoint, turn, type Placement, type RunInfo, type RunWall } from "../features/room-runs";
import { cutoutOps, mergedCutouts, type Cutout } from "../features/worktop-cutouts";
import { cabinetAxes } from "./kitchen-catalog";
import { addLayer, layersOf } from "./layers";
import { uniqueId, uniqueName } from "./operations";
import { rectangleAt } from "./sketch";
import { PART_SEPARATOR, type ApplianceFeature, type BodyInfo, type CabinetFeature, type CadDocument, type Feature, type FrontsFeature, type MachiningFeature, type Vec3 } from "./types";

const ROOM_LAYER = "Pièce";
const APPLIANCE_LAYER = "Électroménager";
const FITTING_LAYER = "Quincaillerie";

export interface KitchenPlan {
  features: Feature[];
  info: Record<string, BodyInfo>;
  names: Record<string, string>;
  /** The layer of a body, by name (made when missing). */
  layers: Record<string, string>;
  layout: KitchenLayout;
  /** Cut-outs that do not fit their worktop. */
  problems: string[];
}

/** Where the kitchen goes in a surveyed room: its placement and the room's walls it stands against. */
export interface KitchenRoom {
  place: Placement;
  walls: Partial<Record<RunWall, RunInfo>>;
}

const IDENTITY: Placement = { quarter: 0, origin: [0, 0] };

/** The features of the kitchen (ids free in `doc`), in history order, and what each body is made of. */
export function kitchenPlan(doc: CadDocument, s: KitchenSettings, frontMaterial: string, worktopMaterial: string, room?: KitchenRoom): KitchenPlan {
  return layoutPlan(doc, kitchenLayout(s, room?.walls), s.frontThickness, frontMaterial, worktopMaterial, room?.place);
}

/** Whether a sink or a hob of the library stands over this point of the floor: placed by hand, with its own cut. */
function cutByHand(doc: CadDocument, [x, y]: number[]): boolean {
  return doc.features.some((f) => {
    if (f.type !== "appliance" || !["sink", "hob"].includes(applianceDef(f.model)?.category ?? "")) return false;
    const { along, back } = cabinetAxes(f.rotation ?? 0);
    const middle = [0, 1].map((i) => f.origin[i]! + (along[i]! * f.width + back[i]! * f.depth) / 2);
    return Math.hypot(middle[0]! - x!, middle[1]! - y!) < Math.max(f.width, f.depth) / 2;
  });
}

/** The features of a layout already made (a kitchen plan's, document/kitchen-plan-build.ts), turned and moved by `place`. */
/** `kept`: the cut-outs each worktop had before (by its name), those put or changed by hand staying in it. */
export function layoutPlan(doc: CadDocument, layout: KitchenLayout, frontThickness: number, frontMaterial: string, worktopMaterial: string, place: Placement = IDENTITY, kept: ReadonlyMap<string, readonly Cutout[]> = new Map(), worktopLook?: string, kickLook?: string): KitchenPlan {
  let probe = doc;
  const plan: KitchenPlan = { features: [], info: {}, names: {}, layers: {}, layout, problems: [] };
  const push = (f: Feature) => {
    plan.features.push(f);
    probe = { ...probe, features: [...probe.features, f] };
  };
  for (const u of layout.units) {
    const rotation = ((u.rotation + place.quarter * 90) % 360) as NonNullable<CabinetFeature["rotation"]>;
    const cabinet: CabinetFeature = {
      id: uniqueId(probe, "cb"), type: "cabinet", name: u.name, origin: placePoint(place, u.origin), width: u.width, height: u.height, depth: u.depth,
      // A sink unit on two rails: no back, the pipes come through.
      thickness: 18, back: u.top === "rails" && u.layout !== "drawers" ? "none" : "applied", backThickness: 3, shelves: u.shelves, ...(u.dividers ? { dividers: u.dividers } : {}), plinth: u.plinth, construction: "sides-through",
      ...(u.top ? { top: u.top } : {}), ...(u.railWidth ? { railWidth: u.railWidth } : {}), ...(u.railFront ? { railFront: u.railFront } : {}), ...(rotation ? { rotation } : {}),
      // What was changed on it by hand in the 3D (document/kitchen-sync.ts).
      ...u.keep?.cabinet,
    };
    push(cabinet);
    cabinetPartNames(cabinet).forEach((name, i) => (plan.info[`${cabinet.id}${PART_SEPARATOR}${i}`] = { material: u.keep?.carcass?.[name] ?? (name === "Fond" ? "hdf" : "melamine-white") }));
    if (u.keep?.name) plan.names[cabinet.id] = u.keep.name;
    if (u.layout === "none") continue;
    // Its fronts; more doors on the same cabinet (an oven column's, under the oven) each their own, in the same look.
    [{ ...u, layout: u.layout }, ...(u.more ?? []).map((m) => ({ ...u, ...m, layout: "door" as const }))].forEach((u, k) => {
      const fronts: FrontsFeature = {
        id: uniqueId(probe, "fr"), type: "fronts", name: `Façades ${u.name}${k ? ` (${k + 1})` : ""}`, cabinet: cabinet.id, layout: u.layout, ...(u.side ? { side: u.side } : {}), ...(u.grip ? { grip: u.grip } : {}), ...(u.facade ?? {}), drawers: u.drawers ?? 3, ...(u.drawerShares ? { drawerShares: u.drawerShares } : {}), ...(u.topDrawer ? { topDrawer: u.topDrawer } : {}), ...(u.innerDrawers ? { innerDrawers: u.innerDrawers } : {}), ...(u.span ? { span: u.span } : {}), ...(u.rise ? { rise: u.rise } : {}),
        mount: "overlay", gap: 3, thickness: frontThickness, hinges: true, handles: u.handles !== false, ...(k ? {} : u.keep?.fronts),
      };
      push(fronts);
      const names = k ? [] : frontsPartNames(fronts, cabinet);
      frontsMaterials(fronts, cabinet, frontMaterial).forEach((material, i) => (plan.info[`${fronts.id}${PART_SEPARATOR}${i}`] = { material: u.keep?.facing?.[names[i] ?? ""] ?? material }));
    });
  }
  for (const box of layout.boxes) {
    const [from, to] = placeBox(place, box.from, box.to);
    const [w, d, h] = [0, 1, 2].map((i) => to[i]! - from[i]!) as [number, number, number];
    // An appliance of the library: filling its box as a cabinet fills its own, its pieces with their looks.
    if (box.appliance) {
      const rotation = ((box.appliance.rotation + place.quarter * 90) % 360) as NonNullable<ApplianceFeature["rotation"]>;
      const across = rotation === 90 || rotation === 270;
      const id = uniqueId(probe, "ap");
      const a: ApplianceFeature = {
        id, type: "appliance", name: box.name, model: box.appliance.model, finish: box.appliance.finish, origin: originOf(rotation, from, to),
        width: Math.round((across ? d : w) * 10) / 10, height: Math.round(h * 10) / 10, depth: Math.round((across ? w : d) * 10) / 10, ...(rotation ? { rotation } : {}),
      };
      push(a);
      applianceParts(a).forEach((part, i) => {
        plan.info[`${id}${PART_SEPARATOR}${i}`] = { appearance: part.look, room: true };
        plan.layers[`${id}${PART_SEPARATOR}${i}`] = APPLIANCE_LAYER;
      });
      continue;
    }
    const side = box.profile && !box.outline ? sideSketch(place, box, from, to) : null;
    const sketch: Feature = {
      id: uniqueId(probe, "sk"), type: "sketch", name: uniqueName(probe, "Esquisse"), hidden: true,
      ...(side ? side.sketch : { plane: "XY" as const, offset: from[2], ...(box.outline ? outlineAt(box.outline.map(([x, y]) => placePoint(place, [x, y, 0]))) : rectangleAt(from[0] + w / 2, from[1] + d / 2, w, d)) }),
    };
    push(sketch);
    const id = uniqueId(probe, "ex");
    push({ id, type: "extrude", name: box.name, sketch: sketch.id, distance: side ? side.distance : h, operation: "new", ...(box.door ? { door: { hinge: turn(place, box.door.hinge), out: turn(place, box.door.out) } } : {}) });
    plan.names[id] = box.name;
    const top = box.kind === "worktop" || box.kind === "splashback";
    // A filler set by hand keeps its own material, carcass or not.
    const material = box.material ?? (top ? worktopMaterial : box.carcass ? "melamine-white" : frontMaterial);
    // Walls, appliances and fittings (a LeMans's trays) are bought, not cut: out of the cut list and the quote.
    plan.info[id] = box.kind === "wall" || box.kind === "appliance" || box.kind === "fitting" ? { room: true } : { material, ...(top && worktopLook ? { appearance: worktopLook } : {}), ...(box.kind === "kick" && (kickLook ?? worktopLook) ? { appearance: kickLook ?? worktopLook } : {}) };
    if (box.kind === "wall") plan.layers[id] = ROOM_LAYER;
    if (box.kind === "appliance") plan.layers[id] = APPLIANCE_LAYER;
    if (box.kind === "fitting") plan.layers[id] = FITTING_LAYER;
    // The worktop's cut-outs, machined in it: their middle along its length from its low end, its front edge's side.
    if ((box.holes?.length || kept.get(box.name)?.length) && box.front) {
      const along = w >= d ? 0 : 1;
      const front = turn(place, box.front);
      const frontSign = (Math.sign(front[1 - along]!) || -1) as -1 | 1;
      // Not where a sink or a hob placed by hand stands: it has cut the worktop for itself (appliance-place.ts).
      const fresh = (box.holes ?? []).filter((hole) => !hole.soft || !cutByHand(doc, placePoint(place, hole.at))).map((hole): Cutout => ({ appliance: hole.appliance, along: Math.round(placePoint(place, hole.at)[along]! - from[along]!), front: null, auto: true }));
      const cutouts = mergedCutouts(fresh, kept.get(box.name) ?? []);
      const { ops, problems } = cutoutOps([from, to], cutouts, frontSign);
      plan.problems.push(...problems.map((p) => `${box.name} : ${p}`));
      if (ops.length) push({ id: uniqueId(probe, "mc"), type: "machining", name: `Découpes ${box.name}`, target: id, kind: "cutout", ops, cutouts, frontSign } satisfies MachiningFeature);
    }
  }
  return plan;
}

/** An outline seen from above (placed): its corners joined by lines, in the plane XY. */
function outlineAt(points: Vec3[]) {
  const pts = points.map((q, i) => ({ id: `p${i + 1}`, x: q[0], y: q[1] }));
  return { points: pts, curves: pts.map((p, i) => ({ id: `l${i + 1}`, kind: "line" as const, p1: p.id, p2: pts[(i + 1) % pts.length]!.id })), constraints: [] };
}

/**
 * A box cut at 45° (its `profile`): its outline seen from the front, drawn in the upright plane along it (XZ or YZ,
 * placed) and extruded through its depth (sketcher/frame.ts: XZ's normal is −Y, YZ's +X).
 */
function sideSketch(place: Placement, box: KitchenLayout["boxes"][number], from: number[], to: number[]) {
  const { along, points } = box.profile!;
  const at = ([u, z]: [number, number]) => {
    const q: [number, number, number] = [...box.from];
    [q[along], q[2]] = [u, z];
    return placePoint(place, q);
  };
  const [p0, p1] = [at(points[0]!), at(points[1]!)];
  const ax = Math.abs(p1[0] - p0[0]) > Math.abs(p1[1] - p0[1]) ? 0 : 1;
  const pts = points.map((p, i) => {
    const q = at(p);
    return { id: `p${i + 1}`, x: q[ax]!, y: q[2] };
  });
  const geometry = { points: pts, curves: pts.map((p, i) => ({ id: `l${i + 1}`, kind: "line" as const, p1: p.id, p2: pts[(i + 1) % pts.length]!.id })), constraints: [] };
  return ax === 0
    ? { sketch: { plane: "XZ" as const, offset: -to[1]!, ...geometry }, distance: to[1]! - from[1]! }
    : { sketch: { plane: "YZ" as const, offset: from[0]!, ...geometry }, distance: to[0]! - from[0]! };
}

/** The materials and names of the plan in `doc`, and the walls and appliances on their layers (made when missing). */
export function decorateKitchen(doc: CadDocument, plan: KitchenPlan): CadDocument {
  let next = doc;
  const layerIds: Record<string, string> = {};
  for (const name of new Set(Object.values(plan.layers))) {
    let id = layersOf(next).find((l) => l.name === name)?.id;
    if (!id) ({ doc: next, id } = addLayer(next, name));
    layerIds[name] = id;
  }
  const bodyInfo = { ...next.bodyInfo };
  for (const [id, i] of Object.entries(plan.info)) bodyInfo[id] = { ...bodyInfo[id], ...i, ...(plan.layers[id] ? { layer: layerIds[plan.layers[id]!] } : {}) };
  return { ...next, bodyInfo, bodyNames: { ...next.bodyNames, ...plan.names } };
}
