/**
 * La face d'une Répartition, à l'échelle, comme la bande du linéaire de la cuisine (app/kitchen/kitchen-run-strip.ts) :
 * ses panneaux (côtés, dessus, dessous, socle, et les étagères et cloisons de ses niches), ses niches vides, puis ce
 * qui les équipe — façades de tiroirs, tringles, portes en pointillés (leurs poignées sont connues, pas dessinées) —, et ses cotes, dehors comme
 * sur un plan : la largeur de chaque case au-dessus et la longueur au-dessus d'elles, la hauteur des niches contre le
 * côté gauche à gauche et contre le côté droit à droite, la hauteur au bout. Tout vient des étapes de l'historique telles que
 * le panneau de l'outil les a (rien n'est encore enregistré) : la face suit chaque réglage. Chaque étagère, cloison,
 * bloc de tiroirs et tringle y garde son identité (pour être choisi, tiré, dupliqué), et chaque cote ce qu'elle règle
 * (pour être tapée sur place). Le dessin est dans partition-face-svg.ts, le clic et le glisser dans partition-strip.ts.
 */
import type { DoorSettings, OffsetRecord, SketchGeometry } from "../document/sketch";
import type { NicheFeature, SketchFeature } from "../document/types";
import { nicheGeometry, nicheParts, partitionDoors } from "../features/niche-parts";
import { partitionLayout, type PartitionInput, type PartitionLayout } from "./partition";
import { isShelves, pathKey, partitionRecord, rebuildChain, type NicheNode } from "./partition-history";
import { partBox, shelfLayout, type NicheBox } from "./shelves";

/** What the panel holds, for the face: the step as OK would store it. */
export interface FaceDraft {
  input: PartitionInput;
  origin: [number, number];
  depth?: number;
  doors?: DoorSettings | null;
  /** The step changed (its id in the sketch's history); none: a new Répartition. */
  id?: string;
}

/** Rectangles in the face's frame (mm): x from the left side, y down from the top. */
export interface FaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A shelf or a cloison of a division of the niches: which step made it, the how-many-th, where its middle can go. */
export interface FacePiece extends FaceRect {
  record: string;
  index: number;
  vertical: boolean;
  /** Its middle, along its axis (y for a shelf, x for a cloison), in the face's frame. */
  centre: number;
  /** How far its middle can go, between the two niches it parts (face's frame, low to high). */
  travel: [number, number];
  /** Where the 32 mm steps are counted from: the bottom of the niche under a shelf, the left of the one beside a cloison. */
  start: number;
}

/** What equips a niche, as one thing to choose and move: a block of drawers or a rod. */
export interface FaceEquip {
  id: string;
  fill: "rod" | "drawers";
  path: number[];
  niche: FaceRect;
}

/** What a dimension written on the face sets, when it is typed again. */
export type FaceEdit =
  | { what: "length" }
  | { what: "height" }
  | { what: "case"; index: number }
  | { what: "thickness" }
  | { what: "plinth" }
  | { what: "division"; record: string }
  | { what: "niche"; path: number[]; axis: "x" | "y" }
  | { what: "front"; id: string; count: number; path: number[] }
  | { what: "rod"; id: string };

/** What is chosen on the face. */
export type FacePick = { kind: "case"; index: number } | { kind: "piece"; index: number } | { kind: "equip"; id: string };

export interface PartitionFace {
  length: number;
  height: number;
  /** The lower left corner of the Répartition in its sketch, to go back from the face to the sketch. */
  origin: [number, number];
  /** Each case of the panel, from the left: where it lies, its width. */
  cases: { x0: number; x1: number; width: number }[];
  /** The top and bottom of the cases (the inside of the boards). */
  inner: [number, number];
  /** The niches left empty (what is between them is a panel: a side, a board, a shelf or a cloison). */
  niches: (FaceRect & { path: number[] })[];
  pieces: FacePiece[];
  equips: FaceEquip[];
  fronts: (FaceRect & { of?: string })[];
  doors: (FaceRect & { hinge: "left" | "right" })[];
  rods: { x0: number; x1: number; y: number; id?: string }[];
  handles: { x1: number; y1: number; x2: number; y2: number }[];
  /** Every small dimension: the free height of each niche, each shelf's thickness, each drawer front, rods, plinth. */
  labels: FaceLabel[];
  /** What each dimension sets: the length (0), the height (1), each case's width (2…), then the small ones' (`edit`). */
  edits: { edit: FaceEdit; value: number }[];
}

