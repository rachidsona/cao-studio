/**
 * Le dessin de la face d'une Répartition (partition-face.ts) en SVG : les panneaux, les niches, ce qui les équipe, les
 * cotes, puis ce qui prend le clic — chaque case, chaque étagère et cloison, chaque bloc de tiroirs et tringle —, ce
 * qui est choisi entouré en laiton. Les cotes qu'on peut taper sur place portent `data-edit`. Pur : une chaîne, où ne
 * vont que des nombres et des mots fixes (aucun nom venu d'un fichier).
 */
import { CHAIN, cm, faceFont, heightLine, SMALL, WHOLE, type FacePick, type FaceRect, type PartitionFace } from "./partition-face";

/** Laiton, comme les poignées de la cuisine : ce qui est choisi et ce qui se tire. */
export const BRASS = "#b8975a";

const PANEL = "fill-gray-300 stroke-gray-600 dark:fill-gray-600 dark:stroke-gray-300";
const NICHE = "fill-gray-50 stroke-gray-500 dark:fill-gray-900 dark:stroke-gray-500";
const FRONT = "fill-gray-100 stroke-gray-500 dark:fill-gray-700 dark:stroke-gray-400";
/**
 * The dimensions, as on a workshop drawing: thin lines and figures in the ink of the page (no red, which says an error),
 * the figures a shade stronger than their lines; one that can be typed turns blue under the pointer. Inside the face,
 * the free heights of the niches and fronts are their figure alone, quieter.
 */
const LABEL = "fill-gray-800 dark:fill-gray-100";
const EDITABLE = "hover:fill-sky-700 dark:hover:fill-sky-300";
const INNER = "fill-gray-500 dark:fill-gray-400";
const MAIN = "stroke-gray-500 dark:stroke-gray-400";
const OUTLINE = `fill="rgb(184 151 90 / 0.25)" stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke" pointer-events="none" data-picked=""`;
/**
 * A dimension line from end to end of what it measures, closed at each end by an oblique tick at 45° (`tick`: its
 * half length, in mm of the face), as on an architect's or a cabinetmaker's drawing: it reads at any size, and the
 * chains of dimensions meet tick to tick.
 */
export function dimLine([x1, y1, x2, y2]: [number, number, number, number], tick: number, tone = DIM): string {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1) return "";
  const t = Math.min(tick, length / 3);
  const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
  // Turned 45° from the line, the same way at both ends.
  const [dx, dy] = [(ux - uy) * Math.SQRT1_2 * t, (uy + ux) * Math.SQRT1_2 * t];
  const mark = (x: number, y: number) => `<line x1="${x - dx}" y1="${y - dy}" x2="${x + dx}" y2="${y + dy}" class="${tone}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  return `<g pointer-events="none" data-dimline=""><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${tone}" stroke-width="1" vector-effect="non-scaling-stroke"/>${mark(x1, y1)}${mark(x2, y2)}</g>`;
}

/** Drawn as a dimension line: what is dimensioned outside the face (the sides' chains) or across a niche (its width). */
const outside = (l: { side?: "left" | "right"; span?: [number, number, number, number] }) => !!l.span && (!!l.side || Math.abs(l.span[1] - l.span[3]) < 1e-9);

/** The lines of the dimensions, as their figures. */
const DIM = MAIN;

