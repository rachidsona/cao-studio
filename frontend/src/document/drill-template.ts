/**
 * Gabarits de perçage imprimables à l'échelle 1 : la face d'une pièce et ses perçages en vraie grandeur, découpée en
 * pages A4 à coller bout à bout (10 mm de recouvrement, repéré en pointillés), pour poser le papier sur le panneau
 * et pointer chaque trou. Chaque trou a sa croix de centrage et son diamètre ; chaque page dit sa place (colonne,
 * rangée) et porte une barre de 100 mm pour vérifier que l'imprimante n'a pas mis à l'échelle. Les pages sont des SVG
 * en millimètres (lus par drawing/svg-pdf.ts pour le PDF). Pur.
 */
import type { FlatEdge, FlatPart } from "../io/dxf";

type P2 = [number, number];

/** A4 portrait, its margins, the header band, the overlap between two pages, the room around the part. */
const PAGE: P2 = [210, 297];
const MARGIN = 10;
const HEADER = 22;
export const OVERLAP = 10;
const PAD = 8;
const AREA: P2 = [PAGE[0] - 2 * MARGIN, PAGE[1] - 2 * MARGIN - HEADER];

const f = (v: number) => Number(v.toFixed(2)).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const INK = "#111827";

/** How many pages across and down a part takes. */
export function tiling(part: Pick<FlatPart, "width" | "height">): { cols: number; rows: number } {
  const span = (size: number, room: number) => Math.max(1, Math.ceil((size + 2 * PAD - OVERLAP) / (room - OVERLAP)));
  return { cols: span(part.width, AREA[0]), rows: span(part.height, AREA[1]) };
}

/** A segment kept to the rectangle [x0, x1] × [y0, y1] (Liang–Barsky); null: outside. */
export function clipSegment(a: P2, b: P2, [x0, y0, x1, y1]: [number, number, number, number]): [P2, P2] | null {
  let [t0, t1] = [0, 1];
  const d: P2 = [b[0] - a[0], b[1] - a[1]];
  const checks: [number, number][] = [[-d[0], a[0] - x0], [d[0], x1 - a[0]], [-d[1], a[1] - y0], [d[1], y1 - a[1]]];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 > t1 ? null : [[a[0] + d[0] * t0, a[1] + d[1] * t0], [a[0] + d[0] * t1, a[1] + d[1] * t1]];
}

/** The part's outline as segments (arcs and a round part's outline as short chords), in the part's mm, y up. */
function outline(part: FlatPart): [P2, P2][] {
  const out: [P2, P2][] = [];
  const round = (c: P2, r: number, s: number, e: number) => {
    const n = Math.max(8, Math.ceil(((e - s) * r) / 2));
    for (let i = 0; i < n; i++) {
      const [u, v] = [s + ((e - s) * i) / n, s + ((e - s) * (i + 1)) / n];
      out.push([[c[0] + r * Math.cos(u), c[1] + r * Math.sin(u)], [c[0] + r * Math.cos(v), c[1] + r * Math.sin(v)]]);
    }
  };
  for (const e of part.edges) {
    if (e.kind === "line") out.push([e.a, e.b]);
    else if (e.kind === "arc") round(e.center, e.radius, e.start, e.end < e.start ? e.end + 2 * Math.PI : e.end);
    else if (part.edges.length === 1) round(e.center, e.radius, 0, 2 * Math.PI);
  }
  return out;
}

const holes = (part: FlatPart) => (part.edges.length === 1 ? [] : part.edges.filter((e): e is Extract<FlatEdge, { kind: "circle" }> => e.kind === "circle"));

