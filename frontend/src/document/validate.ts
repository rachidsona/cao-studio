/**
 * Structural validation of untrusted documents (loaded from the server, from
 * a local recovery copy or from an imported file). It mirrors the server-side
 * check in apps/projects/validation.py and adds per-feature checks.
 * Older schema versions are migrated by parseDocument before validation.
 */
import { nameProblem } from "./expressions";
import { migrateDocument } from "./migrate";
import { DOCUMENT_FORMAT, SCHEMA_VERSION, type CadDocument } from "./types";
import { validateSketch } from "./validate-sketch";

const UNITS = new Set(["mm", "cm", "m", "in"]);
const PLANES = new Set(["XY", "XZ", "YZ"]);
const OPERATIONS = new Set(["new", "join", "cut", "intersect"]);
const MACHINING_KINDS = new Set(["drilling32", "hinge", "groove", "dowel", "confirmat", "halflap", "tenon", "custom"]);
const COMBINE_OPERATIONS = new Set(["join", "cut", "intersect"]);

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const ALIGN_MODES: ReadonlySet<string> = new Set(["none", "min", "center", "max", "after", "before"]);

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
      if (feature.shift !== undefined && !(Array.isArray(feature.shift) && feature.shift.length === 2 && feature.shift.every(isFiniteNumber))) {
        errors.push(`${where} : déplacement de l'esquisse dans son plan invalide.`);
      }
      validateSketch(feature, where, errors);
      break;
    case "extrude":
      if (feature.faces !== undefined) {
        checkRefs(feature.faces, "faces", where, errors);
        if (typeof feature.target !== "string") errors.push(`${where} : corps des faces manquant.`);
      } else if (typeof feature.sketch !== "string") errors.push(`${where} : esquisse source manquante.`);
      checkNumbers(feature, ["distance"], where, errors);
      if (
        feature.regions !== undefined &&
        (!Array.isArray(feature.regions) || feature.regions.length === 0 || !feature.regions.every((p) => Array.isArray(p) && p.length === 2 && p.every(isFiniteNumber)))
      ) {
        errors.push(`${where} : zones à extruder invalides.`);
      }
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
    case "split": {
      if (typeof feature.target !== "string") errors.push(`${where} : corps cible manquant.`);
      if (!["both", "positive", "negative"].includes(feature.keep as string)) errors.push(`${where} : partie à conserver invalide.`);
      const tool = feature.tool;
      if (!isObject(tool)) errors.push(`${where} : outil de coupe manquant.`);
      else if (tool.kind === "plane") {
        if (!["XY", "XZ", "YZ"].includes(tool.plane as string)) errors.push(`${where} : plan de coupe invalide.`);
        if (!isFiniteNumber(tool.offset)) errors.push(`${where} : décalage du plan de coupe invalide.`);
      } else if (tool.kind === "face") {
        if (typeof tool.body !== "string") errors.push(`${where} : corps de la face de coupe manquant.`);
        checkRefs(tool.face, "face", where, errors);
      } else errors.push(`${where} : outil de coupe inconnu.`);
      break;
    }
    case "cabinet":
      if (!isVec3(feature.origin)) errors.push(`${where} : position du caisson invalide.`);
      checkNumbers(feature, ["width", "height", "depth", "thickness", "backThickness", "shelves", "plinth"], where, errors);
      if (!["none", "applied", "inset"].includes(feature.back as string)) errors.push(`${where} : type de fond invalide.`);
      if (!["sides-through", "top-bottom-through"].includes(feature.construction as string)) errors.push(`${where} : construction du caisson invalide.`);
      break;
    case "panels":
      if (typeof feature.sketch !== "string") errors.push(`${where} : esquisse squelette manquante.`);
      checkNumbers(feature, ["thickness", "depth"], where, errors);
      if (!["inside", "center", "outside"].includes(feature.align as string)) errors.push(`${where} : côté des panneaux invalide.`);
      if (!["vertical", "horizontal"].includes(feature.through as string)) errors.push(`${where} : priorité aux coins invalide.`);
      break;
    case "mirror":
      if (!Array.isArray(feature.targets) || !feature.targets.every((t) => typeof t === "string")) errors.push(`${where} : corps à copier invalides.`);
      if (![0, 1, 2].includes(feature.axis as number)) errors.push(`${where} : axe de symétrie invalide.`);
      checkNumbers(feature, ["position"], where, errors);
      break;
    case "array":
      if (!Array.isArray(feature.targets) || !feature.targets.every((t) => typeof t === "string")) errors.push(`${where} : corps à copier invalides.`);
      if (!isVec3(feature.step)) errors.push(`${where} : pas de répétition invalide (trois nombres attendus).`);
      if (!Number.isInteger(feature.count) || (feature.count as number) < 1 || (feature.count as number) > 200) errors.push(`${where} : nombre de copies invalide (1 à 200).`);
      if (feature.second !== undefined) {
        const second = feature.second;
        if (!isObject(second) || !isVec3(second.step) || !Number.isInteger(second.count) || (second.count as number) < 1 || (second.count as number) > 200) errors.push(`${where} : seconde direction du réseau invalide.`);
        else if (((feature.count as number) + 1) * ((second.count as number) + 1) - 1 > 400) errors.push(`${where} : réseau trop grand (400 copies au plus).`);
      }
      if (feature.around !== undefined) {
        const around = feature.around;
        if (!isObject(around) || ![0, 1, 2].includes(around.axis as number) || !isVec3(around.center) || !isFiniteNumber(around.angle)) errors.push(`${where} : réseau circulaire invalide (axe, centre et angle attendus).`);
      }
      break;
    case "rotate":
      if (typeof feature.target !== "string") errors.push(`${where} : corps à tourner manquant.`);
      if (![0, 1, 2].includes(feature.axis as number)) errors.push(`${where} : axe de rotation invalide.`);
      if (!isVec3(feature.center)) errors.push(`${where} : centre de rotation invalide.`);
      checkNumbers(feature, ["angle"], where, errors);
      break;
    case "align":
      if (typeof feature.target !== "string" || typeof feature.reference !== "string") errors.push(`${where} : corps à aligner ou référence manquant.`);
      if (!Array.isArray(feature.modes) || feature.modes.length !== 3 || !feature.modes.every((m) => ALIGN_MODES.has(m as string))) errors.push(`${where} : alignements invalides.`);
      break;
    case "stretch":
      if (typeof feature.target !== "string") errors.push(`${where} : corps à étirer manquant.`);
      if (![0, 1, 2].includes(feature.axis as number)) errors.push(`${where} : axe d'étirement invalide.`);
      checkNumbers(feature, ["position", "distance"], where, errors);
      break;
    case "sweep":
      if (typeof feature.profile !== "string" || typeof feature.path !== "string") errors.push(`${where} : profil ou chemin manquant.`);
      if (!OPERATIONS.has(feature.operation as string)) errors.push(`${where} : opération inconnue.`);
      if (feature.operation !== "new" && typeof feature.target !== "string") errors.push(`${where} : corps cible manquant.`);
      break;
    case "machining": {
      if (typeof feature.target !== "string") errors.push(`${where} : corps à usiner manquant.`);
      if (!MACHINING_KINDS.has(feature.kind as string)) errors.push(`${where} : type d'usinage inconnu.`);
      if (feature.anchor !== undefined && !isVec3(feature.anchor)) errors.push(`${where} : point d'ancrage invalide.`);
      const ops = feature.ops;
      if (!Array.isArray(ops) || ops.length === 0 || ops.length > 500) errors.push(`${where} : usinages invalides (1 à 500).`);
      else
        for (const op of ops) {
          const valid =
            isObject(op) &&
            ((op.kind === "hole" && isVec3(op.at) && isVec3(op.dir) && isFiniteNumber(op.diameter) && op.diameter > 0 && isFiniteNumber(op.depth) && op.depth > 0) ||
              (op.kind === "box" && isVec3(op.from) && isVec3(op.to) && (op.mode === "cut" || op.mode === "join")));
          if (!valid) {
            errors.push(`${where} : un usinage est invalide.`);
            break;
          }
        }
      break;
    }
    case "move":
      if (typeof feature.target !== "string") errors.push(`${where} : corps à déplacer manquant.`);
      if (!isVec3(feature.translate)) errors.push(`${where} : déplacement invalide (trois nombres attendus).`);
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
  else if (isObject(input.parameters)) {
    for (const [name, p] of Object.entries(input.parameters)) {
      const problem = nameProblem(name);
      if (problem) errors.push(`Paramètre « ${name} » : ${problem}`);
      else if (!isObject(p) || !isFiniteNumber(p.value) || (p.expression !== undefined && typeof p.expression !== "string")) errors.push(`Paramètre « ${name} » invalide (valeur numérique attendue).`);
    }
  }
  if (input.bodyNames !== undefined && (!isObject(input.bodyNames) || !Object.values(input.bodyNames).every((v) => typeof v === "string"))) {
    errors.push("« bodyNames » doit associer un nom à chaque corps.");
  }
  if (input.bodyInfo !== undefined && (!isObject(input.bodyInfo) || !Object.values(input.bodyInfo).every(isObject))) errors.push("« bodyInfo » doit décrire chaque corps.");
  if (input.guides !== undefined && (!Array.isArray(input.guides) || !input.guides.every((g) => isObject(g) && isVec3(g.from) && isVec3(g.to)))) errors.push("« guides » doit être une liste de lignes de guide.");
  if (input.views !== undefined && (!Array.isArray(input.views) || !input.views.every((v) => isObject(v) && typeof v.name === "string" && isVec3(v.position) && isVec3(v.target) && isVec3(v.up)))) {
    errors.push("« views » doit être une liste de vues enregistrées.");
  }
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
    if (feature.expressions !== undefined && (!isObject(feature.expressions) || !Object.values(feature.expressions).every((e) => typeof e === "string"))) errors.push(`${where} : formules invalides.`);
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
