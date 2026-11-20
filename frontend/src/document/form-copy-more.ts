/**
 * « Pipette de forme », au-delà des éléments de même sorte (document/form-copy.ts) :
 * - une porte de tout genre — de niche, d'une façade de caisson, d'un meuble de cuisine — donne à une autre son style,
 *   son sens d'ouverture (de côté, relevante, abattante) et sa poignée ou son absence ;
 * - un corps quelconque (planche, côté, panneau) donne à un autre ses trois cotes, sa matière et son apparence ;
 * - une étagère ou une cloison donne la division de sa niche (nombre, épaisseur, hauteurs, et ce qui la divise
 *   encore) à une niche vide qu'on clique ; à une autre étagère, seulement son épaisseur, sa matière et son apparence
 *   (le nombre et la place des étagères restent). Pur.
 */
import { bodyOrigin, findFeature } from "./operations";
import { featureOfBody, type Axis, type CadDocument, type FrontsFeature, type KitchenRunItem, type NicheFeature, type SketchFeature, type Vec3 } from "./types";
import { readRecipe, withRecipe, type NichePlace } from "./niche-recipe";
import { withPieceSize } from "./piece-size";
import { withShelfThickness } from "./niche-size";
import { withLookCopied } from "../appearance/assign";
import { isShelves, pathKey } from "../sketcher/partition-history";

export const DOOR_STYLE = ["style", "frameWidth", "frameDepth", "pitch", "grooves", "glass", "profile"] as const;

/** A door, whatever made it: its style, the side of its hinges, its handle. */
export interface DoorForm {
  style: Record<string, unknown>;
  opening: "left" | "right" | "top" | "bottom";
  handles: boolean;
}

const styleOf = (from: object) => Object.fromEntries(DOOR_STYLE.flatMap((k) => ((from as Record<string, unknown>)[k] === undefined ? [] : [[k, structuredClone((from as Record<string, unknown>)[k])]])));

/** The door of a niche, of fronts or of a kitchen unit (its item); null when it has none (drawers, a penderie…). */
export function doorOf(source: NicheFeature | FrontsFeature | KitchenRunItem): DoorForm | null {
  if ("fill" in source) {
    if (source.fill !== "door" && source.fill !== "doors") return null;
    return { style: styleOf(source), opening: source.hinges?.[0] ?? "left", handles: source.handles };
  }
  if ("cabinet" in source) {
    if (source.layout !== "door" && source.layout !== "doors") return null;
    return { style: styleOf(source), opening: source.side ?? "left", handles: source.handles };
  }
  return { style: styleOf(source.facade ?? {}), opening: source.side ?? "left", handles: source.handles !== false };
}

/** `keys` dropped from `to`, then `values` set (a door's style replaces the other's, its missing keys too). */
const restyled = <T extends object>(to: T, keys: readonly string[], values: Record<string, unknown>): T => {
  const next = { ...to } as Record<string, unknown>;
  for (const k of keys) delete next[k];
  return { ...next, ...values } as T;
};

/** A kitchen unit given a door's form: its fronts' style, the side of its door, its handles. */
export function unitWithDoor(item: KitchenRunItem, door: DoorForm): KitchenRunItem {
  const { side: _side, handles: _handles, ...rest } = item;
  return { ...rest, facade: door.style as KitchenRunItem["facade"], ...(door.opening !== "left" ? { side: door.opening } : {}), ...(door.handles ? {} : { handles: false }) };
}

/** Fronts given a door's form. */
export function frontsWithDoor(f: FrontsFeature, door: DoorForm): FrontsFeature {
  const { side: _side, ...rest } = restyled(f, DOOR_STYLE, door.style);
  return { ...rest, ...(door.opening !== "left" ? { side: door.opening } : {}), handles: door.handles } as FrontsFeature;
}

/** A niche's door given a door's form; one door per case (« doors ») only opens on a side. */
export function nicheWithDoor(f: NicheFeature, door: DoorForm): NicheFeature {
  const next = restyled(f, DOOR_STYLE, door.style);
  if (f.fill === "door") return { ...next, hinges: [door.opening], handles: door.handles };
  return { ...next, handles: door.handles, ...(door.opening === "left" || door.opening === "right" ? { hinges: (f.hinges ?? [door.opening]).map(() => door.opening) } : {}) };
}

