/**
 * La face d'une Répartition, à l'échelle, comme la bande du linéaire de la cuisine (app/kitchen/kitchen-run-strip.ts) :
 * ses panneaux (côtés, dessus, dessous, socle, et les étagères et cloisons de ses niches), ses niches vides, puis ce
 * qui les équipe — façades de tiroirs, tringles, portes en pointillés avec leur poignée —, et ses cotes : la longueur
 * en haut, la hauteur à gauche, la largeur de chaque case en dessous. Tout vient des étapes de l'historique telles que
 * le panneau de l'outil les a (rien n'est encore enregistré) : la face suit chaque réglage. Le dessin est pur (une
 * chaîne SVG), partition-strip.ts y branche le clic et le glisser.
 */
import type { DoorSettings, OffsetRecord, SketchGeometry } from "../document/sketch";
import type { NicheFeature, SketchFeature } from "../document/types";
import { nicheGeometry, nicheParts, partitionDoors } from "../features/niche-parts";
import { partitionLayout, type PartitionInput, type PartitionLayout } from "./partition";
import { isShelves, pathKey, partitionRecord, rebuildChain } from "./partition-history";
import { partBox, shelfLayout, type NicheBox } from "./shelves";

/** Laiton, comme les poignées de la cuisine : ce qui est choisi et ce qui se tire. */
export const BRASS = "#b8975a";

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

export interface PartitionFace {
  length: number;
  height: number;
  /** Each case of the panel, from the left: where it lies, its width. */
  cases: { x0: number; x1: number; width: number }[];
  /** The top and bottom of the cases (the inside of the boards). */
  inner: [number, number];
  /** The niches left empty (what is between them is a panel: a side, a board, a shelf or a cloison). */
  niches: FaceRect[];
  fronts: FaceRect[];
  doors: (FaceRect & { hinge: "left" | "right" })[];
  rods: { x0: number; x1: number; y: number }[];
  handles: { x1: number; y1: number; x2: number; y2: number }[];
  /** Every small dimension: the free height of each niche, each shelf's thickness, each drawer front, rods, plinth. */
  labels: FaceLabel[];
}

/** A small dimension written on the face, in cm (`text`), where it lies (its baseline). */
export interface FaceLabel {
  x: number;
  y: number;
  text: string;
  kind: "niche" | "shelf" | "cloison" | "front" | "rod" | "plinth" | "panel";
  anchor: "start" | "middle" | "end";
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
  // The history with the step as the panel has it: its divisions follow it, as OK would make them.
  const id = draft.id ?? "face-draft";
  const record: OffsetRecord = partitionRecord(id, "", input, origin, draft.depth);
  const step = { ...record.step!, ...(draft.doors && draft.depth !== undefined ? { doors: { ...draft.doors } } : {}) } as OffsetRecord["step"];
  const before = g.offsets ?? [];
  const offsets = draft.id && before.some((r) => r.id === id) ? before.map((r) => (r.id === id ? { ...r, step } : r)) : [...before, { ...record, step }];
  const rebuilt = rebuildChain({ ...g, offsets }, id);
  const boxes = typeof rebuilt === "string" ? new Map<string, { path: number[]; box: NicheBox }>() : rebuilt.niches;
  const keys = [...boxes.keys()];
  const leaves = [...boxes.values()].filter((n) => !keys.some((k) => k.startsWith(`${pathKey(n.path)}.`)));
  const face: PartitionFace = {
    length: input.length,
    height: H,
    cases: caseSpans(input, layout).map(([x0, x1]) => ({ x0, x1, width: x1 - x0 })),
    inner: [H - layout.inner[1], H - layout.inner[0]],
    niches: leaves.map((n) => rect(n.box)),
    fronts: [],
    doors: [],
    rods: [],
    handles: [],
    labels: [],
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
      if (f.partition !== id || f.fill === "back") continue;
      const n = nicheGeometry(f, sketch);
      if (typeof n === "string") continue;
      for (const part of nicheParts(f, n)) {
        const [[u0, v0], [u1, v1]] = [part.from, part.to];
        const box = rect({ x0: Math.min(u0, u1), y0: Math.min(v0, v1), x1: Math.max(u0, u1), y1: Math.max(v0, v1) });
        if (part.kind === "rod") face.rods.push({ x0: u0 - ox, x1: u1 - ox, y: H - (v0 - oy) });
        else if (part.kind === "handle") face.handles.push({ x1: u0 - ox, y1: H - (v0 - oy), x2: u1 - ox, y2: H - (v1 - oy) });
        else if (part.role === "front" && (f.fill === "doors" || f.fill === "door")) face.doors.push({ ...box, hinge: part.handle === "left" ? "right" : "left" });
        else if (part.role === "front") face.fronts.push(box);
      }
    }
  }
  face.labels = faceLabels(face, input, typeof rebuilt === "string" ? [] : divisionPieces(offsets, id, rebuilt.niches).map((p) => ({ ...rect(p.box), vertical: p.vertical })));
  return face;
}

