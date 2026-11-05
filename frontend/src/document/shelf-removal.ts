/**
 * Supprimer une étagère (ou une cloison) d'une Répartition, c'est la retirer de sa division, pas seulement son volume :
 * ses traits s'en vont, les deux niches qu'elle séparait n'en font plus qu'une, les autres étagères restent où elles
 * sont, et ce qui suit une niche suit la nouvelle numérotation. Ce que contenait une niche fusionnée — ses divisions,
 * sa penderie, ses tiroirs — disparaît avec elle ; la dernière étagère retirée emporte l'étape. Pur.
 */
import { removeEntities } from "../sketcher/edit";
import { removeOffsetFrom } from "../sketcher/offset";
import { extrusionGroups, isShelves, pathKey, rebuildChain } from "../sketcher/partition-history";
import { shelfLayout } from "../sketcher/shelves";
import { deleteFeatures, findFeature, updateFeature } from "./operations";
import type { OffsetRecord } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import type { CadDocument, NicheFeature, SketchFeature } from "./types";

/** Which shelves of a division go, by their index from the bottom. */
type Cut = Map<string, (shelf: number) => boolean>;

interface Pruned {
  offsets: OffsetRecord[];
  /** The steps dropped, whose lines and bodies go. */
  dropped: OffsetRecord[];
  /** The equipment of niches that stays, at its new place. */
  moved: Map<string, number[]>;
  /** The equipment of niches that goes with a merged niche. */
  gone: string[];
}

/** The offsets of a sketch without these shelves. A string: why it cannot be done. */
function pruned(g: SketchFeature, cuts: Cut, equipment: NicheFeature[]): Pruned | string {
  const state: Pruned = { offsets: [...(g.offsets ?? [])], dropped: [], moved: new Map(), gone: [] };
  const paths = new Map(equipment.map((f) => [f.id, f.niche]));
  // The deepest first: what a division holds is settled before the division itself changes.
  const deepest = state.offsets.filter((r) => cuts.has(r.id) && isShelves(r)).sort((a, b) => (isShelves(b) ? b.step.niche.length : 0) - (isShelves(a) ? a.step.niche.length : 0));
  for (const { id } of deepest) {
    const record = state.offsets.find((r) => r.id === id);
    if (!record || !isShelves(record)) continue;
    const rebuilt = rebuildChain({ ...g, offsets: state.offsets }, record.step.of);
    if (typeof rebuilt === "string") return rebuilt;
    const box = rebuilt.niches.get(pathKey(record.step.niche))?.box;
    const layout = box ? shelfLayout(box, record.step.input) : "Cette niche n'existe plus.";
    if (typeof layout === "string") return layout;
    const cut = cuts.get(id) as (shelf: number) => boolean;
    // Old niches to new ones: a shelf gone joins the niches on each side of it.
    const to = [0];
    const joined = new Set<number>();
    layout.shelves.forEach((_, i) => {
      const at = to[i] as number;
      if (cut(i)) joined.add(at);
      to.push(cut(i) ? at : at + 1);
    });
    if (!joined.size) continue;
    const count = to.at(-1) as number;
    const prefix = record.step.niche;
    const moved = (path: number[]): number[] | null => {
      if (path.length <= prefix.length || pathKey(path.slice(0, prefix.length)) !== pathKey(prefix)) return path;
      const niche = to[path[prefix.length] as number] as number;
      return joined.has(niche) ? null : [...prefix, niche, ...path.slice(prefix.length + 1)];
    };
    state.offsets = state.offsets.flatMap((r) => {
      if (r.id === id || !isShelves(r) || r.step.of !== record.step.of) return [r];
      const niche = moved(r.step.niche);
      if (!niche) return (state.dropped.push(r), []);
      return [{ ...r, step: { ...r.step, niche } }];
    });
    for (const f of equipment.filter((e) => e.partition === record.step.of && paths.has(e.id))) {
      const niche = moved(paths.get(f.id) as number[]);
      if (niche) paths.set(f.id, niche);
      else (paths.delete(f.id), state.gone.push(f.id));
    }
    if (count === 0) {
      state.dropped.push(record);
      state.offsets = state.offsets.filter((r) => r.id !== id);
      continue;
    }
    // Every shelf left stays where it is; the first niche made of two takes what is left.
    const heights = Array.from({ length: count + 1 }, (_, m) => {
      const from = to.indexOf(m);
      const end = to.lastIndexOf(m);
      return m === Math.min(...joined) ? null : (layout.niches[end] as [number, number])[1] - (layout.niches[from] as [number, number])[0];
    });
    const input = { ...record.step.input, count, mode: "set" as const, heights };
    const bodies = record.bodies?.filter((_, i) => !cut(i));
    state.offsets = state.offsets.map((r) => (r.id === id ? { ...record, step: { ...record.step, input }, ...(bodies ? { bodies } : {}) } : r));
  }
  state.moved = paths;
  return state;
}