/** The template pages of a part: SVGs of an A4 sheet in mm, column by column of each row, from the top left. */
export function drillTemplatePages(part: FlatPart, title: string): string[] {
  const { cols, rows } = tiling(part);
  const step: P2 = [AREA[0] - OVERLAP, AREA[1] - OVERLAP];
  // The part on the big sheet: its corner PAD from the top left, y down.
  const sheet = (p: P2): P2 => [PAD + p[0], PAD + part.height - p[1]];
  const lines = outline(part).map(([a, b]) => [sheet(a), sheet(b)] as [P2, P2]);
  const pages: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [sx, sy] = [c * step[0], r * step[1]];
      const box: [number, number, number, number] = [sx, sy, sx + AREA[0], sy + AREA[1]];
      // From the big sheet to this page.
      const page = (p: P2): P2 => [MARGIN + p[0] - sx, MARGIN + HEADER + p[1] - sy];
      const out: string[] = [`<rect width="${PAGE[0]}" height="${PAGE[1]}" fill="#fff"/>`];
      const line = (a: P2, b: P2, style: string) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" ${style}/>`;
      const text = (at: P2, t: string, size: number, extra = "", fill = INK) => `<text x="${f(at[0])}" y="${f(at[1])}" font-size="${size}" fill="${fill}" ${extra}>${esc(t)}</text>`;
      // The header: what it is, where the page goes, the 100 mm bar.
      out.push(text([MARGIN, MARGIN + 5], `Gabarit de perçage 1:1 — ${title}`, 4, 'font-weight="bold"'));
      out.push(text([MARGIN, MARGIN + 11], `${part.name} · ${f(part.width)} × ${f(part.height)} mm · page ${r * cols + c + 1} / ${rows * cols} (colonne ${c + 1}, rangée ${r + 1})`, 3));
      const bar: P2 = [PAGE[0] - MARGIN - 100, MARGIN + 17];
      out.push(line(bar, [bar[0] + 100, bar[1]], `stroke="${INK}" stroke-width="0.4"`));
      for (let k = 0; k <= 10; k++) out.push(line([bar[0] + k * 10, bar[1] - (k % 5 ? 1 : 2)], [bar[0] + k * 10, bar[1]], `stroke="${INK}" stroke-width="0.25"`));
      out.push(text([MARGIN, MARGIN + 17], "Imprimer à 100 % : la barre doit mesurer 100 mm", 2.6, "", "#6b7280"));
      // The edges of the area, and the overlap to glue under the next page (dashed).
      out.push(`<rect x="${MARGIN}" y="${MARGIN + HEADER}" width="${AREA[0]}" height="${AREA[1]}" fill="none" stroke="#9ca3af" stroke-width="0.2"/>`);
      if (c < cols - 1) out.push(line([MARGIN + AREA[0] - OVERLAP, MARGIN + HEADER], [MARGIN + AREA[0] - OVERLAP, MARGIN + HEADER + AREA[1]], `stroke="#9ca3af" stroke-width="0.25" stroke-dasharray="2 1.5"`));
      if (r < rows - 1) out.push(line([MARGIN, MARGIN + HEADER + AREA[1] - OVERLAP], [MARGIN + AREA[0], MARGIN + HEADER + AREA[1] - OVERLAP], `stroke="#9ca3af" stroke-width="0.25" stroke-dasharray="2 1.5"`));
      if (c < cols - 1 || r < rows - 1) out.push(text([MARGIN + 1.5, MARGIN + HEADER + AREA[1] - 1.5], "Pointillés : recouvrement, à coller sous la page suivante", 2.4, "", "#6b7280"));
      for (const [a, b] of lines) {
        const kept = clipSegment(a, b, box);
        if (kept) out.push(line(page(kept[0]), page(kept[1]), `stroke="${INK}" stroke-width="0.35" stroke-linecap="round"`));
      }
      for (const h of holes(part)) {
        const at = sheet(h.center);
        if (at[0] < box[0] - h.radius || at[0] > box[2] + h.radius || at[1] < box[1] - h.radius || at[1] > box[3] + h.radius) continue;
        const p = page(at);
        const arm = Math.max(h.radius * 1.6, 4);
        out.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(h.radius)}" fill="none" stroke="${INK}" stroke-width="0.25"/>`);
        out.push(line([p[0] - arm, p[1]], [p[0] + arm, p[1]], `stroke="${INK}" stroke-width="0.18"`));
        out.push(line([p[0], p[1] - arm], [p[0], p[1] + arm], `stroke="${INK}" stroke-width="0.18"`));
        const depth = h.depth !== undefined && h.depth < part.thickness - 0.05 ? ` p${f(h.depth)}` : "";
        out.push(text([p[0] + arm * 0.6, p[1] - arm * 0.6], `Ø${f(h.radius * 2)}${depth}`, 2.2));
      }
      pages.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE[0]}mm" height="${PAGE[1]}mm" viewBox="0 0 ${PAGE[0]} ${PAGE[1]}">${out.join("")}</svg>`);
    }
  }
  return pages;
}