/** A small dimension written on the face, in cm (`text`), where it lies (its baseline), what it sets (`edit`). */
export interface FaceLabel {
  x: number;
  y: number;
  text: string;
  kind: "niche" | "shelf" | "cloison" | "front" | "rod" | "plinth" | "panel";
  anchor: "start" | "middle" | "end";
  edit?: number;
  /** The dimension line it reads, from end to end of what it measures (x1, y1, x2, y2), arrows at both ends. */
  span?: [number, number, number, number];
  /** Written upright beside the face (a niche of the first or the last case, in the chains on the left and right). */
  side?: "left" | "right";
}

/** Where each case of the panel lies, from the left (a side left out keeps its place in the niche). */
function caseSpans(input: PartitionInput, layout: PartitionLayout): [number, number][] {
  const e = input.thickness;
  let x = e;
  return layout.caseWidths.map((w, i): [number, number] => {
    const span: [number, number] = [x, x + w];
    const kind = input.dividers[i];
    x += w + (kind === "double" ? 2 * e : kind ? e : 0);
    return span;
  });
}

/** The history with the step as the panel has it (its divisions follow it, as OK would make them), and its id. */
export function draftOffsets(draft: FaceDraft, before: readonly OffsetRecord[]): { id: string; offsets: OffsetRecord[] } {
  const id = draft.id ?? "face-draft";
  const record: OffsetRecord = partitionRecord(id, "", draft.input, draft.origin, draft.depth);
  const step = { ...record.step!, ...(draft.doors && draft.depth !== undefined ? { doors: { ...draft.doors } } : {}) } as OffsetRecord["step"];
  const offsets = draft.id && before.some((r) => r.id === id) ? before.map((r) => (r.id === id ? { ...r, step } : r)) : [...before, { ...record, step }];
  return { id, offsets };
}

/**
 * The face of the Répartition the panel holds; null when its measures are impossible. `g`: the sketch it is in, with
 * its divisions; `sketch` and `equipment`: the sketch as a feature and what equips its niches (in the 3D view only).
 */
