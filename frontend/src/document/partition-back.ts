/**
 * Le fond d'une Répartition posé ou retiré d'un clic (« Fond » sous une zone du Plan de dressing) : la rubrique
 * « Panneau de fond » de son étape, cochée (8 mm, un seul fond) ou décochée, et son équipement « Fond » fait ou retiré
 * (document/partition-doors.ts). Pur.
 */
import { findFeature, updateFeature } from "./operations";
import { syncPartitionDoors } from "./partition-doors";
import type { BackSettings } from "./sketch";
import type { CadDocument } from "./types";
import { isPartition } from "../sketcher/partition-history";

/** A back as the Répartition tool makes one by default. */
export const BACK: BackSettings = { thickness: 8, split: "whole" };

/** Whether the Répartition of this sketch has a back. */
export function hasBack(doc: CadDocument, sketchId: string): boolean {
  const sketch = findFeature(doc, sketchId);
  return sketch?.type === "sketch" && (sketch.offsets ?? []).some((r) => isPartition(r) && !!r.step.back);
}

/** Its back put (`on`) or taken off: on each Répartition of the sketch whose panels are made. */
export function withBack(doc: CadDocument, sketchId: string, on: boolean): CadDocument {
  const next = updateFeature(doc, sketchId, (f) =>
    f.type !== "sketch"
      ? f
      : {
          ...f,
          offsets: f.offsets?.map((r) => {
            if (!isPartition(r) || !r.step.depth) return r;
            const { back: _old, ...step } = r.step;
            return { ...r, step: on ? { ...step, back: r.step.back ?? BACK } : step };
          }),
        },
  );
  return syncPartitionDoors(next, sketchId);
}
