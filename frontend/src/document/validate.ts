/**
 * Structural validation of untrusted documents (loaded from the server, from
 * a local recovery copy or from an imported file). It mirrors the server-side
 * check in apps/projects/validation.py and adds per-feature checks.
 * Older schema versions are migrated by parseDocument before validation.
 */
import { glassFieldsProblem } from "../features/glass-door";
import { withAppliancePartLooks } from "./appliance-looks";
import { nameProblem } from "./expressions";
import { kitchenPlanProblem } from "./validate-kitchen";
import { migrateDocument } from "./migrate";
import { DOCUMENT_FORMAT, SCHEMA_VERSION, type CadDocument } from "./types";
import { validateSketch } from "./validate-sketch";
import { MAX_VARIANTS } from "./variants";

const UNITS = new Set(["mm", "cm", "m", "in"]);
const PLANES = new Set(["XY", "XZ", "YZ"]);
const OPERATIONS = new Set(["new", "join", "cut", "intersect"]);
/** A construction standard (document/standards.ts) as stored. */
function standardOk(s: unknown): boolean {
  if (!isObject(s) || typeof s.id !== "string" || typeof s.name !== "string") return false;
  if (!["thickness", "backThickness", "frontGap", "frontThickness", "band", "bandTrim", "jointSpacing"].every((k) => isFiniteNumber(s[k]))) return false;
  if ((s.plinth !== undefined && !isFiniteNumber(s.plinth)) || (s.autoJoints !== undefined && typeof s.autoJoints !== "boolean")) return false;
  if (!["none", "applied", "inset"].includes(s.back as string) || !["sides-through", "top-bottom-through"].includes(s.construction as string)) return false;
  if (!["overlay", "inset"].includes(s.frontMount as string) || !["confirmat", "dowel", "minifix"].includes(s.joint as string)) return false;
  return ["carcass", "fronts", "backs"].every((k) => s[k] === undefined || typeof s[k] === "string");
}

/** The sizes of its own a worktop cut-out may have: length × depth, a diameter, a corner radius, a name. */
const cutSizesOk = (c: Record<string, unknown>): boolean => {
  const size = c.size;
  const mm = (v: unknown) => isFiniteNumber(v) && v > 0 && v <= 5000;
  return (size === undefined || (Array.isArray(size) && size.length === 2 && size.every(mm))) && (c.diameter === undefined || mm(c.diameter)) && (c.radius === undefined || (isFiniteNumber(c.radius) && c.radius >= 0 && c.radius <= 2500)) && (c.name === undefined || (typeof c.name === "string" && c.name.length <= 80)) && (c.auto === undefined || typeof c.auto === "boolean");
};

