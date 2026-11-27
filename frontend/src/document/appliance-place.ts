/**
 * Un appareil de la bibliothèque posé par rapport au caisson cliqué (features/appliance-library.ts, sa place) : dans
 * sa caisse, centré, la face avant au nu du caisson (un four de colonne vers 85 cm du sol) ; sur le plan de travail
 * au-dessus (une plaque, un évier centrés dans sa profondeur ; un robinet au fond) — le plan découpé dessous ; une hotte
 * à 65 cm au-dessus du plan, contre le mur (une hotte îlot au milieu) ; un groupe filtrant sous un meuble haut ; un
 * réfrigérateur posable debout à sa place, contre le mur ; une cave à vin sous le plan posée au sol comme un
 * lave-vaisselle, en colonne comme un réfrigérateur. Tourné comme le caisson. Un four, un micro-ondes encastré ou une
 * cave à vin lui ôte ses façades, et tout
 * appareil dedans ses étagères. Ses pièces prennent leurs apparences, sur le calque « Électroménager », hors débit.
 * Une seule annulation. Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { addLayer, layersOf } from "./layers";
import { deleteFeatures, latestBody, uniqueId, updateFeature } from "./operations";
import { PART_SEPARATOR, type ApplianceFeature, type CabinetFeature, type CadDocument, type MachiningFeature, type Vec3 } from "./types";
import { applianceDef, type ApplianceDef } from "../features/appliance-library";
import { applianceParts } from "../features/appliance-parts";

type Box = [Vec3, Vec3];
const LAYER = "Électroménager";
/** Above the worktop, the bottom of a hood (mm). */
const HOOD_OVER = 650;
/** A column's oven: its bottom from the floor (mm). */
const OVEN_IN_COLUMN = 850;

export interface PlaceAt {
  /** The worktop over the cabinet: its body and its box (world), if any. */
  worktop?: { body: string; box: Box };
}

/** How thick the part of a hob or a sink lying on the worktop is (mm). */
export const topOf = (def: ApplianceDef): number => (def.category === "hob" ? (def.id === "hob-gas" ? 8 : 6) : def.category === "sink" ? (def.id === "sink-granite" ? 10 : 1.5) : 0);

/** Still in the model: some of its pieces are not deleted (deleting its bodies leaves the operation, its pieces gone). */
export function applianceShown(doc: CadDocument, f: ApplianceFeature): boolean {
  const gone = new Set(doc.removedBodies ?? []);
  return applianceParts(f).some((_, i) => !gone.has(`${f.id}${PART_SEPARATOR}${i}`));
}

/** Where its front-left-bottom corner goes in the cabinet's frame (x along it, y back from its front, z up from its bottom), or why not. */
export function applianceSpot(def: ApplianceDef, size: [number, number, number], c: CabinetFeature, top: number): Vec3 | string {
  const [w, h, d] = size;
  const { width: W, depth: D, height: H, thickness: t } = c;
  const x = (W - w) / 2;
  switch (def.place) {
    case "in": {
      if (w > W + 1) return `${def.name} : ${w} mm de large, le caisson n'en a que ${W}.`;
      const tall = H > 1500;
      // Under the worktop on the floor, as a dishwasher: a wine cooler of a base cabinet.
      // An under-counter fridge too, when it fits there (a taller one is a column's).
      const floor = def.category === "dishwasher" || ((def.category === "wine" || def.category === "fridge") && !tall && h <= H);
      if (h > H - 2 * t + 1 && !floor) return `${def.name} : ${h} mm de haut, le caisson n'en a que ${H}.`;
      if (floor) return [x, 0, Math.max(0, H - h - 5)];
      if (def.category === "fridge" || def.category === "wine") return [x, 0, c.plinth + t];
      if (tall && def.category === "oven") return [x, 0, Math.min(H - h - t, Math.max(c.plinth + t, OVEN_IN_COLUMN))];
      if (tall && def.category === "microwave") return [x, 0, Math.min(H - h - t, OVEN_IN_COLUMN + 600)];
      return [x, 0, Math.max(c.plinth + t, H - h - t)];
    }
    case "top":
      // On the worktop, near the wall: a microwave, a kettle, a toaster.
      if (def.category === "microwave" || def.category === "small") return [x, D - d - 30, top];
      // A hob or a sink: its plate on the worktop, its body under it.
      return [x, (D - 40 - d) / 2, top - (h - topOf(def))];
    case "tap":
      return [x, D - 60 - d + w / 2, top];
    case "hood":
      // An island hood over the middle of its cabinet, a wall one against the wall.
      return [x, def.id === "hood-island" || def.id === "hood-pendant" ? (D - d) / 2 : D - d, top + HOOD_OVER];
    case "under":
      return [x, 0, -h];
    case "stand":
      return [x, D - d, 0 - c.origin[2]];
  }
}

