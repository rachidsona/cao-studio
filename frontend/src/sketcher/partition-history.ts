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
  const elements = new Map<string, ExtrudedElement[]>([[partition.id, partitionElements(layout, origin, input.inside)]]);
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

/** The column a niche is part of: from a niche between two shelves, the whole of what those shelves divide, up to a cloison. */
export function columnPath(g: SketchGeometry, partition: string, path: number[]): number[] {
  let at = path;
  while (at.length > 1) {
    const above = at.slice(0, -1);
    const division = (g.offsets ?? []).find((r) => isShelves(r) && r.step.of === partition && pathKey(r.step.niche) === pathKey(above));
    if (division && isShelves(division) && division.step.input.vertical) break;
    at = above;
  }
  return at;
}

const within = (path: number[], root: number[]) => path.length >= root.length && pathKey(path.slice(0, root.length)) === pathKey(root);

/** A path once its niche has been divided, what it held going to its `keep`-th niche. */
export const rehomedPath = (path: number[], root: number[], keep: number): number[] => (within(path, root) ? [...root, keep, ...path.slice(root.length)] : path);

/**
 * The steps with a new division of the niche at `path`, inserted under what already divides it: those steps go on in
 * its `keep`-th niche. Nothing is removed: the shelves of a case stay, narrower, beside a cloison added afterwards.
 */
export function withDivisionUnder(offsets: readonly OffsetRecord[], partition: string, path: number[], keep: number, added: OffsetRecord): OffsetRecord[] {
  const inside = (r: OffsetRecord) => isShelves(r) && r.step.of === partition && within(r.step.niche, path);
  const moved = offsets.map((r) => (inside(r) && isShelves(r) ? { ...r, step: { ...r.step, niche: rehomedPath(r.step.niche, path, keep) } } : r));
  const at = offsets.findIndex(inside);
  return at < 0 ? [...moved, added] : [...moved.slice(0, at), added, ...moved.slice(at)];
}

/** Niches side by side in the height of one division of shelves: a cloison can run through them all. */
export interface NicheSpan {
  partition: string;
  /** The niche those shelves divide, and the first and last niche of the run. */
  parent: number[];
  from: number;
  to: number;
  /** All the niches of the run, as one. */
  box: NicheBox;
  members: NicheBox[];
}

const shelvesAt = (records: readonly OffsetRecord[], partition: string, path: number[]) =>
  records.find((r): r is OffsetRecord & { step: Extract<PartitionStep, { kind: "shelves" }> } => isShelves(r) && r.step.of === partition && !r.step.input.vertical && pathKey(r.step.niche) === pathKey(path));

/** A stack of shelves made in one division. */
interface FlatStack {
  offsets: OffsetRecord[];
  repath: (path: number[]) => number[];
  /** The bodies of the divisions that went into it. */
  absorbed: string[];
}

/**
 * The shelves of a column as one division: a module, for one, makes a shelf, then shelves in the niche above it. The
 * heights stay, each niche keeps what it holds, and the division at `root` takes over the lines and the bodies of those
 * inside it. A string: why they cannot be one (they differ in thickness or depth).
 */
export function flatStack(g: SketchGeometry, partition: string, root: number[]): FlatStack | string {
  const records = g.offsets ?? [];
  const top = shelvesAt(records, partition, root);
  const built = rebuildChain(g, partition);
  if (!top || typeof built === "string") return "Ces niches n'existent plus.";
  const slots: number[][] = [];
  const nested: typeof top[] = [];
  const walk = (path: number[]) => {
    const division = shelvesAt(records, partition, path);
    if (!division) return void slots.push(path);
    if (division !== top) nested.push(division);
    for (let i = 0; i <= division.step.input.count; i++) walk([...path, i]);
  };
  walk(root);
  if (!nested.length) return { offsets: records, repath: (path) => path, absorbed: [] };
  if (nested.some((d) => Math.abs(d.step.input.thickness - top.step.input.thickness) > 1e-6 || d.step.depth !== top.step.depth)) return "Ces étagères n'ont pas la même épaisseur ou la même profondeur.";
  const sizes = slots.map((path) => {
    const box = built.niches.get(pathKey(path))?.box;
    return box ? box.y1 - box.y0 : 0;
  });
  const repath = (path: number[]): number[] => {
    if (!within(path, root) || path.length === root.length) return path;
    const own = slots.findIndex((slot) => within(path, slot));
    if (own >= 0) return [...root, own, ...path.slice((slots[own] as number[]).length)];
    const under = slots.findIndex((slot) => within(slot, path));
    return under >= 0 ? [...root, under] : path;
  };
  const absorbed = nested.flatMap((d) => d.bodies ?? []);
  const flat: OffsetRecord = {
    ...top,
    curves: [...top.curves, ...nested.flatMap((d) => d.curves)],
    bodies: [...(top.bodies ?? []), ...absorbed],
    step: { ...top.step, input: { ...top.step.input, count: slots.length - 1, mode: "set", heights: [...sizes.slice(0, -1), null] } },
  };
  const offsets = records.filter((r) => !nested.some((d) => d === r)).map((r) => (r === top ? flat : isShelves(r) && r.step.of === partition ? { ...r, step: { ...r.step, niche: repath(r.step.niche) } } : r));
  return { offsets, repath, absorbed };
}

