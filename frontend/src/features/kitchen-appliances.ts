/**
 * L'électroménager d'une implantation de cuisine, en nombres : où vont l'évier (sous la fenêtre s'il y en a une, sinon
 * vers le premier tiers du mur A), le lave-vaisselle (à côté de l'évier), la plaque (à deux modules au moins de
 * l'évier, pas contre une colonne ni sous une fenêtre) ; et les règles d'ergonomie d'une cuisine — le triangle
 * évier, plaque, réfrigérateur, le passage devant un îlot, la plaque loin d'un bout de plan. Pur.
 */

/** A base slot of a run: where it starts along the run, its width, and its middle in the kitchen's frame (plan view). */
export interface Slot {
  run: "A" | "B" | "C";
  at: number;
  width: number;
  /** Middle of its front, in the kitchen's frame (x, y). */
  middle: [number, number];
  /** Under a window. */
  window: boolean;
  /** Next to a column or the free end of the worktop (less than a module of worktop beside it). */
  edge: boolean;
}

export type Role = "sink" | "dishwasher" | "hob";

/** The slot (its index) given to the sink, the dishwasher and the hob, among the base slots in run order. */
export function placeAppliances(slots: readonly Slot[]): Partial<Record<Role, number>> {
  const out: Partial<Record<Role, number>> = {};
  const ok = (i: number) => i >= 0 && i < slots.length && slots[i]!.width >= 600 && !Object.values(out).includes(i);
  const runA = slots.map((s, i) => [s, i] as const).filter(([s]) => s.run === "A");
  if (!runA.length) return out;
  // The sink: under a window of wall A, else about a third along it.
  const under = runA.find(([s, i]) => s.window && ok(i));
  const third = runA[Math.floor(runA.length / 3)];
  const sink = under?.[1] ?? (third && ok(third[1]) ? third[1] : runA.find(([, i]) => ok(i))?.[1]);
  if (sink === undefined) return out;
  out.sink = sink;
  // The dishwasher right beside the sink (the next slot of the same run, else the one before), 600 wide.
  const side = [sink + 1, sink - 1].find((i) => ok(i) && slots[i]!.run === slots[sink]!.run && slots[i]!.width === 600 && Math.abs(slots[i]!.at - slots[sink]!.at) <= Math.max(slots[i]!.width, slots[sink]!.width) + 1);
  if (side !== undefined) out.dishwasher = side;
  // The hob: two slots at least from the sink, not under a window nor at an edge; the farthest such one along the runs.
  const candidates = slots.map((_, i) => i).filter((i) => ok(i) && Math.abs(i - sink) >= 2 && !slots[i]!.window);
  const hob = candidates.find((i) => !slots[i]!.edge && i > sink) ?? candidates.find((i) => !slots[i]!.edge) ?? candidates[0];
  if (hob !== undefined) out.hob = hob;
  return out;
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const m = (mm: number) => `${(mm / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m`;

/** What the kitchen does well or not, as short sentences: the work triangle, the passage, the hob's sides. */
export function ergonomics(places: { sink?: [number, number]; hob?: [number, number]; fridge?: [number, number] }, checks: { islandPassage?: number; hobAtEdge?: boolean; hobUnderWindow?: boolean; dishwasherBySink?: boolean }): { ok: string[]; warn: string[] } {
  const ok: string[] = [];
  const warn: string[] = [];
  const { sink, hob, fridge } = places;
  if (sink && hob && fridge) {
    const sides = [dist(sink, hob), dist(hob, fridge), dist(fridge, sink)];
    const total = sides.reduce((a, b) => a + b, 0);
    const label = `triangle évier – plaque – réfrigérateur de ${m(total)}`;
    if (total < 4000) warn.push(`${label} : trop serré (4 à 7 m conseillés).`);
    else if (total > 7000) warn.push(`${label} : trop de pas (4 à 7 m conseillés).`);
    else ok.push(`${label} (4 à 7 m conseillés).`);
    if (sides.some((s) => s < 1200)) warn.push("Deux postes du triangle sont à moins de 1,20 m l'un de l'autre.");
    if (sides.some((s) => s > 2700)) warn.push("Deux postes du triangle sont à plus de 2,70 m l'un de l'autre.");
  } else if (sink && hob) {
    const d = dist(sink, hob);
    (d >= 1200 ? ok : warn).push(`Évier et plaque à ${m(d)} l'un de l'autre (1,20 m au moins conseillé).`);
  }
  if (checks.islandPassage !== undefined) {
    const p = checks.islandPassage;
    if (p < 900) warn.push(`Passage devant l'îlot de ${m(p)} : trop étroit (90 cm au moins, 1,20 m pour deux).`);
    else ok.push(`Passage devant l'îlot de ${m(p)} (90 cm au moins, 1,20 m pour deux).`);
  }
  if (checks.hobAtEdge) warn.push("La plaque est contre une colonne ou au bout du plan : gardez au moins 30 cm de plan de chaque côté.");
  if (checks.hobUnderWindow) warn.push("La plaque est sous une fenêtre : le rideau et le courant d'air gênent la cuisson.");
  if (checks.dishwasherBySink === false) warn.push("Le lave-vaisselle n'est pas à côté de l'évier.");
  else if (checks.dishwasherBySink) ok.push("Lave-vaisselle à côté de l'évier.");
  return { ok, warn };
}
