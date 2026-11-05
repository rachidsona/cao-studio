/**
 * The parametric history of a « Répartition »: the partition and the divisions of its niches by shelves are kept as
 * steps (records of the sketch, shown in the timeline), and the lines they made are made again, in order, whenever a
 * step is changed — more cases, other shelves, another thickness. A niche is named by a path: the case (from the
 * left), then, for each division inside it, the niche of that division (from the bottom; from the left for
 * cloisons). Pure.
 */
import type { OffsetRecord, PartitionParams, PartitionStep, ShelfParams, SketchGeometry } from "../document/sketch";
import { removeEntities } from "./edit";
import type { ExtrudedElement, ExtrusionGroup } from "./mode";
import { addPartition, partitionElements, partitionGeometry, partitionLayout } from "./partition";
import { addShelves, heldHeights, partBox, shelfLayout, type NicheBox } from "./shelves";

export interface NicheNode {
  path: number[];
  box: NicheBox;
}

export interface Rebuilt {
  geometry: SketchGeometry;
  /** Every niche of the partition (the cases, and what each division made), by path. */
  niches: Map<string, NicheNode>;
  /** What each step extrudes: one body per element, by record id. */
  elements: Map<string, ExtrudedElement[]>;
  /** Divisions that could not be made again (their niche is gone, or too small): removed from the history. */
  dropped: OffsetRecord[];
  problems: string[];
}

export const pathKey = (path: number[]): string => path.join(".");

const centre = (b: NicheBox): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

const sameBox = (a: NicheBox, b: NicheBox) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

export const isPartition = (r: OffsetRecord): r is OffsetRecord & { step: Extract<PartitionStep, { kind: "partition" }> } => r.step?.kind === "partition";
export const isShelves = (r: OffsetRecord): r is OffsetRecord & { step: Extract<PartitionStep, { kind: "shelves" }> } => r.step?.kind === "shelves";

/**
 * The sketch with the partition and its divisions made again from their steps (the records may have been changed or
 * added in `g`); their lines are replaced, everything else in the sketch stays. A string: why it is impossible.
 */
export function rebuildChain(g: SketchGeometry, partitionId: string): Rebuilt | string {
  const records = g.offsets ?? [];
  const partition = records.find((r) => r.id === partitionId && isPartition(r));
  if (!partition || !isPartition(partition)) return "Cette répartition n'existe plus.";
  const { input, origin } = partition.step;
  const layout = partitionLayout(input);
  if (typeof layout === "string") return layout;
  const divisions = records.filter((r): r is OffsetRecord & { step: Extract<PartitionStep, { kind: "shelves" }> } => isShelves(r) && r.step.of === partitionId);

  // The sketch without what these steps made (removing the lines drops records that lose all theirs: they are put back).
  let geometry: SketchGeometry = { ...removeEntities(g, [partition, ...divisions].flatMap((r) => r.curves)), offsets: records };
  const known = new Set(geometry.curves.map((c) => c.id));
  const made = (): string[] => {
    const fresh = geometry.curves.map((c) => c.id).filter((id) => !known.has(id));
    for (const id of fresh) known.add(id);
    return fresh;
  };

  geometry = addPartition(geometry, partitionGeometry(input, layout), origin);
  const owned = new Map<string, string[]>([[partition.id, made()]]);
  const elements = new Map<string, ExtrudedElement[]>([[partition.id, partitionElements(layout, origin)]]);
  const niches = new Map<string, NicheNode>();
  layout.caseSpans.forEach(([x0, x1], i) => niches.set(pathKey([i]), { path: [i], box: { x0: x0 + origin[0], x1: x1 + origin[0], y0: layout.inner[0] + origin[1], y1: layout.inner[1] + origin[1] } }));

  const dropped: OffsetRecord[] = [];
  const problems: string[] = [];
  for (const d of divisions) {
    const node = niches.get(pathKey(d.step.niche));
    if (!node) {
      dropped.push(d);
      problems.push(`${d.name} : sa niche n'existe plus.`);
      continue;
    }
    const lay = shelfLayout(node.box, d.step.input);
    if (typeof lay === "string") {
      dropped.push(d);
      problems.push(`${d.name} : ${lay}`);
      continue;
    }
    geometry = addShelves(geometry, node.box, lay);
    owned.set(d.id, made());
    lay.niches.forEach((span, k) => {
      const path = [...d.step.niche, k];
      niches.set(pathKey(path), { path, box: partBox(node.box, span, lay) });
    });
    elements.set(d.id, lay.shelves.map((span) => ({ probe: centre(partBox(node.box, span, lay)), name: lay.vertical ? "Cloison" : "Étagère", numbered: true })));
  }

  const lost = new Set(dropped.map((d) => d.id));
  const next = records.filter((r) => !lost.has(r.id)).map((r) => (owned.has(r.id) ? { ...r, curves: owned.get(r.id) as string[] } : r));
  return { geometry: { ...geometry, offsets: next }, niches, elements, dropped, problems };
}

