/**
 * L'électroménager d'une implantation de cuisine, en nombres : où vont l'évier (sous la fenêtre s'il y en a une, sinon
 * sur le mur A, vers son premier tiers), le lave-vaisselle (à côté de l'évier), la plaque (pas contre une colonne ni
 * sous une fenêtre) — l'évier et la plaque choisis ensemble pour que le triangle avec le réfrigérateur suive ses conseils ; et les règles d'ergonomie d'une cuisine — le triangle
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

/** The slot (its index) given to the sink, the dishwasher and the hob, among the base slots in run order; `fridge`: its front, when there is one. */
export function placeAppliances(slots: readonly Slot[], fridge?: [number, number]): Partial<Record<Role, number>> {
  const runA = slots.map((s, i) => [s, i] as const).filter(([s]) => s.run === "A").map(([, i]) => i);
  if (!runA.length) return {};
  const ok = (i: number, taken: (number | undefined)[]) => i >= 0 && i < slots.length && slots[i]!.width >= 600 && !taken.includes(i);
  // The sink under a window of wall A when there is one; else one of wall A, about a third along it at best.
  const windows = runA.filter((i) => slots[i]!.window && ok(i, []));
  const sinks = windows.length ? windows : runA.filter((i) => ok(i, []));
  const third = runA[Math.floor(runA.length / 3)]!;
  // The dishwasher right beside the sink (the next slot of the same run, else the one before), 600 wide.
  const dishwasherBy = (sink: number) => [sink + 1, sink - 1].find((i) => ok(i, [sink]) && slots[i]!.run === slots[sink]!.run && slots[i]!.width === 600 && Math.abs(slots[i]!.at - slots[sink]!.at) <= Math.max(slots[i]!.width, slots[sink]!.width) + 1);
  // The hob: the fewest of the triangle's advice broken — 1.20 m at least from the sink on the floor (across a corner,
  // two slots apart can be side by side), and with the fridge when known, 2.70 m at most a side and 4 to 7 m in all —,
  // then not at an edge, then after the sink; never under a window, on the island only when nothing else is left.
  const hobScore = (sink: number, i: number) => {
    const sides = fridge ? [dist(slots[i]!.middle, slots[sink]!.middle), dist(slots[i]!.middle, fridge), dist(fridge, slots[sink]!.middle)] : [dist(slots[i]!.middle, slots[sink]!.middle)];
    const total = sides.reduce((x, y) => x + y, 0);
    const broken = sides.filter((d) => tooNear(d) || (fridge && tooFar(d))).length + (fridge && (total < 4000 || total > 7000) ? 1 : 0);
    // On a wall, under its hood (none is put over an island: the plan passes its slots as « I »), unless nothing else.
    return ((slots[i]!.run as string) === "I" ? 100 : 0) + broken * 4 + (slots[i]!.edge ? 2 : 0) + (i < sink ? 1 : 0);
  };
  // Sink, dishwasher and hob chosen together: the fewest warnings (a dishwasher not beside the sink is one), then the
  // sink nearest the third of wall A.
  let best: { cost: number; out: Partial<Record<Role, number>> } | null = null;
  for (const sink of sinks) {
    const dishwasher = dishwasherBy(sink);
    const hob = slots.map((_, i) => i).filter((i) => ok(i, [sink, dishwasher]) && !slots[i]!.window).reduce<number | undefined>((b, i) => (b === undefined || hobScore(sink, i) < hobScore(sink, b) ? i : b), undefined);
    const cost = (hob === undefined ? 100 : hobScore(sink, hob)) + (dishwasher === undefined ? 4 : 0) + Math.abs(sink - third) / 100;
    if (!best || cost < best.cost) best = { cost, out: { sink, ...(dishwasher !== undefined ? { dishwasher } : {}), ...(hob !== undefined ? { hob } : {}) } };
  }
  return best?.out ?? {};
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// Two posts of the triangle 1.20 to 2.70 m apart (exactly 1.20 m is not « less than 1.20 m »).
const tooNear = (d: number) => d < 1200 - 0.5;
const tooFar = (d: number) => d > 2700 + 0.5;
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
    if (sides.some(tooNear)) warn.push("Deux postes du triangle sont à moins de 1,20 m l'un de l'autre.");
    if (sides.some(tooFar)) warn.push("Deux postes du triangle sont à plus de 2,70 m l'un de l'autre.");
  } else if (sink && hob) {
    const d = dist(sink, hob);
    (tooNear(d) ? warn : ok).push(`Évier et plaque à ${m(d)} l'un de l'autre (1,20 m au moins conseillé).`);
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
