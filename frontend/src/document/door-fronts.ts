/**
 * Les façades d'une Répartition, réglées sur le meuble : plusieurs cases voisines sous une seule porte, et le sens
 * d'ouverture de toutes ses portes, par paires en miroir ou toutes du même côté. Pur.
 */
import { findFeature, updateFeature } from "./operations";
import { syncPartitionDoors } from "./partition-doors";
import type { DoorSettings, OffsetRecord } from "./sketch";
import type { CadDocument, SketchFeature } from "./types";
import { isPartition } from "../sketcher/partition-history";

const DOORS: DoorSettings = { gap: 3, thickness: 18, handles: true };

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
  return record.step.input.cases - (record.step.doors?.joined ?? []).filter((c) => c < record.step.input.cases - 1).length;
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
