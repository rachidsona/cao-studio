/**
 * « Pipette de forme » : la forme d'un élément donnée telle quelle à un autre de même sorte — ses cotes et son
 * apparence — l'autre gardant sa place, son orientation, son nom et son identité. Un meuble de cuisine prend le
 * modèle, les façades, l'intérieur et les cotes (largeur, hauteur, profondeur) d'un autre, et la cuisine est refaite ;
 * un caisson prend les cotes et la construction d'un autre ; des façades prennent la disposition, la pose, le jeu et le
 * style d'autres ; une niche prend la hauteur et la largeur de case, les tiroirs, la tringle, l'accessoire ou les
 * portes d'une autre (leur ouverture — de côté, relevante, abattante —, leur poignée, leur jeu, leur ferrure, leur style), les étagères et cloisons autour suivant (comme l'outil « Niche »). Chaque
 * panneau prend l'apparence, telle qu'on la voit, du panneau de même rang. Une porte ou des tiroirs donnent au moins
 * leur style (cadre, verre, cannelures) et leur apparence à toute autre porte ; un électroménager (évier, four) garde
 * sa forme, seul le style de ses portes passe. D'une porte de tout genre à une autre (niche, façades, meuble de
 * cuisine), le style, le sens d'ouverture et la poignée passent ; un corps quelconque donne ses cotes, sa matière et
 * son apparence ; une étagère ou une cloison la division de sa niche (document/form-copy-more.ts). La matière d'un
 * élément (débit, devis) ne change pas, celle d'un corps copié si. Pur.
 */
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { planItemOf, type PlanItem } from "./kitchen-plan-add";
import { findFeature, updateFeature } from "./operations";
import { featureOfBody, type CabinetFeature, type CadDocument, type Feature, type FrontsFeature, type KitchenRunItem, type NicheFeature } from "./types";
import { applianceOf, itemEntry } from "../features/kitchen-run-items";
import { withLookCopied } from "../appearance/assign";
import { withNicheHeld, withNicheSize } from "./niche-size";
import { pathKey, rebuildChain } from "../sketcher/partition-history";
import type { NicheBox } from "../sketcher/shelves";
import { divisionOf, doorOf, frontsWithDoor, nicheWithDoor, placeLabel, unitWithDoor, withBodyCopied, withDivisionCopied, type Box, type DoorForm } from "./form-copy-more";
import type { NichePlace } from "./niche-recipe";

/** What a clicked body is, as far as its form goes. */
export type FormSource =
  | { kind: "unit"; at: PlanItem; label: string }
  | { kind: "cabinet"; id: string; label: string }
  | { kind: "fronts"; id: string; label: string }
  | { kind: "niche"; id: string; fill: NicheFeature["fill"]; label: string }
  /** A shelf or a cloison: the niche it divides; a niche picked in the view (a target only). */
  | { kind: "division"; place: NichePlace; label: string }
  | { kind: "place"; place: NichePlace; label: string }
  | { kind: "body"; id: string; label: string };
/** An element of the furniture (not a body, a division or a niche picked). */
type Element = Extract<FormSource, { kind: "unit" | "cabinet" | "fronts" | "niche" }>;

const STYLE = ["style", "frameWidth", "frameDepth", "pitch", "grooves", "glass", "profile"] as const;
const CABINET = ["width", "height", "depth", "thickness", "back", "backThickness", "shelves", "dividers", "plinth", "construction", "top"] as const;
const FRONTS = ["layout", "side", "grip", "drawers", "topDrawer", "innerDrawers", "mount", "gap", "thickness", "hinges", "handles", ...STYLE] as const;
const UNIT = ["model", "own", "width", "height", "depth", "side", "grip", "facade", "layout", "drawers", "topDrawer", "innerDrawers", "shelves", "dividers"] as const;
const NICHE: Partial<Record<NicheFeature["fill"], readonly string[]>> = {
  rod: ["diameter", "drop"],
  drawers: ["drawers", "gap", "bottomGap", "betweenGap", "sideGap", "inner", "mount", "thickness", "handles", ...STYLE],
  accessory: ["accessory"],
  // How it opens (the side of its hinges, or along its top: lift-up), its gap and its hardware (stays) go with it.
  doors: ["mount", "thickness", "handles", "hinges", "gap", "hw", ...STYLE],
  door: ["mount", "cover", "thickness", "handles", "hinges", "gap", "hw", ...STYLE],
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
  const division = divisionOf(doc, bodyId);
  if (division) return { kind: "division", place: { sketch: division.sketch, partition: division.partition, path: division.path }, label: placeLabel(doc, division, division.vertical) };
  // The room's walls and the appliances are not furniture to copy.
  if (feature.type === "appliance" || doc.bodyInfo?.[bodyId]?.room || doc.bodyInfo?.[feature.id]?.room) return null;
  return { kind: "body", id: bodyId, label: doc.bodyNames?.[bodyId] ?? feature.name };
}

