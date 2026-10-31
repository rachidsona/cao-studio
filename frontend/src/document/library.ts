/**
 * « Ma bibliothèque », en pur : un module (un caisson, un tiroir, une colonne réglés) est un document complet qui ne
 * garde que les fonctions des pièces choisies et tout ce dont elles dépendent (esquisse, répartition, corps de
 * départ…), avec leurs noms, matières, apparences importées et les paramètres de leurs formules. L'insérer dans un
 * projet y recopie ces fonctions sous des identifiants neufs (toutes les références suivent), au même endroit ; les
 * paramètres que le projet a déjà gardent sa valeur.
 */
import { namesIn } from "./expressions";
import { uniqueId, uniqueName } from "./operations";
import { featureOfBody, type CadDocument, type Feature } from "./types";

/** Every string in a value (deep), but the feature's own id and name. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (k !== "id" && k !== "name") strings(v, out);
  return out;
}

const refersTo = (s: string, id: string) => s === id || s.startsWith(`${id}#`);

/** The ids of the features this one refers to (its sketch, its target, its cabinet, its profiles…). */
export function dependencies(doc: CadDocument, feature: Feature): string[] {
  const texts = strings(feature);
  return doc.features.filter((g) => g.id !== feature.id && texts.some((s) => refersTo(s, g.id))).map((g) => g.id);
}

/** Keys of a map by body ("fid" or "fid#n") that belong to these features. */
const ofFeatures = <T>(map: Record<string, T> | undefined, ids: ReadonlySet<string>) => Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => ids.has(featureOfBody(k))));

/** The module of these bodies: a document with their features and all those they depend on; a reason when empty. */
export function moduleOf(doc: CadDocument, bodyIds: readonly string[]): CadDocument | string {
  const wanted = new Set<string>();
  const visit = (id: string) => {
    if (wanted.has(id)) return;
    const f = doc.features.find((x) => x.id === id);
    if (!f) return;
    wanted.add(id);
    for (const dep of dependencies(doc, f)) visit(dep);
  };
  for (const body of bodyIds) visit(featureOfBody(body));
  if (!wanted.size) return "Sélectionnez les corps du module (un caisson, un tiroir, une colonne…).";
  const features = doc.features.filter((f) => wanted.has(f.id));
  // The parameters of their formulas, and those these depend on.
  const parameters: CadDocument["parameters"] = {};
  const take = (name: string) => {
    const p = doc.parameters?.[name];
    if (!p || name in parameters) return;
    parameters[name] = p;
    for (const dep of p.expression ? namesIn(p.expression) : []) take(dep);
  };
  for (const f of features) for (const text of Object.values(f.expressions ?? {})) for (const name of namesIn(text)) take(name);
  const bodyInfo = ofFeatures(doc.bodyInfo, wanted);
  const used = new Set(Object.values(bodyInfo).map((i) => i.appearance));
  const module: CadDocument = {
    format: doc.format,
    schemaVersion: doc.schemaVersion,
    units: doc.units,
    parameters,
    features: structuredClone(features),
    bodyNames: ofFeatures(doc.bodyNames, wanted),
    bodyInfo: structuredClone(bodyInfo),
  };
  const hidden = (doc.hiddenBodies ?? []).filter((b) => wanted.has(featureOfBody(b)));
  const removed = (doc.removedBodies ?? []).filter((b) => wanted.has(featureOfBody(b)));
  const appearances = (doc.appearances ?? []).filter((a) => used.has(a.id));
  if (hidden.length) module.hiddenBodies = hidden;
  if (removed.length) module.removedBodies = removed;
  if (appearances.length) module.appearances = structuredClone(appearances);
  return module;
}

/** The document with the module put in it under new ids, and the ids of its features there. */
export function insertModule(doc: CadDocument, module: CadDocument): { doc: CadDocument; features: string[] } {
  // New ids, of the same kind as the old ones ("ex2" → "ex7"), none taken twice.
  const ids = new Map<string, string>();
  let probe: CadDocument = doc;
  for (const f of module.features) {
    const id = uniqueId(probe, f.id.replace(/\d+$/, "") || "f");
    ids.set(f.id, id);
    probe = { ...probe, features: [...probe.features, { ...f, id }] };
  }
  const remap = (s: string): string => {
    const [head, ...rest] = s.split("#");
    const id = ids.get(head ?? "");
    return id === undefined ? s : [id, ...rest].join("#");
  };
  const deep = (value: unknown, key = ""): unknown => {
    if (typeof value === "string") return key === "name" ? value : remap(value);
    if (Array.isArray(value)) return value.map((v) => deep(v));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deep(v, k)]));
    return value;
  };
  let next: CadDocument = doc;
  const added: Feature[] = [];
  for (const f of module.features) {
    const copy = deep(f) as Feature;
    // A name the project already has gets the next number ("Caisson 1" → "Caisson 2").
    const taken = (n: string) => next.features.some((g) => g.name === n) || added.some((g) => g.name === n);
    if (taken(copy.name)) copy.name = uniqueName({ ...next, features: [...next.features, ...added] }, copy.name.replace(/\s+\d+$/, ""));
    added.push(copy);
  }
  const keys = <T>(map: Record<string, T> | undefined) => Object.fromEntries(Object.entries(map ?? {}).map(([k, v]) => [remap(k), structuredClone(v)]));
  next = {
    ...next,
    features: [...next.features, ...added],
    parameters: { ...module.parameters, ...next.parameters },
    bodyNames: { ...next.bodyNames, ...keys(module.bodyNames) },
    bodyInfo: { ...next.bodyInfo, ...keys(module.bodyInfo) },
  };
  if (module.hiddenBodies?.length) next.hiddenBodies = [...(next.hiddenBodies ?? []), ...module.hiddenBodies.map(remap)];
  if (module.removedBodies?.length) next.removedBodies = [...(next.removedBodies ?? []), ...module.removedBodies.map(remap)];
  const missing = (module.appearances ?? []).filter((a) => !(next.appearances ?? []).some((b) => b.id === a.id));
  if (missing.length) next.appearances = [...(next.appearances ?? []), ...structuredClone(missing)];
  return { doc: next, features: added.map((f) => f.id) };
}