/** An extension line, from just off what is measured to just past its dimension line. */
const ext = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${MAIN} opacity-70" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none" data-ext=""/>`;

const box = (r: FaceRect, tone: string, extra = "") => `<rect x="${r.x}" y="${r.y}" width="${Math.max(0, r.w)}" height="${Math.max(0, r.h)}" class="${tone}" vector-effect="non-scaling-stroke" ${extra}/>`;

/** A thin piece made easier to take: at least `least` across its axis, around its middle. */
const thick = (r: FaceRect, vertical: boolean, least: number): FaceRect =>
  vertical ? { x: r.x + r.w / 2 - Math.max(r.w, least) / 2, y: r.y, w: Math.max(r.w, least), h: r.h } : { x: r.x, y: r.y + r.h / 2 - Math.max(r.h, least) / 2, w: r.w, h: Math.max(r.h, least) };

/** The face as SVG content (its viewBox from `faceViewBox`); `picked`: what is outlined (a number: that case). */
export function partitionFaceSvg(face: PartitionFace, picked: FacePick | number | null = null): string {
  const pick: FacePick | null = typeof picked === "number" ? { kind: "case", index: picked } : picked;
  const { length: L, height: H } = face;
  const fs = faceFont(face);
  const [top, bottom] = face.inner;
  const parts = [
    // Every panel first, the niches over them: what is left between them is a side, a board, a shelf or a cloison.
    box({ x: 0, y: 0, w: L, h: H }, PANEL, 'data-face=""'),
    ...face.niches.map((n) => box(n, NICHE, 'data-niche=""')),
    ...face.fronts.map((f) => box(f, FRONT, 'data-front=""')),
    ...face.rods.map((r) => `<line x1="${r.x0}" y1="${r.y}" x2="${r.x1}" y2="${r.y}" class="stroke-gray-500 dark:stroke-gray-300" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" data-rod=""/>`),
    ...face.doors.map((d) => box(d, "fill-sky-400/10 stroke-sky-600 dark:stroke-sky-400", `stroke-dasharray="5 3" pointer-events="none" data-door="${d.hinge}"`)),
    // The handles of drawers and doors are not drawn: the face shows the fronts, their heights, without them.
  ];
  // Each case, under what it holds: a click there chooses nothing (its width is pulled by the sides between cases).
  face.cases.forEach((c, i) => {
    const on = pick?.kind === "case" && pick.index === i;
    parts.push(`<rect x="${c.x0}" y="${top}" width="${c.width}" height="${bottom - top}" fill="${on ? "rgb(184 151 90 / 0.15)" : "transparent"}" ${on ? `stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke" data-chosen=""` : ""} data-case="${i}"><title>Case ${i + 1} : ${cm(c.width)} cm</title></rect>`);
  });
  // Over the cases: the shelves and cloisons, the drawers and rods, each taken by a click or pulled.
  face.pieces.forEach((p, k) => {
    const word = p.vertical ? "Cloison" : "Étagère";
    parts.push(`<rect ${rectAttrs(thick(p, p.vertical, fs * 0.5))} fill="transparent" class="${p.vertical ? "cursor-ew-resize" : "cursor-ns-resize"}" data-piece="${k}"><title>${word} ${p.index + 1} — cliquer pour la choisir, tirer pour la déplacer</title></rect>`);
  });
  face.equips.forEach((e, k) => {
    const title = e.fill === "rod" ? "Tringle — tirer pour la monter, la descendre ou la porter dans une autre niche" : "Tiroirs — tirer pour les porter dans une autre niche";
    if (e.fill === "drawers") for (const f of face.fronts.filter((f) => f.of === e.id)) parts.push(`<rect ${rectAttrs(f)} fill="transparent" class="cursor-move" data-equip="${k}"><title>${title}</title></rect>`);
    else for (const r of face.rods.filter((r) => r.id === e.id)) parts.push(`<rect ${rectAttrs(thick({ x: Math.min(r.x0, r.x1), y: r.y, w: Math.abs(r.x1 - r.x0), h: 0 }, false, fs * 0.6))} fill="transparent" class="cursor-move" data-equip="${k}"><title>${title}</title></rect>`);
  });
  // What is picked, outlined in brass.
  if (pick?.kind === "piece" && face.pieces[pick.index]) parts.push(box(face.pieces[pick.index]!, "", OUTLINE));
  if (pick?.kind === "equip") {
    for (const f of face.fronts.filter((f) => f.of === pick.id)) parts.push(box(f, "", OUTLINE));
    for (const r of face.rods.filter((r) => r.id === pick.id)) parts.push(`<line x1="${r.x0}" y1="${r.y}" x2="${r.x1}" y2="${r.y}" stroke="${BRASS}" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" pointer-events="none" data-picked=""/>`);
  }
  // The small dimensions, then the main ones, outside as on a drawing: each case's width over the face and its length
  // over them, the niches against its sides beside it, its height on the right. The lines first, their figures over them.
  const tick = fs * 0.22;
  const [gap, past] = [fs * 0.15, fs * 0.25];
  const [chain, whole, right] = [-fs * CHAIN, -fs * WHOLE, heightLine(face)];
  for (const l of face.labels) {
    if (!l.span || !outside(l)) continue;
    parts.push(dimLine(l.span, tick));
    if (l.side === "left") parts.push(ext(-gap, l.span[1], l.span[0] - past, l.span[1]), ext(-gap, l.span[3], l.span[0] - past, l.span[3]));
    if (l.side === "right") parts.push(ext(L + gap, l.span[1], l.span[0] + past, l.span[1]), ext(L + gap, l.span[3], l.span[0] + past, l.span[3]));
  }
  parts.push(dimLine([0, whole, L, whole], tick, MAIN), ext(0, -gap, 0, whole - past), ext(L, -gap, L, whole - past));
  parts.push(dimLine([right, 0, right, H], tick, MAIN), ext(L + gap, 0, right + past, 0), ext(L + gap, H, right + past, H));
  for (const c of face.cases) parts.push(dimLine([c.x0, chain, c.x1, chain], tick, MAIN), ext(c.x0, -gap, c.x0, chain - past), ext(c.x1, -gap, c.x1, chain - past));
  const tone = (inner: boolean) => (inner ? INNER : LABEL);
  const editable = (k: number | undefined, inner: boolean) => (k === undefined ? `class="${tone(inner)}" pointer-events="none"` : `class="${tone(inner)} ${EDITABLE} cursor-text" data-edit="${k}"`);
  const upright = (x: number, y: number) => `transform="rotate(-90 ${x} ${y})" dominant-baseline="central"`;
  for (const l of face.labels) parts.push(`<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="${fs * SMALL}" ${l.side ? upright(l.x, l.y) : ""} ${editable(l.edit, !l.side && l.kind !== "panel")} data-label="${l.kind}">${l.text}</text>`);
  // The whole, the main figures: a little larger than the chain's, a full line over it.
  parts.push(`<text x="${L / 2}" y="${whole - fs * 0.2}" text-anchor="middle" font-size="${fs}" font-weight="600" class="${LABEL} ${EDITABLE} cursor-text" data-edit="0" data-dim="length">${cm(L)}</text>`);
  parts.push(`<text x="${right + fs * 0.55}" y="${H / 2}" text-anchor="middle" font-size="${fs}" font-weight="600" class="${LABEL} ${EDITABLE} cursor-text" ${upright(right + fs * 0.55, H / 2)} data-edit="1" data-dim="height">${cm(H)}</text>`);
  face.cases.forEach((c, i) => {
    const on = pick?.kind === "case" && pick.index === i;
    parts.push(`<text x="${(c.x0 + c.x1) / 2}" y="${chain - fs * 0.2}" text-anchor="middle" font-size="${fs * 0.85}" class="${on ? "font-semibold" : ""} ${LABEL} ${EDITABLE} cursor-text" ${on ? `style="fill:${BRASS}"` : ""} data-edit="${2 + i}" data-width="${i}">${cm(c.width)}</text>`);
  });
  return parts.join("");
}

const rectAttrs = (r: FaceRect) => `x="${r.x}" y="${r.y}" width="${Math.max(0, r.w)}" height="${Math.max(0, r.h)}"`;
