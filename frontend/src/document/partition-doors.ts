/**
 * Les portes et le fond d'une « Répartition » : cochés dans son outil, ils sont gardés dans son étape (`step.doors`,
 * `step.back`) et fabriqués par un équipement « Portes » ou « Fond » de la répartition (features/niche-parts.ts).
 * Chaque enregistrement de l'esquisse met ces équipements d'accord avec ses étapes : créés, réglés, ou retirés quand on
 * les décoche, qu'on n'extrude plus les panneaux, ou que la répartition disparaît. Un fond coché dont toutes les pièces
 * avaient été supprimées seules revient (sinon « Panneau de fond » coché ne montrait rien). Pur.
 */
import { isPartition } from "../sketcher/partition-history";
import { withEquipment } from "./equipment";
import type { BackSettings, DoorSettings } from "./sketch";
import { deleteFeature, findFeature, uniqueId, uniqueName, updateFeature } from "./operations";
import { featureOfBody, type CadDocument, type NicheFeature } from "./types";
import { nichePartsIn } from "../features/niche-parts";

type Settings = DoorSettings | BackSettings;

const EQUIPMENT = {
  doors: { prefix: "pt", name: "Portes", base: {} },
  back: { prefix: "fd", name: "Fond", base: { gap: 0, handles: false } },
} as const;

/** The equipment of this kind for each partition of the sketch that asks for it. */
function syncEquipment(base: CadDocument, sketchId: string, fill: "doors" | "back", wanted: Map<string, Settings>): CadDocument {
  let doc = base;
  const made = new Set<string>();
  for (const f of base.features) {
    if (f.type !== "niche" || f.fill !== fill || f.sketch !== sketchId) continue;
    const settings = wanted.get(f.partition);
    if (!settings || made.has(f.partition)) {
      doc = deleteFeature(doc, f.id);
      continue;
    }
    made.add(f.partition);
    const same = Object.entries(settings).every(([k, v]) => JSON.stringify(v) === JSON.stringify(f[k as keyof NicheFeature])) && (fill !== "doors" || "hinges" in settings || f.hinges === undefined);
    if (!same) doc = updateFeature(doc, f.id, (x) => {
      const { hinges: _old, ...rest } = x as NicheFeature;
      return { ...rest, ...settings };
    });
  }
  const { prefix, name, base: extra } = EQUIPMENT[fill];
  for (const [partition, settings] of wanted) {
    if (made.has(partition)) continue;
    const feature = { id: uniqueId(doc, prefix), type: "niche", name: uniqueName(doc, name), sketch: sketchId, partition, niche: [], fill, diameter: 25, drop: 60, drawers: 1, ...extra, ...settings } as NicheFeature;
    doc = { ...doc, features: [...doc.features, feature] };
  }
  // A thin back in HDF (unless a material was given to it).
  const kept = doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.fill === fill && f.sketch === sketchId);
  return withEquipment(fill === "back" ? withBackShown(doc, kept) : doc, kept);
}

/** A back asked for, every piece of it deleted on its own: its pieces back in the model. */
function withBackShown(doc: CadDocument, backs: readonly NicheFeature[]): CadDocument {
  const removed = doc.removedBodies ?? [];
  const lost = backs.filter((f) => {
    const gone = removed.filter((b) => featureOfBody(b) === f.id).length;
    return gone > 0 && gone >= nichePartsIn(doc.features, f).length;
  });
  if (!lost.length) return doc;
  const ids = new Set(lost.map((f) => f.id));
  return { ...doc, removedBodies: removed.filter((b) => !ids.has(featureOfBody(b))) };
}

export function syncPartitionDoors(base: CadDocument, sketchId: string): CadDocument {
  const sketch = findFeature(base, sketchId);
  if (sketch?.type !== "sketch") return base;
  const records = (sketch.offsets ?? []).filter(isPartition).filter((r) => r.step.depth);
  const doors = new Map(records.filter((r) => r.step.doors).map((r) => [r.id, r.step.doors!] as const));
  const back = new Map(records.filter((r) => r.step.back).map((r) => [r.id, r.step.back!] as const));
  return syncEquipment(syncEquipment(base, sketchId, "doors", doors), sketchId, "back", back);
}
