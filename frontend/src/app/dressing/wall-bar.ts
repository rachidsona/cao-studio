/**
 * Les murs du dressing en haut du panneau d'une Répartition, comme les linéaires de la cuisine (« Mur A », « Mur B »,
 * … puis « Voir mur A isolé ») : un bouton par zone du plan, celle qu'on règle marquée ; un clic ouvre la Répartition
 * d'une autre zone (faite d'abord, en une étape, quand elle ne l'est pas encore). « Voir … isolé » montre la zone seule,
 * de face, avec ses cotes ; « Tout montrer » rend tout ; une autre zone ouverte pendant ce temps est celle qu'on voit.
 */
import { withZonePartition, zoneStep } from "../../document/plan-layout";
import { planZones, type PlanZone } from "../../document/plan-shapes";
import type { CadDocument, DressingPlan, SketchFeature } from "../../document/types";
import { el } from "../../ui/dom";
import { isolatedSketch, isolateZone, showAll } from "../zone-view";

export interface WallBarHost {
  doc(): CadDocument;
  /** A new document, as one undo step, with its message. */
  change(doc: CadDocument, success: string): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** Opens the Répartition of this step (the panel open now closes). */
  open(sketch: string, step: string): void;
  redraw(): void;
}

const BUTTON = "h-8 min-w-0 flex-1 truncate border px-2 font-medium";
const ON = "border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300";
const OFF = "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** The plan a zone's sketch was made from, and which zone it is; null: a Répartition of its own. */
export function wallOf(doc: CadDocument, sketchId: string): { planId: string; plan: DressingPlan; zone: PlanZone } | null {
  for (const f of doc.features) {
    if (f.type !== "sketch" || !f.dressingPlan) continue;
    const plan = f.dressingPlan;
    const zoneId = Object.entries(plan.made ?? {}).find(([, made]) => made === sketchId)?.[0];
    const zone = zoneId ? planZones(plan).find((z) => z.id === zoneId) : undefined;
    if (zone) return { planId: f.id, plan, zone };
  }
  return null;
}

/** « mur A » for « Mur A ». */
const lower = (label: string) => `${label.charAt(0).toLowerCase()}${label.slice(1)}`;

/** The bar, or null for a Répartition that is not a zone of a dressing plan. */
export function wallBar(host: WallBarHost, sketchId: string): HTMLElement | null {
  const wall = wallOf(host.doc(), sketchId);
  if (!wall) return null;
  const { planId, zone: current } = wall;
  const open = (zone: PlanZone) => {
    if (zone.id === current.id) return;
    const seen = isolatedSketch() === sketchId;
    let target = zoneStep(host.doc(), wall.plan, zone.id);
    if (!target) {
      const made = withZonePartition(host.doc(), planId, zone);
      if (typeof made === "string") return host.notify(made, "error");
      host.change(made.doc, `${zone.label} réparti : réglez sa Répartition.`);
      target = { sketch: made.sketch, step: made.step };
    }
    // A wall seen alone: the one opened is now the one seen (before its panel is drawn, for its button to say so).
    const plan = (host.doc().features.find((f) => f.id === planId) as SketchFeature | undefined)?.dressingPlan;
    if (seen && plan) isolateZone(plan, zone.id, zone.label);
    host.open(target.sketch, target.step);
  };
  const zones = planZones(wall.plan).map((zone) => {
    const on = zone.id === current.id;
    const b = el("button", { type: "button", class: `${BUTTON} ${on ? ON : OFF}`, "aria-pressed": String(on), "data-wall": zone.id, title: on ? `${zone.label} : la Répartition réglée ici` : `Régler la Répartition de ${lower(zone.label)}` }, zone.label);
    b.addEventListener("click", () => open(zone));
    return b;
  });
  const seen = isolatedSketch() === sketchId;
  const see = el("button", { type: "button", class: `h-8 w-full border font-medium ${OFF}`, "data-see-wall": current.id, title: "Seuls ses panneaux et ce qui les équipe, de face, avec leurs cotes ; rien ne change dans le projet" }, seen ? "Tout montrer" : `Voir ${lower(current.label)} isolé`);
  see.addEventListener("click", () => {
    if (isolatedSketch() === sketchId) showAll();
    else isolateZone(wall.plan, current.id, current.label);
    host.redraw();
  });
  return el("div", { class: "space-y-1.5", "data-ref": "dressing-walls" }, el("div", { class: "flex flex-wrap gap-1.5", role: "group", "aria-label": "Murs du dressing" }, ...zones), see);
}
