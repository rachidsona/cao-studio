/**
 * Actions de l'assistant de modélisation : ce que Claude propose (ajouter un caisson, l'habiller de façades,
 * implanter une cuisine, changer une matière, un paramètre…), sous une forme typée et fermée, appliquée ici au
 * document par les mêmes fonctions que les outils. Une action impossible (référence inconnue, cote hors limites)
 * est refusée avec sa raison, sans empêcher les autres ; le résultat est vérifié comme un document chargé.
 * `assistantContext` résume le document pour Claude : il n'envoie que ce qui sert à le désigner et le modifier.
 */
import { cabinetPartNames, cabinetProblem } from "../features/cabinet-parts";
import { frontsParts, frontsProblem } from "../features/fronts-parts";
import { KITCHEN, kitchenProblem } from "../features/kitchen-layout";
import { applyExpressions, nameProblem } from "./expressions";
import { decorateKitchen, kitchenPlan } from "./kitchen-plan";
import { MATERIALS } from "./materials";
import { deleteFeatures, findFeature, uniqueId, updateFeature } from "./operations";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type Feature, type FrontsFeature } from "./types";
import { parseDocument } from "./validate";
import { preferredUnit } from "../measurements/unit-preference";

type Rotation = 0 | 90 | 180 | 270;

export type AssistantAction =
  | { type: "add_cabinet"; name: string; width: number; height: number; depth: number; shelves: number; plinth: number; back: "applied" | "inset" | "none"; x: number; y: number; z: number; rotation: Rotation }
  | { type: "update_cabinet"; ref: string; width: number | null; height: number | null; depth: number | null; shelves: number | null; plinth: number | null; x: number | null; y: number | null; z: number | null; rotation: Rotation | null }
  | { type: "add_fronts"; cabinet: string; layout: "door" | "doors" | "drawers"; drawers: number; mount: "overlay" | "inset"; handles: boolean }
  | { type: "add_kitchen"; layout: "I" | "L"; length_a: number; length_b: number; base_height: number; depth: number; fronts: "mixed" | "drawers" | "doors"; wall_units: boolean; front_material: string; worktop_material: string }
  | { type: "set_material"; ref: string; material: string }
  | { type: "set_parameter"; name: string; value: number }
  | { type: "rename"; ref: string; name: string }
  | { type: "delete"; ref: string };

const materialName = (id: string) => MATERIALS.find((m) => m.id === id)?.name ?? id;

/** The feature an action names: by id, else by name (the last one of that name, ignoring case). */
export function resolveRef(doc: CadDocument, ref: string): Feature | undefined {
  const byId = findFeature(doc, ref);
  if (byId) return byId;
  const wanted = ref.trim().toLocaleLowerCase("fr");
  return [...doc.features].reverse().find((f) => f.name.toLocaleLowerCase("fr") === wanted);
}

/** One line in French saying what the action does. */
export function describeAction(a: AssistantAction): string {
  switch (a.type) {
    case "add_cabinet":
      return `Ajouter le caisson « ${a.name} » ${a.width} × ${a.height} × ${a.depth} mm${a.shelves ? `, ${a.shelves} étagère(s)` : ""}${a.rotation ? `, tourné de ${a.rotation}°` : ""}`;
    case "update_cabinet": {
      const changes = (["width", "height", "depth", "shelves", "plinth", "x", "y", "z", "rotation"] as const).filter((k) => a[k] !== null).map((k) => `${k} = ${a[k]}`);
      return `Modifier « ${a.ref} » : ${changes.join(", ") || "rien"}`;
    }
    case "add_fronts":
      return `Habiller « ${a.cabinet} » : ${a.layout === "door" ? "une porte" : a.layout === "doors" ? "deux portes" : `${a.drawers} tiroirs`}${a.mount === "inset" ? " encastrés" : ""}`;
    case "add_kitchen":
      return `Implanter une cuisine en ${a.layout} (mur A ${a.length_a} mm${a.layout === "L" ? `, mur B ${a.length_b} mm` : ""})${a.wall_units ? " avec meubles hauts" : ""}`;
    case "set_material":
      return `Matière de « ${a.ref} » : ${materialName(a.material)}`;
    case "set_parameter":
      return `Paramètre ${a.name} = ${a.value}`;
    case "rename":
      return `Renommer « ${a.ref} » en « ${a.name} »`;
    case "delete":
      return `Supprimer « ${a.ref} »`;
  }
}

