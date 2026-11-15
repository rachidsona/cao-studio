/** La fiche d'aide de « Tout sélectionner » (colonne à droite de la vue), à part pour garder interface.ts court. */
import type { ToolHelp } from "./types";

export const SELECT_ALL_HELP: ToolHelp = {
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
