/**
 * Lecture d'un plan DXF (ASCII, celui d'un architecte, d'un client ou d'un autre logiciel) pour l'esquisse : lignes,
 * cercles, arcs, polylignes (avec leurs arrondis « bulge »), ellipses et splines (approchées par des segments), dans
 * l'unité du fichier ($INSUNITS) ramenée en millimètres. Le reste (textes, cotes, blocs, hachures) est compté et laissé
 * de côté. Seul le plan XY compte (Z ignoré). Pur.
 */
export type P2 = [number, number];

export type ImportedShape =
  | { kind: "line"; a: P2; b: P2 }
  | { kind: "circle"; center: P2; radius: number }
  /** Counter-clockwise from `start` to `end` (radians). */
  | { kind: "arc"; center: P2; radius: number; start: number; end: number };

export interface DxfImport {
  shapes: ImportedShape[];
  /** Millimetres per unit of the file. */
  scale: number;
  unitName: string;
  /** Entities left out, by type ("TEXT" → 4). */
  skipped: Record<string, number>;
}

const UNITS: Record<number, [number, string]> = {
  1: [25.4, "pouces"],
  2: [304.8, "pieds"],
  4: [1, "mm"],
  5: [10, "cm"],
  6: [1000, "m"],
};

/**
 * A DXF comes from anyone: what it says is bounded (audit of 10/11/2026, L3). Its file at most MAX_DXF_BYTES, at most
 * MAX_SHAPES shapes, coordinates finite within ±COORD_LIMIT mm; an ellipse is at most one turn.
 */
export const MAX_DXF_BYTES = 20 * 1024 * 1024;
const MAX_SHAPES = 200_000;
const COORD_LIMIT = 1e7;

/** The pairs (group code, value) of a DXF text. */
function pairs(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (Number.isFinite(code)) out.push([code, lines[i + 1]!.trim()]);
  }
  return out;
}

/** The segment from a to b bulging by `bulge` (tan of a quarter of the arc's angle, positive counter-clockwise). */
export function bulgeArc(a: P2, b: P2, bulge: number): ImportedShape {
  if (Math.abs(bulge) < 1e-9) return { kind: "line", a, b };
  const angle = 4 * Math.atan(bulge);
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const radius = chord / (2 * Math.sin(Math.abs(angle) / 2));
  // The centre, on the perpendicular bisector, on the side the arc turns around.
  const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const d = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2));
  const ux = (b[0] - a[0]) / chord;
  const uy = (b[1] - a[1]) / chord;
  const side = (bulge > 0 ? 1 : -1) * (Math.abs(angle) > Math.PI ? -1 : 1);
  const center: P2 = [mid[0] - uy * d * side, mid[1] + ux * d * side];
  const at = (p: P2) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  return bulge > 0 ? { kind: "arc", center, radius, start: at(a), end: at(b) } : { kind: "arc", center, radius, start: at(b), end: at(a) };
}

/** A polyline of points (closed or not), with the bulge of each vertex towards the next. */
function polyline(points: P2[], bulges: number[], closed: boolean): ImportedShape[] {
  const out: ImportedShape[] = [];
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
    out.push(bulgeArc(a, b, bulges[i] ?? 0));
  }
  return out;
}

/** Points along a curve as segments. */
const segments = (pts: P2[]): ImportedShape[] => pts.slice(1).map((b, i) => ({ kind: "line", a: pts[i]!, b }));

