/**
 * Cotation automatique de l'esquisse : d'un coup, les cotes de chaîne (d'un niveau de points au suivant, en X sous le
 * dessin et en Y à sa gauche), les cotes hors tout (au-delà des chaînes), les diamètres des cercles et les rayons des
 * arcs — des traits sélectionnés, sinon de tout le dessin (hors construction). Ce sont des cotes de référence :
 * mesurées, jamais imposées, elles suivent le dessin sans le figer ni le contredire. Relancée, elle remplace celles
 * qu'elle avait posées. Pur.
 */
import { curvePoints, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import { nextId, pointPos } from "./edit";

/** The label of the dimensions it lays (to replace them when run again). */
export const AUTO_LABEL = "Cote auto";
/** Above this many levels on an axis, the chain would be unreadable: only the overall dimension. */
const MAX_CHAIN = 40;

export function autoDimensions(g: SketchGeometry, selection: ReadonlySet<string> = new Set()): { geometry: SketchGeometry; count: number } {
  const chosen = selection.size ? g.curves.filter((c) => selection.has(c.id)) : g.curves.filter((c) => !c.construction && !c.projected);
  const kept = g.constraints.filter((c) => !("label" in c && c.label === AUTO_LABEL));
  const work: SketchGeometry = { ...g, constraints: [...kept] };
  const ids = new Set<string>();
  for (const c of chosen) for (const p of c.kind === "line" ? curvePoints(c) : c.kind === "arc" ? [c.start, c.end] : []) ids.add(p);
  const pos = [...ids].map((id) => ({ id, p: pointPos(g, id) }));
  const added: SketchConstraint[] = [];
  const add = (c: Omit<SketchConstraint, "id">) => {
    const made = { ...c, id: nextId({ ...work, constraints: [...work.constraints, ...added] }, "c") } as SketchConstraint;
    added.push(made);
  };
  if (pos.length >= 2) {
    const xs = pos.map((q) => q.p[0]);
    const ys = pos.map((q) => q.p[1]);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    for (const axis of [0, 1] as const) {
      // One point per level along the axis (the lowest, or the leftmost, so the chain sits along one side).
      const levels = new Map<number, (typeof pos)[number]>();
      for (const q of pos) {
        const key = Math.round(q.p[axis] * 100) / 100;
        const best = levels.get(key);
        if (!best || q.p[1 - axis]! < best.p[1 - axis]!) levels.set(key, q);
      }
      const sorted = [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([, q]) => q);
      if (sorted.length < 2) continue;
      const kind = axis === 0 ? "distanceX" : "distanceY";
      const span = (a: (typeof pos)[number], b: (typeof pos)[number]) => Number((b.p[axis] - a.p[axis]).toFixed(6));
      if (sorted.length > 2 && sorted.length <= MAX_CHAIN) {
        for (let i = 0; i + 1 < sorted.length; i++) add({ kind, a: sorted[i]!.id, b: sorted[i + 1]!.id, value: span(sorted[i]!, sorted[i + 1]!), driving: false, label: AUTO_LABEL, offset: size * 0.16 } as Omit<SketchConstraint, "id">);
      }
      const [first, last] = [sorted[0]!, sorted.at(-1)!];
      add({ kind, a: first.id, b: last.id, value: span(first, last), driving: false, label: AUTO_LABEL, offset: size * (sorted.length > 2 ? 0.3 : 0.16) } as Omit<SketchConstraint, "id">);
    }
  }
  for (const c of chosen) {
    if (c.kind === "circle") add({ kind: "diameter", curve: c.id, value: Number((c.radius * 2).toFixed(6)), driving: false, label: AUTO_LABEL } as Omit<SketchConstraint, "id">);
    else if (c.kind === "arc") add({ kind: "radius", curve: c.id, value: Number(c.radius.toFixed(6)), driving: false, label: AUTO_LABEL } as Omit<SketchConstraint, "id">);
  }
  return { geometry: { ...work, constraints: [...work.constraints, ...added] }, count: added.length };
}
