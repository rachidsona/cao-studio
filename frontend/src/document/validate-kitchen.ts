/**
 * Le plan d'une cuisine dans un document ouvert ou importé (esquisse `kitchenPlan`) : la forme des meubles de chaque
 * linéaire. Un `.cao.json` reçu d'un tiers ne doit pas pouvoir glisser du texte là où le code attend un nombre (il
 * irait tel quel dans le dessin SVG de la bande du linéaire). Seuls les types sont contrôlés : un plan fait par
 * l'éditeur passe toujours (audit de sécurité du 10/11/2026, M1).
 */
import { glassFieldsProblem } from "../features/glass-door";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optionalNumber = (v: unknown) => v === undefined || isFiniteNumber(v);
const shortText = (v: unknown, limit: number) => typeof v === "string" && v.length <= limit;

/** A unit of one's own (« Mes caissons »…) as kept on a run: its name, its kind and its sizes. */
function ownOk(own: unknown): boolean {
  if (!isObject(own)) return false;
  return (
    shortText(own.id, 200) &&
    shortText(own.name, 200) &&
    shortText(own.kind, 40) &&
    (own.layout === undefined || shortText(own.layout, 40)) &&
    ["width", "drawers", "shelves", "height", "depth", "plinth"].every((k) => optionalNumber(own[k]))
  );
}

function itemOk(item: unknown): boolean {
  return (
    isObject(item) &&
    shortText(item.id, 200) &&
    shortText(item.model, 200) &&
    isFiniteNumber(item.width) &&
    optionalNumber(item.height) &&
    optionalNumber(item.depth) &&
    (item.side === undefined || ["left", "right", "top", "bottom"].includes(item.side as string)) &&
    (item.grip === undefined || item.grip === "gorge") &&
    (item.railFront === undefined || item.railFront === "edge") &&
    (item.facade === undefined || (isObject(item.facade) && glassFieldsProblem(item.facade, ["frame", "glass", "fluted", "slats"]) === null && ["frameDepth", "pitch"].every((k) => optionalNumber((item.facade as Json)[k])))) &&
    (item.furnished === undefined || shortText(item.furnished, 200)) &&
    (item.from === undefined || shortText(item.from, 200)) &&
    (item.own === undefined || ownOk(item.own))
  );
}

/** What is wrong with a kitchen plan's runs, or null. */
export function kitchenPlanProblem(plan: unknown): string | null {
  if (!isObject(plan)) return "plan de cuisine invalide.";
  if (plan.runs === undefined) return null;
  if (!isObject(plan.runs)) return "linéaires du plan de cuisine invalides.";
  for (const [run, items] of Object.entries(plan.runs)) {
    if (!Array.isArray(items) || items.length > 200) return `linéaire « ${run.slice(0, 20)} » invalide.`;
    if (!items.every(itemOk)) return `un meuble du linéaire « ${run.slice(0, 20)} » est invalide (identifiant, modèle, largeur, cotes).`;
  }
  return null;
}
