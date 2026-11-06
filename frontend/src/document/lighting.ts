/**
 * L'éclairage des meubles, en pur.
 *
 * Dedans, un ruban LED sous le dessus et sous chaque étagère, près de la façade (la planche la plus basse d'un meuble
 * n'en a pas). Dehors :
 * - sous les meubles hauts, un ruban ou des spots ;
 * - une corniche lumineuse sur les meubles qui montent haut ;
 * - une plinthe lumineuse sous les meubles posés sur un socle.
 *
 * Une Répartition s'éclaire niche par niche (document/niche-lights.ts) : ses cloisons arrêtent les rubans. Un caisson, lui,
 * s'éclaire planche par planche.
 *
 * Chaque lumière est un petit corps à part (esquisse et extrusion, sur le calque « Éclairage ») qui éclaire le rendu,
 * hors débit, devis et usinage. Relancer l'outil remplace l'éclairage déjà posé, par exemple après avoir déplacé des
 * meubles.
 */
import { addLayer, layersOf } from "./layers";
import { uniqueId } from "./operations";
import { emptySketchGeometry, rectangleAt } from "./sketch";
import type { CadDocument, Feature, SlopedCeiling, Vec3 } from "./types";

export type Box = [Vec3, Vec3];
export type LightColor = "warm" | "neutral" | "cool";

export const LIGHT_COLORS: { id: LightColor; name: string; appearance: string }[] = [
  { id: "warm", name: "Blanc chaud (2700 K)", appearance: "led-warm" },
  { id: "neutral", name: "Blanc neutre (4000 K)", appearance: "led-neutral" },
  { id: "cool", name: "Blanc froid (6000 K)", appearance: "led-cool" },
];

export const LIGHT_LAYER = "Éclairage";

/** A piece of furniture as the lighting sees it: its carcass box, the side its front faces, its flat boards. */
export interface LitElement {
  name: string;
  /** Box of the carcass (fronts left out). */
  box: Box;
  /** Horizontal axis (0 X, 1 Y) and sense its front faces. */
  front: { axis: 0 | 1; sign: 1 | -1 };
  /** Its horizontal boards (tops, shelves, bottom). */
  boards: { name: string; box: Box }[];
}

export interface LightingSettings {
  /** Strips under the top and the shelves, inside. */
  inside: boolean;
  /** Under the wall units: a strip, spots, or nothing. */
  under: "strip" | "spots" | "none";
  /** A cornice strip on top of tall furniture. */
  cornice: boolean;
  /** A strip under furniture standing on a plinth, lighting the floor. */
  plinth: boolean;
  color: LightColor;
}

export const LIGHTING: LightingSettings = { inside: true, under: "strip", cornice: false, plinth: false, color: "warm" };

export interface LightPiece {
  name: string;
  kind: "strip" | "spot";
  box: Box;
  /** It lights upwards (a cornice); the others light downwards. */
  up?: boolean;
  /** Along a wall at an angle: its four corners on the floor plan (`box` then only bounds it). */
  outline?: [number, number][];
  /** What a dressing's wall keeps its boards in: the outline of a cut corner, a sloped ceiling. */
  clip?: [number, number][];
  ceiling?: SlopedCeiling;
}

/** The length of a strip (mm). */
export function pieceLength({ box: [from, to], outline }: LightPiece): number {
  if (!outline) return Math.max(to[0] - from[0], to[1] - from[1]);
  const [a, b, c] = outline as [[number, number], [number, number], [number, number]];
  return Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]));
}

/** A LED profile: wide and thick (mm); kept from the front edge and from the sides. */
export const STRIP = { width: 12, thickness: 8, inset: 30, margin: 20 };
export const SPOT = { diameter: 60, thickness: 6, inset: 80, spacing: 600 };
/** Wall units hang this high at least; a cornice crowns what rises this high (mm). */
export const WALL_FROM = 600;
export const CORNICE_FROM = 1800;
/** A plinth light wants this much room under the lowest board (mm). */
export const PLINTH_FROM = 60;
export const MIN_LENGTH = 150;

