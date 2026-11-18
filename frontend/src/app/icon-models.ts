/**
 * Le modèle des icônes de la barre d'outils (menu « ⋯ » → Icônes) : « Volumes » — les dessins de la page
 * (templates/editor/_icons.html) — ou un autre jeu, redessiné : « Studio », « Glyphe », « Croquis »
 * (static/icons/*.svg, faits par scripts/icon_models.py). Un modèle choisi, son fichier est chargé et chacun de ses
 * symboles remplace le contenu du symbole du même nom dans la page : toutes les icônes qui en sont tirées (<use>)
 * changent d'un coup ; un outil qu'il ne redessine pas encore garde son volume. Gardé par le navigateur.
 */
const KEY = "icon-model";
export const ICON_MODELS = ["studio", "glyphe", "croquis"] as const;

/** What the page drew, for each symbol a model has replaced: to come back to « Volumes ». */
const drawn = new Map<string, Node[]>();
/** The last model asked for: a slower, older answer is not applied over it. */
let wanted = "";

/** The symbols of a model's file, by id: only what an SVG parser reads from it — never as HTML. */
export function symbolsOf(text: string): Map<string, Element> {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  return new Map([...doc.querySelectorAll("symbol[id]")].map((s) => [s.id, s]));
}

/** The page's symbols take the model's drawings (those it has), the others their own again. */
export function swapSymbols(root: Document, symbols: ReadonlyMap<string, Element>): void {
  for (const [id, nodes] of drawn) root.getElementById(id)?.replaceChildren(...nodes.map((n) => n.cloneNode(true)));
  for (const [id, symbol] of symbols) {
    const mine = root.getElementById(id);
    if (!mine || mine.localName !== "symbol") continue;
    if (!drawn.has(id)) drawn.set(id, [...mine.childNodes].map((n) => n.cloneNode(true)));
    mine.replaceChildren(...[...symbol.childNodes].map((n) => root.importNode(n, true)));
  }
}

async function apply(model: string): Promise<void> {
  wanted = model;
  let symbols = new Map<string, Element>();
  if ((ICON_MODELS as readonly string[]).includes(model)) {
    const response = await fetch(`/static/icons/${model}.svg`);
    if (!response.ok) throw new Error(`Modèle d'icônes « ${model} » introuvable.`);
    symbols = symbolsOf(await response.text());
  }
  if (wanted !== model) return;
  swapSymbols(document, symbols);
  document.documentElement.dataset.iconModel = model;
}

export function bindIconModels(root: HTMLElement): void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-icon-model]")];
  // The styles (relief, contour…) paint the volumes only: not offered with another model.
  const styles = [...root.querySelectorAll<HTMLButtonElement>("[data-icon-style]")];
  const show = (model: string) => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.iconModel === model));
    for (const b of styles) b.disabled = model !== "";
  };
  const choose = (model: string) => {
    show(model);
    apply(model).catch(() => {
      // The file did not come (offline): the volumes stay, and the choice says so.
      if (wanted === model) show("");
    });
  };
  for (const b of buttons) {
    b.addEventListener("click", () => {
      const model = b.dataset.iconModel ?? "";
      try {
        localStorage.setItem(KEY, model);
      } catch {
        // No storage: for this page only.
      }
      choose(model);
    });
  }
  let stored = "";
  try {
    stored = localStorage.getItem(KEY) ?? "";
  } catch {
    // No storage: the volumes.
  }
  if ((ICON_MODELS as readonly string[]).includes(stored)) choose(stored);
  else show("");
}
