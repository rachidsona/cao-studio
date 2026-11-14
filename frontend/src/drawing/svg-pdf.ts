/**
 * Une feuille de mise en plan (le SVG de svg.ts) en page PDF, à l'échelle exacte : traits avec leur épaisseur et leurs
 * pointillés, rectangles, cercles, chemins (droites et arcs), flèches pleines, textes (centrés, alignés, tournés, gras),
 * hachures des coupes. Lit le SVG que l'application écrit elle-même, pas un SVG quelconque. Pur.
 */
import { pdfNumber as n, pdfString, textWidth, writePdf, type PdfPage } from "./pdf-writer";

type Attrs = Record<string, string>;

const attrsOf = (text: string): Attrs => Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const num = (a: Attrs, k: string, d = 0) => (a[k] === undefined ? d : Number(a[k]));

/** "#rrggbb" (or "#rgb") as PDF colour components; null: none. */
function color(value: string | undefined): string | null {
  if (!value || value === "none" || value.startsWith("url(")) return null;
  let hex = value.replace("#", "");
  if (hex === "fff" || hex === "white") hex = "ffffff";
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "0 0 0";
  return [0, 2, 4].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(" ");
}

/** Line width, dashes and cap of an element. */
function strokeStyle(a: Attrs): string {
  const dash = a["stroke-dasharray"] ? `[${a["stroke-dasharray"].split(/[\s,]+/).map((v) => n(Number(v))).join(" ")}] 0 d` : "[] 0 d";
  return `${n(num(a, "stroke-width", 1))} w ${dash} ${a["stroke-linecap"] === "round" ? 1 : 0} J`;
}

