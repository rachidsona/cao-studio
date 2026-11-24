/**
 * Ce qu'on a changé à la main dans la 3D sur un meuble que le Plan de cuisine a fait — les réglages de son caisson et
 * de ses façades, la matière de ses pièces, son nom — gardé par son meuble du linéaire (`KitchenRunItem.keep`) : la
 * cuisine refaite le refait ainsi (document/kitchen-plan.ts). On compare le meuble tel qu'il est à ce que le plan en
 * ferait sans rien garder : ce que le plan change lui-même n'est jamais pris pour un choix. Pur.
 */
import { cabinetPartNames } from "../features/cabinet-parts";
import { frontsPartNames } from "../features/fronts-parts";
import type { KitchenLayout, KitchenUnit } from "../features/kitchen-layout";
import { FRONT_MATERIAL, WORKTOP_MATERIAL } from "./kitchen-floor";
import { layoutPlan } from "./kitchen-plan";
import { FRONT } from "./kitchen-plan-shapes";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature, type KitchenFloorPlan, type KitchenUnitKeep } from "./types";

const CABINET = ["thickness", "back", "backThickness", "plinth", "construction", "top", "railWidth", "shelfSetback"] as const;
const FRONTS = ["mount", "gap", "thickness", "hinges", "drawerShares"] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What of `c` (and its first fronts) differs from what the plan makes of `u`, or undefined: nothing. */
export function keptOf(doc: CadDocument, plan: KitchenFloorPlan, u: KitchenUnit, c: CabinetFeature, fronts: FrontsFeature | undefined): KitchenUnitKeep | undefined {
  const layout: KitchenLayout = { units: [{ ...u, keep: undefined }], boxes: [], notes: [], ergonomics: { ok: [], warn: [] } };
  const base = layoutPlan(doc, layout, FRONT, plan.frontMaterial ?? FRONT_MATERIAL, plan.worktopMaterial ?? WORKTOP_MATERIAL, plan.place);
  const cab = base.features.find((f): f is CabinetFeature => f.type === "cabinet");
  const fr = base.features.find((f): f is FrontsFeature => f.type === "fronts");
  if (!cab) return undefined;
  const keep: KitchenUnitKeep = {};
  const cabinet = Object.fromEntries(CABINET.filter((k) => !same(c[k], cab[k])).map((k) => [k, c[k]]));
  if (Object.keys(cabinet).length) keep.cabinet = cabinet;
  if (fronts && fr) {
    const own = Object.fromEntries(FRONTS.filter((k) => !same(fronts[k], fr[k])).map((k) => [k, fronts[k]]));
    if (Object.keys(own).length) keep.fronts = own;
  }
  // The material of each piece, by its name, where it is not the plan's.
  const looks = (id: string, baseId: string, names: string[]) => Object.fromEntries(names.flatMap((name, i): [string, string][] => {
    const now = doc.bodyInfo?.[`${id}${PART_SEPARATOR}${i}`]?.material;
    return now && now !== base.info[`${baseId}${PART_SEPARATOR}${i}`]?.material ? [[name, now]] : [];
  }));
  const carcass = looks(c.id, cab.id, cabinetPartNames(c));
  if (Object.keys(carcass).length) keep.carcass = carcass;
  if (fronts && fr) {
    const facing = looks(fronts.id, fr.id, frontsPartNames(fronts, c));
    if (Object.keys(facing).length) keep.facing = facing;
  }
  const name = doc.bodyNames?.[c.id];
  if (name) keep.name = name;
  return Object.keys(keep).length ? keep : undefined;
}
