/**
 * Une implantation de cuisine (features/kitchen-layout.ts) traduite en opérations du document : caissons et façades,
 * esquisses et extrusions des murs, plans de travail (avec la découpe de l'évier et de la plaque), fileurs, panneaux,
 * crédence, plinthes et électroménager, avec la matière de chaque corps ; les murs sur le calque « Pièce » et
 * l'électroménager sur le calque « Électroménager », hors débit et devis. Posée dans une Pièce relevée, elle est
 * tournée et placée contre son mur A (features/room-runs.ts). Utilisé par l'outil Implantation et par l'assistant.
 */
import { cabinetPartNames } from "../features/cabinet-parts";
import { frontsMaterials } from "../features/fronts-parts";
import { kitchenLayout, originOf, type KitchenLayout, type KitchenSettings } from "../features/kitchen-layout";
import { applianceParts } from "../features/appliance-parts";
import { placeBox, placePoint, turn, type Placement, type RunInfo, type RunWall } from "../features/room-runs";
import { cutoutOps } from "../features/worktop-cutouts";
import { addLayer, layersOf } from "./layers";
import { uniqueId, uniqueName } from "./operations";
import { rectangleAt } from "./sketch";
import { PART_SEPARATOR, type ApplianceFeature, type BodyInfo, type CabinetFeature, type CadDocument, type Feature, type FrontsFeature, type MachiningFeature } from "./types";

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

/** The features of a layout already made (a kitchen plan's, document/kitchen-plan-build.ts), turned and moved by `place`. */
export function layoutPlan(doc: CadDocument, layout: KitchenLayout, frontThickness: number, frontMaterial: string, worktopMaterial: string, place: Placement = IDENTITY): KitchenPlan {
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
      thickness: 18, back: "applied", backThickness: 3, shelves: u.shelves, plinth: u.plinth, construction: "sides-through",
      ...(u.top ? { top: u.top } : {}), ...(rotation ? { rotation } : {}),
    };
    push(cabinet);
    cabinetPartNames(cabinet).forEach((name, i) => (plan.info[`${cabinet.id}${PART_SEPARATOR}${i}`] = { material: name === "Fond" ? "hdf" : "melamine-white" }));
    if (u.layout === "none") continue;
    const fronts: FrontsFeature = {
      id: uniqueId(probe, "fr"), type: "fronts", name: `Façades ${u.name}`, cabinet: cabinet.id, layout: u.layout, ...(u.side ? { side: u.side } : {}), drawers: u.drawers ?? 3,
      mount: "overlay", gap: 3, thickness: frontThickness, hinges: true, handles: true,
    };
    push(fronts);
    frontsMaterials(fronts, cabinet, frontMaterial).forEach((material, i) => (plan.info[`${fronts.id}${PART_SEPARATOR}${i}`] = { material }));
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
    const sketch: Feature = {
      id: uniqueId(probe, "sk"), type: "sketch", name: uniqueName(probe, "Esquisse"), plane: "XY", offset: from[2], hidden: true,
      ...rectangleAt(from[0] + w / 2, from[1] + d / 2, w, d),
    };
    push(sketch);
    const id = uniqueId(probe, "ex");
    push({ id, type: "extrude", name: box.name, sketch: sketch.id, distance: h, operation: "new", ...(box.door ? { door: { hinge: turn(place, box.door.hinge), out: turn(place, box.door.out) } } : {}) });
    plan.names[id] = box.name;
    const material = box.kind === "worktop" || box.kind === "splashback" ? worktopMaterial : frontMaterial;
    // Walls, appliances and fittings (a LeMans's trays) are bought, not cut: out of the cut list and the quote.
    plan.info[id] = box.kind === "wall" || box.kind === "appliance" || box.kind === "fitting" ? { room: true } : { material };
    if (box.kind === "wall") plan.layers[id] = ROOM_LAYER;
    if (box.kind === "appliance") plan.layers[id] = APPLIANCE_LAYER;
    if (box.kind === "fitting") plan.layers[id] = FITTING_LAYER;
    // The worktop's cut-outs, machined in it: their middle along its length from its low end, its front edge's side.
    if (box.holes?.length && box.front) {
      const along = w >= d ? 0 : 1;
      const front = turn(place, box.front);
      const frontSign = (Math.sign(front[1 - along]!) || -1) as -1 | 1;
      const cutouts = box.holes.map((hole) => ({ appliance: hole.appliance, along: Math.round(placePoint(place, hole.at)[along]! - from[along]!), front: null }));
      const { ops, problems } = cutoutOps([from, to], cutouts, frontSign);
      plan.problems.push(...problems.map((p) => `${box.name} : ${p}`));
      if (ops.length) push({ id: uniqueId(probe, "mc"), type: "machining", name: `Découpes ${box.name}`, target: id, kind: "cutout", ops, cutouts, frontSign } satisfies MachiningFeature);
    }
  }
  return plan;
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
