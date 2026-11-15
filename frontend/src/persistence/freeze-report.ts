/**
 * Les blocages de l'éditeur, comme ses erreurs (error-report.ts) : quand la page cesse de répondre plus d'une seconde
 * alors qu'elle est affichée, le serveur l'apprend (journal « apps.client ») avec la durée et le dernier geste fait
 * — le bouton cliqué, ou un clic dans la vue 3D —, pour qu'une lenteur rencontrée par quelqu'un se retrouve et se
 * corrige. Une horloge qui bat toutes les quarts de seconde mesure son retard : rien à installer, tous les
 * navigateurs. Au plus cinq rapports par page, un par geste.
 */
import { ReportFilter, sendReport, type ErrorReport } from "./error-report";

/** A pause longer than this (ms) is a freeze. */
export const FREEZE = 1000;
const TICK = 250;

/** What is sent for a pause of `gap` ms after `action`, or null when it is short. */
export function freezeReport(gap: number, action: string): ErrorReport | null {
  if (!(gap >= FREEZE)) return null;
  const seconds = (Math.round(gap / 100) / 10).toLocaleString("fr-FR");
  return { message: `Blocage de l'éditeur après : ${action || "aucun geste"}`, source: `${seconds} s` };
}

/** The gesture a click names: the button's own words, or the 3D view. */
export function actionOf(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "";
  if (target.closest("canvas")) return "clic dans la vue 3D";
  const button = target.closest<HTMLElement>("button, [role=menuitem], a, select, input");
  if (!button) return "";
  const name = button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || "";
  const key = ["data-action", "data-workshop", "data-sketch-tool"].map((a) => button.getAttribute(a)).find(Boolean);
  return [name.replace(/\s+/g, " ").trim().slice(0, 80), key ? `(${key})` : ""].filter(Boolean).join(" ");
}

export function installFreezeReporting(): void {
  const filter = new ReportFilter(5);
  let action = "ouverture de la page";
  let last = performance.now();
  let shown = document.visibilityState === "visible";
  document.addEventListener("pointerdown", (event) => (action = actionOf(event.target) || action), true);
  document.addEventListener("keydown", (event) => (action = `touche ${event.ctrlKey || event.metaKey ? "Ctrl+" : ""}${event.key}`), true);
  setInterval(() => {
    const now = performance.now();
    const visible = document.visibilityState === "visible";
    // A hidden tab's clock is slowed by the browser: not a freeze.
    const report = shown && visible ? freezeReport(now - last - TICK, action) : null;
    if (report && filter.accept(report)) sendReport(report);
    last = now;
    shown = visible;
  }, TICK);
}
