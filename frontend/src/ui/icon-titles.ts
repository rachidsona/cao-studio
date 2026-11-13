/**
 * La bulle d'une icône d'outil ne dit que son nom (« Coque », « Vider un corps ») : ce qui l'explique va dans
 * `data-hint`, que la recherche d'outils (app/command-palette.ts) lit encore, et l'Aide le dit en entier. Ce qui est
 * ajouté ensuite (les colonnes d'outils, les barres qui apparaissent) l'est de même.
 */

/** A button drawn as an icon: an SVG in it, no words of its own. */
const isIcon = (button: HTMLElement) => !!button.querySelector("svg") && !button.textContent?.trim();

/** The name of a button: its label, or what its tooltip says before « : ». */
export function iconName(button: HTMLElement): string {
  const label = button.getAttribute("aria-label")?.trim();
  const title = button.getAttribute("title") ?? "";
  return label || title.split(" : ")[0]!.trim();
}

/** The tooltip of an icon button made its name, what it said kept in `data-hint`. */
function shorten(button: HTMLElement): void {
  if (!isIcon(button)) return;
  const title = button.getAttribute("title");
  if (title === null) return;
  const name = iconName(button);
  if (!name || title === name) return;
  if (!button.dataset.hint) button.dataset.hint = title;
  button.setAttribute("title", name);
}

/** What a button's tooltip explained, before it was made its name. */
export const buttonHint = (button: HTMLElement) => button.dataset.hint ?? button.getAttribute("title") ?? "";

export function bindIconTitles(root: HTMLElement): void {
  const all = (node: ParentNode) => node.querySelectorAll<HTMLElement>("button[title]").forEach(shorten);
  all(root);
  new MutationObserver((changes) => {
    for (const change of changes) {
      const target = change.target as HTMLElement;
      if (change.type === "attributes") {
        if (target instanceof HTMLButtonElement) shorten(target);
      } else {
        for (const node of change.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node instanceof HTMLButtonElement && node.hasAttribute("title")) shorten(node);
          all(node);
        }
        // An icon put into a button after it was made.
        const button = target.closest?.("button[title]");
        if (button instanceof HTMLElement) shorten(button);
      }
    }
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
}
