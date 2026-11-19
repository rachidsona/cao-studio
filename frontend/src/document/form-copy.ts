/**
 * « Pipette de forme » : la forme d'un élément donnée telle quelle à un autre de même sorte — ses cotes et son
 * apparence — l'autre gardant sa place, son orientation, son nom et son identité. Un meuble de cuisine prend le
 * modèle, les façades, l'intérieur et les cotes (largeur, hauteur, profondeur) d'un autre, et la cuisine est refaite ;
 * un caisson prend les cotes et la construction d'un autre ; des façades prennent la disposition, la pose, le jeu et le
 * style d'autres ; une niche prend les tiroirs, la tringle, l'accessoire ou le style des portes d'une autre. Chaque
 * panneau prend l'apparence, telle qu'on la voit, du panneau de même rang. Une porte ou des tiroirs donnent au moins
 * leur style (cadre, verre, cannelures) et leur apparence à toute autre porte ; un électroménager (évier, four) garde
 * sa forme, seul le style de ses portes passe. La matière (débit, devis) ne change pas. Pur.
 */
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { planItemOf, type PlanItem } from "./kitchen-plan-add";
import { findFeature, updateFeature } from "./operations";
import { featureOfBody, type CabinetFeature, type CadDocument, type Feature, type FrontsFeature, type KitchenRunItem, type NicheFeature } from "./types";
import { applianceOf, itemEntry } from "../features/kitchen-run-items";
import { withLookCopied } from "../appearance/assign";

/** What a clicked body is, as far as its form goes. */
export type FormSource =
  | { kind: "unit"; at: PlanItem; label: string }
  | { kind: "cabinet"; id: string; label: string }
  | { kind: "fronts"; id: string; label: string }
  | { kind: "niche"; id: string; fill: NicheFeature["fill"]; label: string };

const STYLE = ["style", "frameWidth", "frameDepth", "pitch", "grooves", "glass", "profile"] as const;
const CABINET = ["width", "height", "depth", "thickness", "back", "backThickness", "shelves", "dividers", "plinth", "construction", "top"] as const;
const FRONTS = ["layout", "side", "grip", "drawers", "topDrawer", "innerDrawers", "mount", "gap", "thickness", "hinges", "handles", ...STYLE] as const;
const UNIT = ["model", "own", "width", "height", "depth", "side", "grip", "facade", "layout", "drawers", "topDrawer", "innerDrawers", "shelves", "dividers"] as const;
const NICHE: Partial<Record<NicheFeature["fill"], readonly string[]>> = {
  rod: ["diameter", "drop"],
  drawers: ["drawers", "gap", "bottomGap", "betweenGap", "sideGap", "inner", "mount", "thickness", "handles", ...STYLE],
  accessory: ["accessory"],
  doors: ["mount", "thickness", "handles", ...STYLE],
  door: ["mount", "cover", "thickness", "handles", ...STYLE],
};
const FILL_NAME: Record<NicheFeature["fill"], string> = { rod: "Penderie", drawers: "Tiroirs", doors: "Portes", door: "Porte", accessory: "Accessoire", back: "Fond" };

/** `keys` of `from` set on `to` (a key `from` lacks is taken away from `to`, as « missing » is a value too). */
function taken<T extends object>(to: T, from: object, keys: readonly string[]): T {
  const next = { ...to } as Record<string, unknown>;
  for (const key of keys) {
    const value = (from as Record<string, unknown>)[key];
    if (value === undefined) delete next[key];
    else next[key] = structuredClone(value);
  }
  return next as T;
}

const itemOf = (doc: CadDocument, at: PlanItem): KitchenRunItem | undefined => kitchenPlanIn(doc, at.plan)?.runs?.[at.run]?.find((i) => i.id === at.item);

/** The form a body of the view belongs to, or null (a board of its own, a wall, a worktop…). */
export function formOf(doc: CadDocument, bodyId: string): FormSource | null {
  const feature = findFeature(doc, featureOfBody(bodyId));
  if (!feature) return null;
  const cabinet = feature.type === "cabinet" ? feature.id : feature.type === "fronts" ? feature.cabinet : null;
  const at = cabinet ? planItemOf(doc, cabinet) : null;
  const item = at ? itemOf(doc, at) : undefined;
  if (at && item && !item.furnished) return { kind: "unit", at, label: `${itemEntry(item).name} ${item.width / 10} cm` };
  if (feature.type === "cabinet") return { kind: "cabinet", id: feature.id, label: feature.name };
  if (feature.type === "fronts") return { kind: "fronts", id: feature.id, label: feature.name };
  if (feature.type === "niche" && feature.fill !== "back") return { kind: "niche", id: feature.id, fill: feature.fill, label: `${FILL_NAME[feature.fill]} (${feature.name})` };
  return null;
}

/** The look of the doors or drawers `source` has, if it has some (their style, with its sizes). */
function frontStyle(doc: CadDocument, source: FormSource): object | null {
  if (source.kind === "unit") return itemOf(doc, source.at)?.facade ?? {};
  const f = findFeature(doc, source.id);
  if (f?.type === "fronts") return f;
  if (f?.type === "niche" && (f.fill === "doors" || f.fill === "door" || f.fill === "drawers")) return f;
  return null;
}

const feature = <T extends Feature>(doc: CadDocument, id: string) => findFeature(doc, id) as T;

