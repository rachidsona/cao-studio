/**
 * Survolée, une icône d'outil dit son nom (« Coque », « Vider un corps ») dans une petite étiquette au style des cotes
 * des pièces : contour et texte orange #f8500a sur blanc, en pastille. La bulle grise du navigateur n'est plus
 * montrée : le `title` d'un bouton-icône (une image, pas de texte) devient `data-tip` (son nom) et ce qui
 * l'expliquait `data-hint`, que la recherche d'outils (app/command-palette.ts) lit encore, l'Aide le disant en
 * entier. Ce qui est ajouté ensuite (les colonnes d'outils, les barres qui apparaissent) l'est de même. Les boutons à
 * texte gardent leur bulle.
 */

/** A button drawn as an icon: an SVG in it, no words of its own. */
const isIcon = (button: HTMLElement) => !!button.querySelector("svg") && !button.textContent?.trim();

/** The name of a button: its label, its tip, or what its tooltip says before « : ». */
export function iconName(button: HTMLElement): string {
  const label = button.getAttribute("aria-label")?.trim();
  const title = button.getAttribute("title") ?? "";
  return label || button.dataset.tip || title.split(" : ")[0]!.trim();
}

/** What a button's tooltip explained, before it became the tip of its icon. */
export const buttonHint = (button: HTMLElement) => button.dataset.hint ?? button.getAttribute("title") ?? "";

/** The title of an icon button taken off: its name the tip, what it said the hint; its accessible name kept. */
function retitle(button: HTMLElement): void {
  if (!isIcon(button)) return;
  const title = button.getAttribute("title");
  if (title === null) return;
  const name = iconName(button);
  if (!name) return;
  if (title !== name || !button.dataset.hint) button.dataset.hint = title;
  if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", name);
  button.dataset.tip = name;
  button.removeAttribute("title");
}

export function bindIconTitles(root: HTMLElement): void {
  const all = (node: ParentNode) => node.querySelectorAll<HTMLElement>("button[title]").forEach(retitle);
  all(root);
  new MutationObserver((changes) => {
    for (const change of changes) {
      const target = change.target as HTMLElement;
      if (change.type === "attributes") {
        if (target instanceof HTMLButtonElement) retitle(target);
        continue;
      }
      for (const node of change.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node instanceof HTMLButtonElement && node.hasAttribute("title")) retitle(node);
        all(node);
      }
      // An icon put into a button after it was made.
      const button = target.closest?.("button[title]");
      if (button instanceof HTMLElement) retitle(button);
    }
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });

  // The tip: under the icon (above it near the bottom of the window), while the pointer is on it.
  const tip = document.createElement("span");
  tip.className = "cad-icon-tip";
  tip.setAttribute("role", "tooltip");
  tip.dataset.iconTip = "";
  tip.hidden = true;
  document.body.append(tip);
  let over: HTMLElement | null = null;
  const hide = () => {
    over = null;
    tip.hidden = true;
  };
  const show = (button: HTMLElement) => {
    over = button;
    tip.textContent = button.dataset.tip ?? "";
    tip.hidden = false;
    const r = button.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const below = r.bottom + 6 + t.height <= innerHeight;
    tip.style.left = `${Math.max(4, Math.min(innerWidth - t.width - 4, r.left + r.width / 2 - t.width / 2))}px`;
    tip.style.top = `${below ? r.bottom + 6 : r.top - 6 - t.height}px`;
  };
  const at = (event: Event) => (event.target instanceof Element ? event.target.closest<HTMLElement>("button[data-tip]") : null);
  document.addEventListener("pointerover", (event) => {
    const button = at(event);
    if (button && button !== over) show(button);
    else if (!button && over) hide();
  });
  document.addEventListener("focusin", (event) => {
    const button = at(event);
    if (button && (button as HTMLElement).matches(":focus-visible")) show(button);
  });
  for (const type of ["pointerdown", "focusout", "scroll", "keydown"]) document.addEventListener(type, hide, true);
  document.addEventListener("pointerleave", hide);
}
