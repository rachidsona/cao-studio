/**
 * La recherche du Navigateur : un champ sous son titre garde seulement les corps, dossiers et esquisses dont le nom
 * contient ce qu'on tape (sans tenir compte des accents ni des majuscules) ; un dossier trouvé par son nom garde tout
 * ce qu'il contient. Le bouton à l'œil barré garde seulement les éléments cachés, pour les retrouver et les réafficher.
 * Les deux vont ensemble. Pendant un filtre, les dossiers sont ouverts pour montrer ce qui est trouvé.
 */
import { el } from "./dom";
import type { BodyEntry, BodyRow } from "./browser";
import type { NavItem } from "./feature-meta";
import { eyeIcon, fine } from "./icons";

export interface BrowserFilter {
  query: string;
  hiddenOnly: boolean;
}

const normalized = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export const filtering = (filter: BrowserFilter): boolean => filter.hiddenOnly || normalized(filter.query) !== "";

/** The tree with only what passes the filter; folders left empty go. */
export function filterEntries(entries: BodyEntry[], filter: BrowserFilter): BodyEntry[] {
  const query = normalized(filter.query);
  const keep = (row: BodyRow, named: boolean) =>
    (!filter.hiddenOnly || row.item.hidden) && (named || !query || normalized(`${row.label} ${row.item.name}`).includes(query));
  const walk = (list: BodyEntry[], named: boolean): BodyEntry[] =>
    list.flatMap((entry): BodyEntry[] => {
      if (!("group" in entry)) return keep(entry.body, named) ? [entry] : [];
      const inside = walk(entry.group.entries, named || (!!query && normalized(entry.group.name).includes(query)));
      return inside.length ? [{ group: { ...entry.group, entries: inside } }] : [];
    });
  return walk(entries, false);
}

export function filterSketches(sketches: NavItem[], filter: BrowserFilter): NavItem[] {
  const query = normalized(filter.query);
  return sketches.filter((s) => (!filter.hiddenOnly || s.hidden) && (!query || normalized(s.name).includes(query)));
}

/** The search field and the « hidden only » button, under the Navigator's title; `changed` redraws the tree. */
export function bindBrowserFilter(root: HTMLElement, changed: () => void): () => BrowserFilter {
  const filter: BrowserFilter = { query: "", hiddenOnly: false };
  const tree = root.querySelector<HTMLElement>('[data-ref="tree"]');
  const host = tree?.parentElement;
  if (!tree || !host) return () => filter;
  const input = el("input", {
    type: "search",
    placeholder: "Rechercher…",
    "aria-label": "Rechercher dans le Navigateur",
    class: "h-8 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-xs outline-none focus:border-sky-600 dark:border-gray-600 dark:bg-gray-800",
    "data-browser-search": "",
  });
  const hidden = el(
    "button",
    {
      type: "button",
      class: "flex size-8 shrink-0 items-center justify-center border border-gray-300 text-gray-500 hover:bg-gray-100 aria-pressed:border-sky-600 aria-pressed:bg-sky-100 aria-pressed:text-sky-800 dark:border-gray-600 dark:hover:bg-gray-700 dark:aria-pressed:bg-sky-950 dark:aria-pressed:text-sky-200",
      "aria-pressed": "false",
      "aria-label": "Afficher seulement les éléments cachés",
      title: "Afficher seulement les éléments cachés (un autre clic : tout afficher)",
      "data-browser-hidden-only": "",
    },
    fine(eyeIcon(false), 16),
  );
  host.before(el("div", { class: "flex items-center gap-1 px-3.5 pb-2", role: "search", "aria-label": "Filtrer le Navigateur" }, input, hidden));
  input.addEventListener("input", () => {
    filter.query = input.value;
    changed();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !input.value) return;
    event.stopPropagation();
    input.value = "";
    filter.query = "";
    changed();
  });
  hidden.addEventListener("click", () => {
    filter.hiddenOnly = !filter.hiddenOnly;
    hidden.setAttribute("aria-pressed", String(filter.hiddenOnly));
    changed();
  });
  return () => filter;
}
