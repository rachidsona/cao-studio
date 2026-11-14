/** Les fiches des autres façons de tracer un rectangle, un cercle ou un arc (sketcher/draw-variants.ts), à part pour garder sketch.ts court. */
import type { ToolHelp } from "./types";

export const DRAW_VARIANTS: ToolHelp[] = [
  {
    keys: ["data-sketch-tool:rectangle-center"], name: "Rectangle par le centre",
    what: "Trace un rectangle autour d'un centre : un panneau centré sur un axe, une découpe centrée sur une plaque.",
    steps: ["Cliquez le centre (un point, l'origine, le milieu d'un trait).", "Cliquez un coin — ou tapez la largeur, Tab, la hauteur, puis Entrée."],
    tip: "Le rectangle reste centré : ses coins opposés sont symétriques par rapport au centre, même si vous changez ses cotes.",
  },
  {
    keys: ["data-sketch-tool:rectangle-3pt"], name: "Rectangle par trois points",
    what: "Trace un rectangle penché : le premier côté à n'importe quel angle, puis la largeur.",
    steps: ["Cliquez le début du premier côté.", "Cliquez sa fin, à l'angle voulu.", "Cliquez d'un côté ou de l'autre pour la largeur."],
    tip: "Les angles restent droits : chaque côté est parallèle à celui d'en face, le premier d'équerre avec le second.",
  },
  {
    keys: ["data-sketch-tool:circle-2pt"], name: "Cercle par deux points",
    what: "Trace un cercle par les deux bouts d'un diamètre : entre deux traits, d'un bord à l'autre.",
    steps: ["Cliquez un bout du diamètre.", "Cliquez l'autre bout — ou tapez le diamètre, puis Entrée."],
    tip: "Les deux points restent sur le cercle, face à face.",
  },
  {
    keys: ["data-sketch-tool:circle-3pt"], name: "Cercle par trois points",
    what: "Trace le cercle qui passe par trois points : pour retrouver un rond relevé.",
    steps: ["Cliquez trois points du cercle, dans n'importe quel ordre."],
    tip: "Les trois points restent sur le cercle. Trois points en ligne ne font pas de cercle : l'outil le dit.",
  },
  {
    keys: ["data-sketch-tool:arc-3pt"], name: "Arc par trois points",
    what: "Trace un arc par son départ, sa fin et un point par où il passe : un cintre, le haut d'une porte.",
    steps: ["Cliquez le départ.", "Cliquez la fin.", "Cliquez un point par où l'arc passe : il se courbe de son côté."],
  },
  {
    keys: ["data-sketch-tool:arc-tangent"], name: "Arc tangent",
    what: "Prolonge un trait ou un arc par un arc, sans cassure : un angle arrondi, un chemin qui tourne.",
    steps: ["Cliquez le bout d'un trait ou d'un arc.", "Cliquez la fin de l'arc : il part dans le prolongement du trait."],
    tip: "L'arc reste tangent à ce qu'il prolonge. Une fin droit devant serait un trait : l'outil le dit.",
  },
];

/** Les fiches des cotes de rayon, de diamètre, d'angle et en chaîne (sketcher/chain-dims.ts). */
export const MORE_DIMENSIONS: ToolHelp[] = [
  {
    keys: ["data-sketch-command:dimRadius", "data-sketch-command:dimDiameter"], name: "Cote de rayon et Cote de diamètre",
    what: "Cote un cercle par son rayon, ou un arc par son diamètre — au choix, quand la « Cote » donne l'autre.",
    steps: ["Sélectionnez un cercle ou un arc (ou cliquez d'abord le bouton, puis l'élément).", "Cliquez « Cote de rayon » ou « Cote de diamètre ».", "Tapez la valeur dans le panneau des propriétés."],
    tip: "Une poignée cuvette se cote volontiers au diamètre, un angle arrondi au rayon.",
  },
  {
    keys: ["data-sketch-command:dimAngle"], name: "Cote d'angle",
    what: "Impose l'angle entre deux lignes : une coupe d'onglet, un pan coupé, un dessus incliné.",
    steps: ["Cliquez le bouton, puis deux lignes non parallèles — l'axe X pour l'angle sur l'horizontale.", "Tapez l'angle en degrés dans le panneau des propriétés."],
    tip: "Deux lignes parallèles n'ont pas d'angle : leur écart se cote avec « Cote ».",
  },
  {
    keys: ["data-sketch-command:dimChain"], name: "Chaîne de cotes",
    what: "Pose d'un coup une rangée de cotes d'un point au suivant : les étagères le long d'un côté, une ligne de perçages.",
    steps: [
      "Cliquez le bouton, puis un côté : tous les points posés dessus (ses bouts, les traits qui y aboutissent) sont cotés d'un bout à l'autre.",
      "Ou sélectionnez d'abord trois éléments ou plus (points, traits, cercles) : leurs points, ou les centres des cercles, sont cotés le long de l'axe où ils s'étalent.",
    ],
    tip: "Les cotes figent le dessin ; celle qu'un total déjà coté impose est posée en cote de référence, entre parenthèses, et suit sans contredire.",
  },
];
