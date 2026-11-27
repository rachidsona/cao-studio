/** La famille « Curic » de l'aide : les outils de modélisation à la manière de Curic (sortis de interface.ts). */
import type { HelpFamily } from "./types";

export const CURIC: HelpFamily[] = [
  {
    title: "Curic",
    where: "Ruban du haut, groupe « Modifier ». Son nom ouvre le menu de tous ses outils : Assemblage, Étirer, Tourner, Lignes tout autour et Arêtes cachées n'y restent rangés que tant que vous ne les épinglez pas dans la barre.",
    tools: [
      {
        keys: ["data-action:face-strip"], name: "Magie extrusion",
        what: "Un seul outil pour tout tracer sur un corps puis l'extruder : un trait depuis une arête ou un coin, ou une ligne, un rectangle, un cercle, le décalage du contour dessinés sur une face — puis ajouter ou creuser de la matière.",
        steps: [
          "Cliquez « Magie extrusion » et choisissez le « Tracé » : « Trait depuis une arête (parallèle) », « Trait depuis un coin (en travers) » ou « Trait depuis une face (parallèle) » — une face voisine de la même pièce, comme un chant, ou celle d'une autre pièce : cliquez-la, puis amenez le pointeur sur la face où tracer, le trait est parallèle à la face cliquée, à la distance tapée depuis elle —, « Ligne / polyligne », « Rectangle », « Cercle » ou « Décalage du contour ». L'outil s'ouvre sur le dernier tracé choisi.",
          "Un trait : cliquez l'arête ou le coin de départ (un trait tracé avant sur la face compte comme une arête) ; le trait suit le pointeur, avec les distances aux bords. Ctrl bascule entre « Une ligne » et « Double trait ». Tapez la distance au clavier (retrait;largeur pour un double trait) puis Entrée, ou cliquez pour le poser.",
          "Une forme : cliquez sur une face (ce premier point la fixe, les distances aux bords s'affichent en bas), puis le point suivant, le coin opposé ou un point du cercle — Entrée termine une ligne. Les mesures se tapent séparées par « ; » (120;45).",
          "Tirez pour ajouter, poussez pour creuser — ou tapez la hauteur (− pour creuser) puis Entrée ; Tab inverse. « Nouveau corps » garde le corps cliqué tel quel. L'intérieur d'une face se tire ou se pousse tel quel ; amenée sur la face d'un autre corps, elle va jusqu'à elle et la suit toujours (sa pente, et là où elle ira ensuite). « Direction » fait aller la face tirée perpendiculairement à elle-même, selon X, Y ou Z, ou comme une autre face (cliquez-la : perpendiculairement à elle).",
        ],
        tip: "Les formes de l'esquisse aussi, dans « Tracé » : rectangle par le centre ou par 3 points, cercle par 2 ou 3 points, arc, arc par 3 points, polygone (son nombre de « Côtés »), oblong, ovale, courbe — leurs cotes (longueurs, Ø, R) s'affichent dans la vue pendant le tracé ; tapez une mesure au clavier puis Entrée : une distance depuis le dernier point, « distance;angle », « largeur;hauteur » pour un rectangle par le centre ou un ovale, l'angle d'un arc, la largeur d'un oblong — chaque mesure tapée devient une cote fixe de l'esquisse, comme dans l'esquisse (largeur et hauteur, diamètre, largeur d'oblong, distance entre deux points ; un angle oriente sans cote) ; de même pour Ligne (sa longueur), Rectangle (largeur et hauteur) et Cercle (son diamètre, le double du rayon tapé). Sur la grille, le point s'accroche aux trois axes et au pas de la grille. Sans corps : là où le pointeur ne survole aucun corps, Ligne, Rectangle et Cercle se dessinent sur la grille, sur le plan choisi dans « Sans corps, sur » — Dessus (XY), Face (XZ) ou Côté (YZ), comme Nouvelle esquisse — et se tirent en un corps nouveau ; « Afficher les axes » montre (ou cache) les trois axes de la vue par l'origine : rouge X, vert Y, bleu Z, en tirets du côté négatif. Pour tracer sans extruder, décochez « Puis tirer / pousser » (un trait comme une forme) : le tracé est gardé seul, en esquisse, dès qu'il est posé ; la croix ✕ avant de tirer fait de même. Le point s'accroche aux coins et aux milieux des arêtes ; visez un coin ou une arête d'un corps pour vous arrêter à son niveau. Échap revient d'une étape. Seules les faces planes se tirent. Sur toutes les formes : triangle, polygone, bout de cylindre, face percée ; et sur le flanc d'un cylindre, « Rectangle » (deux coins, il suit la face), « Cercle » (centre puis bord : percé vers l'axe, ou en bossage avec une profondeur négative) et « Décalage du contour » (tout le tour) se creusent à la « Profondeur » du panneau, puis OK ; « Trait depuis une arête » près du bord rond creuse la bande entre ce bord et le trait, tout autour (négative : un collet).",
      },
      {
        keys: ["data-action:mirror"], name: "Symétrie",
        what: "Copie des corps ou des esquisses de l'autre côté d'un plan, contre l'un de leurs côtés ou au centre.",
        steps: [
          "Sélectionnez les corps, puis cliquez « Symétrie ». Sans sélection, l'outil prend le dernier corps créé.",
          "Choisissez l'« Axe » : X largeur, Y profondeur ou Z hauteur. Le plan orange dans la vue est le miroir.",
          "Placez-le avec « Côté − », « Centre » ou « Côté + », ou tapez « Plan à ».",
          "Cliquez un autre corps ou une esquisse pour l'ajouter ou le retirer : c'est enregistré aussitôt.",
        ],
        tip: "Les originaux restent en place. Une esquisse en biais par rapport au plan est refusée : changez d'axe.",
      },
      {
        keys: ["data-action:align"], name: "Aligner",
        what: "Pose un caisson ou une Répartition contre un autre, face contre face, ou aligne des corps sur une référence.",
        steps: [
          "Cliquez « Aligner » : la méthode « Face sur face » est prise d'office.",
          "Cliquez la face du caisson à déplacer (un côté, une façade) : c'est tout le meuble qui bougera, ses façades et son électroménager compris (« Ce qui bouge » permet de ne prendre que la pièce).",
          "Cliquez la face où le poser, sur un autre élément : il s'y plaque, ses bords affleurant les siens au coin le plus proche du clic (« Où »). Réglez le « Jeu » ou un quart de tour si besoin.",
          "C'est enregistré dès que le réglage est valable (Ctrl + Z l'annule). « OK » (ou Entrée) garde l'opération et l'outil reste ouvert pour la suivante ; « Terminer » (la croix ✕, Échap) le ferme.",
        ],
        tip: "« Méthode » propose aussi « Point sur point » et « Par axes (X, Y, Z) » : les corps cliqués s'y alignent sur une référence de la liste, axe par axe (accolé, aligné, centré), et suivent ensuite cette référence quand elle change.",
      },
      {
        keys: ["data-action:mate"], name: "Assemblage",
        what: "Relie deux pièces face contre face pour que l'une suive l'autre quand celle-ci change.",
        steps: [
          "Cliquez une face de la pièce qui bouge, puis une face de la pièce fixe. Des faces opposées se touchent, des faces de même sens affleurent.",
          "Recommencez avec d'autres faces pour lier un autre axe : une liaison par axe, trois au plus.",
          "Pour chaque axe, choisissez « Contact, côté + », « Contact, côté − », « Affleurant, côté + », « Affleurant, côté − » ou « Centré », puis réglez « Jeu », « Retrait » ou « Décalage ».",
          "Le bouton ✕ retire une liaison. C'est enregistré aussitôt.",
        ],
        tip: "Cliquez des faces planes parallèles aux axes, comme la face d'une planche. Le résultat se rouvre dans « Aligner ».",
      },
      {
        keys: ["data-action:stretch"], name: "Étirer",
        what: "Allonge un meuble en une fois : un plan le coupe, les panneaux traversés s'allongent, ceux au-delà se déplacent.",
        steps: [
          "Sélectionnez les corps à étirer (rien : tous les corps visibles), puis cliquez « Étirer ».",
          "Choisissez l'« Axe ». Cliquez un corps pour y placer le plan orange, ou tapez « Plan à ».",
          "Saisissez la « Distance » : positive, elle allonge ; négative, elle raccourcit. C'est enregistré aussitôt.",
        ],
        tip: "Ce qui est avant le plan ne bouge pas. Les esquisses concernées sont étirées aussi.",
      },
      {
        keys: ["data-action:array"], name: "Réseau",
        what: "Répète des corps et des esquisses en ligne, en grille ou en cercle.",
        steps: [
          "Sélectionnez les éléments, puis cliquez « Réseau ». Cliquez-en d'autres dans la vue pour les ajouter ou les retirer.",
          "Choisissez le « Type » : « Linéaire (une direction) », « Rectangulaire (deux directions) » ou « Circulaire (autour d'un axe) ».",
          "Choisissez le « Placement » : « Un pas entre copies (*n) » ou « Réparties sur une distance (/n) ».",
          "Réglez l'« Axe », les « Copies » (ou la « Quantité ») et le « Pas » (ou la « Distance ») : c'est enregistré aussitôt.",
          "Ou cliquez « Jusqu'à… (point, arête ou face) », puis un coin, une arête ou une face dans la vue : la dernière copie y arrive, et le pas (ou la distance) se calcule.",
        ],
        tip: "Un pas négatif va de l'autre côté. En cercle, seuls les corps sont copiés, autour d'un axe qui passe par leur centre.",
      },
      {
        keys: ["data-action:rotate"], name: "Tourner",
        what: "Fait tourner des corps ou des esquisses autour d'un axe, par quarts de tour ou d'un angle saisi.",
        steps: [
          "Sélectionnez les éléments, puis cliquez « Tourner ». Sans sélection, l'outil prend le dernier corps créé.",
          "Choisissez l'« Axe », puis saisissez l'« Angle » ou cliquez « −90° », « +90° » ou « 180° ».",
          "Pour pivoter autour d'un coin, cliquez ce coin (point vert) ; un second clic ramène le pivot au centre.",
          "C'est enregistré dès que le réglage est valable (Ctrl + Z l'annule). « OK » (ou Entrée) garde l'opération et l'outil reste ouvert pour la suivante ; « Terminer » (la croix ✕, Échap) le ferme.",
        ],
        tip: "Tirer une flèche courbe du pivot tourne de 5° en 5° (librement avec Maj). Une esquisse ne tourne que dans son plan. Un meuble entier tourné autour de la hauteur (Z) n'entre jamais dans un voisin ni dans un mur : il est posé au ras, à côté (l'aimant intelligent allumé), comme avec Déplacer.",
      },
      {
        keys: ["data-workshop:layers"], name: "Calques",
        what: "Range les corps par familles (caisson, façades, quincaillerie…) pour les montrer ou les cacher ensemble.",
        steps: [
          "Cliquez « Calques » : un panneau s'ouvre sur la vue.",
          "Cliquez « Nouveau calque » (avec les corps sélectionnés, s'il y en a) et tapez son nom.",
          "Pour y ranger d'autres corps, sélectionnez-les dans la vue puis cliquez le « + » du calque.",
          "L'œil montre ou cache les corps du calque. ✕ supprime le calque : ses corps restent, sans calque.",
        ],
        tip: "Le nombre à droite du nom est le nombre de corps du calque. Un corps caché reste une pièce du meuble : la liste de débit, le devis et la CNC le comptent.",
      },
      {
        keys: ["data-action:oi-intersect"], name: "Lignes tout autour",
        what: "Trace autour d'un corps une ligne parallèle à une face, à une distance donnée, sous forme d'esquisse.",
        steps: [
          "Sélectionnez une face plane puis cliquez « Lignes tout autour », ou cliquez l'outil puis la face.",
          "Tirez la flèche dans la face, ou tapez la « Distance de la face », puis le « Nombre de lignes ».",
          "Cochez « Répartir dans l'épaisseur » pour partager l'épaisseur en parts égales, ou « Tous les corps traversés » pour tracer aussi sur les autres corps coupés.",
          "C'est enregistré dès que le réglage est valable (Ctrl + Z l'annule). « OK » (ou Entrée) garde l'opération et l'outil reste ouvert pour la suivante ; « Terminer » (la croix ✕, Échap) le ferme.",
        ],
        tip: "Le corps reste entier. Chaque plan crée une esquisse « Intersection n », que vous pouvez ensuite extruder.",
      },
      {
        keys: ["data-hidden-joints:"], name: "Arêtes cachées",
        what: "Efface les lignes de joint entre les pièces qui se rejoignent à fleur, pour voir une surface lisse.",
        steps: [
          "Cliquez « Arêtes cachées » : le bouton reste enfoncé et les lignes de joint disparaissent.",
          "Recliquez pour les remettre.",
        ],
        tip: "Les pièces restent séparées : liste de débit et mise en plan ne changent pas. Le choix est retenu.",
      },
      {
        keys: ["data-section:"], name: "Coupe",
        what: "Cache ce qui est au-delà d'un plan pour voir l'intérieur du meuble.",
        steps: [
          "Cliquez « Coupe » : un panneau s'ouvre. Choisissez l'« Axe de la coupe » : X largeur, Y profondeur ou Z hauteur.",
          "Déplacez le curseur « Position de la coupe » : tout ce qui est au-delà du plan est caché.",
          "Cochez « Garder l'autre côté » pour cacher l'autre moitié.",
          "« Fermer la coupe », ou un second clic sur le bouton, remet le meuble entier.",
        ],
        tip: "Seule la vue est coupée : le modèle ne change pas et rien n'est enregistré.",
      },
    ],
  },
];