const finite = (...values: (number | null)[]) => values.every((v) => v === null || Number.isFinite(v));

function applyOne(doc: CadDocument, a: AssistantAction): CadDocument {
  if (a.type === "add_cabinet") {
    if (!finite(a.width, a.height, a.depth, a.shelves, a.plinth, a.x, a.y, a.z)) throw new Error("cote invalide.");
    const cabinet: CabinetFeature = {
      id: uniqueId(doc, "cb"), type: "cabinet", name: a.name.trim() || "Caisson", origin: [a.x, a.y, a.z], width: a.width, height: a.height, depth: a.depth,
      thickness: 18, back: a.back, backThickness: a.back === "inset" ? 8 : 3, shelves: Math.round(a.shelves), plinth: a.plinth, construction: "sides-through",
      ...(a.rotation ? { rotation: a.rotation } : {}),
    };
    const problem = cabinetProblem(cabinet);
    if (problem) throw new Error(problem);
    const info = { ...doc.bodyInfo };
    cabinetPartNames(cabinet).forEach((n, i) => (info[`${cabinet.id}${PART_SEPARATOR}${i}`] = { material: n === "Fond" ? "hdf" : "melamine-white" }));
    return { ...doc, features: [...doc.features, cabinet], bodyInfo: info };
  }
  if (a.type === "update_cabinet") {
    const f = resolveRef(doc, a.ref);
    if (f?.type !== "cabinet") throw new Error(`pas de caisson « ${a.ref} ».`);
    if (!finite(a.width, a.height, a.depth, a.shelves, a.plinth, a.x, a.y, a.z)) throw new Error("cote invalide.");
    const next: CabinetFeature = {
      ...f,
      width: a.width ?? f.width, height: a.height ?? f.height, depth: a.depth ?? f.depth, shelves: a.shelves === null ? f.shelves : Math.round(a.shelves), plinth: a.plinth ?? f.plinth,
      origin: [a.x ?? f.origin[0], a.y ?? f.origin[1], a.z ?? f.origin[2]],
      ...(a.rotation === null ? {} : { rotation: a.rotation }),
    };
    const problem = cabinetProblem(next);
    if (problem) throw new Error(problem);
    return updateFeature(doc, f.id, () => next);
  }
  if (a.type === "add_fronts") {
    const cabinet = resolveRef(doc, a.cabinet);
    if (cabinet?.type !== "cabinet") throw new Error(`pas de caisson « ${a.cabinet} ».`);
    const fronts: FrontsFeature = {
      id: uniqueId(doc, "fr"), type: "fronts", name: `Façades ${cabinet.name}`, cabinet: cabinet.id, layout: a.layout, drawers: Math.round(a.drawers),
      mount: a.mount, gap: 3, thickness: 19, hinges: true, handles: a.handles,
    };
    const problem = frontsProblem(fronts, cabinet);
    if (problem) throw new Error(problem);
    const material = doc.bodyInfo?.[`${cabinet.id}${PART_SEPARATOR}0`]?.material ?? "melamine-white";
    const info = { ...doc.bodyInfo };
    frontsParts(fronts, cabinet).forEach((p, i) => (info[`${fronts.id}${PART_SEPARATOR}${i}`] = { material: p.role ? material : p.name.endsWith("fond") ? "hdf" : "birch-plywood" }));
    return { ...doc, features: [...doc.features, fronts], bodyInfo: info };
  }
  if (a.type === "add_kitchen") {
    const settings = { ...KITCHEN, layout: a.layout, lengthA: a.length_a, lengthB: a.length_b, baseHeight: a.base_height, baseDepth: a.depth, fronts: a.fronts, wallUnits: a.wall_units };
    if (!finite(a.length_a, a.length_b, a.base_height, a.depth)) throw new Error("cote invalide.");
    const problem = kitchenProblem(settings);
    if (problem) throw new Error(problem);
    const known = (id: string, fallback: string) => (MATERIALS.some((m) => m.id === id) ? id : fallback);
    const plan = kitchenPlan(doc, settings, known(a.front_material, "lacquer-white"), known(a.worktop_material, "solid-oak"));
    return decorateKitchen({ ...doc, features: [...doc.features, ...plan.features] }, plan);
  }
  if (a.type === "set_material") {
    const f = resolveRef(doc, a.ref);
    if (!f) throw new Error(`rien ne s'appelle « ${a.ref} ».`);
    if (!MATERIALS.some((m) => m.id === a.material)) throw new Error(`matière inconnue « ${a.material} ».`);
    const info = { ...doc.bodyInfo };
    const set = (id: string) => (info[id] = { ...info[id], material: a.material });
    if (f.type === "cabinet") cabinetPartNames(f).forEach((n, i) => n !== "Fond" && set(`${f.id}${PART_SEPARATOR}${i}`));
    else if (f.type === "fronts") {
      const cabinet = findFeature(doc, f.cabinet);
      frontsParts(f, cabinet?.type === "cabinet" ? cabinet : undefined).forEach((p, i) => p.role && set(`${f.id}${PART_SEPARATOR}${i}`));
    } else set(f.id);
    return { ...doc, bodyInfo: info };
  }
  if (a.type === "set_parameter") {
    const problem = nameProblem(a.name);
    if (problem) throw new Error(problem);
    if (!finite(a.value)) throw new Error("valeur invalide.");
    const previous = doc.parameters[a.name];
    return { ...doc, parameters: { ...doc.parameters, [a.name]: { ...(previous?.comment ? { comment: previous.comment } : {}), value: a.value, unit: previous?.unit ?? "mm" } } };
  }
  if (a.type === "rename") {
    const f = resolveRef(doc, a.ref);
    if (!f) throw new Error(`rien ne s'appelle « ${a.ref} ».`);
    if (!a.name.trim()) throw new Error("nom vide.");
    return updateFeature(doc, f.id, (x) => ({ ...x, name: a.name.trim() }) as Feature);
  }
  const f = resolveRef(doc, a.ref);
  if (!f) throw new Error(`rien ne s'appelle « ${a.ref} ».`);
  return deleteFeatures(doc, [f.id]).next;
}

