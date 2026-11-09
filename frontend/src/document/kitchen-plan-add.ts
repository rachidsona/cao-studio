/**
 * « Meubles de cuisine » lié au Plan de cuisine : dans un projet qui a un plan, un meuble du catalogue (ou un des siens) se
 * range dans un de ses linéaires, comme dans l'éditeur de linéaire (features/kitchen-run-items.ts) — après le meuble donné
 * s'il vient du plan, sinon au bout de sa rangée sur le premier linéaire où il tient sans en chasser un autre —, et la
 * cuisine est refaite en une seule annulation (kitchen-floor.ts). Chaque caisson fait par le plan se relie à son meuble
 * du linéaire. Pur.
 */
import type { CatalogEntry } from "./kitchen-catalog";
import { kitchenPlanIn, kitchenPlanOf, kitchenRunOf, withKitchenBuilt } from "./kitchen-floor";
import { kitchenFromPlan } from "./kitchen-plan-build";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { kitchenRuns, kitchenSizes, runGeometry, type KitchenRun } from "./kitchen-plan-shapes";
import { findFeature } from "./operations";
import type { CadDocument } from "./types";
import { entryItem, fillRun, insertItem, type RunFill } from "../features/kitchen-run-items";

/** A unit of a run of a plan. */
export interface PlanItem {
  plan: string;
  run: string;
  item: string;
}

/** The cabinets the plan made on a run, in order, each with the unit of the run it is. */
export function runCabinets(doc: CadDocument, planId: string, runId: string): { cabinet: string; item?: string }[] {
  const plan = kitchenPlanIn(doc, planId);
  if (!plan) return [];
  const units = kitchenFromPlan(plan, kitchenRoomInfo(doc, plan)).units.filter((u) => u.run === runId);
  const cabinets = (plan.made?.[runId] ?? []).filter((id) => findFeature(doc, id)?.type === "cabinet");
  // The room changed since the kitchen was made: the units no longer match.
  if (units.length !== cabinets.length) return cabinets.map((cabinet) => ({ cabinet }));
  return cabinets.map((cabinet, i) => ({ cabinet, ...(units[i]!.item ? { item: units[i]!.item } : {}) }));
}

/** The unit of the plan a cabinet is, or null (a cabinet set apart, a corner unit). */
export function planItemOf(doc: CadDocument, cabinetId: string): PlanItem | null {
  const owner = kitchenRunOf(doc, cabinetId);
  if (!owner) return null;
  const item = runCabinets(doc, owner.plan, owner.run).find((c) => c.cabinet === cabinetId)?.item;
  return item ? { ...owner, item } : null;
}

export interface PlanAdd {
  doc: CadDocument;
  plan: string;
  run: KitchenRun;
  item: string;
  /** The cabinet made for it (none for an appliance alone). */
  cabinet: string | null;
  /** What to look at on its run. */
  problems: string[];
  /** Its run filled, with the room left. */
  fill: RunFill;
}

/** Each run of the plan filled as it is, with the room left on it. */
export function planSpace(doc: CadDocument, planId: string): { run: KitchenRun; fill: RunFill }[] {
  const plan = kitchenPlanIn(doc, planId);
  if (!plan) return [];
  const fills = kitchenFromPlan(plan, kitchenRoomInfo(doc, plan)).fills;
  return kitchenRuns(plan).flatMap((run) => (fills[run.id] ? [{ run, fill: fills[run.id]! }] : []));
}

/**
 * `entry` put in the plan of the project (the one of `after`, else the last): after `after` on its run when it fits, else at
 * the end of its row on the first run where it fits. Null: the project has no plan; a string: it fits nowhere.
 */
export function addToKitchenPlan(doc: CadDocument, entry: CatalogEntry, after?: Partial<PlanItem> | null): PlanAdd | string | null {
  const planId = after?.plan ?? kitchenPlanOf(doc)?.id;
  const plan = planId ? kitchenPlanIn(doc, planId) : undefined;
  if (!planId || !plan) return null;
  const room = kitchenRoomInfo(doc, plan);
  const s = kitchenSizes(plan);
  const heights = { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop };
  const runs = kitchenRuns(plan);
  const first = runs.find((r) => r.id === after?.run);
  for (const run of first ? [first, ...runs.filter((r) => r !== first)] : runs) {
    const items = plan.runs?.[run.id] ?? [];
    const g = runGeometry(plan, run, room?.[run.id]);
    const item = entryItem(items, entry);
    const next = insertItem(items, item, run === first ? after?.item : null);
    // It fits, and pushes nothing out that stood before.
    const before = new Set(fillRun(g, items, heights).missing.map((m) => m.id));
    const fill = fillRun(g, next, heights);
    if (fill.missing.some((m) => !before.has(m.id))) continue;
    const made = withKitchenBuilt(doc, planId, { runs: { ...plan.runs, [run.id]: next } });
    if (typeof made === "string") return made;
    const cabinet = runCabinets(made.doc, planId, run.id).find((c) => c.item === item.id)?.cabinet ?? null;
    return { doc: made.doc, plan: planId, run, item: item.id, cabinet, problems: made.problems.filter((m) => m.startsWith(`${run.label} :`)).map((m) => m.slice(run.label.length + 3)), fill };
  }
  return `${entry.name} ne tient sur aucun linéaire du plan de cuisine.`;
}
