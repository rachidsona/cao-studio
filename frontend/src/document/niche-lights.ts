/**
 * L'éclairage d'une Répartition, seule ou mur d'un Plan de dressing, en pur : un ruban sous le haut de chaque niche, près
 * de la façade et d'une cloison à l'autre. Sans lui, un ruban sous le dessus traverserait les côtés. Les niches à tiroirs
 * n'en ont pas : les tiroirs les remplissent. Dehors, comme un meuble : sous le meuble s'il est accroché, une corniche
 * s'il monte haut, une plinthe lumineuse sous chaque case. Le mur peut être de biais, coupé en angle ou sous un rampant.
 */
import { nicheWorld } from "../features/niche-parts";
import { frameOf } from "../sketcher/frame";
import { pointInPolygon } from "../sketcher/loops";
import { partitionLayout } from "../sketcher/partition";
import { isPartition, leafNiches, pathKey } from "../sketcher/partition-history";
import { CORNICE_FROM, MIN_LENGTH, PLINTH_FROM, SPOT, STRIP, WALL_FROM, type LightPiece, type LightingSettings } from "./lighting";
import type { NicheFeature, SketchFeature, SlopedCeiling, Vec3 } from "./types";

/** Under this height, a niche is a gap, not a place to light (mm). */
const MIN_NICHE = 100;

/** The ceiling's height at a point of the floor. */
function ceilingAt(c: SlopedCeiling, [x, y]: readonly number[]): number {
  return Math.min(c.cap, c.height + c.rise * ((c.axis === "x" ? x! : y!) - c.at));
}

const inside = (niche: number[], of: number[]) => pathKey(niche) === pathKey(of) || pathKey(niche).startsWith(`${pathKey(of)}.`);

/** The lights of the Répartitions of this sketch; null when it has none standing upright, or none with panels. */
export function partitionLights(sketch: SketchFeature, equipment: readonly NicheFeature[], name: string, s: LightingSettings): LightPiece[] | null {
  const frame = frameOf(sketch);
  const records = (sketch.offsets ?? []).filter(isPartition).filter((r) => (r.step.depth ?? 0) > 0);
  if (!records.length || Math.abs(frame.v[2]) < 0.99) return null;
  const straight = frame.u.filter((c) => Math.abs(c) > 1e-9).length === 1;
  const world = (u: number, v: number, w: number) => nicheWorld({ frame }, [u, v, w]);
  /** A flat piece of the sketch's own measures, kept out of what the wall leaves out. */
  const flat = (piece: Omit<LightPiece, "box" | "outline">, [u0, u1]: [number, number], [w0, w1]: [number, number], v0: number, v1: number): LightPiece[] => {
    const corners = ([[u0, w0], [u1, w0], [u1, w1], [u0, w1]] as const).map(([u, w]) => world(u, v0, w));
    const [z0, z1] = [corners[0]![2], world(u0, v1, w0)[2]];
    const low: Vec3 = [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.min(z0, z1)];
    const high: Vec3 = [Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1])), Math.max(z0, z1)];
    const middle = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2] as [number, number];
    if (sketch.clip && !pointInPolygon(middle, sketch.clip)) return [];
    if (sketch.ceiling && corners.every((c) => ceilingAt(sketch.ceiling as SlopedCeiling, c) < high[2])) return [];
    return [{
      ...piece,
      box: [low, high],
      ...(straight ? {} : { outline: corners.map((c): [number, number] => [c[0], c[1]]) }),
      ...(sketch.clip ? { clip: sketch.clip } : {}),
      ...(sketch.ceiling ? { ceiling: sketch.ceiling } : {}),
    }];
  };
  /** A strip across [u0, u1], just behind the front, between two heights. */
  const strip = (label: string, u0: number, u1: number, depth: number, v0: number, v1: number, up = false): LightPiece[] => {
    if (u1 - u0 - 2 * STRIP.margin < MIN_LENGTH) return [];
    const f = depth - STRIP.inset;
    return flat({ name: label, kind: "strip", ...(up ? { up } : {}) }, [u0 + STRIP.margin, u1 - STRIP.margin], [f - STRIP.width, f], v0, v1);
  };
  const out: LightPiece[] = [];
  for (const record of records) {
    const { input, origin: [ox, oy], depth: panels } = record.step;
    const depth = panels as number;
    const layout = partitionLayout(input);
    if (typeof layout === "string") continue;
    const of = records.length > 1 ? `${name} ${record.name}` : name;
    const filled = equipment.filter((e) => e.partition === record.id && e.fill === "drawers");
    const [top, bottom] = [oy + input.height, oy + (input.boards ? input.plinth : 0)];
    if (s.inside) {
      for (const { partition, path, box } of leafNiches(sketch)) {
        if (partition !== record.id || box.y1 - box.y0 < MIN_NICHE) continue;
        if (filled.some((e) => inside(path, e.niche))) continue;
        // With no top board, nothing holds a strip at the top of the panels.
        if (!input.boards && box.y1 >= top - 1) continue;
        out.push(...strip(`Ruban LED ${of} — niche ${path.map((p) => p + 1).join(".")}`, box.x0, box.x1, depth, box.y1 - STRIP.thickness, box.y1));
      }
    }
    const lowest = world(ox, bottom, 0)[2];
    if (lowest >= WALL_FROM && s.under === "strip") out.push(...strip(`Ruban LED sous ${of}`, ox, ox + input.length, depth, bottom - STRIP.thickness, bottom));
    if (lowest >= WALL_FROM && s.under === "spots") {
      const count = Math.max(1, Math.round(input.length / SPOT.spacing));
      for (let k = 0; k < count; k++) {
        const [u, w] = [ox + (input.length * (k + 0.5)) / count, depth - SPOT.inset];
        out.push(...flat({ name: `Spot ${k + 1} sous ${of}`, kind: "spot" }, [u - SPOT.diameter / 2, u + SPOT.diameter / 2], [w - SPOT.diameter / 2, w + SPOT.diameter / 2], bottom - SPOT.thickness, bottom));
      }
    }
    if (s.cornice && world(ox, top, 0)[2] >= CORNICE_FROM) out.push(...strip(`Corniche LED ${of}`, ox, ox + input.length, depth, top, top + STRIP.thickness, true));
    if (s.plinth && input.boards && input.plinth >= PLINTH_FROM) {
      layout.caseSpans.forEach(([a, b], i) => out.push(...strip(`Plinthe LED ${of} — case ${i + 1}`, ox + a, ox + b, depth, bottom - STRIP.thickness, bottom)));
    }
  }
  return out;
}
