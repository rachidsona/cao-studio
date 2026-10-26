/**
 * Mise en plan: the model as a technical drawing sheet. Three orthographic
 * views (front, right side, top, in third-angle projection as on French
 * plans), edges only, hidden edges dashed, the overall dimensions, a title
 * block and a scale taken from the standard series. Pure: meshes in, SVG
 * text out, so it prints to paper or PDF and saves as a file.
 */
export interface MeshInput {
  id: string;
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** Edge segments, six numbers each (two end points). */
  edges: ArrayLike<number>;
}

type P3 = [number, number, number];
export type ViewName = "front" | "right" | "top";

interface ViewSpec {
  label: string;
  /** Screen right and up directions, and the direction toward the viewer (model axes). */
  right: P3;
  up: P3;
  toViewer: P3;
}

export const VIEW_SPECS: Record<ViewName, ViewSpec> = {
  front: { label: "Vue de face", right: [1, 0, 0], up: [0, 0, 1], toViewer: [0, -1, 0] },
  right: { label: "Vue de droite", right: [0, 1, 0], up: [0, 0, 1], toViewer: [1, 0, 0] },
  top: { label: "Vue de dessus", right: [1, 0, 0], up: [0, 1, 0], toViewer: [0, 0, 1] },
};

export interface Line2 {
  a: [number, number];
  b: [number, number];
  hidden: boolean;
}

export interface Projection {
  lines: Line2[];
  min: [number, number];
  max: [number, number];
}

const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Depth margin (mm): a surface this much nearer to the eye hides what is behind it. */
const HIDING = 0.3;

interface Tri {
  x: [number, number, number];
  y: [number, number, number];
  d: [number, number, number];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function trianglesOf(meshes: MeshInput[], spec: ViewSpec): Tri[] {
  const out: Tri[] = [];
  for (const m of meshes) {
    for (let i = 0; i + 2 < m.indices.length; i += 3) {
      const pts = [0, 1, 2].map((k) => {
        const v = (m.indices[i + k] as number) * 3;
        const p: P3 = [m.vertices[v] as number, m.vertices[v + 1] as number, m.vertices[v + 2] as number];
        return { x: dot(p, spec.right), y: dot(p, spec.up), d: dot(p, spec.toViewer) };
      }) as { x: number; y: number; d: number }[];
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      out.push({
        x: [xs[0]!, xs[1]!, xs[2]!],
        y: [ys[0]!, ys[1]!, ys[2]!],
        d: [pts[0]!.d, pts[1]!.d, pts[2]!.d],
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      });
    }
  }
  return out;
}

/** True when a surface lies in front of the point (x, y, depth d) as seen by the viewer. */
function covered(tris: Tri[], x: number, y: number, d: number): boolean {
  for (const t of tris) {
    if (x < t.minX || x > t.maxX || y < t.minY || y > t.maxY) continue;
    const det = (t.y[1] - t.y[2]) * (t.x[0] - t.x[2]) + (t.x[2] - t.x[1]) * (t.y[0] - t.y[2]);
    if (Math.abs(det) < 1e-12) continue; // seen edge-on
    const l0 = ((t.y[1] - t.y[2]) * (x - t.x[2]) + (t.x[2] - t.x[1]) * (y - t.y[2])) / det;
    const l1 = ((t.y[2] - t.y[0]) * (x - t.x[2]) + (t.x[0] - t.x[2]) * (y - t.y[2])) / det;
    const l2 = 1 - l0 - l1;
    if (l0 < 1e-6 || l1 < 1e-6 || l2 < 1e-6) continue;
    if (l0 * t.d[0] + l1 * t.d[1] + l2 * t.d[2] > d + HIDING) return true;
  }
  return false;
}

/** The edges of the meshes seen from one side, split into visible and hidden runs. */
export function projectView(meshes: MeshInput[], name: ViewName, showHidden = true): Projection {
  const spec = VIEW_SPECS[name];
  const tris = trianglesOf(meshes, spec);
  const found = new Map<string, Line2>();
  const key = (n: number) => Math.round(n * 100);
  for (const m of meshes) {
    for (let i = 0; i + 5 < m.edges.length; i += 6) {
      const a: P3 = [m.edges[i] as number, m.edges[i + 1] as number, m.edges[i + 2] as number];
      const b: P3 = [m.edges[i + 3] as number, m.edges[i + 4] as number, m.edges[i + 5] as number];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const parts = Math.max(1, Math.min(48, Math.ceil(length / 8)));
      const at = (t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      // Runs of the same visibility along the edge.
      let runStart = 0;
      let state: boolean | null = null;
      const flush = (end: number, hidden: boolean) => {
        const p = at(runStart / parts);
        const q = at(end / parts);
        const line: Line2 = { a: [dot(p, spec.right), dot(p, spec.up)], b: [dot(q, spec.right), dot(q, spec.up)], hidden };
        if (Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]) < 0.01) return;
        if (hidden && !showHidden) return;
        const ends = [`${key(line.a[0])},${key(line.a[1])}`, `${key(line.b[0])},${key(line.b[1])}`].sort();
        const id = ends.join("|");
        const known = found.get(id);
        if (!known || (known.hidden && !hidden)) found.set(id, line);
      };
      for (let k = 0; k < parts; k++) {
        const mid = at((k + 0.5) / parts);
        const hidden = covered(tris, dot(mid, spec.right), dot(mid, spec.up), dot(mid, spec.toViewer));
        if (state === null) state = hidden;
        else if (hidden !== state) {
          flush(k, state);
          runStart = k;
          state = hidden;
        }
      }
      if (state !== null) flush(parts, state);
    }
  }
  const lines = [...found.values()];
  const xs = lines.flatMap((l) => [l.a[0], l.b[0]]);
  const ys = lines.flatMap((l) => [l.a[1], l.b[1]]);
  return { lines, min: [Math.min(...xs, 0), Math.min(...ys, 0)], max: [Math.max(...xs, 0), Math.max(...ys, 0)] };
}