/** A circle as four Bézier curves. */
function circlePath(cx: number, cy: number, r: number): string {
  const k = 0.5522847498 * r;
  return [
    `${n(cx + r)} ${n(cy)} m`,
    `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
    `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
    `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
    `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c h`,
  ].join(" ");
}

/** The arc of an SVG « A » (round, not turned) from `p` to `q`, as Bézier curves. */
function arcPath(p: [number, number], r: number, large: boolean, sweep: boolean, q: [number, number]): string {
  const [dx, dy] = [(q[0] - p[0]) / 2, (q[1] - p[1]) / 2];
  const half = Math.hypot(dx, dy);
  if (half < 1e-9) return "";
  const rr = Math.max(r, half);
  const h = Math.sqrt(Math.max(rr * rr - half * half, 0));
  const sign = large === sweep ? -1 : 1;
  const centre: [number, number] = [p[0] + dx + (sign * h * -dy) / half, p[1] + dy + (sign * h * dx) / half];
  const a0 = Math.atan2(p[1] - centre[1], p[0] - centre[0]);
  let a1 = Math.atan2(q[1] - centre[1], q[0] - centre[0]);
  if (sweep && a1 < a0) a1 += 2 * Math.PI;
  if (!sweep && a1 > a0) a1 -= 2 * Math.PI;
  const pieces = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
  const step = (a1 - a0) / pieces;
  const k = (4 / 3) * Math.tan(step / 4) * rr;
  const out: string[] = [];
  for (let i = 0; i < pieces; i++) {
    const [s, e] = [a0 + i * step, a0 + (i + 1) * step];
    const [sx, sy, ex, ey] = [centre[0] + rr * Math.cos(s), centre[1] + rr * Math.sin(s), centre[0] + rr * Math.cos(e), centre[1] + rr * Math.sin(e)];
    out.push(`${n(sx - k * Math.sin(s))} ${n(sy + k * Math.cos(s))} ${n(ex + k * Math.sin(e))} ${n(ey - k * Math.cos(e))} ${n(ex)} ${n(ey)} c`);
  }
  return out.join(" ");
}

/** An SVG path's « d » (absolute M, L, A, Z, as svg.ts writes them) as PDF path operators, and its bounds. */
function pathOps(d: string): { ops: string; box: [number, number, number, number] } {
  const tokens = d.match(/[MLAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const seen = (x: number, y: number) => {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  };
  let at: [number, number] = [0, 0];
  let command = "M";
  let i = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[MLAZ]$/i.test(tokens[i]!)) command = tokens[i++]!.toUpperCase();
    if (command === "Z") {
      out.push("h");
      continue;
    }
    if (command === "A") {
      const r = next();
      next();
      next();
      const large = next() === 1;
      const sweep = next() === 1;
      const q: [number, number] = [next(), next()];
      out.push(arcPath(at, r, large, sweep, q));
      seen(q[0] - r, q[1] - r);
      seen(q[0] + r, q[1] + r);
      at = q;
      continue;
    }
    const q: [number, number] = [next(), next()];
    if (Number.isNaN(q[0]) || Number.isNaN(q[1])) break;
    out.push(`${n(q[0])} ${n(q[1])} ${command === "M" ? "m" : "l"}`);
    seen(...q);
    at = q;
    if (command === "M") command = "L";
  }
  return { ops: out.join(" "), box };
}

/** Parallel lines across `box` at `angle` degrees, `gap` apart: the hatching of a cut face. */
function hatchLines(box: [number, number, number, number], angle: number, gap: number): string {
  const [cx, cy] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const reach = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + gap;
  const a = (angle * Math.PI) / 180;
  // The pattern's lines run along its y axis, turned by `angle`.
  const [ux, uy] = [-Math.sin(a), Math.cos(a)];
  const [vx, vy] = [Math.cos(a), Math.sin(a)];
  const out: string[] = [];
  for (let t = -reach; t <= reach; t += gap) out.push(`${n(cx + vx * t - ux * reach)} ${n(cy + vy * t - uy * reach)} m ${n(cx + vx * t + ux * reach)} ${n(cy + vy * t + uy * reach)} l`);
  return out.join(" ");
}

/** One sheet's SVG as a PDF page. */
export function svgToPdfPage(svg: string): PdfPage {
  const root = attrsOf(/<svg\b([^>]*)>/.exec(svg)?.[1] ?? "");
  const [, , width, height] = (root.viewBox ?? "0 0 297 210").split(/\s+/).map(Number) as [number, number, number, number];
  // The hatch patterns: their angle.
  const patterns = new Map<string, number>();
  for (const m of svg.matchAll(/<pattern\b([^>]*)>/g)) {
    const a = attrsOf(m[1]!);
    patterns.set(a.id!, Number(/rotate\((-?[\d.]+)/.exec(a.patternTransform ?? "")?.[1] ?? 45));
  }
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, "");
  const out: string[] = [];
  for (const m of body.matchAll(/<(line|rect|circle|path)\b([^>]*?)\/>|<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    if (m[3] !== undefined) {
      out.push(textOps(attrsOf(m[3]), unescapeXml(m[4] ?? "")));
      continue;
    }
    const a = attrsOf(m[2]!);
    const stroke = color(a.stroke);
    const fill = color(a.fill);
    let shape = "";
    if (m[1] === "line") shape = `${n(num(a, "x1"))} ${n(num(a, "y1"))} m ${n(num(a, "x2"))} ${n(num(a, "y2"))} l`;
    else if (m[1] === "rect") shape = `${n(num(a, "x"))} ${n(num(a, "y"))} ${n(num(a, "width"))} ${n(num(a, "height"))} re`;
    else if (m[1] === "circle") shape = circlePath(num(a, "cx"), num(a, "cy"), num(a, "r"));
    else {
      const { ops, box } = pathOps(a.d ?? "");
      const hatch = /^url\(#(.+)\)$/.exec(a.fill ?? "")?.[1];
      if (hatch !== undefined) {
        // A cut face: clipped to its outline, lines across it.
        out.push(`q ${ops} W${a["fill-rule"] === "evenodd" ? "*" : ""} n 0 0 0 RG 0.18 w [] 0 d ${hatchLines(box, patterns.get(hatch) ?? 45, 2.5)} S Q`);
        continue;
      }
      shape = ops;
    }
    if (!shape || (!stroke && !fill)) continue;
    // An element without a stroke attribute is only filled (the arrows).
    const paint = stroke && fill ? "B" : stroke ? "S" : a["fill-rule"] === "evenodd" ? "f*" : "f";
    out.push(`q ${stroke ? `${stroke} RG ${strokeStyle(a)} ` : ""}${fill ? `${fill} rg ` : ""}${shape} ${paint} Q`);
  }
  return { width, height, content: out.join("\n") };
}

/** A text, anchored and turned as SVG says. */
function textOps(a: Attrs, text: string): string {
  if (!text.trim()) return "";
  const size = num(a, "font-size", 3.5);
  const bold = a["font-weight"] === "bold";
  const turn = /rotate\((-?[\d.]+)/.exec(a.transform ?? "");
  const angle = ((turn ? Number(turn[1]) : 0) * Math.PI) / 180;
  const width = textWidth(text, size, bold);
  const shift = a["text-anchor"] === "middle" ? width / 2 : a["text-anchor"] === "end" ? width : 0;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const [x, y] = [num(a, "x") - shift * cos, num(a, "y") - shift * sin];
  return `q ${color(a.fill) ?? "0 0 0"} rg BT /${bold ? "F2" : "F1"} ${n(size)} Tf ${n(cos)} ${n(sin)} ${n(sin)} ${n(-cos)} ${n(x)} ${n(y)} Tm ${pdfString(text)} Tj ET Q`;
}

/** The sheets' SVGs as one PDF file (text, ASCII only). */
export function sheetsPdf(svgs: string[], title: string): string {
  return writePdf(svgs.map(svgToPdfPage), title);
}
