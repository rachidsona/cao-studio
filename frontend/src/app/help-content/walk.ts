/** La fiche d'aide de la visite à pied (groupe « Client »), à part pour garder workshop.ts court. */
import type { ToolHelp } from "./types";

export const WALK_HELP: ToolHelp = {
  keys: ["data-workshop:walk"],
  name: "Visite à pied",
  what: "Promène dans la pièce à hauteur d'yeux, pour voir le meuble comme le client le verra.",
  steps: [
    "Cliquez « Visite à pied » : vous êtes au milieu de la pièce, ou à 2,50 m devant le meuble, les yeux à 1,60 m.",
    "Glissez dans la vue pour regarder autour de vous, en haut et en bas.",
    "Marchez avec les flèches ou Z Q S D (W A S D sur un clavier anglais), Maj pour aller plus vite ; sur une tablette, avec le joystick en bas à gauche de la vue.",
    "Montez ou baissez les yeux avec la molette, ou tapez la « Hauteur des yeux » (de 90 cm à 2 m : un enfant, un fauteuil, un grand).",
    "Cliquez une porte ou un tiroir pour l'ouvrir ou le fermer, ou un endroit libre du sol pour vous y rendre.",
    "Échap, « Terminer » ou le même bouton rendent la vue d'avant.",
  ],
  tip: "Les murs et les meubles vous arrêtent : vous glissez le long d'eux. Les plinthes basses et le plafond ne gênent pas. Le modèle ne change pas pendant la visite.",
};
