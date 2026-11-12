/**
 * Les façades d'une Répartition, réglées sur le meuble : une porte par case, posée ou retirée case par case, plusieurs
 * cases voisines sous une seule porte, et le sens d'ouverture de toutes ses portes, par paires en miroir ou toutes du
 * même côté. Pur.
 */
import { findFeature, updateFeature } from "./operations";
import { syncPartitionDoors } from "./partition-doors";
import type { DoorSettings, OffsetRecord } from "./sketch";
import type { CadDocument, SketchFeature } from "./types";
import { isPartition } from "../sketcher/partition-history";
import { DOOR_DEFAULTS } from "./joinery-defaults";

const DOORS: DoorSettings = { ...DOOR_DEFAULTS };

export type DoorSwing = "pairs" | "left" | "right";

function partitionOf(doc: CadDocument, sketchId: string, partition: string): OffsetRecord | undefined {
  return (findFeature(doc, sketchId) as SketchFeature | undefined)?.offsets?.find((r) => r.id === partition && isPartition(r));
}

function withDoors(doc: CadDocument, sketchId: string, partition: string, change: (doors: DoorSettings, cases: number) => DoorSettings): CadDocument {
  const next = updateFeature(doc, sketchId, (f) =>
    f.type !== "sketch" ? f : { ...f, offsets: f.offsets?.map((r) => (r.id === partition && isPartition(r) ? { ...r, step: { ...r.step, doors: change(r.step.doors ?? DOORS, r.step.input.cases) } } : r)) },
  );
  return syncPartitionDoors(next, sketchId);
}

/** How many doors the Répartition has. */
export function doorCount(doc: CadDocument, sketchId: string, partition: string): number {
  const record = partitionOf(doc, sketchId, partition);
  if (!record || !isPartition(record)) return 0;
  return record.step.input.cases - (record.step.doors?.joined ?? []).filter((c) => c < record.step.input.cases - 1).length - (record.step.doors?.skipped?.length ?? 0);
}

/** The case a door over this case starts on. */
const doorStart = (joined: readonly number[], at: number): number => (joined.includes(at - 1) ? doorStart(joined, at - 1) : at);

/** Has this case a door? */
export function caseHasDoor(doc: CadDocument, sketchId: string, partition: string, at: number): boolean {
  const record = partitionOf(doc, sketchId, partition);
  const doors = record && isPartition(record) ? record.step.doors : undefined;
  return !!doors && !(doors.skipped ?? []).includes(doorStart(doors.joined ?? [], at));
}

/** A door on this case, or none if it has one; with no door left, the Répartition has none. */
export function withCaseDoor(doc: CadDocument, sketchId: string, partition: string, at: number): CadDocument {
  const record = partitionOf(doc, sketchId, partition);
  if (!record || !isPartition(record)) return doc;
  const { cases } = record.step.input;
  const start = doorStart(record.step.doors?.joined ?? [], at);
  const skipped = record.step.doors ? record.step.doors.skipped ?? [] : Array.from({ length: cases }, (_, i) => i);
  const next = skipped.includes(start) ? skipped.filter((c) => c !== start) : [...skipped, start].sort((a, b) => a - b);
  const made = withDoors(doc, sketchId, partition, ({ hinges: _old, ...doors }) => ({ ...doors, skipped: next }));
  return doorCount(made, sketchId, partition) > 0 ? made : withoutDoors(made, sketchId, partition);
}

/** A door on every case. */
export function withAllDoors(doc: CadDocument, sketchId: string, partition: string): CadDocument {
  return withDoors(doc, sketchId, partition, ({ hinges: _old, ...doors }) => ({ ...doors, skipped: [] }));
}

/** No door on the Répartition. */
export function withoutDoors(doc: CadDocument, sketchId: string, partition: string): CadDocument {
  const next = updateFeature(doc, sketchId, (f) => {
    if (f.type !== "sketch") return f;
    return { ...f, offsets: f.offsets?.map((r) => {
      if (r.id !== partition || !isPartition(r)) return r;
      const { doors: _gone, ...step } = r.step;
      return { ...r, step };
    }) };
  });
  return syncPartitionDoors(next, sketchId);
}

/** The settings of its doors changed. */
export function withDoorSettings(doc: CadDocument, sketchId: string, partition: string, patch: Partial<DoorSettings>): CadDocument {
  return withDoors(doc, sketchId, partition, (doors) => ({ ...doors, ...patch }));
}

/** The settings of its doors, the usual ones when it has none. */
export function doorSettings(doc: CadDocument, sketchId: string, partition: string): DoorSettings {
  const record = partitionOf(doc, sketchId, partition);
  return (record && isPartition(record) ? record.step.doors : undefined) ?? DOORS;
}

/** Does a door run from case `from` to case `to`? */
export function casesJoined(doc: CadDocument, sketchId: string, partition: string, from: number, to: number): boolean {
  const record = partitionOf(doc, sketchId, partition);
  const joined = record && isPartition(record) ? (record.step.doors?.joined ?? []) : [];
  const [a, b] = from < to ? [from, to] : [to, from];
  return Array.from({ length: b - a }, (_, i) => a + i).every((c) => joined.includes(c));
}

/** One door over these cases and those between them, or separate doors again if they already share one. */
export function withCasesJoined(doc: CadDocument, sketchId: string, partition: string, from: number, to: number): CadDocument {
  const [a, b] = from < to ? [from, to] : [to, from];
  const pairs = Array.from({ length: b - a }, (_, i) => a + i);
  const undo = casesJoined(doc, sketchId, partition, a, b);
  return withDoors(doc, sketchId, partition, ({ hinges: _old, ...doors }) => {
    const kept = (doors.joined ?? []).filter((c) => !pairs.includes(c));
    return { ...doors, joined: undo ? kept : [...kept, ...pairs].sort((x, y) => x - y) };
  });
}

/** The side all the doors open from; in pairs: left, right, left… so that each pair opens from its middle. */
export function withDoorSwing(doc: CadDocument, sketchId: string, partition: string, swing: DoorSwing): CadDocument {
  const count = doorCount(doc, sketchId, partition);
  const hinges = Array.from({ length: count }, (_, i): "left" | "right" => (swing === "pairs" ? (i % 2 === 0 ? "left" : "right") : swing));
  return withDoors(doc, sketchId, partition, (doors) => ({ ...doors, hinges }));
}