/** The document with these cuts made in this sketch; `extra`: more features deleted with them. */
function cutIn(doc: CadDocument, sketchId: string, cuts: Cut, extra: string[]): { next: CadDocument; lost: string[] } | null {
  const g = findFeature(doc, sketchId);
  if (g?.type !== "sketch") return null;
  const equipment = doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === sketchId && f.fill !== "doors" && f.fill !== "back");
  const made = pruned(g, cuts, equipment);
  if (typeof made === "string") return null;
  const bodies = made.dropped.flatMap((r) => r.bodies ?? []).filter((id) => findFeature(doc, id));
  const { next: without, lost } = deleteFeatures(doc, [...extra, ...bodies, ...made.gone]);
  const curves = made.dropped.flatMap((r) => r.curves);
  let geometry: SketchFeature = { ...g, ...removeEntities(g, curves), offsets: made.offsets };
  const groups = [];
  for (const partition of new Set((g.offsets ?? []).flatMap((r) => (cuts.has(r.id) && isShelves(r) ? [r.step.of] : [])))) {
    const rebuilt = rebuildChain(geometry, partition);
    if (typeof rebuilt === "string") return null;
    geometry = { ...geometry, ...rebuilt.geometry };
    groups.push(...extrusionGroups(made.offsets, rebuilt));
  }
  let next = without;
  for (const [id, niche] of made.moved) next = updateFeature(next, id, (f) => (f.type === "niche" ? { ...f, niche } : f));
  next = withSketchExtrusion(next, sketchId, geometry, groups.length ? { groups } : undefined);
  return { next, lost: [...new Set([...bodies, ...made.gone, ...lost])].filter((id) => !extra.includes(id)) };
}

/**
 * Deletes these features, as deleteFeatures does; the shelves and cloisons among them leave their division too. `lost`:
 * what goes with them that was not asked for.
 */
export function removeWithShelves(doc: CadDocument, ids: string[]): { next: CadDocument; lost: string[] } {
  const sketches = doc.features.filter((f): f is SketchFeature => f.type === "sketch");
  let result: { next: CadDocument; lost: string[] } = { next: doc, lost: [] };
  const left = new Set(ids);
  for (const sketch of sketches) {
    const cuts: Cut = new Map();
    for (const r of sketch.offsets ?? []) {
      if (!isShelves(r) || !r.bodies?.some((b) => left.has(b))) continue;
      // A shelf deleted before these steps knew how counts as gone too.
      const bodies = r.bodies;
      cuts.set(r.id, (i) => left.has(bodies[i] as string) || (bodies[i] !== undefined && !findFeature(doc, bodies[i] as string)));
    }
    if (!cuts.size) continue;
    const mine = (sketch.offsets ?? []).filter((r) => cuts.has(r.id)).flatMap((r) => r.bodies ?? []).filter((b) => left.has(b));
    const cutDone = cutIn(result.next, sketch.id, cuts, mine);
    if (!cutDone) continue;
    result = { next: cutDone.next, lost: [...result.lost, ...cutDone.lost] };
    for (const id of mine) left.delete(id);
  }
  const rest = deleteFeatures(result.next, [...left]);
  return { next: rest.next, lost: [...new Set([...result.lost, ...rest.lost])] };
}

/** The document without this step of the history: a division takes its bodies and what its niches hold with it. */
export function removeStep(doc: CadDocument, sketchId: string, id: string): CadDocument {
  const sketch = findFeature(doc, sketchId);
  const record = sketch?.type === "sketch" ? sketch.offsets?.find((r) => r.id === id) : undefined;
  const bodies = (record?.bodies ?? []).filter((b) => findFeature(doc, b));
  const cut = record && isShelves(record) ? cutIn(doc, sketchId, new Map([[id, () => true]]), bodies) : null;
  return cut?.next ?? updateFeature(doc, sketchId, (f) => (f.type === "sketch" ? removeOffsetFrom(f, id) : f));
}
