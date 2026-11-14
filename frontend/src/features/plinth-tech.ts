/**
 * Plinthe technique, en calcul pur : sur les plinthes d'une cuisine (« Plinthe A »…), une grille d'aération devant
 * chaque réfrigérateur et chaque four encastrés, et des tiroirs de plinthe sous les meubles bas qui s'y prêtent (pas
 * sous l'évier, le lave-vaisselle, un four ou un réfrigérateur, ni sous un meuble de moins de 40 cm). Une plinthe qui
 * reçoit des tiroirs est mise de côté (suspendue) et refaite en morceaux entre eux, de sa matière ; la façade d'un
 * tiroir prend sa place, son caisson va sous le meuble sur des coulisses. Les grilles et les coulisses vont au devis ; façades, fonds et côtés au débit. Pur.
 */
import { applianceDef } from "./appliance-library";
import { cabinetAxes, cabinetBox } from "../document/kitchen-catalog";
import { uniqueId } from "../document/operations";
import type { CadDocument, SketchFeature, TrimFeature, Vec3 } from "../document/types";
import type { FinishPart } from "./finish-parts";

export interface PlinthTechSettings {
  vents: boolean;
  drawers: boolean;
  /** The plinths put aside (made again in pieces between the drawers): given back when it is taken away. */
  replaced?: string[];
}

export const PLINTH_VENT = "Grille d'aération de plinthe";
export const PLINTH_SLIDES = "Coulisses de tiroir de plinthe (paire)";
/** A plinth drawer: under a unit this wide at least; its box this deep at most (mm). */
const NARROWEST = 400;
const DEEPEST = 450;

type Box = [Vec3, Vec3];

/** The plinths of the kitchen: their feature id, name and box (from their rectangle sketch). */
function plinths(doc: CadDocument): { id: string; name: string; box: Box }[] {
  return doc.features.flatMap((f) => {
    if (f.type !== "extrude" || f.suppressed || !/^Plinthe/.test(f.name)) return [];
    const s = doc.features.find((x): x is SketchFeature => x.id === f.sketch && x.type === "sketch");
    if (!s?.points.length) return [];
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    const z0 = s.offset ?? 0;
    return [{ id: f.id, name: f.name, box: [[Math.min(...xs), Math.min(...ys), z0], [Math.max(...xs), Math.max(...ys), z0 + f.distance]] as Box }];
  });
}

const overlap = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

