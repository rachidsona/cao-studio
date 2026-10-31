/**
 * Fiche de fabrication d'une pièce, en géométrie pure : la pièce mise à plat (contour exact, perçages) dessinée à
 * l'échelle dans un cadre, avec ses cotes hors tout, la position de chaque perçage cotée depuis le bord gauche (en haut)
 * et depuis le bas (à droite), les chants en trait épais orangé (L1 en bas, L2 en haut, l1 à gauche, l2 à droite), le
 * sens du fil en flèche, et le tableau des perçages (nombre, diamètre, profondeur). Le dessin est un SVG en
 * millimètres d'impression.
 */
import type { FlatEdge, FlatPart } from "../io/dxf";
import type { CutRow } from "./cut-list";

type P2 = [number, number];

/** Size of the drawing (mm on paper) and the room kept around the part for the dimensions. */
const PAPER: P2 = [250, 150];
const ROOM = 26;

export interface HoleGroup {
  diameter: number;
  /** Depth from the face drawn; the thickness when it goes through. */
  depth: number;
  through: boolean;
  count: number;
}

/** The holes of a part, grouped by diameter and depth (biggest first). A circle alone is the outline of a round part. */
export function holeGroups(part: FlatPart): HoleGroup[] {
  if (part.edges.length === 1) return [];
  const groups = new Map<string, HoleGroup>();
  for (const e of part.edges) {
    if (e.kind !== "circle") continue;
    const diameter = Number((e.radius * 2).toFixed(1));
    const depth = Number((e.depth ?? part.thickness).toFixed(1));
    const through = depth >= part.thickness - 0.05;
    const key = `${diameter}|${through ? "t" : depth}`;
    const g = groups.get(key) ?? { diameter, depth, through, count: 0 };
    g.count++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.diameter - a.diameter || b.depth - a.depth);
}

/** "4 × Ø5 prof. 12", "2 × Ø8 traversant". */
export function holeText(g: HoleGroup, num: (mm: number) => string = String): string {
  return `${g.count} × Ø${num(g.diameter)} ${g.through ? "traversant" : `prof. ${num(g.depth)}`}`;
}

/** The distinct positions (rounded to 0.1 mm) of the holes' centres along x and along y, from the part's corner. */
export function holePositions(part: FlatPart): { xs: number[]; ys: number[] } {
  const circles = part.edges.length === 1 ? [] : part.edges.filter((e): e is Extract<FlatEdge, { kind: "circle" }> => e.kind === "circle");
  const distinct = (values: number[]) => [...new Set(values.map((v) => Number(v.toFixed(1))))].sort((a, b) => a - b);
  return { xs: distinct(circles.map((c) => c.center[0])), ys: distinct(circles.map((c) => c.center[1])) };
}

const f = (v: number) => Number(v.toFixed(2)).toString();

