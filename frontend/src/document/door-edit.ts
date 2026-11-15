/**
 * Une porte, prise par une de ses pièces (la porte ou sa poignée) : ce qu'elle est et ce qu'on peut y changer, pour le
 * menu du clic droit (app/door-menu.ts). La porte d'un caisson (ses façades), d'une case de Répartition (réglée sur la
 * Répartition), posée sur des niches, ou bâtie en panneau (un meuble d'angle). Son sens d'ouverture s'inverse, sa
 * poignée s'ôte ou revient, elle se retire ; celle d'un caisson se change en tiroirs ou en porte vitrée, celle d'une
 * Répartition ou sur niches en porte plate, à cadre ou vitrée (cadre alu). Pur.
 */
import { frontsParts, frontsProblem } from "../features/fronts-parts";
import { styleChange, type DoorStyle } from "../features/glass-door";
import { nichePartsIn } from "../features/niche-parts";
import { withCaseDoor, withDoorSettings } from "./door-fronts";
import { madeDoor } from "./kitchen-floor";
import { bodyOrigin, deleteFeatures, findFeature, removePieces, updateFeature } from "./operations";
import type { DoorSettings } from "./sketch";
import { featureOfBody, type CabinetFeature, type CadDocument, type ExtrudeFeature, type FrontsFeature, type NicheFeature, type SketchFeature } from "./types";
import { isPartition } from "../sketcher/partition-history";

export type DoorKind = "fronts" | "partition" | "niche" | "board";

export interface DoorInfo {
  kind: DoorKind;
  /** The feature holding it. */
  feature: string;
  /** Its number among the doors of its feature (0 for a board). */
  index: number;
  /** The side of its hinges, as one faces it; null when it cannot be told (a board, the two doors of a cabinet). */
  hinge: "left" | "right" | null;
  /** Its handle, and whether one can be put or taken off. */
  handles: boolean | null;
}

const partNumber = (bodyId: string) => (bodyId.includes("#") ? Number(bodyId.slice(bodyId.indexOf("#") + 1)) : 0);
const other = (side: "left" | "right") => (side === "left" ? "right" : "left");
/** The usual sides of `n` doors in a row: left, right, left… (each pair opens from its middle). */
const inTurn = (n: number): ("left" | "right")[] => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "left" : "right"));

/** How many doors a Répartition's niche of doors has (its parts before the handles). */
function nicheDoors(f: NicheFeature, doc: CadDocument): number {
  const record = (findFeature(doc, f.sketch) as SketchFeature | undefined)?.offsets?.find((r) => r.id === f.partition && isPartition(r));
  if (!record || !isPartition(record)) return 0;
  const { cases } = record.step.input;
  return doorStarts(cases, record.step.doors).length;
}

/** The first case of each door of a Répartition, from the left. */
function doorStarts(cases: number, doors: DoorSettings | undefined): number[] {
  const joined = doors?.joined ?? [];
  const skipped = doors?.skipped ?? [];
  return Array.from({ length: cases }, (_, c) => c).filter((c) => !joined.includes(c - 1) && !skipped.includes(c));
}

/** The door a body is (or is the handle of), or null. */
export function doorOf(doc: CadDocument, bodyId: string): DoorInfo | null {
  const id = bodyOrigin(doc, bodyId);
  const f = findFeature(doc, featureOfBody(id));
  if (f?.type === "fronts") {
    if (f.layout === "drawers") return null;
    // The glass of a glazed door is that door.
    const index = frontsParts(f, findFeature(doc, f.cabinet) as CabinetFeature | undefined)[partNumber(id)]?.of ?? partNumber(id);
    if (index > (f.layout === "doors" ? 1 : 0)) return null;
    // A lift-up door or a flap has no side: it turns the other way up.
    return { kind: "fronts", feature: f.id, index, hinge: f.layout === "door" && f.side !== "top" && f.side !== "bottom" ? (f.side ?? "left") : null, handles: f.grip === "gorge" ? null : f.handles };
  }
  if (f?.type === "niche" && (f.fill === "doors" || f.fill === "door")) {
    const count = f.fill === "door" ? 1 : nicheDoors(f, doc);
    const part = partNumber(id);
    // A handle (and the glass of a glazed door) comes after the doors, one per door, in order, and says whose it is.
    const index = nichePartsIn(doc.features, f)[part]?.of ?? (part < count ? part : part - count);
    if (index < 0 || index >= count) return null;
    return { kind: f.fill === "door" ? "niche" : "partition", feature: f.id, index, hinge: f.hinges?.[index] ?? inTurn(count)[index]!, handles: f.handles };
  }
  if (f?.type === "extrude" && (f.door || madeDoor(doc, f.id))) return { kind: "board", feature: f.id, index: 0, hinge: null, handles: null };
  return null;
}

