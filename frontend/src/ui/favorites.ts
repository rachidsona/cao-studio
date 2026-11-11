/**
 * Ma barre d'outils (comme le grand jeu d'outils de SketchUp) : une barre verticale à gauche de la vue, avec les
 * outils qu'on utilise souvent, choisis par l'étoile ★ des menus de groupe (« CRÉER ▾ »…). Chaque icône lance l'outil
 * de la barre du haut (même caché ou replié) et en reprend l'état (enfoncé, grisé) ; un clic droit la retire.
 * Une barre par mode (modèle, esquisse), et dans le modèle une par onglet du ruban (Conception 3D, Dressing, Cuisine :
 * use), retenue par le navigateur ; celles du Dressing et de la Cuisine commencent avec leurs outils de tous les jours. On la déplace où l'on veut par sa poignée ⠿, et on
 * la met à l'horizontale ou à la verticale (ui/movable.ts). Son « – » la cache : il n'en reste qu'une étoile ★, à sa
 * place, qui la fait réapparaître ; cachée ou non, c'est retenu par le navigateur, pour toutes les barres.
 */
import { makeMovable } from "./movable";

const STORAGE = "cao.favorites.";
const HIDDEN = `${STORAGE}hidden`;

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDDEN, "1");
    else localStorage.removeItem(HIDDEN);
  } catch {
    // Not remembered: only this visit.
  }
}

function read(name: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE + name) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function write(name: string, keys: string[]): void {
  try {
    localStorage.setItem(STORAGE + name, JSON.stringify(keys));
  } catch {
    // Not remembered: only this visit.
  }
}

export interface Favorites {
  has(key: string): boolean;
  toggle(key: string): void;
  /** Another bar of the same toolbar (an onglet): its tools, or `seed` the first time. */
  use(name: string, seed?: readonly string[]): void;
}

/** Whether a bar was ever kept. */
function kept(name: string): boolean {
  try {
    return localStorage.getItem(STORAGE + name) !== null;
  } catch {
    return false;
  }
}

