/**
 * Les fenêtres des outils (mètre, calques, paramètres, extrusion, caisson, réseau…) s'ouvrent dans le panneau de
 * droite, chacune dans son onglet en haut du panneau, à côté de l'onglet « Sélection » (les propriétés) : la plus
 * récente s'affiche, un clic sur un onglet passe à l'autre, et quand un outil se ferme son onglet disparaît. La vue 3D
 * reste dégagée. Sur un écran étroit, où ce panneau est replié, elles restent posées sur la vue comme avant.
 */

/** Classes that place a panel over the view; dropped when it goes into the right panel. */
const FLOATING = ["absolute", "top-2", "left-2", "right-2", "z-30", "max-h-[85%]", "shadow-xl", "backdrop-blur", "w-56", "w-60", "w-64", "w-72", "w-80", "overflow-y-auto"];

/** What the right panel shows: the properties, or one tool window. */
let active: HTMLElement | "properties" = "properties";
let bar: HTMLElement | null = null;

/** The right panel's dock, when it is shown (wide screens). */
function dock(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>('[data-ref="dock"]');
  return el && window.matchMedia("(min-width: 1024px)").matches ? el : null;
}

/** Name of a tool window: its label, else its title. */
export function panelName(panel: HTMLElement): string {
  return panel.getAttribute("aria-label") || panel.querySelector("h2, h3")?.textContent?.trim() || "Outil";
}

function tab(label: string, selected: boolean, select: () => void, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(selected));
  button.title = title;
  button.textContent = label;
  button.className =
    "-mb-px shrink-0 border-b-2 px-3 py-2 text-xs font-semibold whitespace-nowrap " +
    (selected ? "border-sky-600 text-sky-800 dark:border-sky-400 dark:text-sky-200" : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100");
  button.addEventListener("click", select);
  return button;
}

/** Draws the tabs and shows only what the active one holds. */
function sync(target: HTMLElement): void {
  const panels = [...target.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
  if (active !== "properties" && !panels.includes(active)) active = "properties";
  const properties = document.querySelector<HTMLElement>('[data-ref="properties"]');
  properties?.toggleAttribute("data-dock-hidden", active !== "properties");
  for (const panel of panels) panel.toggleAttribute("data-dock-hidden", panel !== active);
  target.classList.toggle("border-t", active === "properties");
  if (!bar) return;
  bar.hidden = panels.length === 0;
  const choose = (what: HTMLElement | "properties") => () => {
    active = what;
    sync(target);
  };
  bar.replaceChildren(
    tab("Sélection", active === "properties", choose("properties"), "Propriétés de la sélection ou de l'opération choisie"),
    ...panels.map((panel) => tab(panelName(panel), panel === active, choose(panel), `Fenêtre de l'outil ${panelName(panel)}`)),
  );
}

/** The tab bar above the right panel's content, made once; the tabs follow the windows opened and closed. */
function ensureTabs(target: HTMLElement): void {
  if (bar) return;
  const scroller = target.parentElement;
  if (!scroller) return;
  bar = document.createElement("div");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Panneau de droite");
  bar.dataset.dockTabs = "";
  bar.className = "flex shrink-0 overflow-x-auto border-b border-gray-200 px-2 [scrollbar-width:none] dark:border-gray-800";
  bar.hidden = true;
  scroller.before(bar);
  new MutationObserver(() => sync(target)).observe(target, { childList: true });
}

/** Puts a tool's panel in the right panel, in its own tab, shown (or over the view, in `container`, on narrow screens). */
export function placePanel(container: HTMLElement, panel: HTMLElement): void {
  const target = dock();
  if (!target) {
    container.append(panel);
    return;
  }
  ensureTabs(target);
  panel.classList.remove(...FLOATING);
  panel.classList.add("w-full", "rounded-none", "shadow-[0_6px_18px_rgba(15,23,42,0.30)]", "dark:shadow-[0_6px_20px_rgba(0,0,0,0.75)]");
  panel.dataset.docked = "true";
  active = panel;
  target.prepend(panel);
  sync(target);
  target.parentElement?.scrollTo({ top: 0 });
}
