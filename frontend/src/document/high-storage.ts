/**
 * « Rangement en hauteur » : ce qui, dans les Répartitions dessinées debout, est hors de portée de main — les niches
 * dont le bas est à 2 m du sol ou plus, et les tringles posées plus haut que 1,90 m — avec ce qu'elles contiennent et
 * ce qu'on en conseille : une penderie escamotable (pantographe, features/accessory-parts.ts) quand elle y tient, des
 * boîtes de rangement saisonnier dans une niche vide, des portes plutôt que des tiroirs là-haut. withPullDown remplace
 * la tringle d'une niche (ou garnit une niche vide) par la penderie escamotable, en une seule annulation. Pur.
 */
import { accessoryModel, accessoryProblem } from "../features/accessory-parts";
import { nicheGeometry } from "../features/niche-parts";
import { frameOf, toWorld } from "../sketcher/frame";
import { leafNiches } from "../sketcher/partition-history";
import { deleteFeatures, uniqueId } from "./operations";
import type { CadDocument, NicheFeature, SketchFeature } from "./types";

/** A niche whose bottom is this high or more is out of reach without a step (mm). */
export const REACH = 2000;
/** A rod higher than this is out of reach (170 to 190 cm advised: document/layout-check.ts). */
export const ROD_TOP = 1900;
const PULLDOWN = "pulldown";

export interface HighNiche {
  sketch: string;
  partition: string;
  path: number[];
  /** « Plan — mur a, niche 3 »: the sketch, then the niche's number (left to right, bottom to top). */
  name: string;
  width: number;
  height: number;
  /** Its bottom and top above the floor (mm). */
  bottom: number;
  top: number;
  /** What is in it: « vide », or the name of its equipment. */
  holds: string;
  advice: string;
  /** A pull-down rail fits and would bring it within reach: « Poser une penderie escamotable » is offered. */
  pulldown: boolean;
}

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The equipment of a niche (rod, drawers, accessory), not the doors or the back of the whole partition. */
function equipmentOf(doc: CadDocument, sketch: string, partition: string, path: number[]): NicheFeature | undefined {
  return doc.features.find((f): f is NicheFeature => f.type === "niche" && !f.suppressed && f.sketch === sketch && f.partition === partition && ["rod", "drawers", "accessory"].includes(f.fill) && same(f.niche, path));
}

/** Out-of-reach niches of the drawn partitions, highest last within each sketch; `length` writes a length. */
export function highNiches(doc: CadDocument, length: (mm: number) => string): HighNiche[] {
  const out: HighNiche[] = [];
  for (const sketch of doc.features.filter((f): f is SketchFeature => f.type === "sketch" && !f.suppressed)) {
    const frame = frameOf(sketch);
    // Drawn standing (a front or side plane): its v is the vertical.
    if (Math.abs(Math.abs(frame.v[2]) - 1) > 1e-6) continue;
    const niches = leafNiches(sketch);
    const byPartition = new Map<string, typeof niches>();
    for (const n of niches) byPartition.set(n.partition, [...(byPartition.get(n.partition) ?? []), n]);
    for (const [partition, list] of byPartition) {
      const order = [...list].sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0);
      order.forEach((n, i) => {
        const zs = [toWorld(frame, n.box.x0, n.box.y0)[2], toWorld(frame, n.box.x1, n.box.y1)[2]];
        const [bottom, top] = [Math.min(...zs), Math.max(...zs)];
        const equipment = equipmentOf(doc, sketch.id, partition, n.path);
        const rodAt = equipment?.fill === "rod" ? toWorld(frame, n.box.x0, n.box.y1 - equipment.drop)[2] : null;
        const highRod = rodAt !== null && rodAt > ROD_TOP + 1e-6;
        if (bottom < REACH - 1e-6 && !highRod) return;
        const geometry = nicheGeometry({ partition, niche: n.path, fill: "accessory" }, sketch);
        const fits = typeof geometry !== "string" && accessoryProblem({ accessory: { model: PULLDOWN, lift: 0 }, thickness: 18 }, geometry) === null;
        const at = length(bottom);
        let holds = "vide";
        let advice: string;
        let pulldown = false;
        if (equipment?.fill === "accessory") {
          const label = accessoryModel(equipment.accessory?.model)?.label ?? "Accessoire";
          holds = equipment.name;
          advice = equipment.accessory?.model === PULLDOWN ? "Penderie escamotable : elle descend à hauteur de main." : `« ${label} » à ${at} du sol : hors de portée sans escabeau.`;
        } else if (equipment?.fill === "drawers") {
          holds = equipment.name;
          advice = `Tiroirs à ${at} du sol, hors de portée : des portes ou un abattant valent mieux là-haut.`;
        } else if (highRod) {
          holds = `${equipment!.name} (tringle à ${length(rodAt!)})`;
          pulldown = fits;
          advice = fits ? `Tringle à ${length(rodAt!)} du sol, hors de portée : une penderie escamotable la descend à hauteur de main.` : `Tringle à ${length(rodAt!)} du sol, hors de portée : baissez-la sous ${length(ROD_TOP)} (la penderie escamotable n'y tient pas).`;
        } else {
          pulldown = fits;
          advice = fits ? "Assez grande pour une penderie escamotable ; sinon, des boîtes de rangement saisonnier (valises, couettes), prises avec un escabeau." : "Rangement saisonnier : valises, couettes, boîtes, prises avec un escabeau.";
        }
        out.push({ sketch: sketch.id, partition, path: n.path, name: `${sketch.name}, niche ${i + 1}`, width: n.box.x1 - n.box.x0, height: n.box.y1 - n.box.y0, bottom, top, holds, advice, pulldown });
      });
    }
  }
  return out;
}

/** The niche's rod (if any) taken out and a pull-down rail hung in it instead; or why not. */
export function withPullDown(doc: CadDocument, niche: Pick<HighNiche, "sketch" | "partition" | "path">): { doc: CadDocument; name: string } | string {
  const sketch = doc.features.find((f): f is SketchFeature => f.id === niche.sketch && f.type === "sketch");
  const geometry = nicheGeometry({ partition: niche.partition, niche: niche.path, fill: "accessory" }, sketch);
  if (typeof geometry === "string") return geometry;
  const problem = accessoryProblem({ accessory: { model: PULLDOWN, lift: 0 }, thickness: 18 }, geometry);
  if (problem) return problem;
  const equipment = equipmentOf(doc, niche.sketch, niche.partition, niche.path);
  if (equipment && equipment.fill !== "rod") return `La niche porte déjà « ${equipment.name} » : retirez-le d'abord.`;
  const base = equipment ? deleteFeatures(doc, [equipment.id]).next : doc;
  const label = accessoryModel(PULLDOWN)!.label;
  const used = base.features.map((f) => new RegExp(`^${label} (\\d+)$`).exec(f.name)?.[1]).filter((n): n is string => n !== undefined).map(Number);
  const name = `${label} ${Math.max(0, ...used) + 1}`;
  const feature: NicheFeature = {
    id: uniqueId(base, "ac"), type: "niche", name, sketch: niche.sketch, partition: niche.partition, niche: [...niche.path], fill: "accessory",
    accessory: { model: PULLDOWN, lift: 0 }, diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: false,
  };
  return { doc: { ...base, features: [...base.features, feature] }, name };
}
