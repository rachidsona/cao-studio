/**
 * Une implantation de cuisine (features/kitchen-layout.ts) traduite en opérations du document : caissons et façades,
 * esquisses et extrusions des murs, plans de travail et fileurs, avec la matière de chaque corps et les murs sur le
 * calque « Pièce » (hors débit). Utilisé par l'outil Implantation et par l'assistant.
 */
import { cabinetPartNames } from "../features/cabinet-parts";
import { frontsMaterials } from "../features/fronts-parts";
import { kitchenLayout, type KitchenSettings } from "../features/kitchen-layout";
import { addLayer, layersOf } from "./layers";
import { uniqueId, uniqueName } from "./operations";
import { rectangleAt } from "./sketch";
import { PART_SEPARATOR, type BodyInfo, type CabinetFeature, type CadDocument, type Feature, type FrontsFeature } from "./types";

const ROOM_LAYER = "Pièce";

export interface KitchenPlan {
  features: Feature[];
  info: Record<string, BodyInfo>;
  names: Record<string, string>;
}

/** The features of the kitchen (ids free in `doc`), in history order, and what each body is made of. */
export function kitchenPlan(doc: CadDocument, s: KitchenSettings, frontMaterial: string, worktopMaterial: string): KitchenPlan {
  const { units, boxes } = kitchenLayout(s);
  let probe = doc;
  const features: Feature[] = [];
  const info: Record<string, BodyInfo> = {};
  const names: Record<string, string> = {};
  const push = (f: Feature) => {
    features.push(f);
    probe = { ...probe, features: [...probe.features, f] };
  };
  for (const u of units) {
    const cabinet: CabinetFeature = {
      id: uniqueId(probe, "cb"), type: "cabinet", name: u.name, origin: u.origin, width: u.width, height: u.height, depth: u.depth,
      thickness: 18, back: "applied", backThickness: 3, shelves: u.shelves, plinth: u.plinth, construction: "sides-through",
      ...(u.rotation ? { rotation: u.rotation } : {}),
    };
    push(cabinet);
    cabinetPartNames(cabinet).forEach((name, i) => (info[`${cabinet.id}${PART_SEPARATOR}${i}`] = { material: name === "Fond" ? "hdf" : "melamine-white" }));
    const fronts: FrontsFeature = {
      id: uniqueId(probe, "fr"), type: "fronts", name: `Façades ${u.name}`, cabinet: cabinet.id, layout: u.layout, drawers: 3,
      mount: "overlay", gap: 3, thickness: s.frontThickness, hinges: true, handles: true,
    };
    push(fronts);
    frontsMaterials(fronts, cabinet, frontMaterial).forEach((material, i) => (info[`${fronts.id}${PART_SEPARATOR}${i}`] = { material }));
  }
  for (const box of boxes) {
    const [w, d, h] = [0, 1, 2].map((i) => (box.to[i] as number) - (box.from[i] as number)) as [number, number, number];
    const sketch: Feature = {
      id: uniqueId(probe, "sk"), type: "sketch", name: uniqueName(probe, "Esquisse"), plane: "XY", offset: box.from[2], hidden: true,
      ...rectangleAt(box.from[0] + w / 2, box.from[1] + d / 2, w, d),
    };
    push(sketch);
    const id = uniqueId(probe, "ex");
    push({ id, type: "extrude", name: box.name, sketch: sketch.id, distance: h, operation: "new" });
    names[id] = box.name;
    info[id] = box.kind === "wall" ? { room: true } : { material: box.kind === "worktop" ? worktopMaterial : frontMaterial };
  }
  return { features, info, names };
}

/** The materials and names of the plan in `doc`, and the walls on the "Pièce" layer (made when missing). */
export function decorateKitchen(doc: CadDocument, plan: KitchenPlan): CadDocument {
  let next = doc;
  let layer = layersOf(next).find((l) => l.name === ROOM_LAYER)?.id;
  if (!layer) ({ doc: next, id: layer } = addLayer(next, ROOM_LAYER));
  const bodyInfo = { ...next.bodyInfo };
  for (const [id, i] of Object.entries(plan.info)) bodyInfo[id] = { ...bodyInfo[id], ...i, ...(i.room ? { layer } : {}) };
  return { ...next, bodyInfo, bodyNames: { ...next.bodyNames, ...plan.names } };
}