/** The parts (grilles, drawers) and the plinths' cuts; what to say. */
export function plinthTech(doc: CadDocument, s: PlinthTechSettings): { parts: FinishPart[]; replaced: { id: string; pieces: number }[]; notes: string[] } {
  const parts: FinishPart[] = [];
  const replaced: { id: string; pieces: number }[] = [];
  const notes: string[] = [];
  const all = plinths(doc);
  if (!all.length) return { parts, replaced, notes: ["Aucune plinthe : posez la cuisine avec ses plinthes (Plan de cuisine)."] };
  const cabinets = doc.features.flatMap((f) => (f.type === "cabinet" && !f.suppressed ? [{ name: f.name, box: cabinetBox(f) as Box }] : []));
  const appliances = doc.features.flatMap((f) => {
    if (f.type !== "appliance" || f.suppressed) return [];
    const def = applianceDef(f.model);
    // The box it fills, whichever way it turns.
    const { along, back } = cabinetAxes(f.rotation ?? 0);
    const corners = [0, f.width].flatMap((w) => [0, f.depth].map((d) => [f.origin[0] + along[0] * w + back[0] * d, f.origin[1] + along[1] * w + back[1] * d]));
    const xs = corners.map((c) => c[0]!);
    const ys = corners.map((c) => c[1]!);
    return [{ name: f.name, category: def?.category, place: def?.place, box: [[Math.min(...xs), Math.min(...ys), f.origin[2]], [Math.max(...xs), Math.max(...ys), f.origin[2] + f.height]] as Box }];
  });
  const sinks = doc.features.flatMap((f) => (f.type === "machining" && f.kind === "cutout" && !f.suppressed ? (f.cutouts ?? []).filter((c) => c.appliance.startsWith("sink")).map(() => f.target) : []));
  let vents = 0;
  let drawers = 0;
  for (const p of all) {
    const [lo, hi] = p.box;
    const axis = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 1;
    const across = 1 - axis;
    const span = (b: Box): [number, number] => [b[0][axis]!, b[1][axis]!];
    const acrossOf = (b: Box) => (b[0][across]! + b[1][across]!) / 2;
    // The units over this plinth: along it, standing just behind it.
    const near = (b: Box) => overlap(span(b), [lo[axis]!, hi[axis]!]) > 50 && Math.abs(acrossOf(b) - acrossOf(p.box)) < 700 && b[0][2] < hi[2] + 400;
    const over = cabinets.filter((c) => near(c.box));
    if (!over.length) continue;
    // The fronts' side: away from the units.
    const out = acrossOf(p.box) > acrossOf(over[0]!.box) ? 1 : -1;
    const face = out > 0 ? hi[across]! : lo[across]!;
    const box = (a: [number, number], w: [number, number], z: [number, number]): Box => {
      const from: Vec3 = [0, 0, z[0]];
      const to: Vec3 = [0, 0, z[1]];
      [from[axis], to[axis]] = a;
      [from[across], to[across]] = w[0] <= w[1] ? w : [w[1], w[0]];
      return [from, to];
    };
    const height = hi[2] - lo[2];
    const busy = appliances.filter((a) => near(a.box));
    if (s.vents) {
      for (const a of busy.filter((x) => x.category === "fridge" || x.category === "oven")) {
        const [a0, a1] = span(a.box);
        const mid = (a0 + a1) / 2;
        const w = Math.min(450, a1 - a0 - 100);
        if (w < 100) continue;
        const [from, to] = box([mid - w / 2, mid + w / 2], [face, face + out * 2], [lo[2] + height * 0.25, lo[2] + height * 0.75]);
        parts.push({ name: `Grille d'aération ${++vents}`, from, to, hardware: true, item: PLINTH_VENT });
      }
    }
    if (s.drawers) {
      const gaps: [number, number][] = [];
      for (const c of over) {
        const [c0, c1] = span(c.box);
        const width = c1 - c0;
        const blocked = busy.some((a) => overlap(span(a.box), [c0, c1]) > 50 && a.category !== "hob" && a.category !== "hood" && a.category !== "tap") || /évier|evier|sink/i.test(c.name) || sinks.length && cabinetUnderSink(c.box, doc, sinks);
        if (width < NARROWEST || blocked) continue;
        const [d0, d1] = [c0 + 3, c1 - 3];
        const n = ++drawers;
        const [z0, z1] = [lo[2] + 5, hi[2] - 3];
        // The plinth left out where the front goes, the front in its place, the box behind it under the unit.
        gaps.push([d0 - 2, d1 + 2]);
        const back = face - out * (hi[across]! - lo[across]!);
        const deep = Math.min(DEEPEST, Math.abs(c.box[1][across]! - c.box[0][across]!) - 60);
        part(parts, `Tiroir de plinthe ${n} — façade`, box([d0, d1], [face, back], [z0, z1]));
        part(parts, `Tiroir de plinthe ${n} — fond`, box([d0 + 20, d1 - 20], [back, back - out * deep], [z0, z0 + 8]));
        part(parts, `Tiroir de plinthe ${n} — côté gauche`, box([d0 + 20, d0 + 32], [back, back - out * deep], [z0 + 8, z1 - 15]));
        part(parts, `Tiroir de plinthe ${n} — côté droit`, box([d1 - 32, d1 - 20], [back, back - out * deep], [z0 + 8, z1 - 15]));
        const [sf, st] = box([d0 + 8, d0 + 20], [back, back - out * deep], [z0 + 10, z0 + 30]);
        parts.push({ name: `Tiroir de plinthe ${n} — coulisses`, from: sf, to: st, hardware: true, item: PLINTH_SLIDES });
      }
      if (gaps.length) {
        // The plinth made again in pieces, between the drawers.
        const cutsAt = [lo[axis]!, ...gaps.sort((a, b) => a[0] - b[0]).flat(), hi[axis]!];
        let pieces = 0;
        for (let i = 0; i + 1 < cutsAt.length; i += 2) {
          const [a, b] = [cutsAt[i]!, cutsAt[i + 1]!];
          if (b - a > 5) part(parts, `${p.name} — morceau ${++pieces}`, box([a, b], [lo[across]!, hi[across]!], [lo[2], hi[2]]));
        }
        replaced.push({ id: p.id, pieces });
      }
    }
  }
  if (s.vents) notes.push(vents ? `${vents} grille${vents > 1 ? "s" : ""} d'aération devant le réfrigérateur et les fours encastrés.` : "Aucun réfrigérateur ni four encastré au-dessus d'une plinthe : pas de grille.");
  if (s.drawers) notes.push(drawers ? `${drawers} tiroir${drawers > 1 ? "s" : ""} de plinthe sous les meubles bas (ni l'évier, ni les appareils).` : "Aucun meuble bas de 40 cm au moins, sans appareil ni évier, au-dessus d'une plinthe : pas de tiroir.");
  return { parts, replaced, notes };
}

