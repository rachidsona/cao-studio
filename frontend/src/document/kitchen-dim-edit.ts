/**
 * Une cote d'un linéaire vu seul, tapée (document/kitchen-run-dims.ts) : la largeur d'un meuble (un appareil garde
 * ses largeurs, et un meuble qui ne tiendrait plus est refusé), la porte ou le côté d'un meuble d'angle dans leurs
 * limites, une longueur ou une hauteur du plan, qui le fait suivre. La cuisine est refaite d'un coup ; une chaîne :
 * pourquoi c'est refusé. Pur.
 */
import { withSurroundHeight } from "./caisson-unit";
import { cornerLimits, withCorner } from "./kitchen-corners";
import { kitchenPlanIn, withKitchenBuilt, withKitchenChanged } from "./kitchen-floor";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { kitchenPlanProblem, kitchenRuns, kitchenSizes, runGeometry } from "./kitchen-plan-shapes";
import type { DimEdit } from "./kitchen-run-dims";
import type { CadDocument } from "./types";
import { applianceOf, fillRun, itemEntry, sizeLimits } from "../features/kitchen-run-items";

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;

/** The kitchen with this dimension of this run set to `mm`, or why it cannot be. */
export function withRunDim(doc: CadDocument, planId: string, runId: string, edit: DimEdit, mm: number): CadDocument | string {
  const plan = kitchenPlanIn(doc, planId);
  const run = plan && kitchenRuns(plan).find((r) => r.id === runId);
  if (!plan || !run) return "Ce plan n'existe plus.";
  const value = Math.round(mm * 10) / 10;
  if (edit.kind === "plan") {
    const next = { ...plan, [edit.key]: value };
    const problem = kitchenPlanProblem(next);
    if (problem) return problem;
    const made = withKitchenChanged(doc, planId, next);
    return typeof made === "string" ? made : made.doc;
  }
  if (edit.kind === "corner") {
    const size = value - edit.less;
    const [lo, hi] = cornerLimits(plan)[edit.key];
    if (!(size >= lo && size <= hi)) return `Cette cote va de ${cm(lo + edit.less)} à ${cm(hi + edit.less)}.`;
    const made = withKitchenBuilt(doc, planId, withCorner(plan, edit.joint, { [edit.key]: size }));
    return typeof made === "string" ? made : made.doc;
  }
  if (edit.kind === "height") {
    const made = withSurroundHeight(doc, planId, run.id, edit.item, value);
    return typeof made === "string" ? made : made.doc;
  }
  const items = plan.runs?.[run.id] ?? [];
  const item = items.find((i) => i.id === edit.item);
  if (!item) return "Ce meuble n'est plus sur le linéaire.";
  const app = applianceOf(item);
  if (app && !app.widths.includes(value)) return `${app.name} existe en ${app.widths.map(cm).join(", ")}.`;
  const [lo, hi] = sizeLimits(plan, itemEntry(item)).width;
  if (!(value >= lo && value <= hi)) return `Une largeur va de ${cm(lo)} à ${cm(hi)}.`;
  const next = items.map((i) => (i.id === item.id ? { ...i, width: value } : i));
  // It must still fit, and push nothing out.
  const s = kitchenSizes(plan);
  const g = runGeometry(plan, run, kitchenRoomInfo(doc, plan)?.[run.id]);
  const heights = { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop };
  const before = new Set(fillRun(g, items, heights).missing.map((m) => m.id));
  const fits = (w: number) => !fillRun(g, items.map((i) => (i.id === item.id ? { ...i, width: w } : i)), heights).missing.some((m) => !before.has(m.id));
  if (!fits(value)) {
    // The widest it can be, to the millimetre.
    let [ok, no] = [Math.min(item.width, value), value];
    while (no - ok > 1) {
      const mid = Math.floor((ok + no) / 2);
      if (fits(mid)) ok = mid;
      else no = mid;
    }
    return `À ${cm(value)}, ${itemEntry(item).name} ne tient plus : ${cm(ok)} au plus.`;
  }
  const made = withKitchenBuilt(doc, planId, { runs: { ...plan.runs, [run.id]: next } });
  return typeof made === "string" ? made : made.doc;
}