export function partitionFace(draft: FaceDraft, g: SketchGeometry, equipment: { sketch: SketchFeature; niches: readonly NicheFeature[] } | null = null): PartitionFace | null {
  const { input, origin } = draft;
  const layout = partitionLayout(input);
  if (typeof layout === "string") return null;
  const [ox, oy] = origin;
  const H = input.height;
  const rect = (b: NicheBox): FaceRect => ({ x: b.x0 - ox, y: H - (b.y1 - oy), w: b.x1 - b.x0, h: b.y1 - b.y0 });
  const { id, offsets } = draftOffsets(draft, g.offsets ?? []);
  const rebuilt = rebuildChain({ ...g, offsets }, id);
  const boxes = typeof rebuilt === "string" ? new Map<string, NicheNode>() : rebuilt.niches;
  const keys = [...boxes.keys()];
  const leaves = [...boxes.values()].filter((n) => !keys.some((k) => k.startsWith(`${pathKey(n.path)}.`)));
  const cases = caseSpans(input, layout).map(([x0, x1]) => ({ x0, x1, width: x1 - x0 }));
  const face: PartitionFace = {
    length: input.length,
    height: H,
    origin: [ox, oy],
    cases,
    inner: [H - layout.inner[1], H - layout.inner[0]],
    niches: leaves.map((n) => ({ ...rect(n.box), path: n.path })),
    pieces: divisionPieces(offsets, id, boxes, origin, H),
    equips: [],
    fronts: [],
    doors: [],
    rods: [],
    handles: [],
    labels: [],
    edits: [{ edit: { what: "length" }, value: input.length }, { edit: { what: "height" }, value: H }, ...cases.map((c, index) => ({ edit: { what: "case" as const, index }, value: c.width }))],
  };
  // The doors of the step itself (« Une porte par case »), hinged left, right… unless chosen.
  if (draft.doors && draft.depth !== undefined) {
    const doors = partitionDoors(input, origin, draft.doors.gap, draft.doors.joined, draft.doors.skipped);
    // Only « left » or « right » goes into the drawing, whatever a file imported holds.
    const side = (i: number) => (draft.doors?.hinges?.[i] === "right" ? "right" : draft.doors?.hinges?.[i] === "left" ? "left" : i % 2 === 0 ? "left" : "right");
    if (typeof doors !== "string") doors.forEach(([x0, y0, x1, y1], i) => face.doors.push({ ...rect({ x0, y0, x1, y1 }), hinge: side(i) }));
  }
  // What equips the niches, from the parts the 3D builds (its frame is the sketch's: u, v are x, y).
  if (equipment && draft.depth) {
    const sketch = { ...equipment.sketch, offsets };
    for (const f of equipment.niches) {
      // An accessory is not drawn on the face: it has no dimension to set there.
      if (f.partition !== id || f.fill === "back" || f.fill === "accessory") continue;
      const n = nicheGeometry(f, sketch);
      if (typeof n === "string") continue;
      const of = f.fill === "rod" || f.fill === "drawers" ? f.id : undefined;
      if (f.fill === "rod" || f.fill === "drawers") face.equips.push({ id: f.id, fill: f.fill, path: [...f.niche], niche: rect(n.box) });
      for (const part of nicheParts(f, n)) {
        const [[u0, v0], [u1, v1]] = [part.from, part.to];
        const box = rect({ x0: Math.min(u0, u1), y0: Math.min(v0, v1), x1: Math.max(u0, u1), y1: Math.max(v0, v1) });
        if (part.kind === "rod") face.rods.push({ x0: u0 - ox, x1: u1 - ox, y: H - (v0 - oy), ...(of ? { id: of } : {}) });
        else if (part.kind === "handle") face.handles.push({ x1: u0 - ox, y1: H - (v0 - oy), x2: u1 - ox, y2: H - (v1 - oy) });
        else if (part.role === "front" && (f.fill === "doors" || f.fill === "door")) face.doors.push({ ...box, hinge: part.handle === "left" ? "right" : "left" });
        else if (part.role === "front") face.fronts.push({ ...box, ...(of ? { of } : {}) });
      }
    }
  }
  faceLabels(face, input, equipment?.niches ?? []);
  return face;
}

/** The shelves and cloisons of the divisions of this partition, as the history makes them again, with where each can go. */
function divisionPieces(offsets: readonly OffsetRecord[], id: string, niches: Map<string, NicheNode>, [ox, oy]: [number, number], H: number): FacePiece[] {
  return offsets.flatMap((d) => {
    if (!isShelves(d) || d.step.of !== id) return [];
    const node = niches.get(pathKey(d.step.niche));
    const lay = node ? shelfLayout(node.box, d.step.input) : "";
    if (!node || typeof lay === "string") return [];
    const t = d.step.input.thickness;
    return lay.shelves.flatMap((span, index): FacePiece[] => {
      const below = niches.get(pathKey([...d.step.niche, index]))?.box;
      const above = niches.get(pathKey([...d.step.niche, index + 1]))?.box;
      if (!below || !above) return [];
      const b = partBox(node.box, span, lay);
      const r = { x: b.x0 - ox, y: H - (b.y1 - oy), w: b.x1 - b.x0, h: b.y1 - b.y0 };
      const vertical = lay.vertical === true;
      const own = { record: d.id, index, vertical };
      if (vertical) return [{ ...r, ...own, centre: r.x + r.w / 2, travel: [below.x0 + t / 2 - ox, above.x1 - t / 2 - ox], start: below.x0 + t / 2 - ox }];
      return [{ ...r, ...own, centre: r.y + r.h / 2, travel: [H - (above.y1 - t / 2 - oy), H - (below.y0 + t / 2 - oy)], start: H - (below.y0 + t / 2 - oy) }];
    });
  });
}

/**
 * The small dimensions, each where it can be read: the panels' thickness under the bottom left corner, each shelf's on
 * its right end and each cloison's at its top when they are not as thick as the panels; the free height of each niche,
 * outside for those against the left or the right side (end to end, as on a drawing), inside for the others (« largeur × hauteur » for a niche narrower
 * than its case), the height of each drawer front on it, a rod's height from the floor under it, the plinth in it. A
 * dimension with no room (a niche lower than the text) is left out. Each one says what it sets.
 */