/** `to` given the form of `from`, and the look of its boards (`bodies`: those of the view); or why not. */
export function withFormCopied(doc: CadDocument, from: FormSource, to: FormSource, bodies: readonly string[] = []): CadDocument | string {
  const next = formCopied(doc, from, to);
  return typeof next === "string" ? next : withLooksCopied(doc, next, from, to, bodies);
}

/** The features whose boards take a look: the one clicked; a unit's cabinet and fronts (its fronts only, for a style). */
function parts(doc: CadDocument, source: FormSource, other: FormSource): string[] {
  if (source.kind !== "unit") return [source.id];
  const cabinet = cabinetOfUnit(doc, source);
  const fronts = cabinet ? doc.features.find((f) => f.type === "fronts" && f.cabinet === cabinet)?.id : undefined;
  if (other.kind === "unit") return [cabinet, fronts].filter((id): id is string => !!id);
  return [other.kind === "cabinet" ? cabinet : fronts].filter((id): id is string => !!id);
}

/** Each board of `to` seen as the board of the same rank of `from` (as its last one, beyond). */
function withLooksCopied(before: CadDocument, doc: CadDocument, from: FormSource, to: FormSource, bodies: readonly string[]): CadDocument {
  const ranks = (feature: string) => bodies.filter((b) => featureOfBody(b) === feature).map((b) => Number(b.slice(b.lastIndexOf("#") + 1)));
  const source = parts(before, from, to);
  let next = doc;
  parts(doc, to, from).forEach((id, k) => {
    const of = source[k];
    const mine = of ? ranks(of) : [];
    if (!of || !mine.length) return;
    for (const n of new Set([...mine, ...ranks(id)])) next = withLookCopied(next, `${of}#${mine.includes(n) ? n : Math.max(...mine)}`, [`${id}#${n}`]);
  });
  return next;
}

function formCopied(doc: CadDocument, from: FormSource, to: FormSource): CadDocument | string {
  if (from.kind === to.kind && (from.kind === "unit" ? to.kind === "unit" && from.at.plan === to.at.plan && from.at.run === to.at.run && from.at.item === to.at.item : from.id === (to as { id: string }).id)) return "C'est l'élément dont la forme est prise : cliquez-en un autre.";
  const style = frontStyle(doc, from);
  if (to.kind === "unit") {
    const source = from.kind === "unit" ? itemOf(doc, from.at) : undefined;
    const target = itemOf(doc, to.at);
    const plan = kitchenPlanIn(doc, to.at.plan);
    if (!target || !plan) return "Ce meuble n'est plus dans le plan de cuisine.";
    let item: KitchenRunItem;
    if (source) {
      if (source.furnished) return "Un caisson aménagé à la main ne donne pas sa forme.";
      if (itemEntry(source).kind !== itemEntry(target).kind) return `Un meuble ${kindName(itemEntry(source).kind)} ne donne pas sa forme à un meuble ${kindName(itemEntry(target).kind)}.`;
      // An appliance keeps its form (a sink, an oven): only the style of the doors goes, to or from it.
      item = applianceOf(source) || applianceOf(target) ? taken(target, source, ["facade"]) : taken(target, source, UNIT);
    } else if (style) item = { ...target, facade: taken({}, style, STYLE) };
    else return "Un meuble de cuisine prend la forme d'un autre meuble, ou le style d'une porte.";
    const runs = { ...plan.runs, [to.at.run]: (plan.runs?.[to.at.run] ?? []).map((i) => (i.id === target.id ? item : i)) };
    const built = withKitchenBuilt(doc, to.at.plan, { runs });
    return typeof built === "string" ? built : built.doc;
  }
  if (to.kind === "cabinet") {
    const id = from.kind === "cabinet" ? from.id : from.kind === "unit" ? cabinetOfUnit(doc, from) : null;
    if (!id) return "Un caisson prend la forme d'un autre caisson.";
    const source = feature<CabinetFeature>(doc, id);
    return updateFeature(doc, to.id, (f) => taken(f, source, CABINET));
  }
  if (to.kind === "fronts") {
    const source = from.kind === "fronts" ? feature<FrontsFeature>(doc, from.id) : null;
    if (source) return updateFeature(doc, to.id, (f) => taken(f, source, FRONTS));
    if (style) return updateFeature(doc, to.id, (f) => taken(f, style, STYLE));
    return "Des façades prennent la forme d'autres façades, ou le style d'une porte.";
  }
  const target = feature<NicheFeature>(doc, to.id);
  if (from.kind === "niche" && from.fill === to.fill) return updateFeature(doc, to.id, (f) => taken(f, feature<NicheFeature>(doc, from.id), NICHE[to.fill] ?? []));
  if (style && (target.fill === "doors" || target.fill === "door" || target.fill === "drawers")) return updateFeature(doc, to.id, (f) => taken(f, style, STYLE));
  return `${FILL_NAME[target.fill]} prend la forme d'une niche de même sorte${target.fill === "rod" || target.fill === "accessory" ? "" : ", ou le style d'une porte"}.`;
}

/** The cabinet a plan unit is. */
function cabinetOfUnit(doc: CadDocument, unit: Extract<FormSource, { kind: "unit" }>): string | null {
  const made = findFeature(doc, unit.at.plan);
  if (made?.type !== "sketch") return null;
  return (made.kitchenPlan?.made?.[unit.at.run] ?? []).find((id) => planItemOf(doc, id)?.item === unit.at.item) ?? null;
}

const kindName = (kind: string) => ({ base: "bas", wall: "haut", tall: "colonne" })[kind] ?? kind;