export function parseDxf(text: string): DxfImport {
  const all = pairs(text);
  let scale = 1;
  let unitName = "mm (unité non précisée)";
  const units = all.findIndex(([c, v]) => c === 9 && v === "$INSUNITS");
  if (units >= 0) {
    const known = UNITS[Number(all[units + 1]?.[1])];
    if (known) [scale, unitName] = known;
  }
  const start = all.findIndex(([c, v], i) => c === 2 && v === "ENTITIES" && all[i - 1]?.[1] === "SECTION");
  const shapes: ImportedShape[] = [];
  const skipped: Record<string, number> = {};
  if (start < 0) return { shapes, scale, unitName, skipped };
  // The entities, each its type and its pairs; a POLYLINE gathers its VERTEXes until SEQEND.
  let i = start + 1;
  const read = (): { type: string; data: [number, string][] } | null => {
    if (i >= all.length || all[i]![0] !== 0) return null;
    const type = all[i]![1];
    const data: [number, string][] = [];
    i++;
    while (i < all.length && all[i]![0] !== 0) data.push(all[i++]!);
    return { type, data };
  };
  const num = (data: [number, string][], code: number, fallback = 0) => {
    const v = data.find(([c]) => c === code);
    return v ? Number(v[1]) : fallback;
  };
  for (let e = read(); e && e.type !== "ENDSEC" && e.type !== "EOF"; e = read()) {
    const d = e.data;
    if (e.type === "LINE") shapes.push({ kind: "line", a: [num(d, 10), num(d, 20)], b: [num(d, 11), num(d, 21)] });
    else if (e.type === "CIRCLE") shapes.push({ kind: "circle", center: [num(d, 10), num(d, 20)], radius: num(d, 40) });
    else if (e.type === "ARC") shapes.push({ kind: "arc", center: [num(d, 10), num(d, 20)], radius: num(d, 40), start: (num(d, 50) * Math.PI) / 180, end: (num(d, 51) * Math.PI) / 180 });
    else if (e.type === "LWPOLYLINE") {
      const points: P2[] = [];
      const bulges: number[] = [];
      for (const [c, v] of d) {
        if (c === 10) points.push([Number(v), 0]), bulges.push(0);
        else if (c === 20 && points.length) points[points.length - 1]![1] = Number(v);
        else if (c === 42 && bulges.length) bulges[bulges.length - 1] = Number(v);
      }
      shapes.push(...polyline(points, bulges, (num(d, 70) & 1) === 1));
    } else if (e.type === "POLYLINE") {
      const closed = (num(d, 70) & 1) === 1;
      const points: P2[] = [];
      const bulges: number[] = [];
      for (let v = read(); v && v.type === "VERTEX"; v = read()) {
        points.push([num(v.data, 10), num(v.data, 20)]);
        bulges.push(num(v.data, 42));
        if (all[i]?.[1] === "SEQEND") {
          read();
          break;
        }
      }
      shapes.push(...polyline(points, bulges, closed));
    } else if (e.type === "ELLIPSE") {
      // Centre, end of the major axis (relative), ratio of the minor one, start and end parameters.
      const [cx, cy, mx, my] = [num(d, 10), num(d, 20), num(d, 11), num(d, 21)];
      const ratio = num(d, 40, 1);
      const t0 = num(d, 41, 0);
      let t1 = num(d, 42, 2 * Math.PI);
      if (t1 <= t0) t1 += 2 * Math.PI;
      // One turn at most, 64 steps a turn: a parameter of 1e8 would ask for a billion points.
      if (!Number.isFinite(t0) || !Number.isFinite(t1)) {
        skipped.ELLIPSE = (skipped.ELLIPSE ?? 0) + 1;
        continue;
      }
      t1 = Math.min(t1, t0 + 2 * Math.PI);
      const steps = Math.max(8, Math.ceil(((t1 - t0) / (2 * Math.PI)) * 64));
      const pts: P2[] = Array.from({ length: steps + 1 }, (_, k) => {
        const t = t0 + ((t1 - t0) * k) / steps;
        return [cx + mx * Math.cos(t) - my * ratio * Math.sin(t), cy + my * Math.cos(t) + mx * ratio * Math.sin(t)];
      });
      shapes.push(...segments(pts));
    } else if (e.type === "SPLINE") {
      // Its fit points when it has some, else its control points: a close enough outline for a plan.
      const fit: P2[] = [];
      const control: P2[] = [];
      for (let k = 0; k < d.length; k++) {
        const [c, v] = d[k]!;
        if (c === 11) fit.push([Number(v), 0]);
        else if (c === 21 && fit.length) fit[fit.length - 1]![1] = Number(v);
        else if (c === 10) control.push([Number(v), 0]);
        else if (c === 20 && control.length) control[control.length - 1]![1] = Number(v);
      }
      const pts = fit.length >= 2 ? fit : control;
      if (pts.length >= 2) shapes.push(...segments(pts));
    } else skipped[e.type] = (skipped[e.type] ?? 0) + 1;
    if (shapes.length > MAX_SHAPES) {
      skipped["au-delà de 200 000 traits"] = 1;
      break;
    }
  }
  const s = (p: P2): P2 => [p[0] * scale, p[1] * scale];
  const scaled = shapes.map((sh): ImportedShape => (sh.kind === "line" ? { kind: "line", a: s(sh.a), b: s(sh.b) } : { ...sh, center: s(sh.center), radius: sh.radius * scale }));
  // A value that is not a number (« abc »), infinite (1e999) or out of any room: the shape is left out, and said.
  const ok = (v: number) => Number.isFinite(v) && Math.abs(v) <= COORD_LIMIT;
  const valid = scaled.filter((sh) => (sh.kind === "line" ? [...sh.a, ...sh.b].every(ok) : [...sh.center, sh.radius].every(ok) && (sh.kind === "circle" || (Number.isFinite(sh.start) && Number.isFinite(sh.end)))));
  if (valid.length < scaled.length) skipped["valeurs invalides"] = scaled.length - valid.length;
  const kept = valid.filter((sh) => (sh.kind === "line" ? Math.hypot(sh.b[0] - sh.a[0], sh.b[1] - sh.a[1]) > 1e-9 * scale : sh.radius > 1e-9 * scale));
  return { shapes: kept, scale, unitName, skipped };
}

/** The box (min, max) of shapes, as drawn. */
export function shapesBox(shapes: readonly ImportedShape[]): [P2, P2] | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const sh of shapes) {
    if (sh.kind === "line") xs.push(sh.a[0], sh.b[0]), ys.push(sh.a[1], sh.b[1]);
    else xs.push(sh.center[0] - sh.radius, sh.center[0] + sh.radius), ys.push(sh.center[1] - sh.radius, sh.center[1] + sh.radius);
  }
  if (!xs.length) return null;
  // A loop, not Math.min(...xs): spreading 200 000 values overflows the call stack.
  const box: [P2, P2] = [[Infinity, Infinity], [-Infinity, -Infinity]];
  xs.forEach((x, k) => {
    const y = ys[k]!;
    box[0] = [Math.min(box[0][0], x), Math.min(box[0][1], y)];
    box[1] = [Math.max(box[1][0], x), Math.max(box[1][1], y)];
  });
  return box;
}
