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
