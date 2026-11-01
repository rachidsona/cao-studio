/**
 * Standards de construction (comme les « Manufacturing methods » de Polyboard ou les principes de construction
 * d'imos) : une façon de construire, nommée — épaisseurs, fond, construction des côtés, socle, façades, matières,
 * chants, assemblage — que les caissons suivent au lieu de la porter chacun. Trois niveaux, du plus général au plus
 * proche : l'atelier (les modèles fournis ici et ceux qu'on enregistre), le projet (`doc.standard`) et le caisson
 * (`CabinetFeature.standard`, qui l'emporte ; « none » : réglé à la main). Appliquer pousse les valeurs du standard
 * dans les caissons, leurs façades, leurs matières et leurs chants, en une annulation ; un caisson retouché à la main
 * « ne suit plus » son standard, ce que `drift` dit avant qu'on le remette d'accord. Pur.
 */
import { cabinetParts } from "../features/cabinet-parts";
import { frontsParts } from "../features/fronts-parts";
import { setBodyInfo } from "./materials";
import { PART_SEPARATOR, type BodyInfo, type CabinetFeature, type CadDocument, type FrontsFeature } from "./types";

export interface ConstructionStandard {
  id: string;
  name: string;
  /** Carcass boards (mm). */
  thickness: number;
  back: CabinetFeature["back"];
  backThickness: number;
  construction: CabinetFeature["construction"];
  /** Plinth height (mm); missing: each cabinet keeps its own (kitchen units and wall units differ). */
  plinth?: number;
  frontMount: FrontsFeature["mount"];
  frontGap: number;
  frontThickness: number;
  /** Materials (ids of document/materials.ts) of the carcass, the fronts and the backs; missing: left as they are. */
  carcass?: string;
  fronts?: string;
  backs?: string;
  /** Edge band of the visible edges (front edges of the carcass, the four edges of the fronts), mm; 0: none. */
  band: number;
  /** Bands at least this thick are taken off the cutting size (thinner ones are not), mm. */
  bandTrim: number;
  /** How the carcass is assembled (Règles d'assemblage) and the spacing of the fasteners (mm). */
  joint: "confirmat" | "dowel" | "minifix";
  jointSpacing: number;
}

export const STANDARDS: ConstructionStandard[] = [
  {
    id: "melamine-19", name: "Mélaminé 19 mm, fond vissé, système 32", thickness: 19, back: "applied", backThickness: 3, construction: "sides-through",
    frontMount: "overlay", frontGap: 3, frontThickness: 19, carcass: "melamine-white", fronts: "melamine-white", backs: "hdf", band: 1, bandTrim: 1, joint: "confirmat", jointSpacing: 128,
  },
  {
    id: "melamine-16", name: "Mélaminé 16 mm économique, fond rainuré", thickness: 16, back: "inset", backThickness: 3, construction: "sides-through",
    frontMount: "overlay", frontGap: 3, frontThickness: 16, carcass: "melamine-white", fronts: "melamine-white", backs: "hdf", band: 0.4, bandTrim: 1, joint: "dowel", jointSpacing: 96,
  },
  {
    id: "minifix-18", name: "Démontable 18 mm à excentriques (Minifix)", thickness: 18, back: "inset", backThickness: 8, construction: "sides-through",
    frontMount: "overlay", frontGap: 3, frontThickness: 19, carcass: "melamine-oak", fronts: "melamine-oak", backs: "hdf", band: 1, bandTrim: 1, joint: "minifix", jointSpacing: 256,
  },
  {
    id: "plywood-18", name: "Contreplaqué bouleau 18 mm, façades rentrées", thickness: 18, back: "inset", backThickness: 8, construction: "top-bottom-through",
    frontMount: "inset", frontGap: 2, frontThickness: 18, carcass: "birch-plywood", fronts: "birch-plywood", backs: "birch-plywood", band: 0, bandTrim: 1, joint: "dowel", jointSpacing: 96,
  },
  {
    id: "lacquer-22", name: "Haut de gamme 22 mm, façades laquées", thickness: 22, back: "inset", backThickness: 8, construction: "sides-through",
    frontMount: "overlay", frontGap: 2, frontThickness: 22, carcass: "melamine-anthracite", fronts: "lacquer-white", backs: "melamine-anthracite", band: 2, bandTrim: 1, joint: "dowel", jointSpacing: 96,
  },
];