/** The door `source` is or has, whatever made it (a niche, fronts, a kitchen unit). */
function doorFrom(doc: CadDocument, source: Element): DoorForm | null {
  if (source.kind === "unit") {
    const item = itemOf(doc, source.at);
    return item ? doorOf({ ...item, side: item.side ?? itemEntry(item).side }) : null;
  }
  const f = source.kind === "fronts" || source.kind === "niche" ? findFeature(doc, source.id) : null;
  return f?.type === "fronts" || f?.type === "niche" ? doorOf(f) : null;
}

/** The look of the doors or drawers `source` has, if it has some (their style, with its sizes). */
function frontStyle(doc: CadDocument, source: Element): object | null {
  if (source.kind === "unit") return itemOf(doc, source.at)?.facade ?? {};
  const f = findFeature(doc, source.id);
  if (f?.type === "fronts") return f;
  if (f?.type === "niche" && (f.fill === "doors" || f.fill === "door" || f.fill === "drawers")) return f;
  return null;
}

const feature = <T extends Feature>(doc: CadDocument, id: string) => findFeature(doc, id) as T;

/**
 * `to` given the form of `from`, and the look of its boards (`bodies`: those of the view); or why not. A body takes
 * its sizes from `boxOf` (its box in the view); `notes`: what could not be copied.
 */
export function withFormCopied(doc: CadDocument, from: FormSource, to: FormSource, bodies: readonly string[] = [], boxOf: (id: string) => Box | null = () => null, notes: string[] = []): CadDocument | string {
  if (from.kind === "body" || to.kind === "body") return from.kind === "body" && to.kind === "body" ? withBodyCopied(doc, from.id, to.id, boxOf, notes) : "Un corps prend la forme d'un autre corps.";
  if (from.kind === "division" || to.kind === "division" || to.kind === "place") {
    if (from.kind !== "division") return "Une niche prend la division d'une autre : cliquez d'abord une étagère ou une cloison.";
    return to.kind === "division" || to.kind === "place" ? withDivisionCopied(doc, from.place, to.place) : "Une étagère ou une cloison donne sa division à une niche : cliquez la niche, ou l'une de ses étagères.";
  }
  if (from.kind === "place") return "Cliquez d'abord une étagère ou une cloison.";
  const next = formCopied(doc, from, to);
  return typeof next === "string" ? next : withLooksCopied(doc, next, from, to, bodies);
}

/** The features whose boards take a look: the one clicked; a unit's cabinet and fronts (its fronts only, for a style). */
function parts(doc: CadDocument, source: Element, other: Element): string[] {
  if (source.kind !== "unit") return [source.id];
  const cabinet = cabinetOfUnit(doc, source);
  const fronts = cabinet ? doc.features.find((f) => f.type === "fronts" && f.cabinet === cabinet)?.id : undefined;
  if (other.kind === "unit") return [cabinet, fronts].filter((id): id is string => !!id);
  return [other.kind === "cabinet" ? cabinet : fronts].filter((id): id is string => !!id);
}

