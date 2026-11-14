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

/** « Snack et comptoir » (app/kitchen/snack-tool.ts). */
export const SNACK_HELP: ToolHelp = {
  keys: ["data-action:snack"],
  name: "Snack et comptoir",
  what: "Pose un plan pour s'asseoir qui déborde d'un plan de travail, au dos d'un îlot ou au bout d'un plan, à sa hauteur ou en bar.",
  steps: [
    "Cliquez « Snack et comptoir » et choisissez le « Plan de travail » (l'îlot d'abord, s'il y en a un).",
    "Choisissez « Où » : au dos (le côté opposé aux façades) ou au bout du plan ; et la « Hauteur » : comptoir (à la hauteur du plan) ou bar (105 cm, sur une rehausse).",
    "Réglez le « Débord » (30 cm d'habitude) et la longueur, 0 pour tout le plan.",
    "Lisez combien de tabourets tiennent et leur hauteur d'assise. C'est enregistré aussitôt ; « Terminer » ferme.",
  ],
  tip: "Une console porte le débord tous les 60 cm environ ; elles vont au devis, le plan de snack et la rehausse au débit, dans la matière du plan de travail. Moins de 25 cm de débord ne laisse pas la place des genoux ; au-delà de 40 cm, mettez des pieds. Comptez 60 cm par tabouret, d'assise 65 cm au comptoir et 75 cm au bar. L'opération se rouvre ici depuis l'historique.",
};

/** « Plinthe technique » (app/kitchen/plinth-tech-tool.ts). */
export const PLINTH_TECH_HELP: ToolHelp = {
  keys: ["data-workshop:plinth-tech"],
  name: "Plinthe technique",
  what: "Met des grilles d'aération dans la plinthe devant le réfrigérateur et les fours, et des tiroirs de plinthe sous les meubles bas.",
  steps: [
    "Posez la cuisine avec ses plinthes (Plan de cuisine), puis cliquez « Plinthe technique ».",
    "Cochez « Grilles d'aération », « Tiroirs de plinthe », ou les deux.",
    "Cliquez « Appliquer » : la plinthe technique est faite en une étape (Ctrl + Z la retire). Décochez tout et appliquez pour la retirer.",
  ],
  tip: "Une grille va devant chaque réfrigérateur et chaque four encastrés. Un tiroir de plinthe va sous chaque meuble bas de 40 cm et plus, ni sous l'évier ni sous un appareil ; sa plinthe est mise de côté et refaite en morceaux entre les tiroirs, de sa matière. Grilles et coulisses vont au devis, façades, fonds et côtés au débit. Si la cuisine est refaite, appliquez de nouveau.",
};

/** « Inventaire du client » (app/dressing/inventory-tool.ts). */
export const INVENTORY_HELP: ToolHelp = {
  keys: ["data-workshop:inventory"],
  name: "Inventaire du client",
  what: "Transforme ce que le client doit ranger en mètres de penderie, tablettes et tiroirs, le compare au dressing dessiné et propose les modules qui manquent.",
  steps: [
    "Cliquez « Inventaire du client » et tapez combien de chemises, vestes, pantalons, robes longues, manteaux, pulls pliés, paires de chaussures et tiroirs voulus.",
    "Lisez le tableau : ce qu'il faut (avec 10 % de marge), ce que le dressing dessiné offre déjà, ce qui manque.",
    "Sous « À ajouter », les modules qui le donnent et leur largeur : posez-les avec « Modules à glisser » ou « Module ».",
    "Ou reportez les valeurs de la dernière ligne dans « Remplir selon les besoins » du Plan de dressing, qui pose les modules d'un coup.",
  ],
  tip: "Repères : 3 cm de tringle par chemise ou pantalon pendu, 6 par veste, 4 par robe longue, 8 par manteau ; 35 cm de tablette pour une pile de 6 pulls, 20 cm par paire de chaussures. Une tringle dans une niche de 1,30 m de haut ou plus compte en penderie longue. L'inventaire est gardé par ce navigateur, pour ce projet.",
};

/** « Rangement en hauteur » (app/dressing/high-storage-tool.ts). */
export const HIGH_STORAGE_HELP: ToolHelp = {
  keys: ["data-workshop:high-storage"],
  name: "Rangement en hauteur",
  what: "Dresse le tableau des niches hors de portée de main et pose une penderie escamotable (pantographe) là où elle tient.",
  steps: [
    "Cliquez « Rangement en hauteur » : le tableau donne chaque niche dont le bas est à 2 m du sol ou plus, et chaque tringle posée plus haut que 1,90 m, avec sa hauteur, sa taille et ce qu'elle contient.",
    "Lisez le conseil de chaque ligne : boîtes de rangement saisonnier dans une niche vide, portes plutôt que tiroirs là-haut, tringle à baisser.",
    "Là où elle tient, « Poser une penderie escamotable » remplace la tringle (ou garnit la niche vide) par une penderie qui descend à hauteur de main ; Ctrl + Z la retire.",
  ],
  tip: "Repères : on attrape sans escabeau jusqu'à 2 m environ ; une tringle se pose entre 1,70 m et 1,90 m. La penderie escamotable tient dans une niche de 45 à 115 cm de large, 90 cm de haut et 47 cm de profondeur au moins ; elle va au devis. Seules les Répartitions dessinées debout sont lues.",
};

/** « Planche de présentation » (app/workshop/presentation-board-tool.ts). */
export const BOARD_HELP: ToolHelp = {
  keys: ["data-workshop:board"],
  name: "Planche de présentation",
  what: "Met le projet sur une seule page pour le client : la vue 3D en grand, la face et le dessus, les dimensions, les matières, les rangements, la composition et le prix.",
  steps: [
    "Cadrez la vue 3D comme vous voulez la montrer (Rendu des matières allumé pour les couleurs du bois).",
    "Cliquez « Planche de présentation », tapez le nom du « Client » et un « Mot pour le client » ; cochez ou non « Afficher le prix TTC », choisissez le « Format » (A3 ou A4 paysage).",
    "Relisez le résumé (hors tout, matières, rangements, composition), puis cliquez « Imprimer / PDF » ; dans la fenêtre d'impression, « Enregistrer en PDF » pour l'envoyer.",
  ],
  tip: "Les vues de face et de dessus sont prises sur fond blanc, sans la grille, puis la vue revient comme elle était. Le prix est celui du devis aux tarifs enregistrés. Le client et le mot sont gardés par ce navigateur, pour ce projet.",
};
