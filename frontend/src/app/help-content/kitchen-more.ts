/** Les fiches d'aide des outils de conception de cuisine et de dressing ajoutés ensuite, à part pour garder woodworking.ts court. */
import type { ToolHelp } from "./types";

/** « Plan technique » (app/kitchen/tech-plan-tool.ts). */
export const TECH_PLAN_HELP: ToolHelp = {
  keys: ["data-workshop:tech-plan"],
  name: "Plan technique",
  what: "Donne au plombier et à l'électricien ce qu'il faut amener au mur avant la pose : eau, évacuations, lignes et prises, coté mur par mur.",
  steps: [
    "Posez la cuisine (Plan de cuisine ou Implantation, avec son électroménager), puis cliquez « Plan technique ».",
    "Chaque mur s'affiche vu de la pièce : ce qui s'y pose en gris clair, les points numérotés, et leur liste cotée depuis le début du mur (à gauche) et depuis le sol.",
    "Les repères : EF eau froide, EC eau chaude, EV évacuation, P prise 16 A, 32 et 20 lignes de la plaque et du four, AIR sortie de la hotte.",
    "Cliquez « Fichier PDF » pour télécharger une page A4 par mur, à remettre aux artisans.",
  ],
  tip: "Sous l'évier : eau chaude à gauche, eau froide à droite, à 50 cm du sol, évacuation entre elles à 40 cm. La prise et l'eau du lave-vaisselle vont dans le meuble voisin, du côté de l'évier. Les prises du plan de travail sont à 10 cm au-dessus, jamais à moins de 60 cm de l'évier ou de la plaque ; le plan dit quand il en manque pour en avoir 4. Ce sont des repères d'usage : l'installateur les valide.",
};

/** « Plan de travail en barres » (app/kitchen/worktop-bars-tool.ts). */
export const WORKTOP_BARS_HELP: ToolHelp = {
  keys: ["data-workshop:worktop-bars"],
  name: "Plan de travail en barres",
  what: "Coupe chaque plan de travail en longueurs du commerce, place les joints et l'angle, et donne les barres à acheter, comptées au devis.",
  steps: [
    "Posez la cuisine avec ses plans de travail, puis cliquez « Plan de travail en barres ».",
    "Choisissez la longueur des « Barres vendues » (3 m, 3,05 m, 4,10 m ou 4,20 m) et l'angle : « Joint droit » (l'un passe, l'autre vient contre) ou « Coupe d'onglet ».",
    "Chaque plan s'affiche vu de dessus : ses découpes en pointillés, ses joints en rouge, la longueur de chaque morceau.",
    "Lisez « À acheter » : le nombre de barres de chaque matière et largeur, et les ferrures de jonction.",
  ],
  tip: "Les joints tombent sur le côté d'un meuble pour être portés, à 10 cm au moins d'une découpe d'évier ou de plaque. En onglet, le plan qui vient contre s'allonge de la profondeur de l'autre. Les morceaux courts se rangent dans les chutes d'une barre déjà comptée. Le devis compte ces barres au prix du m² de leur matière, au lieu de la surface du plan, et deux ferrures par joint. Le réglage est gardé avec votre compte.",
};
