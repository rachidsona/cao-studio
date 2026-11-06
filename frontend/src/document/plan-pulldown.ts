/**
 * Les penderies escamotables d'un plan : une par tringle hors de portée (au-dessus de 1,90 m), achetée et comptée au
 * devis. Rien n'est gardé à part : ce qu'il faut se relit dans les tringles, et un clic remet les pièces à jour. Pur.
 */
import { REACH_ROD } from "./dressing-extras";
import { findFeature, uniqueId } from "./operations";
import type { CadDocument, DressingPlan, NicheFeature, SketchFeature, TrimFeature } from "./types";
import { nicheGeometry, worldBox } from "../features/niche-parts";

const ITEM = "Penderie escamotable";
const NAME = "Penderies escamotables";

type Part = TrimFeature["parts"][number];

/** What the rods of this plan call for, and whether the model differs from it. */
export function pullDownState(doc: CadDocument, plan: DressingPlan): { wanted: Part[]; stale: boolean } {
  const sketches = new Set(Object.values(plan.made ?? {}));
  const wanted = doc.features.flatMap((f): Part[] => {
    if (f.type !== "niche" || f.fill !== "rod" || !sketches.has(f.sketch)) return [];
    const rod = f as NicheFeature & { fill: "rod" };
    const here = nicheGeometry(rod, findFeature(doc, rod.sketch) as SketchFeature);
    if (typeof here === "string") return [];
    const y = here.box.y1 - rod.drop;
    if (y <= REACH_ROD) return [];
    const [from, to] = worldBox(here, { from: [here.box.x0 + 20, y - 20, here.depth / 2 - 20], to: [here.box.x1 - 20, y + 20, here.depth / 2 + 20] });
    return [{ name: ITEM, from, to, hardware: true, item: ITEM }];
  });
  const has = doc.features.find((f): f is TrimFeature => f.type === "trim" && f.name === NAME)?.parts ?? [];
  const same = (a: Part, b: Part) => [...a.from, ...a.to].every((v, i) => Math.abs(v - [...b.from, ...b.to][i]!) < 1);
  return { wanted, stale: wanted.length !== has.length || wanted.some((w) => !has.some((h) => same(w, h))) };
}

/** The pull-down rods brought up to date. */
export function withPullDowns(base: CadDocument, plan: DressingPlan): CadDocument {
  const { wanted } = pullDownState(base, plan);
  const others = base.features.filter((f) => !(f.type === "trim" && f.name === NAME));
  const doc = { ...base, features: others };
  return wanted.length ? { ...doc, features: [...others, { id: uniqueId(doc, "fi"), type: "trim", name: NAME, parts: wanted }] } : doc;
}
