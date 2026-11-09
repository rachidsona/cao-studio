/**
 * Chaque onglet du ruban montre, à droite, le panneau de son travail : Dressing → le Plan de dressing, Cuisine → le
 * Plan de cuisine (ouverts s'ils ne le sont pas, pour poser un plan s'il n'y en a pas encore), Conception 3D → la
 * Sélection. Un plan déjà ouvert garde son état (un linéaire en cours de changement reste où il en est). Un projet
 * créé depuis l'accueil comme cuisine ou dressing (?onglet=kitchen) s'ouvre ainsi, son plan à droite.
 */
import { showPanel } from "../ui/dock";

const PLANS: Record<string, { name: string; button: string }> = {
  dressing: { name: "Plan de dressing", button: '[data-workshop="dressing-plan"]' },
  kitchen: { name: "Plan de cuisine", button: '[data-workshop="kitchen-plan"]' },
};

export function bindTabPanels(root: HTMLElement): void {
  document.addEventListener("cad:ribbon-tab", (event) => {
    const tab = (event as CustomEvent<string>).detail;
    const plan = PLANS[tab];
    if (!plan) return showPanel("properties");
    const open = document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${plan.name}"]`);
    if (open) showPanel(open);
    else root.querySelector<HTMLElement>(plan.button)?.click();
  });
  const asked = new URLSearchParams(location.search).get("onglet");
  if (asked && PLANS[asked]) {
    history.replaceState(null, "", location.pathname);
    document.dispatchEvent(new CustomEvent("cad:ribbon-tab", { detail: asked }));
  }
}