/** The lights of these elements. */
export function lightPieces(elements: readonly LitElement[], s: LightingSettings): LightPiece[] {
  const out: LightPiece[] = [];
  for (const e of elements) {
    const i = e.front.axis;
    const j = 1 - i;
    const frontOf = (b: Box) => (e.front.sign > 0 ? b[1][i]! : b[0][i]!);
    /** A strip along the element's width, `inset` behind the front edge of `b`, between heights z0 and z1. */
    const strip = (name: string, b: Box, z0: number, z1: number, up = false) => {
      const [a0, a1] = [b[0][j]! + STRIP.margin, b[1][j]! - STRIP.margin];
      if (a1 - a0 < MIN_LENGTH) return;
      const f = frontOf(b) - e.front.sign * STRIP.inset;
      const across = [f, f - e.front.sign * STRIP.width].sort((x, y) => x - y) as [number, number];
      const from: Vec3 = [0, 0, z0];
      const to: Vec3 = [0, 0, z1];
      from[i] = across[0];
      to[i] = across[1];
      from[j] = a0;
      to[j] = a1;
      out.push({ name, kind: "strip", box: [from, to], ...(up ? { up } : {}) });
    };
    const boards = [...e.boards].sort((a, b) => a.box[0][2] - b.box[0][2]);
    const lowest = boards[0];
    if (s.inside) for (const b of boards.slice(1)) strip(`Ruban LED ${e.name} — sous ${b.name}`, b.box, b.box[0][2] - STRIP.thickness, b.box[0][2]);
    const bottom = e.box[0][2];
    if (bottom >= WALL_FROM && s.under === "strip") strip(`Ruban LED sous ${e.name}`, e.box, bottom - STRIP.thickness, bottom);
    if (bottom >= WALL_FROM && s.under === "spots") {
      const span = e.box[1][j]! - e.box[0][j]!;
      const count = Math.max(1, Math.round(span / SPOT.spacing));
      const c = frontOf(e.box) - e.front.sign * SPOT.inset;
      for (let k = 0; k < count; k++) {
        const along = e.box[0][j]! + (span * (k + 0.5)) / count;
        const from: Vec3 = [0, 0, bottom - SPOT.thickness];
        const to: Vec3 = [0, 0, bottom];
        from[i] = c - SPOT.diameter / 2;
        to[i] = c + SPOT.diameter / 2;
        from[j] = along - SPOT.diameter / 2;
        to[j] = along + SPOT.diameter / 2;
        out.push({ name: `Spot ${k + 1} sous ${e.name}`, kind: "spot", box: [from, to] });
      }
    }
    const top = e.box[1][2];
    if (s.cornice && top >= CORNICE_FROM) strip(`Corniche LED ${e.name}`, e.box, top, top + STRIP.thickness, true);
    // A plinth: the lowest board stands off the floor.
    if (s.plinth && bottom < 50 && lowest && lowest.box[0][2] >= PLINTH_FROM) strip(`Plinthe LED ${e.name}`, lowest.box, lowest.box[0][2] - STRIP.thickness, lowest.box[0][2]);
  }
  return out;
}

/** The features of the lights (a hidden sketch and its extrusion each), on the « Éclairage » layer, lit in the render. */
export function addLights(doc: CadDocument, pieces: readonly LightPiece[], color: LightColor): { doc: CadDocument; bodies: string[] } {
  let next = doc;
  let layer = layersOf(next).find((l) => l.name === LIGHT_LAYER)?.id;
  if (!layer && pieces.length) ({ doc: next, id: layer } = addLayer(next, LIGHT_LAYER));
  const appearance = LIGHT_COLORS.find((c) => c.id === color)!.appearance;
  const features: Feature[] = [];
  const bodyInfo = { ...next.bodyInfo };
  const bodyNames = { ...next.bodyNames };
  const bodies: string[] = [];
  const probe = () => ({ ...next, features: [...next.features, ...features] });
  for (const p of pieces) {
    const [from, to] = p.box;
    const [cx, cy] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const sketchId = uniqueId(probe(), "sk");
    const geometry = p.kind === "spot" ? spotAt(cx, cy, (to[0] - from[0]) / 2) : p.outline ? outlined(p.outline) : rectangleAt(cx, cy, to[0] - from[0], to[1] - from[1]);
    features.push({ id: sketchId, type: "sketch", name: `Esquisse ${p.name}`, plane: "XY", offset: from[2], hidden: true, ...geometry });
    const id = uniqueId(probe(), "ex");
    features.push({ id, type: "extrude", name: p.name, sketch: sketchId, distance: to[2] - from[2], operation: "new", ...(p.clip ? { clip: p.clip } : {}), ...(p.ceiling ? { ceiling: p.ceiling } : {}) });
    bodyInfo[id] = { room: true, light: { kind: p.kind, color, ...(p.up ? { up: true } : {}) }, appearance, ...(layer ? { layer } : {}) };
    bodyNames[id] = p.name;
    bodies.push(id);
  }
  return { doc: { ...next, features: [...next.features, ...features], bodyInfo, bodyNames }, bodies };
}

/** A circle of radius r centred on (cx, cy). */
function spotAt(cx: number, cy: number, r: number) {
  const geometry = emptySketchGeometry();
  geometry.points.push({ id: "pc", x: cx, y: cy });
  geometry.curves.push({ id: "c1", kind: "circle", center: "pc", radius: r });
  return geometry;
}

/** A closed shape through these corners. */
function outlined(corners: readonly [number, number][]) {
  const geometry = emptySketchGeometry();
  corners.forEach(([x, y], i) => {
    geometry.points.push({ id: `p${i}`, x, y });
    geometry.curves.push({ id: `l${i}`, kind: "line", p1: `p${i}`, p2: `p${(i + 1) % corners.length}` });
  });
  return geometry;
}

/** The document without the lights already set (their extrusions and sketches). */
export function removeLights(doc: CadDocument): CadDocument {
  const lights = new Set(Object.entries(doc.bodyInfo ?? {}).filter(([, info]) => info.light).map(([id]) => id));
  if (!lights.size) return doc;
  const sketches = new Set(doc.features.flatMap((f) => (f.type === "extrude" && lights.has(f.id) && f.sketch ? [f.sketch] : [])));
  const bodyInfo = Object.fromEntries(Object.entries(doc.bodyInfo ?? {}).filter(([id]) => !lights.has(id)));
  const bodyNames = Object.fromEntries(Object.entries(doc.bodyNames ?? {}).filter(([id]) => !lights.has(id)));
  return { ...doc, features: doc.features.filter((f) => !lights.has(f.id) && !sketches.has(f.id)), bodyInfo, bodyNames };
}
