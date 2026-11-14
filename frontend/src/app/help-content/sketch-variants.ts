/** Les fiches des autres façons de tracer un rectangle, un cercle ou un arc (sketcher/draw-variants.ts), à part pour garder sketch.ts court. */
import type { ToolHelp } from "./types";

export const DRAW_VARIANTS: ToolHelp[] = [
  {
    keys: ["data-sketch-command:joineryshapes"], name: "Formes de menuiserie",
    what: "Pose d'un clic une forme courante de l'atelier, déjà contrainte et cotée : découpe d'évier (angles arrondis) ou de plaque de cuisson, encoche au bord, queue d'aronde, rangée de trous système 32, poignée cuvette.",
    steps: [
      "Cliquez « Formes de menuiserie », choisissez la forme et tapez ses cotes (largeur, profondeur, rayon, nombre de trous, entraxe, pente…).",
      "Cliquez « Poser dans l'esquisse », puis cliquez à l'endroit voulu : le centre de la découpe, le milieu du bord pour une encoche, le premier trou pour une rangée. La forme suit la souris avant d'être posée.",
      "Chaque clic en pose une autre ; Échap arrête. Changez ensuite une de ses cotes pour la régler, et cotez sa place depuis un bord.",
    ],
    tip: "Les cotes tapées sont gardées pour la fois suivante. Une rangée système 32 garde ses trous égaux et alignés : changer l'entraxe ou le diamètre d'une cote les règle tous.",
  },
  {
    keys: [], name: "Coordonnées au clavier",
    what: "Pose le prochain point d'un tracé à des coordonnées tapées, comme en DAO, avec n'importe quel outil de dessin.",
    steps: [
      "Un outil de dessin ouvert (ligne, rectangle, cercle…), tapez « @ » pour des coordonnées relatives (depuis le dernier point posé ; l'origine pour le premier), ou « # » pour des coordonnées absolues (depuis l'origine).",
      "Tapez « x;y » — par exemple @60;0 — ou « distance<angle » en polaire — par exemple @80<45, l'angle en degrés depuis l'horizontale.",
      "Entrée pose le point ; le tracé continue au point suivant. Retour arrière efface, Échap annule la saisie.",
    ],
    tip: "Les longueurs sont dans l'unité du projet. « 600,0 » se lit x = 600, y = 0 ; pour un nombre à virgule, séparez par « ; » (12,5;30). Le point visé se voit pendant la frappe, et la barre d'état rappelle ce qui est tapé. Sur un clavier de PC, « @ » se tape avec AltGr + à.",
  },
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
  {
    keys: ["data-sketch-command:fullydefine"], name: "Contraindre tout",
    what: "Fige d'un coup l'esquisse : pose les cotes qui manquent, à leur mesure actuelle, sans bouger le dessin. Les traits figés passent du bleu au blanc.",
    steps: [
      "Regardez le compteur « … à fixer » et la couleur des traits : en bleu, ils peuvent encore bouger ; en blanc, ils sont figés.",
      "Cliquez « Contraindre tout » : les longueurs, diamètres et rayons d'abord, puis les angles des traits penchés, enfin la place des points depuis l'origine.",
      "Changez ensuite les cotes posées pour régler les mesures.",
    ],
    tip: "Une cote qui contredirait les autres n'est pas posée. Avec des contraintes en conflit, réglez-les d'abord.",
  },
];

/** La fiche de l'étirement dans l'esquisse (sketcher/move.ts, stretchGeometry). */
export const STRETCH: ToolHelp = {
  keys: ["data-sketch-tool:stretch"], name: "Étirer",
  what: "Allonge ou raccourcit une partie du dessin : un caisson élargi par son côté, une niche rehaussée. Les traits qui relient la partie tirée au reste s'allongent, et leurs cotes prennent la nouvelle mesure.",
  steps: [
    "Cliquez « Étirer ».",
    "Glissez un cadre sur un vide autour des points à tirer — par exemple le côté droit d'un caisson et ses étagères qui y aboutissent. Vous pouvez aussi cliquer les points un à un.",
    "Tirez-les à la souris, ou saisissez le déplacement dans le panneau (ΔX ΔY, distance et angle, ou position). Il est appliqué aussitôt ; Échap ferme.",
  ],
  tip: "Les autres contraintes sont gardées : un côté vertical reste vertical. Un étirement qui les contredirait est refusé, avec les contraintes en cause. Un nouveau cadre remplace les points pris.",
};