/** The part drawn to scale with its dimensions, edge bands and grain, as an SVG of `PAPER` mm. */
export function partSheetSvg(part: FlatPart, row: Pick<CutRow, "edges" | "grain"> | null, num: (mm: number) => string = (mm) => f(mm)): string {
  const scale = Math.min((PAPER[0] - 2 * ROOM) / Math.max(part.width, 1), (PAPER[1] - 2 * ROOM) / Math.max(part.height, 1));
  const [w, h] = [part.width * scale, part.height * scale];
  const [ox, oy] = [(PAPER[0] - w) / 2, (PAPER[1] - h) / 2];
  // Paper y goes down: the part's y goes up from its bottom edge.
  const at = ([x, y]: P2): P2 => [ox + x * scale, oy + h - y * scale];
  const out: string[] = [];
  const line = (a: P2, b: P2, style: string) => out.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" ${style}/>`);
  const text = (p: P2, s: string, style = "", rotate = false) =>
    out.push(`<text x="${f(p[0])}" y="${f(p[1])}" ${rotate ? `transform="rotate(-90 ${f(p[0])} ${f(p[1])})"` : ""} ${style}>${s}</text>`);

  // The outline, then the holes.
  for (const e of part.edges) {
    if (e.kind === "line") line(at(e.a), at(e.b), 'class="cut"');
    else if (e.kind === "circle") {
      const [cx, cy] = at(e.center);
      out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.max(e.radius * scale, 0.4))}" class="${part.edges.length === 1 ? "cut" : "hole"}"/>`);
    } else {
      const p = (t: number): P2 => at([e.center[0] + e.radius * Math.cos(t), e.center[1] + e.radius * Math.sin(t)]);
      const sweep = (((e.end - e.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const [a, b] = [p(e.start), p(e.end)];
      // Counter-clockwise in the part is clockwise on paper (y flipped): sweep flag 0.
      out.push(`<path d="M${f(a[0])} ${f(a[1])} A${f(e.radius * scale)} ${f(e.radius * scale)} 0 ${sweep > Math.PI ? 1 : 0} 0 ${f(b[0])} ${f(b[1])}" class="cut"/>`);
    }
  }

  // Edge bands: a thick line just outside the side that carries one.
  if (row) {
    const d = 1.6;
    const bands: [boolean, P2, P2, string, P2][] = [
      [row.edges.length1, [ox, oy + h + d], [ox + w, oy + h + d], "L1", [ox + w + 2, oy + h + d + 1]],
      [row.edges.length2, [ox, oy - d], [ox + w, oy - d], "L2", [ox + w + 2, oy - d + 1]],
      [row.edges.width1, [ox - d, oy], [ox - d, oy + h], "l1", [ox - d - 1, oy - 2]],
      [row.edges.width2, [ox + w + d, oy], [ox + w + d, oy + h], "l2", [ox + w + d - 1, oy - 2]],
    ];
    for (const [on, a, b, name, label] of bands) {
      if (!on) continue;
      line(a, b, 'class="band"');
      text(label, name, 'class="band-label"');
    }
  }

  // Overall dimensions: the length under the part, the width on its left.
  const below = oy + h + 12;
  line([ox, oy + h + 3], [ox, below + 2], 'class="ext"');
  line([ox + w, oy + h + 3], [ox + w, below + 2], 'class="ext"');
  line([ox, below], [ox + w, below], 'class="dim" marker-start="url(#tick)" marker-end="url(#tick)"');
  text([ox + w / 2, below - 1.2], num(part.width), 'class="dim-text" text-anchor="middle"');
  const left = ox - 12;
  line([ox - 3, oy], [left - 2, oy], 'class="ext"');
  line([ox - 3, oy + h], [left - 2, oy + h], 'class="ext"');
  line([left, oy], [left, oy + h], 'class="dim" marker-start="url(#tick)" marker-end="url(#tick)"');
  text([left - 1.2, oy + h / 2], num(part.height), 'class="dim-text" text-anchor="middle"', true);

  // Hole positions: from the left edge along the top, from the bottom edge along the right side.
  const { xs, ys } = holePositions(part);
  // Clear of the edge bands (drawn 1.6 mm out).
  const top = oy - 7;
  for (const x of xs) {
    const px = ox + x * scale;
    line([px, oy - 3], [px, top], 'class="ord"');
    text([px + 0.9, top - 1], num(x), 'class="ord-text"', true);
  }
  const right = ox + w + 7;
  for (const y of ys) {
    const py = oy + h - y * scale;
    line([ox + w + 3, py], [right, py], 'class="ord"');
    text([right + 1, py + 1], num(y), 'class="ord-text"');
  }

  // The grain: a double arrow along it, in the middle of the part.
  if (row && row.grain !== "none") {
    const [cx, cy] = [ox + w / 2, oy + h / 2];
    const half = Math.min(row.grain === "length" ? w : h, 60) * 0.3;
    const [a, b]: [P2, P2] = row.grain === "length" ? [[cx - half, cy], [cx + half, cy]] : [[cx, cy + half], [cx, cy - half]];
    line(a, b, 'class="grain" marker-start="url(#arrow)" marker-end="url(#arrow)"');
    text(row.grain === "length" ? [cx, cy - 2] : [cx - 2, cy], "fil", 'class="grain-text" text-anchor="middle"', row.grain !== "length");
  }

  const defs =
    '<defs><marker id="tick" viewBox="0 0 4 4" refX="2" refY="2" markerWidth="4" markerHeight="4" orient="auto"><path d="M2 0V4" stroke="#111" stroke-width="0.6"/></marker>' +
    '<marker id="arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L6 3L0 6z" fill="#0369a1"/></marker></defs>';
  const style =
    "<style>.cut{fill:none;stroke:#111;stroke-width:0.45}.hole{fill:#fee2e2;stroke:#dc2626;stroke-width:0.3}.band{stroke:#f59e0b;stroke-width:1.2}" +
    ".band-label{font-size:3px;fill:#b45309;font-weight:700}.ext{stroke:#6b7280;stroke-width:0.15}.dim{stroke:#111;stroke-width:0.2}" +
    ".dim-text{font-size:3.4px;fill:#111}.ord{stroke:#dc2626;stroke-width:0.15}.ord-text{font-size:2.4px;fill:#dc2626}" +
    ".grain{stroke:#0369a1;stroke-width:0.4}.grain-text{font-size:3px;fill:#0369a1}</style>";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAPER[0]} ${PAPER[1]}" width="${PAPER[0]}mm" height="${PAPER[1]}mm" font-family="system-ui,sans-serif">${defs}${style}${out.join("")}</svg>`;
}