const MACHINING_KINDS = new Set(["drilling32", "hinge", "groove", "dowel", "confirmat", "minifix", "halflap", "tenon", "cutout", "custom"]);
const COMBINE_OPERATIONS = new Set(["join", "cut", "intersect", "exclude"]);

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
      if (feature.texts !== undefined) {
        const ok =
          Array.isArray(feature.texts) &&
          feature.texts.length <= 200 &&
          feature.texts.every(
            (t) => isObject(t) && typeof t.id === "string" && typeof t.text === "string" && t.text.length <= 500 && isFiniteNumber(t.x) && isFiniteNumber(t.y) && isFiniteNumber(t.height) && (t.height as number) > 0 && (t.angle === undefined || isFiniteNumber(t.angle)),
          );
        if (!ok) errors.push(`${where} : textes de l'esquisse invalides.`);
      }
      if (feature.underlay !== undefined) {
        const u = feature.underlay as Json;
        const ok = isObject(u) && typeof u.image === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(u.image) && [u.x, u.y, u.width, u.height, u.opacity].every(isFiniteNumber) && (u.width as number) > 0 && (u.height as number) > 0 && (u.opacity as number) >= 0 && (u.opacity as number) <= 1;
        if (!ok) errors.push(`${where} : image de référence invalide (image en data URL, position, taille positive, opacité de 0 à 1).`);
      }
      if (feature.frame !== undefined) {
        const f = feature.frame as Json;
        const length = (v: unknown) => (isVec3(v) ? Math.hypot(...(v as number[])) : 0);
        if (!isObject(f) || !isVec3(f.origin) || length(f.xDir) < 1e-9 || length(f.normal) < 1e-9) errors.push(`${where} : plan de construction invalide.`);
      }
      if (feature.kitchenPlan !== undefined) {
        const problem = kitchenPlanProblem(feature.kitchenPlan);
        if (problem) errors.push(`${where} : ${problem}`);
      }
      validateSketch(feature, where, errors);
      break;
    case "extrude":
      if (feature.faces !== undefined) {
        checkRefs(feature.faces, "faces", where, errors);
        // Without its body, the extrusion fails alone (features/solids.ts), to choose again: the project still opens.
        if (feature.target !== undefined && typeof feature.target !== "string") errors.push(`${where} : corps des faces invalide.`);
      } else if (typeof feature.sketch !== "string") errors.push(`${where} : esquisse source manquante.`);
      checkNumbers(feature, ["distance"], where, errors);
      if (feature.until !== undefined && (!isObject(feature.until) || typeof feature.until.body !== "string")) errors.push(`${where} : face d'arrivée invalide.`);
      else if (feature.until !== undefined) checkRefs(feature.until.face, "face", where, errors);
      if (feature.cover !== undefined && (feature.cover !== true || feature.until === undefined)) errors.push(`${where} : « Couvrir la face d'arrivée » invalide.`);
      if (feature.startOffset !== undefined && !isFiniteNumber(feature.startOffset)) errors.push(`${where} : décalage de départ invalide.`);
      if (feature.direction !== undefined && !(isVec3(feature.direction) && (feature.direction as number[]).some((c) => c !== 0))) errors.push(`${where} : direction invalide.`);
      if (feature.strip !== undefined && (!isObject(feature.strip) || !isVec3(feature.strip.from) || !isVec3(feature.strip.to))) errors.push(`${where} : bande de face invalide.`);
      if (feature.door !== undefined && (!isObject(feature.door) || !isVec3(feature.door.hinge) || !isVec3(feature.door.out) || (feature.door.angle !== undefined && !(typeof feature.door.angle === "number" && feature.door.angle > 0 && feature.door.angle <= 180)))) errors.push(`${where} : porte invalide.`);
      if (
        feature.regions !== undefined &&
        (!Array.isArray(feature.regions) || feature.regions.length === 0 || !feature.regions.every((p) => Array.isArray(p) && p.length === 2 && p.every(isFiniteNumber)))
      ) {
        errors.push(`${where} : zones à extruder invalides.`);
      }
      if (feature.regionKeys !== undefined && (!Array.isArray(feature.regionKeys) || !Array.isArray(feature.regions) || feature.regionKeys.length !== feature.regions.length || !feature.regionKeys.every((k) => typeof k === "string"))) {
        errors.push(`${where} : noms des zones à extruder invalides.`);
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
      for (const key of ["radiusEnd", "distance2"])
        if (feature[key] !== undefined && !(isFiniteNumber(feature[key]) && (feature[key] as number) > 0)) errors.push(`${where} : ${key === "radiusEnd" ? "rayon de fin" : "seconde distance"} invalide.`);
      if (feature.swap !== undefined && typeof feature.swap !== "boolean") errors.push(`${where} : inversion invalide.`);
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
      } else if (!(tool.kind === "line" ? isVec3(tool.origin) && isVec3(tool.normal) && Math.hypot(...(tool.normal as number[])) >= 1e-9 : tool.kind === "faces" && Array.isArray(tool.faces) && tool.faces.length > 0 && tool.faces.every((f) => Array.isArray(f) && f.length >= 3 && f.every(isVec3)))) errors.push(`${where} : ${tool.kind === "line" ? "plan de coupe du trait invalide" : tool.kind === "faces" ? "surface de coupe du trait invalide" : "outil de coupe inconnu"}.`);
      break;
    }
    case "cabinet":
      if (!isVec3(feature.origin)) errors.push(`${where} : position du caisson invalide.`);
      checkNumbers(feature, ["width", "height", "depth", "thickness", "backThickness", "shelves", "plinth"], where, errors);
      if (!["none", "applied", "inset"].includes(feature.back as string)) errors.push(`${where} : type de fond invalide.`);
      if (!["sides-through", "top-bottom-through"].includes(feature.construction as string)) errors.push(`${where} : construction du caisson invalide.`);
      if (feature.top !== undefined && !["panel", "rails"].includes(feature.top as string)) errors.push(`${where} : haut du caisson invalide.`); if (feature.open !== undefined && feature.open !== "left" && feature.open !== "right") errors.push(`${where} : côté ouvert inconnu.`); if (feature.railFront !== undefined && feature.railFront !== "edge") errors.push(`${where} : traverse avant invalide.`);
      if (feature.rotation !== undefined && ![0, 90, 180, 270].includes(feature.rotation as number)) errors.push(`${where} : orientation du caisson invalide (0, 90, 180 ou 270°).`);
      if (feature.standard !== undefined && typeof feature.standard !== "string") errors.push(`${where} : standard de construction invalide.`);
      break;
    case "panels":
      if (typeof feature.sketch !== "string") errors.push(`${where} : esquisse squelette manquante.`);
      checkNumbers(feature, ["thickness", "depth"], where, errors);
      if (!["inside", "center", "outside"].includes(feature.align as string)) errors.push(`${where} : côté des panneaux invalide.`);
      if (!["vertical", "horizontal", "miter"].includes(feature.through as string)) errors.push(`${where} : priorité aux coins invalide.`);
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
      if (feature.dir !== undefined && (!isVec3(feature.dir) || Math.hypot(...(feature.dir as number[])) < 1e-9)) errors.push(`${where} : direction de l'axe de rotation invalide.`);
      checkNumbers(feature, ["angle"], where, errors);
      break;
    case "align":
      if (typeof feature.target !== "string" || typeof feature.reference !== "string") errors.push(`${where} : corps à aligner ou référence manquant.`);
      if (!Array.isArray(feature.modes) || feature.modes.length !== 3 || !feature.modes.every((m) => ALIGN_MODES.has(m as string))) errors.push(`${where} : alignements invalides.`);
      if (feature.gaps !== undefined && !isVec3(feature.gaps)) errors.push(`${where} : écarts invalides.`);
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
      if (feature.place !== undefined) {
        const place = feature.place;
        if (!isObject(place) || !["origin", "center", "bottom-left", "bottom-right"].includes(place.anchor as string) || !isFiniteNumber(place.spin) || typeof place.flip !== "boolean") errors.push(`${where} : placement du profil invalide.`);
      }
      if (feature.section !== undefined) {
        const s = feature.section;
        if (!isObject(s) || !isFiniteNumber(s.width) || !isFiniteNumber(s.height) || (s.width as number) <= 0 || (s.height as number) <= 0 || !["center", "left", "right"].includes(s.align as string) || (s.fromEnd !== undefined && typeof s.fromEnd !== "boolean")) errors.push(`${where} : section rectangulaire invalide.`);
      }
      break;
    case "paneling":
      if (typeof feature.target !== "string") errors.push(`${where} : corps à mettre en panneaux manquant.`);
      checkRefs(feature.faces, "faces", where, errors);
      checkNumbers(feature, ["thickness"], where, errors);
      if (!["miter", "butt"].includes(feature.joint as string)) errors.push(`${where} : assemblage des panneaux invalide.`);
      break;
    case "shell":
      if (typeof feature.target !== "string") errors.push(`${where} : corps à creuser manquant.`);
      checkRefs(feature.faces, "faces", where, errors);
      checkNumbers(feature, ["thickness"], where, errors);
      if (feature.sides !== undefined && !["joined", "separate"].includes(feature.sides as string)) errors.push(`${where} : côtés du corps vidé invalides.`);
      if ((feature.joint !== undefined && !["miter", "butt"].includes(feature.joint as string)) || (feature.frame !== undefined && typeof feature.frame !== "boolean") || (feature.corners !== undefined && !(isObject(feature.corners) && ["top", "bottom"].every((k) => ["miter", "sides", "boards"].includes((feature.corners as Record<string, unknown>)[k] as string))))) errors.push(`${where} : assemblage des côtés (ou « cadre ») invalide.`);
      if (feature.back !== undefined) {
        const back = feature.back;
        if (!isObject(back) || !["inset", "applied"].includes(back.mount as string) || !isFiniteNumber(back.thickness) || !((back.thickness as number) > 0)) errors.push(`${where} : fond invalide (pose « inset » ou « applied », épaisseur positive).`);
        else checkRefs(back.face, "face", `${where} (fond)`, errors);
      }
      break;
    case "fronts":
      if (typeof feature.cabinet !== "string") errors.push(`${where} : caisson manquant.`);
      if (!["door", "doors", "drawers"].includes(feature.layout as string)) errors.push(`${where} : disposition des façades inconnue.`);
      if (!["overlay", "inset"].includes(feature.mount as string)) errors.push(`${where} : pose des façades inconnue.`);
      checkNumbers(feature, ["drawers", "gap", "thickness"], where, errors); for (const k of ["topDrawer", "innerDrawers"]) if (feature[k] !== undefined && !(isFiniteNumber(feature[k]) && (feature[k] as number) > 0 && (k === "topDrawer" || Number.isInteger(feature[k])))) errors.push(`${where} : « ${k} » doit être un nombre positif.`);
      if (typeof feature.hinges !== "boolean" || typeof feature.handles !== "boolean") errors.push(`${where} : réglages de quincaillerie invalides.`);
      if (feature.side !== undefined && !["left", "right", "top", "bottom"].includes(feature.side as string)) errors.push(`${where} : côté des charnières inconnu.`);
      if (feature.grip !== undefined && feature.grip !== "gorge") errors.push(`${where} : prise de main inconnue.`);
      if (feature.face !== undefined && feature.face !== "left" && feature.face !== "right") errors.push(`${where} : côté de la porte latérale inconnu.`);
      if (glassFieldsProblem(feature, ["flat", "frame", "glass", "fluted", "slats"])) errors.push(`${where} : ${glassFieldsProblem(feature, ["flat", "frame", "glass", "fluted", "slats"])}`);
      if (feature.frameDepth !== undefined && !(isFiniteNumber(feature.frameDepth) && feature.frameDepth > 0)) errors.push(`${where} : « frameDepth » doit être un nombre positif.`);
      break;
    case "room": {
      if (!Array.isArray(feature.walls) || !feature.walls.length || !feature.walls.every((w) => isObject(w) && isFiniteNumber(w.length) && (w.length as number) > 0 && isFiniteNumber(w.angle) && (w.angle as number) > 0 && (w.angle as number) < 360 && (w.plumb === undefined || (isObject(w.plumb) && isFiniteNumber(w.plumb.mid) && isFiniteNumber(w.plumb.high))))) errors.push(`${where} : murs invalides (longueur positive, angle entre 0 et 360°).`);
      if (!isFiniteNumber(feature.height) || (feature.height as number) <= 0 || !isFiniteNumber(feature.thickness) || (feature.thickness as number) <= 0) errors.push(`${where} : hauteur et épaisseur des murs positives.`);
      const kinds = ["window", "door", "socket", "beam", "slope"];
      if (!Array.isArray(feature.obstacles) || !feature.obstacles.every((o) => isObject(o) && kinds.includes(o.kind as string) && Number.isInteger(o.wall) && Object.entries(o).every(([k, v]) => k === "kind" || isFiniteNumber(v)))) errors.push(`${where} : obstacles invalides.`);
      break;
    }
    case "trim":
      if (!Array.isArray(feature.parts) || !feature.parts.every((p) => isObject(p) && typeof p.name === "string" && [p.from, p.to].every((v) => Array.isArray(v) && v.length === 3 && v.every((c) => isFiniteNumber(c))) && (p.radius === undefined || (isFiniteNumber(p.radius) && (p.radius as number) > 0)) && (p.hardware === undefined || typeof p.hardware === "boolean") && (p.item === undefined || typeof p.item === "string") && (p.per === undefined || p.per === "m"))) errors.push(`${where} : planches de finition invalides.`);
      else if (!feature.parts.every((p) => p.outline === undefined || (isObject(p.outline) && (p.outline.axis === 0 || p.outline.axis === 1) && (p.outline.plane === undefined || p.outline.plane === "top") && Array.isArray(p.outline.points) && p.outline.points.length >= 3 && p.outline.points.every((q: unknown) => Array.isArray(q) && q.length === 2 && q.every((c) => isFiniteNumber(c)))))) errors.push(`${where} : contour d'une planche recoupée invalide.`);
      if (feature.issues !== undefined && !(Array.isArray(feature.issues) && feature.issues.every((i) => typeof i === "string"))) errors.push(`${where} : problèmes du relevé invalides.`);
      break;
    case "niche":
      if (typeof feature.sketch !== "string" || typeof feature.partition !== "string") errors.push(`${where} : répartition manquante.`);
      if (!Array.isArray(feature.niche) || !feature.niche.every((n) => Number.isInteger(n) && (n as number) >= 0)) errors.push(`${where} : niche invalide.`);
      if (!["rod", "drawers", "doors", "back", "door", "accessory"].includes(feature.fill as string)) errors.push(`${where} : équipement inconnu.`);
      if (feature.fill === "accessory" && !(isObject(feature.accessory) && typeof feature.accessory.model === "string" && isFiniteNumber(feature.accessory.lift))) errors.push(`${where} : accessoire invalide.`);
      if (feature.span !== undefined && (!Array.isArray(feature.span) || !feature.span.every((p) => Array.isArray(p) && p.every((k) => Number.isInteger(k))))) errors.push(`${where} : niches de la porte invalides.`);
      checkNumbers(feature, ["diameter", "drop", "drawers", "gap", "thickness"], where, errors);
      if (feature.hinges !== undefined && !(Array.isArray(feature.hinges) && feature.hinges.every((h) => ["left", "right", "top", "bottom"].includes(h as string)))) errors.push(`${where} : sens d'ouverture des portes invalide.`);
      if (feature.joined !== undefined && !(Array.isArray(feature.joined) && feature.joined.every((c) => Number.isInteger(c) && (c as number) >= 0))) errors.push(`${where} : portes communes invalides.`);
      if (feature.skipped !== undefined && !(Array.isArray(feature.skipped) && feature.skipped.every((c) => Number.isInteger(c) && (c as number) >= 0))) errors.push(`${where} : cases sans porte invalides.`);
      if (glassFieldsProblem(feature, ["flat", "frame", "glass", "fluted", "slats"])) errors.push(`${where} : ${glassFieldsProblem(feature, ["flat", "frame", "glass", "fluted", "slats"])}`);
      if (feature.frameDepth !== undefined && !(isFiniteNumber(feature.frameDepth) && feature.frameDepth > 0)) errors.push(`${where} : « frameDepth » doit être un nombre positif.`);
      if (feature.split !== undefined && feature.split !== "whole" && feature.split !== "cases") errors.push(`${where} : découpe du fond invalide.`);
      for (const [key, ok, what] of [["mount", ["overlay", "inset"], "pose des façades inconnue"], ["cover", ["whole", "none"], "recouvrement de la porte inconnu"]] as const) if (feature[key] !== undefined && !(ok as readonly string[]).includes(feature[key] as string)) errors.push(`${where} : ${what}.`);
      for (const key of ["sideGap", "betweenGap", "bottomGap"]) if (feature[key] !== undefined && !isFiniteNumber(feature[key])) errors.push(`${where} : « ${key} » doit être un nombre fini.`);
      if (typeof feature.handles !== "boolean") errors.push(`${where} : réglage des poignées invalide.`);
      break;
    case "modifier":
      if (typeof feature.target !== "string") errors.push(`${where} : planche à modifier manquante.`);
      if (!["bend", "taper", "twist", "ffd", "points", "face-scale"].includes(feature.kind as string)) errors.push(`${where} : modificateur inconnu.`);
      if (feature.moves !== undefined && (!Array.isArray(feature.moves) || !feature.moves.every((p) => isObject(p) && isVec3(p.from) && isVec3(p.to)))) errors.push(`${where} : points à déplacer invalides.`);
      if (feature.lattice !== undefined && (!Array.isArray(feature.lattice) || feature.lattice.length !== 81 || !feature.lattice.every((v) => isFiniteNumber(v)))) errors.push(`${where} : grille de déformation invalide (27 points).`);
      if (feature.kind === "face-scale" && !(isObject(feature.face) && isVec3(feature.face.center) && isVec3(feature.face.u) && isVec3(feature.face.v) && [feature.face.size, feature.face.scale].every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => isFiniteNumber(v) && v > 0)))) errors.push(`${where} : face à déformer invalide.`);
      checkNumbers(feature, ["amount"], where, errors);
      break;
    case "loft":
      if (!Array.isArray(feature.profiles) || feature.profiles.length < 2 || !feature.profiles.every((p) => typeof p === "string")) errors.push(`${where} : il faut au moins deux esquisses à relier.`);
      if (!OPERATIONS.has(feature.operation as string)) errors.push(`${where} : opération inconnue.`);
      if (feature.operation !== "new" && typeof feature.target !== "string") errors.push(`${where} : corps cible manquant.`);
      break;
    case "machining": {
      if (typeof feature.target !== "string") errors.push(`${where} : corps à usiner manquant.`);
      if (!MACHINING_KINDS.has(feature.kind as string)) errors.push(`${where} : type d'usinage inconnu.`);
      if ((feature.anchor !== undefined && !isVec3(feature.anchor)) || (feature.anchorHigh !== undefined && !isVec3(feature.anchorHigh))) errors.push(`${where} : point d'ancrage invalide.`);
      if (feature.cutouts !== undefined && (!Array.isArray(feature.cutouts) || feature.cutouts.length > 50 || !feature.cutouts.every((c) => isObject(c) && typeof c.appliance === "string" && isFiniteNumber(c.along) && (c.front === null || isFiniteNumber(c.front)) && cutSizesOk(c))))
        errors.push(`${where} : découpes invalides.`);
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
    case "appliance":
      if (typeof feature.model !== "string" || typeof feature.finish !== "string") errors.push(`${where} : modèle d'électroménager invalide.`);
      if (!isVec3(feature.origin)) errors.push(`${where} : position de l'appareil invalide.`);
      checkNumbers(feature, ["width", "height", "depth"], where, errors);
      if (feature.rotation !== undefined && ![0, 90, 180, 270].includes(feature.rotation as number)) errors.push(`${where} : orientation de l'appareil invalide (0, 90, 180 ou 270°).`);
      break;
    default:
      errors.push(`${where} : type d'opération inconnu « ${String(feature.type)} ».`);
  }
}

