/**
 * Le Navigateur se replie (grands écrans) : la flèche ‹ de son titre le fait disparaître et la vue prend sa place ; un
 * onglet « › Navigateur » en bas du bord gauche de la vue (ui/edge-tabs.ts) le rouvre. Retenu par le navigateur. Sur les
 * petits écrans, le Navigateur reste la feuille qu'ouvre le bouton « Arbre ».
 */
import { el } from "./dom";
import { EDGE_TAB_CLASS, edgeTabs } from "./edge-tabs";

const KEY = "cao.navigator-folded";

function readFolded(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function writeFolded(folded: boolean): void {
  try {
    if (folded) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Only this visit.
  }
}

export function bindNavigatorFold(root: HTMLElement): void {
  const tree = root.querySelector<HTMLElement>('[data-ref="panel-tree"]');
  const header = tree?.querySelector<HTMLElement>(".cad-card");
  const pile = edgeTabs(root);
  if (!tree || !header || !pile) return;
  const fold = el(
    "button",
    { type: "button", class: "tool-btn min-h-8 min-w-8 px-1 text-base max-lg:hidden", "aria-label": "Replier le Navigateur", title: "Replier le Navigateur : la vue prend sa place, l'onglet « Navigateur » en bas à gauche de la vue le rouvre", "data-navigator-fold": "" },
    "‹",
  );
  header.querySelector("h2")?.after(fold);
  header.classList.add("gap-1");
  const tab = el(
    "button",
    { type: "button", class: `${EDGE_TAB_CLASS} order-first max-lg:hidden`, "aria-label": "Déplier le Navigateur", title: "Déplier le Navigateur", "data-navigator-unfold": "" },
    el("span", { "aria-hidden": "true" }, "›"),
    el("span", { class: "edge-tab-vertical", "aria-hidden": "true" }, "Navigateur"),
  );
  pile.append(tab);

  const apply = (folded: boolean) => {
    tree.dataset.folded = String(folded);
    tab.hidden = !folded;
    fold.setAttribute("aria-expanded", String(!folded));
    tab.setAttribute("aria-expanded", String(folded));
  };
  fold.addEventListener("click", () => {
    writeFolded(true);
    apply(true);
    tab.focus();
  });
  tab.addEventListener("click", () => {
    writeFolded(false);
    apply(false);
    fold.focus();
  });
  apply(readFolded());
}