/** A point of the cabinet's frame, in the model. */
function inModel(c: CabinetFeature, [x, y, z]: Vec3): Vec3 {
  const { along, back } = cabinetAxes(c.rotation ?? 0);
  return [c.origin[0] + along[0] * x + back[0] * y, c.origin[1] + along[1] * x + back[1] * y, c.origin[2] + z];
}

/** The box of a rectangle of the cabinet's frame (x0…x1 along, y0…y1 back), from z0 to z1, in the model. */
function boxInModel(c: CabinetFeature, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box {
  const [a, b] = [inModel(c, [x0, y0, z0]), inModel(c, [x1, y1, z1])];
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), z0 + c.origin[2]], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), z1 + c.origin[2]]];
}

/** The document with the appliance placed by this cabinet (its id), or why not. */
export function withAppliance(doc: CadDocument, model: string, size: [number, number, number], finish: string, c: CabinetFeature, at: PlaceAt = {}): { doc: CadDocument; id: string; notes: string[] } | string {
  const def = applianceDef(model);
  if (!def) return "Modèle d'électroménager inconnu.";
  const notes: string[] = [];
  // The worktop's top over the cabinet, in its frame (else the cabinet's top and a usual worktop).
  const top = at.worktop ? at.worktop.box[1][2] - c.origin[2] : c.height + 38;
  const spot = applianceSpot(def, size, c, top);
  if (typeof spot === "string") return spot;
  const [w, h, d] = size;
  const id = uniqueId(doc, "ap");
  const feature: ApplianceFeature = { id, type: "appliance", name: def.name, model, origin: inModel(c, spot), width: w, height: h, depth: d, finish, ...(c.rotation ? { rotation: c.rotation } : {}) };
  // A second click on the same cabinet: the same kind of appliance is already there.
  const middle = (f: ApplianceFeature): Vec3 => {
    const { along, back } = cabinetAxes(f.rotation ?? 0);
    return [0, 1, 2].map((i) => f.origin[i]! + (i < 2 ? along[i]! * f.width / 2 + back[i]! * f.depth / 2 : f.height / 2)) as Vec3;
  };
  const [mx, my, mz] = middle(feature);
  const there = doc.features.find((f): f is ApplianceFeature => {
    if (f.type !== "appliance" || applianceDef(f.model)?.category !== def.category || !applianceShown(doc, f)) return false;
    const [x, y, z] = middle(f);
    return Math.hypot(x - mx, y - my) < 50 && Math.abs(z - mz) < (f.height + h) / 2;
  });
  if (there) return `« ${there.name} » est déjà posé ici : supprimez-le d'abord pour en mettre un autre.`;
  let next: CadDocument = { ...doc, features: [...doc.features, feature] };
  // In its cabinet: no shelves; an oven or a built-in microwave without the cabinet's fronts.
  if (def.place === "in") {
    next = updateFeature(next, c.id, (f) => (f.type === "cabinet" ? { ...f, shelves: 0 } : f));
    if (def.open) {
      const fronts = next.features.filter((f) => f.type === "fronts" && f.cabinet === c.id).map((f) => f.id);
      if (fronts.length) {
        next = deleteFeatures(next, fronts).next;
        notes.push("Façades du caisson ôtées.");
      }
    }
  }
  // The worktop cut under a hob or a sink, a hole for a tap.
  if (at.worktop && (def.category === "hob" || def.category === "sink" || def.category === "tap")) {
    const [x, y] = spot;
    const [lo, hi] = at.worktop.box;
    const z0 = lo[2] - 1 - c.origin[2];
    const z1 = hi[2] + 1 - c.origin[2];
    const ops: MachiningFeature["ops"] =
      def.category === "tap"
        ? [{ kind: "hole", at: inModel(c, [x + w / 2, y + d - w / 2, hi[2] - c.origin[2]]), dir: [0, 0, -1], diameter: 35, depth: hi[2] - lo[2] }]
        : [{ kind: "box", ...(([from, to]) => ({ from, to }))(boxInModel(c, x + 20, x + w - 20, y + 20, y + d - 20, z0, z1)), mode: "cut" }];
    next = { ...next, features: [...next.features, { id: uniqueId(next, "mc"), type: "machining", name: `Découpe ${def.name}`, target: latestBody(next, at.worktop.body), kind: "cutout", ops, anchor: [...lo], anchorHigh: [...hi] } satisfies MachiningFeature] };
    notes.push("Plan de travail découpé.");
  }
  // Its pieces' looks, on the appliances' layer, out of the cut list.
  let layer = layersOf(next).find((l) => l.name === LAYER)?.id;
  if (!layer) ({ doc: next, id: layer } = addLayer(next, LAYER));
  const info = { ...next.bodyInfo };
  applianceParts(feature).forEach((p, i) => (info[`${id}${PART_SEPARATOR}${i}`] = { appearance: p.look, room: true, layer }));
  next = { ...next, bodyInfo: info };
  if (def.place === "stand" && d > c.depth + 1) notes.push(`Il dépasse de ${Math.round(d - c.depth)} mm devant le caisson.`);
  return { doc: next, id, notes };
}