/** The door opening from its other side. */
export function withDoorFlipped(doc: CadDocument, bodyId: string): CadDocument | string {
  const door = doorOf(doc, bodyId);
  if (!door) return "Ce n'est pas une porte.";
  const f = findFeature(doc, door.feature);
  if (door.kind === "fronts" && f?.type === "fronts") {
    if (f.layout === "doors") return "Les deux portes de ce caisson s'ouvrent déjà du milieu.";
    const side = f.side === "top" ? "bottom" : f.side === "bottom" ? "top" : other(f.side ?? "left");
    return updateFeature(doc, f.id, () => ({ ...f, side }) satisfies FrontsFeature);
  }
  if (door.kind === "partition" && f?.type === "niche") {
    const hinges = Array.from({ length: nicheDoors(f, doc) }, (_, i) => f.hinges?.[i] ?? inTurn(nicheDoors(f, doc))[i]!);
    hinges[door.index] = other(hinges[door.index]!);
    return withDoorSettings(doc, f.sketch, f.partition, { hinges });
  }
  if (door.kind === "niche" && f?.type === "niche") return updateFeature(doc, f.id, () => ({ ...f, hinges: [other(door.hinge ?? "left")] }) satisfies NicheFeature);
  if (door.kind === "board" && f?.type === "extrude") {
    const made = f.door ?? madeDoor(doc, f.id);
    if (!made) return "Cette porte n'a pas de charnière.";
    return updateFeature(doc, f.id, () => ({ ...f, door: { ...made, hinge: made.hinge.map((c) => (c ? -c : 0)) as typeof made.hinge } }) satisfies ExtrudeFeature);
  }
  return "Ce n'est pas une porte.";
}

/** The door taken off: a case of a Répartition left open, the piece of a cabinet's fronts or a board taken out. */
export function withDoorRemoved(doc: CadDocument, bodyId: string): CadDocument | string {
  const door = doorOf(doc, bodyId);
  if (!door) return "Ce n'est pas une porte.";
  const f = findFeature(doc, door.feature);
  if (door.kind === "partition" && f?.type === "niche") {
    const record = (findFeature(doc, f.sketch) as SketchFeature | undefined)?.offsets?.find((r) => r.id === f.partition && isPartition(r));
    if (!record || !isPartition(record)) return "Cette Répartition n'existe plus.";
    const start = doorStarts(record.step.input.cases, record.step.doors)[door.index];
    return start === undefined ? "Cette porte n'existe plus." : withCaseDoor(doc, f.sketch, f.partition, start);
  }
  if (door.kind === "niche") return deleteFeatures(doc, [door.feature]).next;
  if (door.kind === "fronts" && f?.type === "fronts" && f.layout === "door") return deleteFeatures(doc, [f.id]).next;
  // One of a cabinet's two doors (with its glass), a corner door: the piece taken out (undo brings it back).
  if (door.kind === "fronts" && f?.type === "fronts") {
    const parts = frontsParts(f, findFeature(doc, f.cabinet) as CabinetFeature | undefined);
    return removePieces(doc, parts.flatMap((p, i) => (i === door.index || p.of === door.index ? [`${f.id}#${i}`] : [])));
  }
  return removePieces(doc, [bodyOrigin(doc, bodyId)]);
}

/** Its handle (with those of its fellow doors) taken off, or put back. */
export function withDoorHandles(doc: CadDocument, bodyId: string): CadDocument | string {
  const door = doorOf(doc, bodyId);
  const f = door && findFeature(doc, door.feature);
  if (!door || door.handles === null || !f) return "Cette porte n'a pas de poignée à régler.";
  if (f.type === "fronts") return updateFeature(doc, f.id, () => ({ ...f, handles: !f.handles }));
  if (f.type === "niche" && door.kind === "partition") return withDoorSettings(doc, f.sketch, f.partition, { handles: !f.handles });
  if (f.type === "niche") return updateFeature(doc, f.id, () => ({ ...f, handles: !f.handles }));
  return "Cette porte n'a pas de poignée à régler.";
}

/**
 * Without `style`: a cabinet's doors made drawers (three), or a Répartition's doors flat or framed, the other way.
 * With it: the doors in that style — flat, framed, fluted, slatted or glazed, for a cabinet, a Répartition or a door
 * over niches (a glazed one with an aluminium frame of 20 mm, clear glass and brushed aluminium unless chosen before).
 */
export function withDoorStyle(doc: CadDocument, bodyId: string, style?: DoorStyle): CadDocument | string {
  const door = doorOf(doc, bodyId);
  const f = door && findFeature(doc, door.feature);
  if (f?.type === "fronts" && !style) return updateFeature(doc, f.id, () => ({ ...f, layout: "drawers" as const, drawers: f.drawers || 3 }));
  if (f?.type === "fronts") {
    return updateFeature(doc, f.id, () => ({ ...f, ...styleChange(style!, f) }) as FrontsFeature);
  }
  const next = style ?? (f?.type === "niche" && f.style === "frame" ? "flat" : "frame");
  if (f?.type === "niche" && door?.kind === "partition") return withDoorSettings(doc, f.sketch, f.partition, styleChange(next, f));
  if (f?.type === "niche" && door?.kind === "niche" && style) return updateFeature(doc, f.id, () => ({ ...f, ...styleChange(style, f) }));
  return "Rien d'autre à proposer pour cette porte.";
}

export type DoorsPatch = Partial<Pick<FrontsFeature, "layout" | "mount" | "gap" | "thickness" | "handles" | "hinges">>;

/** A cabinet's doors changed (one or two, inset or overlay, gap, thickness, handles, hinges); a string: why they cannot be. */
export function withDoorsChanged(doc: CadDocument, featureId: string, patch: DoorsPatch): CadDocument | string {
  const f = findFeature(doc, featureId);
  if (f?.type !== "fronts" || f.layout === "drawers") return "Ces portes n'existent plus.";
  const next: FrontsFeature = { ...f, ...patch };
  // Two doors open from their middle: no side to keep; one door gets back the side it had, or the left.
  if (next.layout === "doors" && next.side !== "top" && next.side !== "bottom") delete next.side;
  const problem = frontsProblem(next, findFeature(doc, f.cabinet) as CabinetFeature | undefined);
  return problem ?? updateFeature(doc, f.id, () => next);
}
