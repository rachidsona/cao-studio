/**
 * Aide de l'éditeur : la prise en main en quelques étapes, les raccourcis clavier (3D et esquisse) et, dans
 * help-browser.ts, la fiche de chaque outil. S'ouvre avec le bouton Aide, la touche « ? » ou le menu « ⋯ » ; les
 * raccourcis listés ici sont ceux de keyboard.ts et de sketch-controller.ts.
 */
import { el } from "../ui/dom";
import { helpBrowser } from "./help-browser";
import { openModal } from "./workshop-ui";

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl";

export const SHORTCUTS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Partout",
    keys: [
      [`${MOD} S`, "Enregistrer"],
      [`${MOD} K`, "Palette de commandes : lancer un outil par son nom"],
      [`${MOD} Z`, "Annuler"],
      [`${MOD} ⇧ Z  ou  ${MOD} Y`, "Rétablir"],
      ["Échap", "Quitter l'outil, puis la sélection"],
      ["Suppr", "Supprimer la sélection"],
      ["?", "Afficher cette aide"],
    ],
  },
  {
    title: "Vue 3D",
    keys: [
      ["F", "Cadrer tout le modèle"],
      ["E", "Extrusion"],
      ["H", "Perçage"],
      ["R", "Répéter le dernier outil, sur la niche sous le pointeur"],
      ["Clic droit sur une niche", "Menu : étagères, tiroirs, penderie, module, copier"],
      ["Maj + glisser", "Sélection par fenêtre (gauche → droite : entièrement dedans ; droite → gauche : touché)"],
      ["Ctrl, ⌘ ou Maj + clic", "Ajouter des corps et des esquisses à la sélection"],
      ["Clic au même endroit", "Choisir l'élément suivant sous le pointeur"],
    ],
  },
  {
    title: "Esquisse",
    keys: [
      ["S", "Sélection"],
      ["L", "Ligne"],
      ["R", "Rectangle"],
      ["C", "Cercle"],
      ["A", "Arc"],
      ["D", "Cote"],
      ["O", "Décalage"],
      ["M", "Déplacer"],
      ["X", "Construction (trait d'aide)"],
      ["G", "Accrochage à la grille"],
      ["F", "Cadrer l'esquisse"],
      ["E", "Extruder l'esquisse"],
      ["Entrée", "Terminer l'esquisse"],
    ],
  },
];

const STEPS: [string, string][] = [
  ["Esquisser", "« Créer › Esquisse », choisissez un plan ou une face, tracez (L, R, C) et cotez (D) : l'esquisse est entièrement contrainte quand elle est verte."],
  ["Donner du volume", "Sélectionnez une zone fermée et Extrusion (E) : tirez la flèche ou tapez la distance ; « Couper » creuse un corps."],
  ["Modifier", "Perçage, congé, chanfrein, déplacement… Chaque opération est dans l'historique en bas : cliquez-la pour la modifier."],
  ["Meubler", "Menuiserie : caisson, panneaux depuis un squelette, usinages et assemblages ; chaque panneau est un corps à part."],
  ["Fabriquer", "Atelier : liste de débit (CSV, impression), calepinage des panneaux, mise en plan cotée, export DXF pour la commande numérique."],
];

function helpContent(): HTMLElement {
  const steps = el(
    "ol",
    { class: "list-decimal space-y-1.5 pl-5 text-sm" },
    ...STEPS.map(([title, text]) => el("li", {}, el("span", { class: "font-semibold" }, `${title} : `), text)),
  );
  const groups = SHORTCUTS.map(({ title, keys }) =>
    el(
      "section",
      { class: "min-w-0" },
      el("h3", { class: "mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, title),
      el(
        "dl",
        { class: "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" },
        ...keys.flatMap(([key, what]) => [
          el("dt", {}, el("kbd", { class: " border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap dark:border-gray-600 dark:bg-gray-800" }, key)),
          el("dd", { class: "text-gray-700 dark:text-gray-300" }, what),
        ]),
      ),
    ),
  );
  return el(
    "div",
    { class: "space-y-5" },
    el("section", {}, el("h3", { class: "mb-2 text-sm font-semibold" }, "Prise en main"), steps),
    el("div", { class: "grid gap-5 lg:grid-cols-3" }, ...groups),
  );
}

let close: (() => void) | null = null;

function openHelp(root: HTMLElement): void {
  close?.();
  const shut = openModal("Aide", helpBrowser(root, helpContent()));
  close = () => {
    shut();
    close = null;
  };
}

/** The "?" key (outside text fields), the Aide button and the menu entry open the help. */
export function bindHelp(root: HTMLElement): void {
  for (const button of root.querySelectorAll('[data-action="help"]')) button.addEventListener("click", () => openHelp(root));
  window.addEventListener("keydown", (event) => {
    if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    openHelp(root);
  });
}