const part = (parts: FinishPart[], name: string, [from, to]: Box) => parts.push({ name, from, to });

/** Whether a sink is cut in the worktop over this unit. */
function cabinetUnderSink(b: Box, doc: CadDocument, sinkTops: string[]): boolean {
  return doc.features.some((f) => {
    if (f.type !== "machining" || f.kind !== "cutout" || !sinkTops.includes(f.target) || !f.cutouts) return false;
    const top = doc.features.find((x) => x.id === f.target);
    if (top?.type !== "extrude") return false;
    const s = doc.features.find((x): x is SketchFeature => x.id === top.sketch && x.type === "sketch");
    if (!s) return false;
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    const axis = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : 1;
    const start = axis === 0 ? Math.min(...xs) : Math.min(...ys);
    return f.cutouts.some((c) => c.appliance.startsWith("sink") && start + c.along > b[0][axis]! && start + c.along < b[1][axis]!);
  });
}

/**
 * The document with the kitchen's technical plinth made again: the one made before taken out (its plinths given
 * back), then, if anything is wanted, a Finitions « Plinthe technique », the plinths with drawers put aside. One step.
 * `material`: the material of a plinth (its pieces and its drawers' fronts take it).
 */
export function withPlinthTech(doc: CadDocument, s: PlinthTechSettings): { doc: CadDocument; notes: string[]; made: string | null; plinthOf: Map<string, string> } {
  const old = doc.features.filter((f): f is TrimFeature => f.type === "trim" && !!f.plinthTech);
  const given = new Set(old.flatMap((f) => f.plinthTech?.replaced ?? []));
  let next: CadDocument = { ...doc, features: doc.features.filter((f) => !old.includes(f as TrimFeature)).map((f) => (given.has(f.id) && f.suppressed ? { ...f, suppressed: false } : f)) };
  const { parts, replaced, notes } = plinthTech(next, s);
  if (!parts.length) return { doc: next, notes, made: null, plinthOf: new Map() };
  const ids = new Set(replaced.map((r) => r.id));
  next = { ...next, features: next.features.map((f) => (ids.has(f.id) ? { ...f, suppressed: true } : f)) };
  const id = uniqueId(next, "pt");
  next = { ...next, features: [...next.features, { id, type: "trim", name: "Plinthe technique", parts, plinthTech: { vents: s.vents, drawers: s.drawers, replaced: [...ids] } } satisfies TrimFeature] };
  // Which plinth each board comes from (its pieces, its drawers' fronts): for their material.
  const plinthOf = new Map<string, string>();
  const first = [...ids][0];
  parts.forEach((p, i) => {
    if (p.hardware) return;
    const owner = replaced.find((r) => p.name.startsWith(`${doc.features.find((f) => f.id === r.id)?.name} — `))?.id ?? first;
    if (owner) plinthOf.set(`${id}#${i}`, owner);
  });
  return { doc: next, notes, made: id, plinthOf };
}