function faceLabels(face: PartitionFace, input: PartitionInput, niches: readonly NicheFeature[]): void {
  const F = faceFont(face);
  const fs = F * SMALL;
  const H = face.height;
  const first = face.cases[0];
  const last = face.cases.length > 1 ? face.cases.at(-1) : undefined;
  // The niches against the left side, then those against the right side, are dimensioned outside, end to end.
  const side = (n: FaceRect): "left" | "right" | undefined => (first && Math.abs(n.x - first.x0) < 1 ? "left" : last && Math.abs(n.x + n.w - last.x1) < 1 ? "right" : undefined);
  const add = (label: Omit<FaceLabel, "edit">, edit: FaceEdit, value: number) => {
    face.labels.push({ ...label, edit: face.edits.length });
    face.edits.push({ edit, value });
  };
  add({ x: 0, y: H + F * 1.05, text: `ép. ${cm(input.thickness)}`, kind: "panel", anchor: "start" }, { what: "thickness" }, input.thickness);
  if (input.boards && input.plinth > 0) {
    // The plinth closes the chain of the left side, at the floor: its figure alone, as on a drawing.
    const line = -F * CHAIN;
    add({ x: line - F * 0.45, y: H - input.plinth / 2, text: cm(input.plinth), kind: "plinth", anchor: "middle", side: "left", span: [line, H - input.plinth, line, H] }, { what: "plinth" }, input.plinth);
  }
  for (const p of face.pieces) {
    // As thick as the panels (« ép. » says it): not written again on each shelf.
    if (Math.abs((p.vertical ? p.w : p.h) - input.thickness) < 0.05) continue;
    const edit = { what: "division" as const, record: p.record };
    if (p.vertical) add({ x: p.x + p.w / 2, y: p.y + fs * 1.1, text: cm(p.w), kind: "cloison", anchor: "middle" }, edit, p.w);
    else add({ x: p.x + p.w - fs * 0.2, y: p.y + p.h / 2 + fs * 0.35, text: cm(p.h), kind: "shelf", anchor: "end" }, edit, p.h);
  }
  const inside = (r: FaceRect, x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  for (const n of face.niches) {
    const out = side(n);
    // A niche of drawers: its fronts have their heights (outside, it keeps its own in the chain).
    const drawers = face.fronts.some((f) => inside(n, f.x + f.w / 2, f.y + f.h / 2));
    if (n.h < fs * 1.6 || (!out && (n.w < fs * 2.5 || drawers))) continue;
    const own = face.cases.find((c) => n.x + n.w / 2 > c.x0 && n.x + n.w / 2 < c.x1);
    const narrower = !drawers && own && own.width - n.w > 1 && n.w > fs * 3.5;
    const height = { what: "niche" as const, path: n.path, axis: "y" as const };
    const cx = n.x + n.w / 2;
    if (out) {
      // Beside the face, upright, its line from the shelf under it to the one over it.
      const line = out === "left" ? -F * CHAIN : face.length + F * CHAIN;
      const x = out === "left" ? line - F * 0.45 : line + F * 0.45;
      add({ x, y: n.y + n.h / 2, text: cm(n.h), kind: "niche", anchor: "middle", side: out, span: [line, n.y, line, n.y + n.h] }, height, n.h);
    } else {
      // Its free height, written in its middle (what it measures: from the shelf under it to the one over it).
      add({ x: cx, y: n.y + n.h / 2 + fs * 0.35, text: cm(n.h), kind: "niche", anchor: "middle", span: [cx, n.y, cx, n.y + n.h] }, height, n.h);
    }
    // Narrower than its case (beside a cloison): its width too, from side to side, low in it.
    if (narrower) {
      const y = n.y + n.h - fs * 1.1;
      add({ x: cx, y: y - fs * 0.3, text: cm(n.w), kind: "niche", anchor: "middle", span: [n.x, y, n.x + n.w, y] }, { what: "niche", path: n.path, axis: "x" }, n.w);
    }
  }
  for (const f of face.fronts) {
    const block = niches.find((e) => e.id === f.of);
    if (f.h < fs * 1.2) continue;
    // Its height, against its right edge: its middle stays free for a click that takes the drawers.
    const line = f.x + f.w - fs * 0.35;
    const label = { x: line, y: f.y + f.h / 2 + fs * 0.35, text: cm(f.h), kind: "front" as const, anchor: "end" as const, span: [line, f.y, line, f.y + f.h] as [number, number, number, number] };
    if (block) add(label, { what: "front", id: block.id, count: block.drawers, path: [...block.niche] }, f.h);
    else face.labels.push(label);
  }
  for (const r of face.rods) {
    // From the floor to the rod's axis.
    const line = Math.min(r.x0, r.x1) + fs * 0.3;
    const label = { x: line + fs * 0.3, y: r.y + fs * 1.3, text: `tringle ${cm(H - r.y)}`, kind: "rod" as const, anchor: "start" as const, span: [line, r.y, line, H] as [number, number, number, number] };
    if (r.id) add(label, { what: "rod", id: r.id }, H - r.y);
    else face.labels.push(label);
  }
}

/** The small dimensions' size, against the main ones'. */
export const SMALL = 0.8;

export const cm = (mm: number) => Number((mm / 10).toFixed(1)).toLocaleString("fr-FR");

/** The size of the labels (mm), to read them at the width and the height the panel gives the face. */
export const faceFont = (face: Pick<PartitionFace, "length" | "height">) => Math.max(50, face.length / 30, face.height / 22);

/**
 * Where the dimension lines lie outside the face, in label sizes: the first chain (each case's width over it, the
 * niches against its sides and the plinth beside it), then the whole (its length over that, its height on the right),
 * their figures written on them, a full figure apart so that they never touch.
 */
export const CHAIN = 0.8;
export const WHOLE = 2.15;

/** Where the line of the whole height lies: beyond the chain of the right side when there is one. */
export const heightLine = (face: Pick<PartitionFace, "length" | "height" | "cases">) => face.length + faceFont(face) * (face.cases.length > 1 ? WHOLE : CHAIN);

/** Room for the dimensions around the face. */
export function faceViewBox(face: Pick<PartitionFace, "length" | "height" | "cases">): string {
  const fs = faceFont(face);
  const [x0, y0] = [-fs * 1.85, -fs * (WHOLE + 0.75)];
  return `${x0} ${y0} ${heightLine(face) + fs * 1.05 - x0} ${face.height + fs * 1.4 - y0}`;
}

/** The narrowest a case can be pulled to (mm). */
export const MIN_CASE = 100;

/**
 * The shares of the cases once the edge of case `i` (its right one, or its left one) is pulled until it is `width` mm
 * wide, to the centimetre: the case next to that edge takes the difference, the others stay. Null: nothing changes, or
 * it would leave a case narrower than 10 cm. The shares are the widths in mm (their sum is the room left by the sides).
 */
export function pulledWidths(face: Pick<PartitionFace, "cases">, i: number, edge: "left" | "right", width: number): number[] | null {
  const widths = face.cases.map((c) => c.width);
  const j = edge === "right" ? i + 1 : i - 1;
  const [a, b] = [widths[i], widths[j]];
  if (a === undefined || b === undefined) return null;
  const next = Math.round(width / 10) * 10;
  if (Math.abs(next - a) < 1e-6 || next < MIN_CASE || a + b - next < MIN_CASE) return null;
  widths[i] = next;
  widths[j] = a + b - next;
  return widths.map((w) => Math.round(w * 10) / 10);
}

/** The shares of the cases with case `i` at `width` mm: the others share what is left, in the proportions they had. */
export function caseAt(face: Pick<PartitionFace, "cases">, i: number, width: number): number[] | string {
  const widths = face.cases.map((c) => c.width);
  const total = widths.reduce((a, b) => a + b, 0);
  const others = total - (widths[i] ?? 0);
  const left = total - width;
  if (widths[i] === undefined || !(width >= MIN_CASE) || left < MIN_CASE * (widths.length - 1) || !others) return "Cette largeur ne laisse pas de place aux autres cases.";
  return widths.map((w, k) => Math.round((k === i ? width : (w * left) / others) * 10) / 10);
}