const variantsOk = (list: unknown) =>
  Array.isArray(list) && list.length <= MAX_VARIANTS && list.every((v) => isObject(v) && typeof v.id === "string" && typeof v.name === "string" && (v.total === null || isFiniteNumber(v.total)) && isObject(v.doc) && Array.isArray(v.doc.features) &&
      // Its picture is shown as is: an image of its own, never an address elsewhere (audit of 10/11/2026, M4).
      (v.image === undefined || v.image === "" || (typeof v.image === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]*$/.test(v.image))));

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
  if (input.drawings !== undefined) {
    const sheets = input.drawings;
    const sheetOk = (d: unknown) =>
      isObject(d) && typeof d.id === "string" && typeof d.name === "string" && Array.isArray(d.views) && Array.isArray(d.annotations) && isObject(d.sketch) && Array.isArray(d.sketch.items) && isObject(d.title) &&
      d.views.every((v) => isObject(v) && typeof v.id === "string" && isFiniteNumber(v.scale) && (v.scale as number) > 0 && Array.isArray(v.at) && isObject(v.spec) && (v.explode === undefined || (isFiniteNumber(v.explode) && (v.explode as number) >= 0 && (v.explode as number) <= 2))) &&
      d.annotations.every(
        (a) =>
          isObject(a) &&
          typeof a.id === "string" &&
          typeof a.kind === "string" &&
          // Written in the SVG of the sheet: a text where a number is expected would go in as markup (audit of 10/11/2026, M2).
          (a.text === undefined || typeof a.text === "string") &&
          (a.size === undefined || (isFiniteNumber(a.size) && (a.size as number) > 0)) &&
          (a.at === undefined || (Array.isArray(a.at) && a.at.length === 2 && a.at.every(isFiniteNumber))),
      );
    if (!Array.isArray(sheets) || sheets.length > 50 || !sheets.every(sheetOk)) errors.push("« drawings » : feuilles de mise en plan invalides.");
  }
  if (input.bodyInfo !== undefined && (!isObject(input.bodyInfo) || !Object.values(input.bodyInfo).every(isObject))) errors.push("« bodyInfo » doit décrire chaque corps.");
  else if (input.bodyInfo !== undefined) {
    for (const info of Object.values(input.bodyInfo as Record<string, Record<string, unknown>>)) {
      if (info.appearance !== undefined && typeof info.appearance !== "string") errors.push("« bodyInfo » : l'apparence d'un corps doit être un identifiant.");
      if (info.color !== undefined && !(typeof info.color === "string" && /^#[0-9a-f]{6}$/i.test(info.color))) errors.push("« bodyInfo » : la couleur d'un corps doit être de la forme #rrggbb.");
      if (info.faces !== undefined && (!Array.isArray(info.faces) || info.faces.length > 500 || !info.faces.every((f) => isObject(f) && isVec3(f.normal) && isVec3(f.rel) && typeof f.appearance === "string" && (f.color === undefined || (typeof f.color === "string" && /^#[0-9a-f]{6}$/i.test(f.color))))))
        errors.push("« bodyInfo » : les motifs des faces d'un corps sont invalides.");
    }
  }
  if (input.layers !== undefined && (!Array.isArray(input.layers) || !input.layers.every((l) => isObject(l) && typeof l.id === "string" && typeof l.name === "string" && typeof l.visible === "boolean"))) errors.push("« layers » doit être une liste de calques (id, name, visible).");
  if (input.hardware !== undefined && !(isObject(input.hardware) && Object.entries(input.hardware).every(([k, v]) => ["hinge", "slide", "handle"].includes(k) && typeof v === "string"))) {
    errors.push("« hardware » doit donner les modèles choisis (hinge, slide, handle) par leur identifiant.");
  }
  if (input.standard !== undefined && typeof input.standard !== "string") errors.push("« standard » doit être l'identifiant d'un standard de construction.");
  if (input.standards !== undefined && (!Array.isArray(input.standards) || input.standards.length > 50 || !input.standards.every(standardOk))) errors.push("« standards » doit être une liste de standards de construction valides.");
  if (input.furniture !== undefined && (!Array.isArray(input.furniture) || input.furniture.length > 500 || !input.furniture.every((r) => isObject(r) && typeof r.name === "string" && isObject(r.ask) && typeof r.ask.kind === "string" && typeof r.ask.option === "string" && ["width", "height", "depth", "thickness"].every((k) => isFiniteNumber((r.ask as Record<string, unknown>)[k])) && typeof r.material === "string" && Array.isArray(r.corner) && r.corner.length === 3 && r.corner.every((c) => isFiniteNumber(c)) && Array.isArray(r.along) && r.along.length === 2 && r.along.every((c) => isFiniteNumber(c)) && Array.isArray(r.features) && r.features.every((f) => typeof f === "string")))) errors.push("« furniture » doit être une liste de meubles de l'assistant (nom, demande, matière, coin, sens, opérations).");
  if (input.quotes !== undefined && (!Array.isArray(input.quotes) || input.quotes.length > 100 || !input.quotes.every((q) => isObject(q) && typeof q.id === "string" && typeof q.label === "string" && typeof q.date === "string" && isFiniteNumber(q.net) && isFiniteNumber(q.gross) && Array.isArray(q.lines) && q.lines.length <= 500 && q.lines.every((l) => isObject(l) && typeof l.label === "string" && isFiniteNumber(l.quantity) && typeof l.unit === "string" && isFiniteNumber(l.unitPrice) && isFiniteNumber(l.total))))) {
    errors.push("« quotes » doit être une liste de versions du devis (id, label, date, lignes, totaux).");
  }
  if (input.variants !== undefined && !variantsOk(input.variants)) errors.push("« variants » doit être une liste de versions du projet (id, nom, document).");
  if (input.folders !== undefined && (!Array.isArray(input.folders) || !input.folders.every((f) => isObject(f) && typeof f.id === "string" && typeof f.name === "string" && Array.isArray(f.bodies) && f.bodies.every((b) => typeof b === "string")))) {
    errors.push("« folders » doit être une liste de dossiers (id, name, bodies).");
  }
  if (input.appearances !== undefined && (!Array.isArray(input.appearances) || !input.appearances.every((a) => isObject(a) && typeof a.id === "string" && typeof a.name === "string" && typeof a.image === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(a.image) && Array.isArray(a.tile) && a.tile.length === 2 && a.tile.every((t) => typeof t === "number" && t > 0)))) {
    errors.push("« appearances » doit être une liste d'images (id, name, image en data URL, tile).");
  }
  const faceOn = (x: unknown) => isObject(x) && typeof x.body === "string" && isObject(x.face) && typeof x.face.type === "string" && isVec3(x.face.rel) && isVec3(x.face.center) && isVec3(x.face.normal);
  if (input.extendLinks !== undefined && (!Array.isArray(input.extendLinks) || !input.extendLinks.every((l) => isObject(l) && typeof l.id === "string" && faceOn(l.from) && faceOn(l.to)))) {
    errors.push("« extendLinks » doit être une liste de liaisons (id, from, to : un corps et une face).");
  }
  if (input.removedBodies !== undefined && (!Array.isArray(input.removedBodies) || !input.removedBodies.every((k) => typeof k === "string"))) {
    errors.push("« removedBodies » doit être une liste de pièces.");
  }
  if (input.configurations !== undefined && (!Array.isArray(input.configurations) || !input.configurations.every((c) => isObject(c) && typeof c.id === "string" && typeof c.name === "string" && isObject(c.values) && Object.values(c.values).every((v) => typeof v === "number" && Number.isFinite(v))))) {
    errors.push("« configurations » doit être une liste de configurations (id, name, values).");
  }
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

/**
 * A saved project as it can be opened (audit of 11/11/2026): an operation the editor cannot use no longer keeps the
 * whole project closed — it is switched off (suppressed), kept for its author to repair, and said in `problems`; one
 * without an id or a type is left out. Only a fault of the document itself (format, version, its lists) still throws.
 */
export function openDocument(input: unknown): { doc: CadDocument; problems: string[] } {
  const upgraded = migrateDocument(input);
  if (validateDocument(upgraded).length === 0) return { doc: parseDocument(upgraded), problems: [] };
  if (!isObject(upgraded) || !Array.isArray(upgraded.features)) return { doc: parseDocument(upgraded), problems: [] };
  const envelope = validateDocument({ ...upgraded, features: [] });
  if (envelope.length) throw new Error(`Document invalide :\n- ${envelope.join("\n- ")}`);
  const problems: string[] = [];
  const ids = new Set<string>();
  const features: unknown[] = [];
  for (const feature of upgraded.features) {
    const alone = validateDocument({ ...upgraded, features: [feature] }).map((m) => m.replace(/^Opération 1 /, ""));
    const named = isObject(feature) && typeof feature.id === "string" && typeof feature.type === "string" && !ids.has(feature.id);
    const label = isObject(feature) && typeof feature.name === "string" ? `« ${feature.name} »` : "Une opération";
    if (!named) {
      problems.push(`${label} est retirée : elle n'a pas d'identifiant propre.`);
      continue;
    }
    ids.add(feature.id as string);
    if (alone.length === 0) features.push(feature);
    else {
      features.push({ ...feature, suppressed: true });
      problems.push(`${label} est désactivée : ${alone.join(" ; ")}`);
    }
  }
  return { doc: parseDocumentLoose({ ...upgraded, features }), problems };
}

/** The document with its broken operations switched off: checked as a whole except them. */
function parseDocumentLoose(input: Record<string, unknown>): CadDocument {
  const doc = input as unknown as CadDocument;
  return { ...doc, parameters: doc.parameters ?? {} };
}

/** Validates an untrusted document, upgrading older schema versions first. */
export function parseDocument(input: unknown): CadDocument {
  const upgraded = migrateDocument(input);
  const errors = validateDocument(upgraded);
  if (errors.length > 0) throw new Error(`Document invalide :\n- ${errors.join("\n- ")}`);
  const doc = upgraded as CadDocument;
  // Its appliances' pieces added since it was saved, dressed as the others.
  return withAppliancePartLooks({ ...doc, parameters: doc.parameters ?? {} });
}