/** A standard of the project (its own, or one of the workshop's). */
export function findStandard(doc: CadDocument, id: string | undefined, workshop: readonly ConstructionStandard[] = []): ConstructionStandard | undefined {
  if (!id || id === "none") return undefined;
  return doc.standards?.find((s) => s.id === id) ?? workshop.find((s) => s.id === id) ?? STANDARDS.find((s) => s.id === id);
}

/** The standard a cabinet follows: its own, else the project's; none when it is set by hand. */
export function cabinetStandard(doc: CadDocument, cabinet: CabinetFeature, workshop: readonly ConstructionStandard[] = []): ConstructionStandard | undefined {
  if (cabinet.standard === "none") return undefined;
  return findStandard(doc, cabinet.standard ?? doc.standard, workshop);
}

/** The settings of a cabinet made to its standard. */
export function cabinetTo(cabinet: CabinetFeature, s: ConstructionStandard): CabinetFeature {
  return { ...cabinet, thickness: s.thickness, back: s.back, backThickness: s.backThickness, construction: s.construction, ...(s.plinth !== undefined ? { plinth: s.plinth } : {}) };
}

/** The settings of fronts made to the standard of their cabinet. */
export function frontsTo(fronts: FrontsFeature, s: ConstructionStandard): FrontsFeature {
  return { ...fronts, mount: s.frontMount, gap: s.frontGap, thickness: s.frontThickness };
}

const NO_EDGES = { length1: false, length2: false, width1: false, width2: false };

/** The edge band of the front edge of a carcass board (the edge at its lowest Y, along the axis that is neither Y nor its thickness). */
function frontEdge(from: number[], to: number[]): NonNullable<BodyInfo["edges"]> {
  const size = [0, 1, 2].map((i) => Math.abs(to[i]! - from[i]!));
  const thickness = size.indexOf(Math.min(...size));
  const along = [0, 2].find((i) => i !== thickness) ?? 0;
  const longest = Math.max(...size);
  return { ...NO_EDGES, ...(size[along]! >= longest - 1e-6 ? { length1: true } : { width1: true }) };
}

