/**
 * « Cacher » les hauts, la casquette ou le plan de travail d'un Plan de cuisine dans la 3D, d'un clic, pour atteindre
 * les meubles du dessous. La vue seulement : rien ne change dans le projet, et chaque case se décoche pour les revoir.
 */
import { kitchenPlanIn, kitchenRunOf } from "../../document/kitchen-floor";
import { kitchenFromPlan } from "../../document/kitchen-plan-build";
import { kitchenRoomInfo } from "../../document/kitchen-plan-room";
import { bodyOrigin, findFeature } from "../../document/operations";
import { featureOfBody, type CadDocument } from "../../document/types";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";

export type HiddenRow = "wall" | "cap" | "worktop";
const LABELS: Record<HiddenRow, string> = { wall: "Hauts", cap: "Casquette", worktop: "Plan de travail" };
const CAP = /^(Casquette|Bandeau de casquette|Bout de casquette|Panneau sous Casquette)\b/;
/** Above the worktop by this much (mm), a piece is of the wall units' row. */
const ABOVE = 50;

const hidden = new Set<HiddenRow>();
let context: { viewport: Viewport; editor: Editor } | null = null;

/** What a plan makes, by name: the row it is of, for those that can be hidden. */
export function planRows(doc: CadDocument, planId: string): Map<string, HiddenRow> {
  const plan = kitchenPlanIn(doc, planId);
  const out = new Map<string, HiddenRow>();
  if (!plan) return out;
  const { units, boxes } = kitchenFromPlan(plan, kitchenRoomInfo(doc, plan));
  const high = plan.worktopHeight + ABOVE;
  for (const u of units) if (CAP.test(u.name)) out.set(u.name, "cap");
  else if (u.origin[2] >= high) out.set(u.name, "wall");
  for (const b of boxes) if (b.kind === "worktop") out.set(b.name, "worktop");
  else if (CAP.test(b.name)) out.set(b.name, "cap");
  else if (Math.min(b.from[2], b.to[2]) >= high && b.kind !== "wall") out.set(b.name, "wall");
  return out;
}

const rows = new WeakMap<CadDocument, Map<string, Map<string, HiddenRow>>>();
/** The row of the plan a body is a piece of (a front: its cabinet's), or null. */
function rowOfBody(doc: CadDocument, bodyId: string): HiddenRow | null {
  const f = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  const named = f?.type === "fronts" ? findFeature(doc, f.cabinet) : f;
  const owner = named ? kitchenRunOf(doc, named.id) : null;
  if (!named || !owner) return null;
  const known = rows.get(doc) ?? new Map<string, Map<string, HiddenRow>>();
  rows.set(doc, known);
  if (!known.has(owner.plan)) known.set(owner.plan, planRows(doc, owner.plan));
  return known.get(owner.plan)!.get(named.name) ?? null;
}

function apply(): void {
  if (!context || !hidden.size) return;
  const { viewport, editor } = context;
  const doc = editor.previewDoc ?? editor.doc;
  for (const id of viewport.displayedBodies) {
    const row = rowOfBody(doc, id);
    if (row && hidden.has(row)) viewport.setBodyVisible(id, false);
  }
}

/** The boxes « Cacher : Hauts, Casquette, Plan de travail ». */
export function rowsToggle(): HTMLElement {
  const boxes = (Object.keys(LABELS) as HiddenRow[]).map((row) => {
    const box = el("input", { type: "checkbox", checked: hidden.has(row), "aria-label": `Cacher : ${LABELS[row]}`, "data-hide-row": row });
    box.addEventListener("change", () => {
      if (box.checked) hidden.add(row);
      else hidden.delete(row);
      box.blur();
      if (!context) return;
      // Shown again, then hidden as the view has it (an isolation: app/zone-view.ts).
      if (!box.checked) for (const id of context.viewport.displayedBodies) context.viewport.setBodyVisible(id, true);
      context.editor.render();
      apply();
    });
    return el("label", { class: "flex items-center gap-1" }, box, LABELS[row]);
  });
  return el("div", { class: "flex items-center gap-1.5 text-2xs text-gray-500 dark:text-gray-400", title: "Cochés : ces meubles de la cuisine sont cachés dans la 3D, pour atteindre ceux du dessous (la vue seulement)." }, "Cacher :", ...boxes);
}

/** After the isolation of a zone (bound after app/zone-view.ts): what is hidden stays so as the bodies are made again. */
export function bindRowsHidden(viewport: Viewport, editor: Editor): void {
  context = { viewport, editor };
  const setBodies = viewport.setBodies.bind(viewport);
  viewport.setBodies = (bodies) => {
    setBodies(bodies);
    apply();
  };
  editor.afterRender(() => apply());
}