/** Each board of `to` seen as the board of the same rank of `from` (as its last one, beyond). */
function withLooksCopied(before: CadDocument, doc: CadDocument, from: Element, to: Element, bodies: readonly string[]): CadDocument {
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

function formCopied(doc: CadDocument, from: Element, to: Element): CadDocument | string {
  if (from.kind === to.kind && (from.kind === "unit" ? to.kind === "unit" && from.at.plan === to.at.plan && from.at.run === to.at.run && from.at.item === to.at.item : from.id === (to as { id: string }).id)) return "C'est l'élément dont la forme est prise : cliquez-en un autre.";
  const style = frontStyle(doc, from);
  const door = doorFrom(doc, from);
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
    } else if (door) item = unitWithDoor(target, door);
    else if (style) item = { ...target, facade: taken({}, style, STYLE) };
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
    if (door) return updateFeature(doc, to.id, (f) => frontsWithDoor(f as FrontsFeature, door));
    if (style) return updateFeature(doc, to.id, (f) => taken(f, style, STYLE));
    return "Des façades prennent la forme d'autres façades, ou le style d'une porte.";
  }
  const target = feature<NicheFeature>(doc, to.id);
  const styled = target.fill === "doors" || target.fill === "door" || target.fill === "drawers";
  if (from.kind === "niche" && (from.fill === to.fill || (style && styled))) {
    const source = feature<NicheFeature>(doc, from.id);
    const sized = withNicheSized(doc, source, to.id);
    if (typeof sized === "string") return sized;
    if (from.fill === to.fill) return updateFeature(sized, to.id, (f) => taken(f, source, NICHE[to.fill] ?? []));
    return updateFeature(sized, to.id, (f) => (door && target.fill !== "drawers" ? nicheWithDoor(f as NicheFeature, door) : taken(f, source, STYLE)));
  }
  if (door && (target.fill === "door" || target.fill === "doors")) return updateFeature(doc, to.id, (f) => nicheWithDoor(f as NicheFeature, door));
  if (style && styled) return updateFeature(doc, to.id, (f) => taken(f, style, STYLE));
  return `${FILL_NAME[target.fill]} prend la forme d'une niche de même sorte${target.fill === "rod" || target.fill === "accessory" ? "" : ", ou le style d'une porte"}.`;
}

/** The box of the niche a niche feature fills, in its sketch (mm). */
function nicheBox(doc: CadDocument, niche: NicheFeature): NicheBox | null {
  const g = findFeature(doc, niche.sketch);
  if (g?.type !== "sketch") return null;
  const made = rebuildChain(g, niche.partition);
  return typeof made === "string" ? null : (made.niches.get(pathKey(niche.niche))?.box ?? null);
}

/** Niche `to` made as high and as wide as niche `from`: the shelves and cloisons around it follow; or why not. */
function withNicheSized(doc: CadDocument, from: NicheFeature, to: string): CadDocument | string {
  let next = doc;
  for (const axis of ["y", "x"] as const) {
    const target = feature<NicheFeature>(next, to);
    let want = nicheBox(next, from);
    let box = nicheBox(next, target);
    if (!want || !box) return next;
    // In the same piece, the source is held at its size first: it does not share what the target gives up.
    if (from.sketch === target.sketch && Math.abs(want[axis === "y" ? "y1" : "x1"] - want[axis === "y" ? "y0" : "x0"] - (box[axis === "y" ? "y1" : "x1"] - box[axis === "y" ? "y0" : "x0"])) >= 0.5) {
      const held = axis === "y" ? withNicheHeld(next, from.sketch, [want.y0, want.y1]) : withNicheSize(next, from.sketch, axis, [want.x0, want.x1], want.x1 - want.x0);
      if (typeof held !== "string") next = held;
      want = nicheBox(next, from);
      box = nicheBox(next, target);
      if (!want || !box) return next;
    }
    const [w0, w1, b0, b1] = axis === "y" ? [want.y0, want.y1, box.y0, box.y1] : [want.x0, want.x1, box.x0, box.x1];
    if (Math.abs(w1 - w0 - (b1 - b0)) < 0.5) continue;
    const sized = withNicheSize(next, target.sketch, axis, [b0, b1], w1 - w0);
    if (typeof sized === "string") return `« ${target.name} » ne peut pas prendre la ${axis === "y" ? "hauteur" : "largeur"} de « ${from.name} » : ${sized}`;
    next = sized;
  }
  return next;
}

/** The cabinet a plan unit is. */
function cabinetOfUnit(doc: CadDocument, unit: Extract<FormSource, { kind: "unit" }>): string | null {
  const made = findFeature(doc, unit.at.plan);
  if (made?.type !== "sketch") return null;
  return (made.kitchenPlan?.made?.[unit.at.run] ?? []).find((id) => planItemOf(doc, id)?.item === unit.at.item) ?? null;
}

const kindName = (kind: string) => ({ base: "bas", wall: "haut", tall: "colonne" })[kind] ?? kind;