/** The bodies of a cabinet and its fronts with what the standard says they are made of. */
function partsInfo(doc: CadDocument, cabinet: CabinetFeature, s: ConstructionStandard): { ids: string[]; patch: Partial<BodyInfo> }[] {
  const out: { ids: string[]; patch: Partial<BodyInfo> }[] = [];
  cabinetParts(cabinet).forEach((p, i) => {
    const id = `${cabinet.id}${PART_SEPARATOR}${i}`;
    if (p.name === "Fond") out.push({ ids: [id], patch: { ...(s.backs ? { material: s.backs } : {}), edges: NO_EDGES } });
    else out.push({ ids: [id], patch: { ...(s.carcass ? { material: s.carcass } : {}), ...(s.band > 0 ? { edges: frontEdge(p.from, p.to), band: s.band } : { edges: NO_EDGES }) } });
  });
  for (const f of doc.features) {
    if (f.type !== "fronts" || f.cabinet !== cabinet.id || f.suppressed) continue;
    frontsParts(frontsTo(f, s), cabinetTo(cabinet, s)).forEach((p, i) => {
      if (!p.role) return;
      const all = { length1: true, length2: true, width1: true, width2: true };
      out.push({ ids: [`${f.id}${PART_SEPARATOR}${i}`], patch: { ...(s.fronts ? { material: s.fronts } : {}), ...(s.band > 0 ? { edges: all, band: s.band } : { edges: NO_EDGES }) } });
    });
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface StandardImpact {
  /** Cabinets and fronts whose settings change, by name. */
  cabinets: string[];
  fronts: string[];
  /** Bodies whose material or edge bands change. */
  parts: number;
}

/**
 * Every cabinet (or those of `only`) made to its standard, with its fronts, materials and edge bands; and what changed.
 * Cabinets set by hand (`standard: "none"`) and those without a standard are left alone.
 */
export function applyStandards(doc: CadDocument, workshop: readonly ConstructionStandard[] = [], only?: readonly string[]): { doc: CadDocument; impact: StandardImpact } {
  const impact: StandardImpact = { cabinets: [], fronts: [], parts: 0 };
  let next = doc;
  for (const cabinet of doc.features) {
    if (cabinet.type !== "cabinet" || cabinet.suppressed || (only && !only.includes(cabinet.id))) continue;
    const s = cabinetStandard(doc, cabinet, workshop);
    if (!s) continue;
    const made = cabinetTo(cabinet, s);
    if (!same(made, cabinet)) impact.cabinets.push(cabinet.name);
    next = { ...next, features: next.features.map((f) => (f.id === cabinet.id ? made : f.type === "fronts" && f.cabinet === cabinet.id ? frontsTo(f, s) : f)) };
    for (const f of doc.features) if (f.type === "fronts" && f.cabinet === cabinet.id && !same(frontsTo(f, s), f)) impact.fronts.push(f.name);
    for (const { ids, patch } of partsInfo(next, made, s)) {
      const before = next.bodyInfo?.[ids[0]!] ?? {};
      if (!same({ ...before, ...patch }, before)) impact.parts++;
      next = setBodyInfo(next, ids, patch);
    }
  }
  return { doc: next, impact };
}

/** The cabinets that no longer follow their standard (changed by hand since), by id. */
export function drift(doc: CadDocument, workshop: readonly ConstructionStandard[] = []): string[] {
  return doc.features.flatMap((f) => {
    if (f.type !== "cabinet" || f.suppressed) return [];
    const s = cabinetStandard(doc, f, workshop);
    if (!s) return [];
    const fronts = doc.features.filter((x): x is FrontsFeature => x.type === "fronts" && x.cabinet === f.id);
    return same(cabinetTo(f, s), f) && fronts.every((x) => same(frontsTo(x, s), x)) ? [] : [f.id];
  });
}

/** Why a standard cannot be used, or null. */
export function standardProblem(s: ConstructionStandard): string | null {
  if (!s.name.trim()) return "Le standard doit avoir un nom.";
  if (!(s.thickness > 0 && s.frontThickness > 0)) return "Les épaisseurs doivent être positives.";
  if (s.back !== "none" && !(s.backThickness > 0)) return "L'épaisseur du fond doit être positive.";
  if (!(s.frontGap >= 0 && s.band >= 0 && s.bandTrim >= 0)) return "Le jeu et les chants ne peuvent pas être négatifs.";
  if (s.plinth !== undefined && !(s.plinth >= 0)) return "Le socle ne peut pas être négatif.";
  if (!(s.jointSpacing >= 16)) return "L'entraxe de l'assemblage doit faire au moins 16 mm.";
  return null;
}

/** The project's standard set (a copy in the project when it is one of the workshop's, so the project keeps it). */
export function setProjectStandard(doc: CadDocument, s: ConstructionStandard | null): CadDocument {
  if (!s) {
    const { standard: _s, ...rest } = doc;
    return rest;
  }
  const builtIn = STANDARDS.some((b) => same(b, s));
  const standards = builtIn ? doc.standards : [...(doc.standards ?? []).filter((x) => x.id !== s.id), s];
  return { ...doc, standard: s.id, ...(standards?.length ? { standards } : {}) };
}

/** Bands this thin are not taken off the cutting size (the project's standard), mm. */
export function bandTrimOf(doc: CadDocument): number {
  return findStandard(doc, doc.standard)?.bandTrim ?? 0;
}