/** The document with the actions applied in order, what was done, and why the others were refused. */
export function applyActions(doc: CadDocument, actions: AssistantAction[]): { doc: CadDocument; done: string[]; refused: string[] } {
  let next = doc;
  const done: string[] = [];
  const refused: string[] = [];
  for (const a of actions) {
    try {
      next = applyOne(next, a);
      done.push(describeAction(a));
    } catch (error) {
      refused.push(`${describeAction(a)} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const linked = applyExpressions(next);
  if (Object.keys(linked.parameterErrors).length || linked.errors.length) refused.push("Des formules ne se calculent plus : les paramètres sont gardés, les cotes liées non mises à jour.");
  else next = linked.doc;
  return { doc: parseDocument(JSON.parse(JSON.stringify(next))), done, refused };
}

/** What Claude needs to know of the document: its features (with the numbers of the furniture), parameters, materials. */
export function assistantContext(doc: CadDocument): Record<string, unknown> {
  const features = doc.features.slice(-200).map((f) => {
    const base = { id: f.id, type: f.type, name: f.name };
    if (f.type === "cabinet") return { ...base, origin: f.origin, width: f.width, height: f.height, depth: f.depth, shelves: f.shelves, plinth: f.plinth, back: f.back, rotation: f.rotation ?? 0, material: doc.bodyInfo?.[`${f.id}${PART_SEPARATOR}0`]?.material ?? null };
    if (f.type === "fronts") return { ...base, cabinet: f.cabinet, layout: f.layout, drawers: f.drawers, mount: f.mount };
    if (f.type === "extrude") return { ...base, distance: f.distance, material: doc.bodyInfo?.[f.id]?.material ?? null, room: doc.bodyInfo?.[f.id]?.room ?? false };
    return base;
  });
  return {
    display_unit: preferredUnit(),
    parameters: Object.fromEntries(Object.entries(doc.parameters).map(([n, p]) => [n, p.expression ? `= ${p.expression} (${p.value})` : p.value])),
    features,
    materials: MATERIALS.map((m) => ({ id: m.id, name: m.name })),
  };
}
