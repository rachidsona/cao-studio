/**
 * Structural validation of untrusted documents (loaded from the server, from
 * a local recovery copy or from an imported file). It mirrors the server-side
 * check in apps/projects/validation.py and adds per-feature checks.
 * Older schema versions are migrated by parseDocument before validation.
 */
import { migrateDocument } from "./migrate";
import { DOCUMENT_FORMAT, SCHEMA_VERSION, type CadDocument } from "./types";
import { validateSketch } from "./validate-sketch";

const UNITS = new Set(["mm", "cm", "m", "in"]);
const PLANES = new Set(["XY", "XZ", "YZ"]);
const OPERATIONS = new Set(["new", "join", "cut", "intersect"]);
const COMBINE_OPERATIONS = new Set(["join", "cut", "intersect"]);

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function checkNumbers(obj: Json, keys: string[], where: string, errors: string[]): void {
  for (const key of keys) {
    if (!isFiniteNumber(obj[key])) errors.push(`${where} : « ${key} » doit être un nombre fini.`);
  }
}

function isVec3(v: unknown): boolean {
  return Array.isArray(v) && v.length === 3 && v.every(isFiniteNumber);
}

/** Edge / face references (geometry/references.ts). */
function checkRefs(refs: unknown, kind: "edge" | "face" | "faces", where: string, errors: string[]): void {
  const list = kind === "face" ? [refs] : refs;
  if (!Array.isArray(list)) {
    errors.push(`${where} : « ${kind === "faces" ? "faces" : "edges"} » doit être une liste.`);
    return;
  }
  list.forEach((ref, i) => {
    const ok =
      isObject(ref) &&
      typeof ref.type === "string" &&
      isVec3(ref.rel) &&
      (kind === "edge" ? isVec3(ref.mid) && isVec3(ref.dir) && isFiniteNumber(ref.length) : isVec3(ref.center) && isVec3(ref.normal));
    if (!ok) errors.push(`${where} : référence ${kind === "edge" ? "d'arête" : "de face"} ${i + 1} invalide.`);
  });
}

function checkFeature(feature: Json, where: string, errors: string[]): void {
  switch (feature.type) {
    case "sketch":
      if (!PLANES.has(feature.plane as string)) errors.push(`${where} : plan d'esquisse invalide.`);
      checkNumbers(feature, ["offset"], where, errors);
      validateSketch(feature, where, errors);
      break;
    case "extrude":
      if (feature.faces !== undefined) {
        checkRefs(feature.faces, "faces", where, errors);
        if (typeof feature.target !== "string") errors.push(`${where} : corps des faces manquant.`);
      } else if (typeof feature.sketch !== "string") errors.push(`${where} : esquisse source manquante.`);
      checkNumbers(feature, ["distance"], where, errors);
      if (!OPERATIONS.has(feature.operation as string)) errors.push(`${where} : opération inconnue.`);
      if (feature.target !== undefined && typeof feature.target !== "string") errors.push(`${where} : cible invalide.`);
      break;
    case "hole":
      if (typeof feature.target !== "string") errors.push(`${where} : corps cible manquant.`);
      checkNumbers(feature, ["x", "y", "diameter"], where, errors);
      if (feature.depth !== "through" && !isFiniteNumber(feature.depth)) {
        errors.push(`${where} : profondeur invalide.`);
      }
      if (feature.origin !== undefined && !isVec3(feature.origin)) errors.push(`${where} : point de départ invalide.`);
      if (feature.direction !== undefined && !isVec3(feature.direction)) errors.push(`${where} : direction invalide.`);
      if (feature.face !== undefined) checkRefs(feature.face, "face", where, errors);
      break;
    case "revolve":
      if (typeof feature.sketch !== "string") errors.push(`${where} : esquisse source manquante.`);
      if (typeof feature.axis !== "string") errors.push(`${where} : axe manquant.`);
      checkNumbers(feature, ["angle"], where, errors);
      if (!OPERATIONS.has(feature.operation as string)) errors.push(`${where} : opération inconnue.`);
      if (feature.target !== undefined && typeof feature.target !== "string") errors.push(`${where} : cible invalide.`);
      break;
    case "fillet":
    case "chamfer":
      if (typeof feature.target !== "string") errors.push(`${where} : corps cible manquant.`);
      checkNumbers(feature, [feature.type === "fillet" ? "radius" : "distance"], where, errors);
      checkRefs(feature.edges, "edge", where, errors);
      break;
    case "split":
      if (typeof feature.target !== "string") errors.push(`${where} : corps cible manquant.`);
      if (
        !Array.isArray(feature.planes) ||
        !feature.planes.every((p) => isObject(p) && isVec3(p.point) && isVec3(p.normal))
      ) {
        errors.push(`${where} : plans de coupe invalides.`);
      }
      break;
    case "combine":
      if (typeof feature.target !== "string") errors.push(`${where} : corps cible manquant.`);
      if (!Array.isArray(feature.tools) || !feature.tools.every((t) => typeof t === "string")) errors.push(`${where} : corps outils invalides.`);
      if (!COMBINE_OPERATIONS.has(feature.operation as string)) errors.push(`${where} : opération inconnue.`);
      if (feature.keepTools !== undefined && typeof feature.keepTools !== "boolean") errors.push(`${where} : option invalide.`);
      break;
    default:
      errors.push(`${where} : type d'opération inconnu « ${String(feature.type)} ».`);
  }
}

/** Returns the list of problems found; an empty list means the document is usable. */
export function validateDocument(input: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(input)) return ["Le document doit être un objet JSON."];
  if (input.format !== DOCUMENT_FORMAT) errors.push(`Format inconnu (attendu « ${DOCUMENT_FORMAT} »).`);
  if (input.schemaVersion !== SCHEMA_VERSION) errors.push(`Version de schéma non prise en charge.`);
  if (!UNITS.has(input.units as string)) errors.push("Unité d'affichage invalide.");
  if (input.parameters !== undefined && !isObject(input.parameters)) errors.push("« parameters » doit être un objet.");
  if (!Array.isArray(input.features)) {
    errors.push("« features » doit être une liste.");
    return errors;
  }
  const ids = new Set<string>();
  input.features.forEach((feature, index) => {
    const where = `Opération ${index + 1}`;
    if (!isObject(feature) || typeof feature.id !== "string" || typeof feature.type !== "string") {
      errors.push(`${where} : « id » et « type » sont obligatoires.`);
      return;
    }
    if (ids.has(feature.id)) errors.push(`${where} : identifiant « ${feature.id} » dupliqué.`);
    ids.add(feature.id);
    checkFeature(feature, `${where} (${feature.id})`, errors);
  });
  return errors;
}

/** Validates an untrusted document, upgrading older schema versions first. */
export function parseDocument(input: unknown): CadDocument {
  const upgraded = migrateDocument(input);
  const errors = validateDocument(upgraded);
  if (errors.length > 0) throw new Error(`Document invalide :\n- ${errors.join("\n- ")}`);
  const doc = upgraded as CadDocument;
  return { ...doc, parameters: doc.parameters ?? {} };
}
