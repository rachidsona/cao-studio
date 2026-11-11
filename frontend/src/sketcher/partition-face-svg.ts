/**
 * Le dessin de la face d'une Répartition (partition-face.ts) en SVG : les panneaux, les niches, ce qui les équipe, les
 * cotes, puis ce qui prend le clic — chaque case, chaque étagère et cloison, chaque bloc de tiroirs et tringle —, ce
 * qui est choisi entouré en laiton. Les cotes qu'on peut taper sur place portent `data-edit`. Pur : une chaîne, où ne
 * vont que des nombres et des mots fixes (aucun nom venu d'un fichier).
 */
import { cm, faceFont, SMALL, type FacePick, type FaceRect, type PartitionFace } from "./partition-face";

/** Laiton, comme les poignées de la cuisine : ce qui est choisi et ce qui se tire. */
export const BRASS = "#b8975a";

const PANEL = "fill-gray-300 stroke-gray-600 dark:fill-gray-600 dark:stroke-gray-300";
const NICHE = "fill-gray-50 stroke-gray-500 dark:fill-gray-900 dark:stroke-gray-500";
const FRONT = "fill-gray-100 stroke-gray-500 dark:fill-gray-700 dark:stroke-gray-400";
const LABEL = "fill-gray-600 dark:fill-gray-300";
const OUTLINE = `fill="rgb(184 151 90 / 0.25)" stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke" pointer-events="none" data-picked=""`;
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
    ...face.handles.map((h) => `<line x1="${h.x1}" y1="${h.y1}" x2="${h.x2 === h.x1 && h.y2 === h.y1 ? h.x2 + 1 : h.x2}" y2="${h.y2}" stroke="${BRASS}" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke" pointer-events="none" data-handle=""/>`),
  ];
  // Each case takes the click, over what it holds; the chosen one is outlined.
  face.cases.forEach((c, i) => {
    const on = pick?.kind === "case" && pick.index === i;
    parts.push(`<rect x="${c.x0}" y="${top}" width="${c.width}" height="${bottom - top}" fill="${on ? "rgb(184 151 90 / 0.15)" : "transparent"}" ${on ? `stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke" data-chosen=""` : ""} class="cursor-pointer" data-case="${i}"><title>Case ${i + 1} : ${cm(c.width)} cm${on ? "" : " — cliquer pour la choisir"}</title></rect>`);
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
  // The small dimensions, then the main ones: the length over it, the height on its left, each case's width under it.
  const editable = (k: number | undefined) => (k === undefined ? 'class="fill-sky-800 dark:fill-sky-300" pointer-events="none"' : `class="fill-sky-800 dark:fill-sky-300 cursor-text" data-edit="${k}"`);
  for (const l of face.labels) parts.push(`<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="${fs * SMALL}" ${editable(l.edit)} data-label="${l.kind}">${l.text}</text>`);
  parts.push(`<text x="${L / 2}" y="${-fs * 0.6}" text-anchor="middle" font-size="${fs}" class="${LABEL} cursor-text" data-edit="0" data-dim="length">${cm(L)}</text>`);
  parts.push(`<text x="${-fs * 0.6}" y="${H / 2}" text-anchor="middle" font-size="${fs}" class="${LABEL} cursor-text" transform="rotate(-90 ${-fs * 0.6} ${H / 2})" data-edit="1" data-dim="height">${cm(H)}</text>`);
  face.cases.forEach((c, i) => {
    const on = pick?.kind === "case" && pick.index === i;
    parts.push(`<text x="${(c.x0 + c.x1) / 2}" y="${H + fs * 1.3}" text-anchor="middle" font-size="${fs}" class="${on ? "font-semibold" : ""} ${LABEL} cursor-text" ${on ? `style="fill:${BRASS}"` : ""} data-edit="${2 + i}" data-width="${i}">${cm(c.width)}</text>`);
  });
  return parts.join("");
}

const rectAttrs = (r: FaceRect) => `x="${r.x}" y="${r.y}" width="${Math.max(0, r.w)}" height="${Math.max(0, r.h)}"`;
