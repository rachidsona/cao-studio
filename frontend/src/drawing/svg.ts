/**
 * Une feuille de mise en plan en SVG (millimètres du papier) : cadre et cartouche, vues (traits vus, cachés en
 * pointillés, faces coupées hachurées), traits de coupe et cercles de détail sur les vues mères, cotes et annotations,
 * nomenclature, dessin 2D libre. Chaque élément porte `data-id` : l'éditeur de feuille s'en sert pour la sélection.
 */
import { drawAnnotation, TEXT_SIZE, type Drawn } from "./annotations";
import type { SheetLayout } from "./layout";
import { FORMATS, FRAME_ID, FRAME_MARGIN, TITLE_ID, scaleText, titleBox, type DrawingSheet, type LineStyle, type Sketch2D, type Vec2 } from "./model";

/** A row of the parts list. */
export interface BomRow {
  item: number;
  name: string;
  quantity: number;
  material: string;
  size: string;
  bodies: string[];
}

export interface RenderOptions {
  format: (mm: number) => string;
  bom: BomRow[];
  /** Sheet number and count (for the title block). */
  page: [number, number];
  selected?: ReadonlySet<string>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const f = (n: number) => n.toFixed(2);
const INK = "#111827";
const DIM = "#1d4ed8";
const PICKED = "#ea580c";

export const STYLES: Record<LineStyle, string> = {
  solid: `stroke="${INK}" stroke-width="0.35" stroke-linecap="round"`,
  hidden: `stroke="${INK}" stroke-width="0.25" stroke-dasharray="2 1"`,
  axis: `stroke="${INK}" stroke-width="0.18" stroke-dasharray="6 1 1 1"`,
  thin: `stroke="${INK}" stroke-width="0.18"`,
};

const line = (a: Vec2, b: Vec2, style: string) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" ${style}/>`;
const text = (at: Vec2, t: string, extra = "", size = TEXT_SIZE) => `<text x="${f(at[0])}" y="${f(at[1])}" font-size="${Number(size) || TEXT_SIZE}" font-family="Helvetica, Arial, sans-serif" ${extra}>${esc(t)}</text>`;

/** An annotation's lines, arrows, texts, circles and arcs as SVG. */
export function drawnSvg(d: Drawn, color: string): string {
  const out: string[] = [];
  const style = `stroke="${color}" stroke-width="0.18" fill="none"`;
  // A dimension's own lines: thin or thick, solid or dashed.
  // A dimension's lines thin or thick; its extension lines solid or in short dashes, its own line always solid.
  const lines = d.style ? `stroke="${color}" stroke-width="${d.style.width}" fill="none"` : style;
  const extensions = d.style?.dashed ? `${lines} stroke-dasharray="2 1"` : lines;
  for (const [a, b] of d.lines) out.push(line(a, b, lines));
  for (const [a, b] of d.extensions ?? []) out.push(line(a, b, extensions));
  for (const { tip, dir } of d.arrows) {
    const [l, w] = [2.5, 0.8];
    const back: Vec2 = [tip[0] - dir[0] * l, tip[1] - dir[1] * l];
    const side: Vec2 = [-dir[1] * w, dir[0] * w];
    out.push(`<path d="M${f(tip[0])} ${f(tip[1])}L${f(back[0] + side[0])} ${f(back[1] + side[1])}L${f(back[0] - side[0])} ${f(back[1] - side[1])}Z" fill="${color}"/>`);
  }
  for (const c of d.circles) out.push(`<circle cx="${f(c.center[0])}" cy="${f(c.center[1])}" r="${f(c.radius)}" ${c.radius < 1 ? `fill="${color}"` : style}/>`);
  for (const a of d.arcs) {
    const [p, q] = [a.from, a.to].map((t) => [a.center[0] + a.radius * Math.cos(t), a.center[1] + a.radius * Math.sin(t)]) as [Vec2, Vec2];
    out.push(`<path d="M${f(p[0])} ${f(p[1])}A${f(a.radius)} ${f(a.radius)} 0 ${a.to - a.from > Math.PI ? 1 : 0} 1 ${f(q[0])} ${f(q[1])}" ${lines}/>`);
  }
  for (const t of d.texts) out.push(text(t.at, t.text, `fill="${color}" text-anchor="${t.anchor}" transform="rotate(${t.angle.toFixed(2)} ${f(t.at[0])} ${f(t.at[1])})"`, t.size));
  return out.join("");
}

/** A free 2D element on the paper (real mm at the sketch's scale, y up from its origin). */
export function sketchSvg(sheet: DrawingSheet, item: Sketch2D, style = STYLES[item.style]): string {
  const { scale, origin } = sheet.sketch;
  const p = (v: Vec2): Vec2 => [origin[0] + v[0] / scale, origin[1] - v[1] / scale];
  if (item.kind === "line") return line(p(item.a), p(item.b), style);
  if (item.kind === "rect") {
    const [a, b] = [p(item.a), p(item.b)];
    return `<rect x="${f(Math.min(a[0], b[0]))}" y="${f(Math.min(a[1], b[1]))}" width="${f(Math.abs(b[0] - a[0]))}" height="${f(Math.abs(b[1] - a[1]))}" fill="none" ${style}/>`;
  }
  const c = p(item.center);
  return `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(item.radius / scale)}" fill="none" ${style}/>`;
}

/** The parts list as a table whose top left corner is `at`; its rows of 6 mm. */
export function bomSvg(at: Vec2, rows: BomRow[]): { svg: string; size: Vec2 } {
  const widths = [12, 62, 12, 42, 46];
  const heads = ["Rep.", "Désignation", "Qté", "Matière", "Dimensions"];
  const h = 6;
  const out: string[] = [];
  const width = widths.reduce((a, b) => a + b, 0);
  const all = [heads, ...rows.map((r) => [String(r.item), r.name, String(r.quantity), r.material, r.size])];
  all.forEach((cells, i) => {
    const y = at[1] + i * h;
    out.push(`<rect x="${f(at[0])}" y="${f(y)}" width="${width}" height="${h}" fill="${i === 0 ? "#f3f4f6" : "none"}" stroke="${INK}" stroke-width="0.25"/>`);
    let x = at[0];
    cells.forEach((c, k) => {
      const clipped = c.length > widths[k]! / 1.9 ? `${c.slice(0, Math.floor(widths[k]! / 1.9) - 1)}…` : c;
      out.push(text([x + 1.5, y + 4.2], clipped, `fill="${INK}"${i === 0 ? ' font-weight="bold"' : ""}`, 3));
      x += widths[k]!;
      if (k < cells.length - 1) out.push(line([x, y], [x, y + h], `stroke="${INK}" stroke-width="0.25"`));
    });
  });
  return { svg: out.join(""), size: [width, all.length * h] };
}

function titleBlock(sheet: DrawingSheet, options: RenderOptions): string {
  const [[x, y], [right]] = titleBox(sheet);
  const bw = right - x;
  const t = sheet.title;
  const ink = options.selected?.has(TITLE_ID) ? PICKED : INK;
  const scale = sheet.views[0] ? scaleText(sheet.views[0].scale) : sheet.sketch.items.length ? scaleText(sheet.sketch.scale) : "—";
  const cell = (cx: number, cy: number, cw: number, ch: number, label: string, value: string, big = false) =>
    `<rect x="${f(cx)}" y="${f(cy)}" width="${f(cw)}" height="${f(ch)}" fill="none" stroke="${ink}" stroke-width="0.35"/>` +
    text([cx + 1.2, cy + 2.6], label, 'fill="#6b7280"', 2) +
    text([cx + 1.2, cy + ch - 1.6], value, `fill="${INK}"${big ? ' font-weight="bold"' : ""}`, big ? 5 : 3.2);
  return [
    `<g data-id="${TITLE_ID}">`,
    cell(x, y, bw, 12, "Titre", t.title, true),
    cell(x, y + 12, 60, 10, "Société", t.company),
    cell(x + 60, y + 12, 60, 10, "Dessiné par", t.author),
    cell(x + 120, y + 12, 60, 10, "Date", t.date),
    cell(x, y + 22, 50, 10, "Matière", t.material),
    cell(x + 50, y + 22, 30, 10, "Échelle", scale),
    cell(x + 80, y + 22, 30, 10, "Format", sheet.format),
    cell(x + 110, y + 22, 40, 10, "N° de plan", t.number),
    cell(x + 150, y + 22, 30, 10, "Feuille", `${options.page[0]} / ${options.page[1]}`),
    text([x, y - 2], sheet.projection === "first" ? "Projection européenne" : "Projection américaine", 'fill="#6b7280"', 2.5),
    `</g>`,
  ].join("");
}

/** The whole sheet as an SVG document. */
export function renderSheet(sheet: DrawingSheet, layout: SheetLayout, options: RenderOptions): string {
  const [w, h] = FORMATS[sheet.format];
  const out: string[] = [];
  const picked = (id: string) => options.selected?.has(id) ?? false;
  const hatch: string[] = [];
  const off = new Set(sheet.hiddenItems ?? []);
  if (!off.has(FRAME_ID)) out.push(`<g data-id="${FRAME_ID}"><rect x="${FRAME_MARGIN}" y="${FRAME_MARGIN}" width="${w - 2 * FRAME_MARGIN}" height="${h - 2 * FRAME_MARGIN}" fill="none" stroke="${picked(FRAME_ID) ? PICKED : INK}" stroke-width="0.6"/></g>`);
  if (!off.has(TITLE_ID)) out.push(titleBlock(sheet, options));

  for (const view of sheet.views) {
    if (off.has(view.id)) continue;
    const g = layout.geometry(sheet, view);
    const p = (q: Vec2) => layout.toPaper(sheet, view, q);
    const parts: string[] = [];
    // Cut faces: hatched at 45°, the next body the other way.
    g.hatches.forEach((body, k) => {
      const id = `hatch-${view.id}-${k}`;
      hatch.push(`<pattern id="${id}" width="2.5" height="2.5" patternUnits="userSpaceOnUse" patternTransform="rotate(${k % 2 ? -45 : 45})"><line x1="0" y1="0" x2="0" y2="2.5" stroke="${INK}" stroke-width="0.18"/></pattern>`);
      const d = body.map((loop) => `M${loop.map((q) => p(q).map(f).join(" ")).join("L")}Z`).join("");
      parts.push(`<path d="${d}" fill="url(#${id})" fill-rule="evenodd" stroke="none"/>`);
    });
    for (const l of g.lines) parts.push(line(p(l.a), p(l.b), picked(view.id) ? `stroke="${PICKED}" stroke-width="0.35"` : STYLES[l.hidden ? "hidden" : "solid"]));
    // Marks of the sections and details taken from this view.
    for (const child of sheet.views.filter((v) => v.parent === view.id && !off.has(v.id))) {
      if (child.cut) {
        const [a, b] = [p(child.cut.a), p(child.cut.b)];
        const d: Vec2 = [(b[0] - a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1), (b[1] - a[1]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1)];
        // The arrows point where the section looks (away from the removed side).
        let look: Vec2 = [d[1], -d[0]];
        if (child.cut.flip) look = [-look[0], -look[1]];
        parts.push(line(a, b, `stroke="${INK}" stroke-width="0.25" stroke-dasharray="8 1.5 1 1.5"`));
        const mark: Drawn = { lines: [], arrows: [], texts: [], circles: [], arcs: [] };
        for (const end of [a, b]) {
          mark.lines.push([end, [end[0] + look[0] * 6, end[1] + look[1] * 6]]);
          mark.arrows.push({ tip: [end[0] + look[0] * 6, end[1] + look[1] * 6], dir: look });
          mark.texts.push({ at: [end[0] + look[0] * 9 + d[0] * 2, end[1] + look[1] * 9 + 1.5], text: child.cut.letter, angle: 0, anchor: "middle", size: 4 });
        }
        parts.push(drawnSvg(mark, INK));
      }
      if (child.detail) {
        const c = p(child.detail.center);
        const r = child.detail.radius / view.scale;
        parts.push(`<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r)}" fill="none" stroke="${INK}" stroke-width="0.25" stroke-dasharray="3 1"/>`);
        parts.push(text([c[0] + r * 0.75, c[1] - r * 0.75 - 1], child.detail.letter, `fill="${INK}" font-weight="bold"`, 4));
      }
    }
    if (view.kind === "detail" && view.detail) {
      const c = p(view.detail.center);
      parts.push(`<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(view.detail.radius / view.scale)}" fill="none" ${STYLES.thin}/>`);
    }
    const label = view.kind === "section" && view.cut ? `COUPE ${view.cut.letter}-${view.cut.letter}` : view.kind === "detail" && view.detail ? `DÉTAIL ${view.detail.letter}` : view.label;
    parts.push(text(layout.labelAt(sheet, view), `${label} (${scaleText(view.scale)})`, `fill="${picked(view.id) ? PICKED : INK}" text-anchor="middle" font-weight="bold"`, 3.5));
    out.push(`<g data-id="${esc(view.id)}">${parts.join("")}</g>`);
  }

  const itemOf = (body: string) => options.bom.find((r) => r.bodies.includes(body))?.item ?? null;
  for (const a of sheet.annotations) {
    if (off.has(a.id)) continue;
    if (a.kind === "bom") {
      out.push(`<g data-id="${esc(a.id)}">${bomSvg(a.at, options.bom).svg}</g>`);
      continue;
    }
    out.push(`<g data-id="${esc(a.id)}">${drawnSvg(drawAnnotation(sheet, layout, a, options.format, itemOf), picked(a.id) ? PICKED : a.kind === "text" || a.kind === "note" || a.kind === "balloon" ? INK : DIM)}</g>`);
  }
  for (const item of sheet.sketch.items.filter((i) => !off.has(i.id))) out.push(`<g data-id="${esc(item.id)}">${sketchSvg(sheet, item, picked(item.id) ? `stroke="${PICKED}" stroke-width="0.4"` : undefined)}</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><defs>${hatch.join("")}</defs><rect width="${w}" height="${h}" fill="#fff"/>${out.join("")}</svg>`;
}