/** The shelves and cloisons of the divisions of this partition, as the history makes them again. */
function divisionPieces(offsets: readonly OffsetRecord[], id: string, niches: Map<string, { box: NicheBox }>): { box: NicheBox; vertical: boolean }[] {
  return offsets.flatMap((d) => {
    if (!isShelves(d) || d.step.of !== id) return [];
    const node = niches.get(pathKey(d.step.niche));
    const lay = node ? shelfLayout(node.box, d.step.input) : "";
    if (!node || typeof lay === "string") return [];
    return lay.shelves.map((span) => ({ box: partBox(node.box, span, lay), vertical: lay.vertical === true }));
  });
}

/**
 * The small dimensions, each where it can be read: the panels' thickness over the top left corner, each shelf's on its
 * right end, each cloison's at its top; the free height inside each niche (« largeur × hauteur » for a niche narrower
 * than its case), the height of each drawer front on it, a rod's height from the floor under it, the plinth in it. A
 * dimension with no room (a niche lower than the text) is left out.
 */
function faceLabels(face: PartitionFace, input: PartitionInput, pieces: (FaceRect & { vertical: boolean })[]): FaceLabel[] {
  const fs = faceFont(face) * SMALL;
  const H = face.height;
  const labels: FaceLabel[] = [{ x: 0, y: -(fs / SMALL) * 0.6, text: `ép. ${cm(input.thickness)}`, kind: "panel", anchor: "start" }];
  if (input.boards && input.plinth > 0) labels.push({ x: face.length / 2, y: H - input.plinth / 2 + fs * 0.35, text: `socle ${cm(input.plinth)}`, kind: "plinth", anchor: "middle" });
  for (const p of pieces) {
    if (p.vertical) labels.push({ x: p.x + p.w / 2, y: p.y + fs * 1.1, text: cm(p.w), kind: "cloison", anchor: "middle" });
    else labels.push({ x: p.x + p.w - fs * 0.2, y: p.y + p.h / 2 + fs * 0.35, text: cm(p.h), kind: "shelf", anchor: "end" });
  }
  const inside = (r: FaceRect, x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  for (const n of face.niches) {
    // A niche of drawers: its fronts have their heights.
    if (n.h < fs * 1.6 || n.w < fs * 2.5 || face.fronts.some((f) => inside(n, f.x + f.w / 2, f.y + f.h / 2))) continue;
    const own = face.cases.find((c) => n.x + n.w / 2 > c.x0 && n.x + n.w / 2 < c.x1);
    const narrower = own && own.width - n.w > 1 && n.w > fs * 6;
    labels.push({ x: n.x + n.w / 2, y: n.y + n.h / 2 + fs * 0.35, text: narrower ? `${cm(n.w)} × ${cm(n.h)}` : `↕ ${cm(n.h)}`, kind: "niche", anchor: "middle" });
  }
  for (const f of face.fronts) if (f.h >= fs * 1.2) labels.push({ x: f.x + fs * 0.4, y: f.y + f.h / 2 + fs * 0.35, text: cm(f.h), kind: "front", anchor: "start" });
  for (const r of face.rods) labels.push({ x: Math.min(r.x0, r.x1) + fs * 0.4, y: r.y + fs * 1.3, text: `tringle ${cm(H - r.y)}`, kind: "rod", anchor: "start" });
  return labels;
}

/** The small dimensions' size, against the main ones'. */
const SMALL = 0.8;

const PANEL = "fill-gray-300 stroke-gray-600 dark:fill-gray-600 dark:stroke-gray-300";
const NICHE = "fill-gray-50 stroke-gray-500 dark:fill-gray-900 dark:stroke-gray-500";
const FRONT = "fill-gray-100 stroke-gray-500 dark:fill-gray-700 dark:stroke-gray-400";
const LABEL = "fill-gray-600 dark:fill-gray-300";
const cm = (mm: number) => Number((mm / 10).toFixed(1)).toLocaleString("fr-FR");
const box = (r: FaceRect, tone: string, extra = "") => `<rect x="${r.x}" y="${r.y}" width="${Math.max(0, r.w)}" height="${Math.max(0, r.h)}" class="${tone}" vector-effect="non-scaling-stroke" ${extra}/>`;

/** The size of the labels (mm), to read them at the width of the panel. */
export const faceFont = (face: Pick<PartitionFace, "length" | "height">) => Math.max(50, Math.max(face.length, face.height * 0.6) / 26);

/** The face as SVG content (its viewBox from `faceViewBox`); `chosen`: the case outlined, null: none. */
export function partitionFaceSvg(face: PartitionFace, chosen: number | null = null): string {
  const { length: L, height: H } = face;
  const fs = faceFont(face);
  const [top, bottom] = face.inner;
  const parts = [
    // Every panel first, the niches over them: what is left between them is a side, a board, a shelf or a cloison.
    box({ x: 0, y: 0, w: L, h: H }, PANEL, 'data-face=""'),
    ...face.niches.map((n) => box(n, NICHE, 'data-niche=""')),
    ...face.fronts.map((f) => box(f, FRONT, 'data-front=""')),
    ...face.rods.map((r) => `<line x1="${r.x0}" y1="${r.y}" x2="${r.x1}" y2="${r.y}" class="stroke-gray-500 dark:stroke-gray-300" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" data-rod=""/>`),
    ...face.doors.map((d) => box(d, "fill-sky-400/10 stroke-sky-600 dark:stroke-sky-400", `stroke-dasharray="5 3" data-door="${d.hinge}"`)),
    ...face.handles.map((h) => `<line x1="${h.x1}" y1="${h.y1}" x2="${h.x2 === h.x1 && h.y2 === h.y1 ? h.x2 + 1 : h.x2}" y2="${h.y2}" stroke="${BRASS}" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke" data-handle=""/>`),
  ];
  // The small dimensions, then the main ones: the length over it, the height on its left, each case's width under it.
  for (const l of face.labels) parts.push(`<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="${fs * SMALL}" class="fill-sky-800 dark:fill-sky-300" pointer-events="none" data-label="${l.kind}">${l.text}</text>`);
  parts.push(`<text x="${L / 2}" y="${-fs * 0.6}" text-anchor="middle" font-size="${fs}" class="${LABEL}" data-dim="length">${cm(L)}</text>`);
  parts.push(`<text x="${-fs * 0.6}" y="${H / 2}" text-anchor="middle" font-size="${fs}" class="${LABEL}" transform="rotate(-90 ${-fs * 0.6} ${H / 2})" data-dim="height">${cm(H)}</text>`);
  face.cases.forEach((c, i) => {
    const on = i === chosen;
    parts.push(`<text x="${(c.x0 + c.x1) / 2}" y="${H + fs * 1.3}" text-anchor="middle" font-size="${fs}" class="${on ? "font-semibold" : ""} ${LABEL}" ${on ? `style="fill:${BRASS}"` : ""} data-width="${i}">${cm(c.width)}</text>`);
  });
  // Each case takes the click, over what it holds; the chosen one is outlined.
  face.cases.forEach((c, i) => {
    const on = i === chosen;
    parts.push(`<rect x="${c.x0}" y="${top}" width="${c.width}" height="${bottom - top}" fill="${on ? "rgb(184 151 90 / 0.15)" : "transparent"}" ${on ? `stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke" data-chosen=""` : ""} class="cursor-pointer" data-case="${i}"><title>Case ${i + 1} : ${cm(c.width)} cm${on ? "" : " — cliquer pour la choisir"}</title></rect>`);
  });
  return parts.join("");
}

/** Room for the dimensions around the face. */
export function faceViewBox(face: Pick<PartitionFace, "length" | "height">): string {
  const fs = faceFont(face);
  return `${-fs * 1.6} ${-fs * 1.6} ${face.length + fs * 2.2} ${face.height + fs * 3.2}`;
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
