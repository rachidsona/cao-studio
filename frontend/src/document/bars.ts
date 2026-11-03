/**
 * Débit en barres (le « bois de construction » d'OpenCutList, son débit 1D) : les pièces d'une matière vendue en
 * barres (tasseaux, liteaux) sont coupées dans des barres du commerce de leur section, mises bout à bout, les plus
 * longues d'abord, chacune dans la première barre où elle tient (trait de scie entre deux pièces, une coupe d'équerre
 * au début de la barre). Ce qui reste au bout d'une barre est sa chute. Pur.
 */
import type { CutRow } from "./cut-list";
import { MATERIALS } from "./materials";

export interface BarCut {
  name: string;
  tag?: string;
  /** From the start of the bar (mm). */
  x: number;
  length: number;
}

export interface Bar {
  material: string;
  /** Width × thickness of the section (mm). */
  section: [number, number];
  /** Length of the bar bought (mm). */
  length: number;
  cuts: BarCut[];
  /** Share of the bar used by parts (0..1). */
  usage: number;
  /** What is left at the end (mm). */
  rest: number;
}

/** The length of the bars a material is sold in, or null when it is not sold in bars. */
export function barLength(material: string): number | null {
  const m = MATERIALS.find((x) => x.name === material);
  return m?.kind === "bar" ? (m.bar ?? 2400) : null;
}

/** The parts of the rows sold in bars, cut from bars of their section; parts longer than a bar are returned apart. */
export function layoutBars(rows: readonly CutRow[], options = { kerf: 4, trim: 10 }): { bars: Bar[]; tooLong: string[] } {
  const groups = new Map<string, { material: string; section: [number, number]; stock: number; pieces: { name: string; tag?: string; length: number }[] }>();
  for (const r of rows) {
    const stock = barLength(r.material);
    if (stock === null) continue;
    const section: [number, number] = [r.roughWidth ?? r.cutWidth, r.thickness];
    const key = `${r.material}|${section.join("x")}`;
    const group = groups.get(key) ?? { material: r.material, section, stock, pieces: [] };
    for (let i = 0; i < r.quantity; i++) group.pieces.push({ name: r.names[i] ?? r.names[0] ?? "", ...(r.tag ? { tag: r.tag } : {}), length: r.roughLength ?? r.cutLength });
    groups.set(key, group);
  }
  const bars: Bar[] = [];
  const tooLong: string[] = [];
  for (const { material, section, stock, pieces } of groups.values()) {
    const open: { cuts: BarCut[]; end: number }[] = [];
    for (const p of [...pieces].sort((a, b) => b.length - a.length)) {
      if (p.length > stock - options.trim) {
        tooLong.push(p.name);
        continue;
      }
      // The first bar it fits in; else a new bar, squared at its start.
      let bar = open.find((b) => b.end + options.kerf + p.length <= stock);
      if (!bar) {
        bar = { cuts: [], end: options.trim - options.kerf };
        open.push(bar);
      }
      const x = bar.end + options.kerf;
      bar.cuts.push({ name: p.name, ...(p.tag ? { tag: p.tag } : {}), x, length: p.length });
      bar.end = x + p.length;
    }
    for (const b of open) {
      const used = b.cuts.reduce((n, c) => n + c.length, 0);
      bars.push({ material, section, length: stock, cuts: b.cuts, usage: used / stock, rest: Math.max(0, stock - b.end - options.kerf) });
    }
  }
  return { bars, tooLong };
}