/** The highest niche a niche reaches going up through shelves only (a cloison stops the way); null if it is not between shelves. */
function stackRoot(g: SketchGeometry, partition: string, path: number[]): number[] | null {
  let root: number[] | null = null;
  for (let at = path.slice(0, -1); at.length && shelvesAt(g.offsets ?? [], partition, at); at = at.slice(0, -1)) root = at;
  return root;
}

/** The runs of neighbouring niches among these, one above the other in a stack of shelves, however it was made. */
export function nicheSpans(g: SketchGeometry, boxes: readonly NicheBox[]): NicheSpan[] {
  const found = new Map<string, { partition: string; parent: number[]; index: number; box: NicheBox }[]>();
  for (const box of boxes) {
    const at = nicheAt(g, box);
    if (!at || at.path.length < 2) continue;
    const root = stackRoot(g, at.partition, at.path);
    if (!root) continue;
    const flat = flatStack(g, at.partition, root);
    // Shelves that cannot be one division: only those of the niche's own division are cut.
    const parent = typeof flat === "string" ? at.path.slice(0, -1) : root;
    const index = (typeof flat === "string" ? at.path : flat.repath(at.path)).at(-1) as number;
    const key = `${at.partition}:${pathKey(parent)}`;
    found.set(key, [...(found.get(key) ?? []), { partition: at.partition, parent, index, box }]);
  }
  return [...found.values()].flatMap((list) => {
    const sorted = [...list].sort((a, b) => a.index - b.index);
    const runs: (typeof sorted)[] = [];
    for (const item of sorted) {
      const run = runs.at(-1);
      if (run && (run.at(-1) as (typeof sorted)[number]).index === item.index - 1) run.push(item);
      else runs.push([item]);
    }
    return runs.filter((run) => run.length > 1).map((run): NicheSpan => {
      const members = run.map((r) => r.box);
      const box = { x0: Math.min(...members.map((m) => m.x0)), y0: Math.min(...members.map((m) => m.y0)), x1: Math.max(...members.map((m) => m.x1)), y1: Math.max(...members.map((m) => m.y1)) };
      return { partition: run[0]!.partition, parent: run[0]!.parent, from: run[0]!.index, to: run.at(-1)!.index, box, members };
    });
  });
}

/**
 * The steps with cloisons running through a run of niches, cutting the shelves between them. The shelves of the run
 * leave their division, which keeps those around it: one niche stands in for the run, the cloisons divide it, and each
 * of the niches they make gets the same shelves again, at the same heights. What the run held goes to the `keep`-th.
 */
export function withCloisonsThrough(g: SketchGeometry, span: Pick<NicheSpan, "partition" | "parent" | "from" | "to">, cloisons: (niche: number[]) => OffsetRecord, rows: (niche: number[], input: ShelfParams) => OffsetRecord, keep: number): { offsets: OffsetRecord[]; repath: (path: number[]) => number[]; removed: string[]; absorbed: { into: string; bodies: string[] }[] } | string {
  const { partition, parent, from, to } = span;
  const flat = flatStack(g, partition, parent);
  const stacked = typeof flat === "string" ? g : { ...g, offsets: flat.offsets };
  const records = stacked.offsets ?? [];
  const division = records.find((r) => isShelves(r) && r.step.of === partition && pathKey(r.step.niche) === pathKey(parent));
  const built = rebuildChain(stacked, partition);
  if (!division || !isShelves(division) || typeof built === "string") return "Ces niches n'existent plus.";
  const { input } = division.step;
  const sizes = Array.from({ length: input.count + 1 }, (_, i) => {
    const box = built.niches.get(pathKey([...parent, i]))?.box;
    return box ? box.y1 - box.y0 : 0;
  });
  const cut = to - from;
  const left = input.count - cut;
  const merged = sizes.slice(from, to + 1).reduce((sum, h) => sum + h, 0) + cut * input.thickness;
  // Every shelf cut: the division goes, and the cloisons divide the niche it divided.
  const whole = left === 0 ? parent : [...parent, from];
  const reach = (path: number[]): number[] => {
    if (!within(path, parent) || path.length === parent.length) return path;
    const index = path[parent.length] as number;
    const rest = path.slice(parent.length + 1);
    if (index < from) return path;
    if (index > to) return [...parent, index - cut, ...rest];
    return [...whole, keep, index - from, ...rest];
  };
  const heights = [...sizes.slice(0, from), merged, ...sizes.slice(to + 1)];
  const around = { ...division, step: { ...division.step, input: { ...input, count: left, mode: "set" as const, heights: [...heights.slice(0, -1), null] } } };
  const row: ShelfParams = { count: cut, thickness: input.thickness, mode: "set", fixed: input.fixed, heights: [...sizes.slice(from, to), null] };
  const first = cloisons(whole);
  const count = isShelves(first) ? first.step.input.count : 1;
  const added = [first, ...Array.from({ length: count + 1 }, (_, k) => rows([...whole, k], row))];
  const offsets = records.flatMap((r) => (r === division ? [...(left ? [around] : []), ...added] : [isShelves(r) && r.step.of === partition ? { ...r, step: { ...r.step, niche: reach(r.step.niche) } } : r]));
  const absorbed = typeof flat === "string" ? [] : flat.absorbed;
  const repath = typeof flat === "string" ? reach : (path: number[]) => reach(flat.repath(path));
  return { offsets, repath, removed: left ? [] : (division.bodies ?? []), absorbed: left ? [{ into: division.id, bodies: absorbed }] : [] };
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
