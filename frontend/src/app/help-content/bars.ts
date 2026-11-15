/**
 * Les fiches d'aide des barres d'outils : « Tout sélectionner » et « Tout ouvrir » (colonne à droite de la vue), le
 * glisser des icônes d'une barre à l'autre, et l'ouverture d'un projet ; à part pour garder interface.ts court.
 */
import type { ToolHelp } from "./types";

const SELECT_ALL_HELP: ToolHelp = {
  keys: [],
  selector: "[data-select-all]",
  name: "Tout sélectionner",
  what: "Sélectionne d'un coup tous les corps et toutes les esquisses montrés dans la vue.",
  steps: [
    "Cliquez « Tout sélectionner », dans la colonne à droite de la vue (ou Ctrl ou ⌘ + A) : tout ce qui est montré est en bleu, et la barre du bas dit combien.",
    "Servez-vous de la sélection : déplacer, copier, isoler, changer la matière, supprimer…",
    "Échap, ou un clic dans le vide, vide la sélection.",
  ],
  tip: "Ce qui est caché (un calque éteint, une coupe, un isolement) n'est pas pris : cachez d'abord ce que vous voulez laisser de côté. Dans une esquisse, Ctrl + A prend tout le dessin.",
};

const OPEN_ALL_HELP: ToolHelp = {
  keys: [],
  selector: "[data-open-all]",
  name: "Tout ouvrir",
  what: "Ouvre d'un coup toutes les portes, sort tous les tiroirs et tous les accessoires du modèle, pour le montrer ouvert.",
  steps: [
    "Cliquez « Tout ouvrir », dans la colonne à droite de la vue : les portes tournent sur leurs charnières, les tiroirs, paniers et porte-pantalons glissent, les plateaux tournants et les demi-lunes pivotent, la penderie escamotable descend.",
    "Recliquez : tout se referme. Un clic sur une seule porte, un seul tiroir ou un seul accessoire l'ouvre ou le ferme à part.",
  ],
  tip: "Seule la vue change : le modèle, le débit et le devis restent les mêmes, et un recalcul du modèle referme tout. Ce qui est caché (calque, isolement) ne s'ouvre pas.",
};

/** In the family of the column beside the view. */
export const SIDE_HELP: ToolHelp[] = [SELECT_ALL_HELP, OPEN_ALL_HELP];

export const DRAG_HELP: ToolHelp = {
  keys: [],
  name: "Glisser les icônes d'une barre à l'autre",
  what: "Enlève une icône d'une barre, ou la met dans une autre, en la glissant : le ruban du haut, Mes outils, les sept colonnes et la colonne à droite de la vue.",
  steps: [
    "Pour enlever une icône, glissez-la hors des barres, sur la vue par exemple : elle devient rouge ; lâchez-la. Du ruban, elle se range dans le menu de son groupe (l'épingle l'y remet).",
    "Pour l'ajouter à une autre barre, glissez-la dessus : un trait bleu montre où elle se pose. Venue du ruban, elle y reste aussi ; venue d'ailleurs, elle change de barre.",
    "Glissée plus loin dans sa propre barre (Mes outils, une colonne, les outils ajoutés à droite de la vue), elle change de place.",
    "Le « + » en bas de la colonne à droite de la vue liste tous les outils : un clic remet une de ses icônes enlevées, ou en ajoute une autre.",
  ],
  tip: "Échap pendant le glisser annule. Lâchée sur une barre qui ne la prend pas (un outil d'esquisse sur le ruban du modèle), l'icône reste où elle était. Vos barres sont retenues par le navigateur.",
};

/** Opening a project: the model kept in the browser first, the exact one next (app/quick-open.ts). */
export const OPEN_PROJECT_HELP: ToolHelp = {
  keys: [], name: "Ouverture d'un projet",
  what: "Rouvre un projet presque aussitôt : le navigateur garde le dernier modèle calculé de chaque projet et le montre pendant que le noyau 3D démarre et recalcule.",
  steps: [
    "La première fois, l'écran de chargement suit le démarrage du noyau 3D puis le calcul des corps.",
    "Les fois suivantes, si le modèle n'a pas changé depuis, ses corps s'affichent tout de suite ; la barre d'état en bas dit « Dernier calcul affiché — calcul exact en cours… », puis « Recalcul … ms » quand le calcul exact les a remplacés.",
    "Pendant ce temps, vous pouvez déjà regarder, tourner et sélectionner : les mesures, les contours, les perçages et les exports (DXF, STEP…) attendent le calcul exact, une seconde ou deux, et répondent ensuite.",
  ],
  tip: "Un projet modifié ailleurs (un autre ordinateur, un autre onglet), une mise à jour de l'éditeur ou du catalogue de l'atelier : l'ancien modèle n'est pas montré, le projet se calcule comme la première fois. Un devis, une vue ou un nom changé ne compte pas. Le navigateur garde les 12 derniers projets calculés ; vider ses données ne fait que ralentir la prochaine ouverture.",
};