/** A shelf or a cloison of a Répartition, from one of its bodies: its step, and the niche it divides; null for any other body. */
export function divisionOf(doc: CadDocument, bodyId: string): (NichePlace & { vertical: boolean; record: string }) | null {
  const id = featureOfBody(bodyOrigin(doc, bodyId));
  for (const f of doc.features) {
    if (f.type !== "sketch") continue;
    const record = (f.offsets ?? []).find((r) => isShelves(r) && (r.bodies ?? []).includes(id));
    if (record && isShelves(record)) return { sketch: f.id, partition: record.step.of, path: record.step.niche, vertical: !!record.step.input.vertical, record: record.id };
  }
  return null;
}

/**
 * The shelves of the step of body `to` made as body `from` is: its thickness, its material and its look; their number
 * and their places stay.
 */
export function withShelfCopied(doc: CadDocument, from: { body: string; sketch: string; record: string }, to: { sketch: string; record: string }): CadDocument | string {
  if (from.sketch === to.sketch && from.record === to.record) return "Ce sont les étagères dont la forme est prise : cliquez-en une autre.";
  const source = (findFeature(doc, from.sketch) as SketchFeature | undefined)?.offsets?.find((r) => r.id === from.record);
  if (!source || !isShelves(source)) return "Cette étagère n'existe plus.";
  const sized = withShelfThickness(doc, to.sketch, to.record, source.step.input.thickness);
  if (typeof sized === "string") return sized;
  const bodies = (findFeature(sized, to.sketch) as SketchFeature | undefined)?.offsets?.find((r) => r.id === to.record)?.bodies ?? [];
  if (!bodies.length) return sized;
  const material = sized.bodyInfo?.[from.body]?.material;
  const next = material ? { ...sized, bodyInfo: { ...sized.bodyInfo, ...Object.fromEntries(bodies.map((b) => [b, { ...sized.bodyInfo?.[b], material }])) } } : sized;
  return withLookCopied(next, from.body, bodies);
}

/** Niche `to` divided as niche `from` is (what it holds stays out: only its shelves and cloisons go). */
export function withDivisionCopied(doc: CadDocument, from: NichePlace, to: NichePlace): CadDocument | string {
  if (from.sketch === to.sketch && from.partition === to.partition && pathKey(from.path) === pathKey(to.path)) return "C'est la niche dont la division est prise : cliquez-en une autre.";
  const { steps } = readRecipe(doc, from);
  if (!steps.length) return "Cette niche n'a pas d'étagère ni de cloison à copier.";
  if (findFeature(doc, to.sketch)?.type !== "sketch") return "Cette niche n'existe plus.";
  return withRecipe(doc, to, { steps, equipment: [] });
}

export type Box = [Vec3, Vec3];

/**
 * Body `to` made as body `from`: its three sizes (from their boxes in the view; a piece of a Répartition keeps its
 * niche's, `notes` says why), its material and its look.
 */
export function withBodyCopied(doc: CadDocument, from: string, to: string, boxOf: (id: string) => Box | null, notes: string[] = []): CadDocument | string {
  if (from === to) return "C'est le corps dont la forme est prise : cliquez-en un autre.";
  let next = doc;
  const [a, b] = [boxOf(from), boxOf(to)];
  if (a && b) {
    for (const axis of [0, 1, 2] as Axis[]) {
      const [want, was] = [a[1][axis]! - a[0][axis]!, b[1][axis]! - b[0][axis]!];
      if (Math.abs(want - was) < 0.5) continue;
      const sized = withPieceSize(next, to, axis, was, want);
      if (typeof sized === "string") {
        if (!notes.includes(sized)) notes.push(sized);
      } else next = sized;
    }
  }
  const material = next.bodyInfo?.[from]?.material;
  if (material) next = { ...next, bodyInfo: { ...next.bodyInfo, [to]: { ...next.bodyInfo?.[to], material } } };
  return withLookCopied(next, from, [to]);
}

/** A sketch's own name for a niche's place (for the messages). */
export const placeLabel = (doc: CadDocument, place: NichePlace, vertical: boolean) => `${vertical ? "Cloisons" : "Étagères"} (${(findFeature(doc, place.sketch) as SketchFeature | undefined)?.name ?? "Répartition"})`;