/** The favourites bar of a toolbar (`name`), placed over the view in `host`; `tools` are the toolbar's buttons by key. */
export function bindFavorites(host: HTMLElement, first: string, tools: Map<string, HTMLElement>, visibility: string): Favorites {
  let name = first;
  let keys = read(name).filter((k) => tools.has(k));
  const bar = document.createElement("div");
  bar.dataset.favorites = name;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Mes outils");
  bar.className = `absolute top-2 left-2 z-20 items-center gap-0.5 border border-gray-200 bg-white/95 p-1 shadow-lg backdrop-blur data-[moving=true]:opacity-80 data-[moving=true]:shadow-2xl dark:border-gray-700 dark:bg-gray-900/95 ${visibility}`;
  // The grip (drag to move the bar, double-click: back to its place) and the button that turns it.
  const grip = document.createElement("div");
  grip.className = "flex shrink-0 cursor-move touch-none items-center justify-center text-[11px] leading-none text-gray-400 select-none hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200";
  grip.textContent = "⠿";
  grip.title = "Glisser pour déplacer ma barre ; double-clic : la remettre à sa place";
  grip.dataset.favoritesGrip = "";
  const turn = document.createElement("button");
  turn.type = "button";
  turn.className = "flex shrink-0 items-center justify-center text-[11px] leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200";
  const list = document.createElement("div");
  list.className = "flex items-center gap-0.5";
  // « – » hides the bar; only its star stays, at its place, to bring it back.
  const iconClass = "flex size-6 shrink-0 items-center justify-center text-sm leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200";
  const hide = document.createElement("button");
  hide.type = "button";
  hide.className = iconClass;
  hide.textContent = "–";
  hide.title = "Cacher ma barre (l'étoile ★ la fait réapparaître)";
  hide.setAttribute("aria-label", "Cacher ma barre");
  const show = document.createElement("button");
  show.type = "button";
  show.className = `${iconClass} size-8 text-base text-amber-500 hover:text-amber-600`;
  show.textContent = "★";
  show.title = "Afficher ma barre (Mes outils)";
  show.setAttribute("aria-label", "Afficher ma barre");
  bar.append(grip, list, turn, hide, show);
  const setHidden = (hidden: boolean) => {
    bar.dataset.hidden = String(hidden);
    for (const part of [grip, list, turn, hide]) part.style.display = hidden ? "none" : "";
    show.style.display = hidden ? "" : "none";
    writeHidden(hidden);
  };
  hide.addEventListener("click", () => setHidden(true));
  show.addEventListener("click", () => setHidden(false));
  setHidden(readHidden());
  host.append(bar);
  const movable = makeMovable(host, bar, grip, `${STORAGE}place.${first}`, (horizontal) => {
    bar.classList.toggle("flex-col", !horizontal);
    bar.classList.toggle("flex-row", horizontal);
    list.classList.toggle("flex-col", !horizontal);
    list.classList.toggle("flex-row", horizontal);
    // The bar may scroll when it is longer than the view.
    for (const [cls, on] of [["max-h-[calc(100%-1rem)]", !horizontal], ["overflow-y-auto", !horizontal], ["max-w-[calc(100%-1rem)]", horizontal], ["overflow-x-auto", horizontal]] as const) bar.classList.toggle(cls, on);
    grip.classList.toggle("h-3", !horizontal);
    grip.classList.toggle("w-full", !horizontal);
    grip.classList.toggle("w-3", horizontal);
    grip.classList.toggle("self-stretch", horizontal);
    turn.textContent = horizontal ? "⇅" : "⇄";
    turn.className = turn.className.replace(/ (h-4 w-full|w-4 self-stretch)$/, "") + (horizontal ? " w-4 self-stretch" : " h-4 w-full");
    turn.title = horizontal ? "Mettre ma barre à la verticale" : "Mettre ma barre à l'horizontale";
    turn.setAttribute("aria-label", turn.title);
  });
  turn.addEventListener("click", () => movable.toggleOrientation());
  const watchers: MutationObserver[] = [];

  const render = () => {
    for (const w of watchers.splice(0)) w.disconnect();
    if (!keys.length) {
      const hint = document.createElement("span");
      hint.className = "flex size-9 items-center justify-center text-lg text-gray-400";
      hint.textContent = "☆";
      hint.title = "Mes outils : ajoutez ceux que vous utilisez souvent avec l'étoile ★ des menus de groupe (CRÉER ▾, MODIFIER ▾…).";
      list.replaceChildren(hint);
      return;
    }
    list.replaceChildren(
      ...keys.map((key) => {
        const source = tools.get(key)!;
        const label = source.getAttribute("aria-label") ?? source.title;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tool-btn icon-btn";
        button.title = `${source.title || label} — clic droit : retirer de ma barre`;
        button.setAttribute("aria-label", label);
        const icon = source.querySelector("svg")?.cloneNode(true);
        if (icon) button.append(icon);
        // Mirror the source's state (pressed, disabled).
        const sync = () => {
          button.disabled = (source as HTMLButtonElement).disabled;
          const pressed = source.getAttribute("aria-pressed");
          if (pressed === null) button.removeAttribute("aria-pressed");
          else button.setAttribute("aria-pressed", pressed);
        };
        sync();
        const watcher = new MutationObserver(sync);
        watcher.observe(source, { attributes: true, attributeFilter: ["aria-pressed", "disabled"] });
        watchers.push(watcher);
        button.addEventListener("click", () => source.click());
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          toggle(key);
        });
        return button;
      }),
    );
  };

  const toggle = (key: string) => {
    keys = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    write(name, keys);
    render();
  };
  bar.addEventListener("pointerdown", (event) => event.stopPropagation());
  render();
  const use = (next: string, seed: readonly string[] = []) => {
    name = next;
    bar.dataset.favorites = name;
    keys = (kept(name) ? read(name) : [...seed]).filter((k) => tools.has(k));
    render();
  };
  return { has: (key) => keys.includes(key), toggle, use };
}