/** The partition and the path of the niche that has exactly this box, among all the partitions of the sketch. */
export function nicheAt(g: SketchGeometry, box: NicheBox): { partition: string; path: number[] } | null {
  for (const r of g.offsets ?? []) {
    if (!isPartition(r)) continue;
    const rebuilt = rebuildChain(g, r.id);
    if (typeof rebuilt === "string") continue;
    for (const node of rebuilt.niches.values()) if (sameBox(node.box, box)) return { partition: r.id, path: node.path };
  }
  return null;
}

/**
 * The niches that can still be divided, in every partition of the sketch: those no division has cut (a niche cut by
 * shelves or cloisons is replaced by the niches it gave). With the depth of the panels of their partition, if extruded.
 */
export function leafNiches(g: SketchGeometry): { partition: string; path: number[]; box: NicheBox; depth?: number }[] {
  return (g.offsets ?? []).filter(isPartition).flatMap((r) => {
    const rebuilt = rebuildChain(g, r.id);
    if (typeof rebuilt === "string") return [];
    const keys = [...rebuilt.niches.keys()];
    return [...rebuilt.niches.values()]
      .filter((n) => !keys.some((k) => k.startsWith(`${pathKey(n.path)}.`)))
      .map((n) => ({ partition: r.id, path: n.path, box: n.box, ...(r.step.depth !== undefined ? { depth: r.step.depth } : {}) }));
  });
}

/** The shelves that make the height of this niche, the last on its way, and which of their niches it lies in. */
export function heightStep(g: SketchGeometry, partition: string, path: number[]): { record: OffsetRecord; index: number } | null {
  for (let k = path.length - 1; k > 0; k--) {
    const at = pathKey(path.slice(0, k));
    const record = (g.offsets ?? []).find((r) => isShelves(r) && r.step.of === partition && !r.step.input.vertical && pathKey(r.step.niche) === at);
    if (record) return { record, index: path[k] as number };
  }
  return null;
}

/** A division with this niche at this height, or sharing what is left (null): the others keep what they have. */
export function withNicheHeight(input: ShelfParams, index: number, height: number | null): ShelfParams {
  const heights = heldHeights(input).map((h, i) => (i === index ? height : h));
  return heights.every((h) => h === null) ? { ...input, mode: "equal", heights: [] } : { ...input, mode: "set", heights };
}

/** « Répartition 3 cases », then « Répartition 3 cases (2) »: a name no step of the sketch has. */
export function stepName(g: SketchGeometry, base: string): string {
  const used = new Set((g.offsets ?? []).map((o) => o.name));
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base} (${n})`;
  return name;
}

/** The ids « of3 », « of4 »…: `count` ids after the one given (an unused one), for steps made together. */
export function idsFrom(first: string, count: number): string[] {
  const m = /^(.*?)(\d+)$/.exec(first);
  if (!m) return Array.from({ length: count }, (_, i) => (i === 0 ? first : `${first}${i + 1}`));
  return Array.from({ length: count }, (_, i) => `${m[1]}${Number(m[2]) + i}`);
}

const EMPTY = { curves: [], source: [], distance: 0, both: false, join: "sharp" } as const;

export function partitionRecord(id: string, name: string, input: PartitionParams, origin: [number, number], depth?: number): OffsetRecord {
  return { id, name, ...EMPTY, curves: [], source: [], step: { kind: "partition", input: structuredClone(input), origin, ...(depth !== undefined ? { depth } : {}) } };
}

export function shelvesRecord(id: string, name: string, of: string, niche: number[], input: ShelfParams, depth?: number): OffsetRecord {
  return { id, name, ...EMPTY, curves: [], source: [], step: { kind: "shelves", of, niche, input: { ...input }, ...(depth !== undefined ? { depth } : {}) } };
}

/**
 * The extrusions to make with a rebuilt chain, one group per step that extrudes (the bodies it made before are
 * replaced), and the ones to delete for a step that no longer extrudes or that was dropped. `only`: just these steps.
 */
export function extrusionGroups(before: OffsetRecord[], rebuilt: Rebuilt, only?: ReadonlySet<string>): ExtrusionGroup[] {
  const groups: ExtrusionGroup[] = [];
  for (const r of rebuilt.geometry.offsets ?? []) {
    if (!r.step || !rebuilt.elements.has(r.id) || (only && !only.has(r.id))) continue;
    const old = before.find((b) => b.id === r.id)?.bodies ?? [];
    if (r.step.depth !== undefined) groups.push({ record: r.id, distance: r.step.depth, elements: rebuilt.elements.get(r.id) ?? [], remove: old });
    else if (old.length) groups.push({ record: r.id, distance: 1, elements: [], remove: old });
  }
  for (const d of rebuilt.dropped) if (d.bodies?.length) groups.push({ distance: 1, elements: [], remove: d.bodies });
  return groups;
}