// ---- the sheet ------------------------------------------------------------------------------

export const SHEETS = { A4: [297, 210], A3: [420, 297] } as const;
export type SheetName = keyof typeof SHEETS;

/** Standard reductions, smallest first (1:1 is full size). */
export const SCALES = [1, 2, 2.5, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];

export interface SheetOptions {
  sheet: SheetName;
  /** Fixed denominator (1:n), or null for the largest scale that fits. */
  scale: number | null;
  hidden: boolean;
  title: string;
  /** Text of a length in the display unit. */
  format: (mm: number) => string;
  date?: string;
}

export interface Sheet {
  svg: string;
  scale: number;
  /** The projections the sheet was drawn from. */
  views: Record<ViewName, Projection>;
}

const GAP = 28;
const MARGIN = 10;
const TITLE_HEIGHT = 22;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function fitScale(sheet: [number, number], width: number, depth: number, height: number): number {
  const availableW = sheet[0] - 2 * MARGIN - 40;
  const availableH = sheet[1] - 2 * MARGIN - TITLE_HEIGHT - 30;
  return SCALES.find((n) => (width + depth) / n + GAP <= availableW && (height + depth) / n + GAP <= availableH) ?? (SCALES.at(-1) as number);
}

/** The drawing sheet as an SVG document (paper millimetres). */
export function buildSheet(meshes: MeshInput[], options: SheetOptions): Sheet {
  const views = { front: projectView(meshes, "front", options.hidden), right: projectView(meshes, "right", options.hidden), top: projectView(meshes, "top", options.hidden) };
  const size = (p: Projection): [number, number] => [p.max[0] - p.min[0], p.max[1] - p.min[1]];
  const [width, height] = size(views.front);
  const depth = size(views.top)[1];
  const [sw, sh] = SHEETS[options.sheet];
  const scale = options.scale ?? fitScale([sw, sh], width, depth, height);
  const k = 1 / scale;
  // The three views, centred on the sheet: front top left, right beside it, top under it.
  const totalW = width * k + GAP + depth * k;
  const totalH = height * k + GAP + depth * k;
  const x0 = (sw - totalW) / 2;
  const y0 = MARGIN + 8 + (sh - 2 * MARGIN - TITLE_HEIGHT - totalH) / 2;
  const origins: Record<ViewName, [number, number]> = {
    front: [x0, y0],
    right: [x0 + width * k + GAP, y0],
    top: [x0, y0 + height * k + GAP],
  };
  const out: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, extra = "") => out.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" ${extra}/>`);
  const text = (x: number, y: number, t: string, extra = "") => out.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="3.2" font-family="sans-serif" ${extra}>${esc(t)}</text>`);

  // Frame and title block.
  out.push(`<rect x="${MARGIN}" y="${MARGIN}" width="${sw - 2 * MARGIN}" height="${sh - 2 * MARGIN}" fill="none" stroke="#000" stroke-width="0.5"/>`);
  const bx = sw - MARGIN - 130;
  const by = sh - MARGIN - TITLE_HEIGHT;
  out.push(`<rect x="${bx}" y="${by}" width="130" height="${TITLE_HEIGHT}" fill="none" stroke="#000" stroke-width="0.35"/>`);
  text(bx + 3, by + 7, options.title, 'font-weight="bold" font-size="4.2"');
  text(bx + 3, by + 13.5, `Échelle 1:${scale}  ·  Format ${options.sheet}  ·  Cotes en ${options.format(1000).replace(/^[\d.,\s]+/, "") || "mm"}`);
  text(bx + 3, by + 19, `Projection européenne${options.date ? `  ·  ${options.date}` : ""}`, 'fill="#555"');

  for (const name of ["front", "right", "top"] as ViewName[]) {
    const p = views[name];
    const [ox, oy] = origins[name];
    const [w, h] = size(p);
    const px = (x: number) => ox + (x - p.min[0]) * k;
    const py = (y: number) => oy + (p.max[1] - y) * k;
    for (const l of p.lines) {
      const style = l.hidden ? 'stroke="#777" stroke-width="0.18" stroke-dasharray="1.6 1"' : 'stroke="#000" stroke-width="0.35" stroke-linecap="round"';
      line(px(l.a[0]), py(l.a[1]), px(l.b[0]), py(l.b[1]), style);
    }
    text(ox, oy - 3, VIEW_SPECS[name].label, 'font-weight="bold"');
    // Overall dimensions: width under the view, height at the side (left for face and top, right for the side view).
    const dim = (x1: number, y1: number, x2: number, y2: number, label: string, vertical: boolean) => {
      const style = 'stroke="#0b5ed7" stroke-width="0.18"';
      line(x1, y1, x2, y2, style);
      const tick = 1.6;
      if (vertical) {
        line(x1 - tick, y1 + tick, x1 + tick, y1 - tick, style);
        line(x2 - tick, y2 + tick, x2 + tick, y2 - tick, style);
        out.push(`<text transform="translate(${(x1 - 1.2).toFixed(2)} ${((y1 + y2) / 2).toFixed(2)}) rotate(-90)" font-size="3.2" font-family="sans-serif" text-anchor="middle" fill="#0b5ed7">${esc(label)}</text>`);
      } else {
        line(x1 - tick, y1 + tick, x1 + tick, y1 - tick, style);
        line(x2 - tick, y2 + tick, x2 + tick, y2 - tick, style);
        text((x1 + x2) / 2, y1 - 1.2, label, 'text-anchor="middle" fill="#0b5ed7"');
      }
    };
    const below = oy + h * k + 7;
    line(px(p.min[0]), oy + h * k + 1, px(p.min[0]), below + 1.5, 'stroke="#0b5ed7" stroke-width="0.12"');
    line(px(p.max[0]), oy + h * k + 1, px(p.max[0]), below + 1.5, 'stroke="#0b5ed7" stroke-width="0.12"');
    dim(px(p.min[0]), below, px(p.max[0]), below, options.format(w), false);
    const side = name === "right" ? ox + w * k + 7 : ox - 7;
    const from = name === "right" ? ox + w * k + 1 : ox - 1;
    line(from, py(p.max[1]), side + (name === "right" ? 1.5 : -1.5), py(p.max[1]), 'stroke="#0b5ed7" stroke-width="0.12"');
    line(from, py(p.min[1]), side + (name === "right" ? 1.5 : -1.5), py(p.min[1]), 'stroke="#0b5ed7" stroke-width="0.12"');
    dim(side, py(p.max[1]), side, py(p.min[1]), options.format(h), true);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}mm" height="${sh}mm" viewBox="0 0 ${sw} ${sh}"><rect width="${sw}" height="${sh}" fill="#fff"/>${out.join("")}</svg>`;
  return { svg, scale, views };
}
