import { DRAW_VARIANTS, MORE_DIMENSIONS, SMART_SELECT, STRETCH } from "./sketch-variants";
import type { HelpFamily } from "./types";

export const SKETCH: HelpFamily[] = [
  {
    title: "Esquisse : Terminer",
    where: "Barre d'outils de l'esquisse, tout à gauche, visible quand une esquisse est ouverte. Le nom d'un groupe suivi de ▾ ouvre le menu de tous ses outils, y compris ceux rangés par défaut.",
    tools: [
      {
        keys: ["data-sketch-command:finish"], name: "Terminer l'esquisse",
        what: "Ferme l'esquisse et revient à la modélisation en gardant le dessin.",
        steps: [
          "Cliquez « Terminer l'esquisse », ou appuyez sur Entrée.",
          "L'esquisse reste dans l'historique et se retrouve sélectionnée.",
        ],
        tip: "Chaque trait est enregistré au moment où vous le tracez, et s'annule un par un. Un outil de dessin (ligne, rectangle, cercle, arc…) reste actif après chaque forme, pour en tracer d'autres : Échap le quitte et revient à la sélection ; un second Échap, sans outil ni sélection, quitte l'esquisse.",
      }, {
        keys: ["data-sketch-command:extrude"], name: "Extrusion",
        what: "Termine l'esquisse et donne de l'épaisseur à une zone fermée du dessin.",
        steps: [
          "Cliquez « Extrusion » (ou la touche E).",
          "Dans la vue, cliquez la zone fermée à extruder ; recliquez une zone pour la retirer.",
          "Tirez la flèche, ou tapez la « Distance » dans le panneau.",
          "Choisissez l'« Opération » : Nouveau corps, Joindre, Couper ou Intersection.",
          "Pour Joindre, Couper ou Intersection, choisissez la « Cible » : c'est enregistré aussitôt.",
        ],
        tip: "Une esquisse qui n'a que des lignes, sans zone fermée, n'est pas extrudée : elle ouvre l'outil Toit (une ligne sur le dessus d'un corps) ou l'outil Panneaux (chaque ligne devient un panneau).",
      },
    ],
  },
  {
    title: "Esquisse : Créer",
    where: "Barre d'outils de l'esquisse, groupe « Créer ». Polygone, Oblong, Ovale, Courbe lissée, Texte, Image de référence et Importer un plan DXF sont rangés dans le menu du groupe (▾) tant que vous ne les épinglez pas dans la barre.",
    tools: [
      {
        keys: ["data-sketch-tool:select"], name: "Sélection",
        what: "Choisit des traits ou des points, pour les contraindre, les coter ou les supprimer.",
        steps: [
          "Cliquez un trait ou un point : il est sélectionné. Recliquez-le pour le retirer.",
          "Cliquez à l'intérieur d'une forme fermée : tous ses côtés sont sélectionnés.",
          "Cliquez plusieurs fois au même endroit pour passer d'un trait à celui qui le recouvre.",
          "Tirez un point pour le déplacer : les contraintes et les cotes sont respectées.",
          "Appuyez sur Suppr pour supprimer la sélection, sur Échap pour la vider.",
        ],
        tip: "Un point violet (repère projeté d'un corps) est fixe : on ne peut pas le tirer.",
      }, {
        keys: ["data-sketch-tool:line"], name: "Ligne",
        what: "Trace une ligne, ou une suite de lignes reliées (polyligne) en tenant Maj.",
        steps: [
          "Cliquez le premier point.",
          "Cliquez le point d'arrivée : le trait est posé, et l'outil attend le premier point du suivant.",
          "Ou tapez sa longueur — ou un calcul, (190+100)/2 — : elle s'écrit dans la case en bleu et le trait la prend, dans le sens de la souris. Tab passe à l'angle (sur l'horizontale), Entrée pose le trait.",
          "Maj + clic (ou Maj + Entrée) sur le point d'arrivée : le trait suivant part de là. Continuez ainsi, puis Échap pour terminer.",
          "Pour fermer la forme, Maj + clic à nouveau sur le tout premier point.",
        ],
        tip: "Cliquer sur un point existant le réutilise ; cliquer sur un trait y accroche le nouveau point. Les accrochages se règlent dans le groupe « Affichage ».",
      }, {
        keys: ["data-sketch-tool:rectangle"], name: "Rectangle",
        what: "Trace un rectangle à partir de deux coins opposés.",
        steps: [
          "Cliquez un coin.",
          "Cliquez le coin opposé — ou tapez ses cotes : la largeur s'écrit dans la case en bleu, Tab la garde (un cadenas) et passe à la hauteur, Entrée pose le rectangle. Une case prend aussi un calcul : (190+100)/2, 2*70, 80-2,5 — son résultat s'affiche à côté (« = 145 »).",
        ],
        tip: "Chaque cote tapée reste une cote de l'esquisse, que vous changez ensuite d'un clic. Un clic sur une case ouvre la calculatrice sur sa valeur : ✓ la garde, comme Tab. La souris donne le côté (à droite ou à gauche, en haut ou en bas) ; ce qui n'est pas tapé la suit. Retour arrière efface. Si la forme tapée sort de l'écran, la vue recule pour la montrer entière. Les côtés sont déjà horizontaux et verticaux. L'outil reste actif pour le rectangle suivant : Échap (ou l'outil « Sélection ») le quitte.",
      }, {
        keys: ["data-sketch-tool:circle"], name: "Cercle",
        what: "Trace un cercle à partir de son centre.",
        steps: [
          "Cliquez le centre.",
          "Cliquez un point du cercle : la distance donne le rayon — ou tapez son diamètre, puis Entrée.",
        ],
        tip: "Le diamètre tapé reste une cote du cercle ; un cercle posé à la souris se cote ensuite avec l'outil « Cote ».",
      }, {
        keys: ["data-sketch-tool:arc"], name: "Arc",
        what: "Trace un arc de cercle défini par son centre.",
        steps: [
          "Cliquez le centre.",
          "Cliquez le point de départ : la distance donne le rayon.",
          "Cliquez la fin de l'arc. L'arc tourne dans le sens antihoraire, du départ vers la fin.",
        ],
      },
      ...DRAW_VARIANTS,
      {
        keys: ["data-sketch-tool:polygon"], name: "Polygone",
        what: "Trace un polygone régulier, de 3 à 9 côtés.",
        steps: [
          "Tapez un chiffre de 3 à 9 pour le nombre de côtés (6 au départ) ; il s'affiche dans l'indication en bas.",
          "Cliquez le centre du polygone.",
          "Cliquez un sommet : il fixe la taille et l'orientation.",
        ],
        tip: "Tous les côtés sont liés par une égalité, et les sommets sont tenus sur un cercle de construction : modifier un côté change toute la forme.",
      }, {
        keys: ["data-sketch-tool:slot"], name: "Oblong",
        what: "Trace un trou oblong : deux demi-cercles reliés par deux côtés droits.",
        steps: [
          "Cliquez le premier centre.",
          "Cliquez le second centre.",
          "Cliquez pour donner la largeur : elle vaut deux fois la distance à l'axe.",
        ],
        tip: "Les deux centres doivent être distincts. Pour une rainure ou une lumière, extrudez ensuite l'oblong en « Couper ».",
      }, {
        keys: ["data-sketch-tool:oval"], name: "Ovale",
        what: "Trace un ovale à quatre centres, comme le tracé du menuisier.",
        steps: [
          "Cliquez le centre de l'ovale.",
          "Cliquez un coin du rectangle qui l'entoure : sa largeur et sa hauteur donnent l'ovale.",
        ],
        tip: "L'ovale est fait d'arcs tangents entre eux : il se décale, s'ajuste et s'extrude comme n'importe quelle forme.",
      }, {
        keys: ["data-sketch-tool:curve"], name: "Courbe lissée",
        what: "Trace une courbe douce qui passe par les points cliqués.",
        steps: [
          "Cliquez le premier point.",
          "Cliquez les points suivants : la courbe les traverse en restant tangente.",
          "Recliquez le dernier point pour terminer la courbe ouverte.",
          "Ou cliquez le premier point (à partir de trois points) pour la fermer.",
        ],
        tip: "La courbe est faite d'arcs tangents, donc compatible avec l'ajustement, le décalage et l'extrusion.",
      }, {
        keys: ["data-sketch-command:underlay"], name: "Image de référence",
        what: "Pose une photo ou un croquis sous l'esquisse pour le décalquer.",
        steps: [
          "Cliquez « Image de référence » et choisissez une image (PNG, JPEG ou WebP) : elle est posée sous le dessin.",
          "Dans la fenêtre, réglez « Largeur (mm) », « Coin X (mm) », « Coin Y (mm) » et « Opacité (%) ».",
          "Cliquez « Caler avec deux points », puis deux points de l'image dont vous connaissez la distance.",
          "Tapez cette distance réelle et cliquez « Mettre à l'échelle ».",
        ],
        tip: "L'image est réduite à 1600 px et gardée avec le projet. « Changer d'image » et « Retirer l'image » sont dans la même fenêtre.",
      }, {
        keys: ["data-sketch-command:importdxf"], name: "Importer un plan DXF",
        what: "Place dans l'esquisse un plan DXF : murs, niches, lignes, cercles et arcs.",
        steps: [
          "Cliquez « Importer un plan DXF » et choisissez le fichier .dxf.",
          "La fenêtre donne le nombre de traits, la taille et l'unité du fichier.",
          "Gardez cochée « Poser son coin bas-gauche sur l'origine de l'esquisse », ou décochez-la pour garder les coordonnées du fichier.",
          "Cliquez « Comme référence » (traits de construction fixes, pour dessiner par-dessus) ou « Comme dessin » (traits ordinaires, extrudables).",
        ],
        tip: "Textes, cotes et blocs du fichier sont laissés de côté ; la fenêtre en donne le compte.",
      }, {
        keys: ["data-sketch-tool:text"], name: "Texte",
        what: "Écrit un texte dans l'esquisse, par exemple pour le graver.",
        steps: [
          "Cliquez l'endroit où le texte commence (sa ligne de base). Cliquer un texte existant le modifie.",
          "Dans la fenêtre, tapez le « Texte », la « Hauteur (mm) » des lettres et l'« Angle (°) ».",
          "Validez avec « OK » ou Entrée. « Supprimer » retire un texte existant.",
        ],
        tip: "Pour graver le texte, extrudez l'esquisse avec l'opération « Couper ».",
      }, {
        keys: ["data-sketch-command:construction"], name: "Construction",
        what: "Passe des traits en géométrie de construction : repères orange en pointillés qui ne forment pas de zone à extruder.",
        steps: [
          "Pour des traits déjà dessinés : sélectionnez-les, puis cliquez « Construction » (ou X). Recliquez pour les remettre en traits ordinaires.",
          "Pour les prochains traits : cliquez « Construction » sans rien sélectionner. Le bouton reste enfoncé jusqu'à un nouveau clic.",
        ],
        tip: "Utile pour des axes, des alignements ou des centres : ils guident le dessin sans compter dans les contours.",
      },
    ],
  },
  {
    title: "Esquisse : Modifier",
    where: "Barre d'outils de l'esquisse, groupe « Modifier ». Prolonger, Chanfrein, Projeter, Intersection, Couper, Réseau, les quatre transformations (Symétrie, Rotation, Échelle, Réseau circulaire) sont rangés dans le menu du groupe (▾) tant que vous ne les épinglez pas.",
    tools: [
      {
        keys: ["data-sketch-tool:offset"], name: "Décalage",
        what: "Copie des traits parallèlement à eux-mêmes, à une distance donnée.",
        steps: [
          "Cliquez « Décalage » (ou O). Les traits déjà sélectionnés sont pris tout de suite.",
          "Cliquez les lignes, arcs ou cercles à décaler. Avec « Sélection en chaîne » cochée, un clic prend toute la chaîne reliée.",
          "Réglez la « Distance » dans le panneau, ou tirez la flèche dans la vue.",
          "Choisissez la « Direction » (Un côté, Deux côtés), « Inverser » si la copie part du mauvais côté, et les « Coins » (Arrondis, Vifs).",
          "C'est enregistré dès que c'est prêt (Entrée l'enregistre tout de suite).",
        ],
        tip: "L'original est conservé. Une distance négative décale de l'autre côté. Le décalage reste dans l'historique : on peut le rouvrir pour le changer.",
      }, {
        keys: ["data-sketch-tool:offsetEdge"], name: "Décaler l'arête",
        what: "Crée tout de suite une copie décalée vers l'intérieur d'une face, d'une arête de corps ou d'un trait.",
        steps: [
          "Cliquez « Décaler l'arête ».",
          "Cliquez un trait de l'esquisse, une arête ou une face d'un corps : la copie apparaît à la dernière distance utilisée.",
          "Tirez la flèche, ou tapez un chiffre pour saisir la distance (les calculs comme « 250 − 180 » passent).",
          "Cliquez un autre élément pour une autre copie. Échap termine.",
        ],
        tip: "Sur un corps, les arêtes sont projetées dans l'esquisse en traits violets fixes. Le sens positif va vers l'intérieur de la face ; un signe moins prend l'autre côté. Règle de l'outil : un trait décalé ne dépasse pas les traits déjà dessinés qu'il croise — depuis son milieu, il s'arrête au premier de chaque côté (les traits de construction ne l'arrêtent pas).",
      }, {
        keys: ["data-sketch-tool:extend"], name: "Prolonger",
        what: "Allonge le bout d'une ligne ou d'un arc jusqu'à la courbe suivante.",
        steps: [
          "Cliquez « Prolonger ».",
          "Survolez le bout de la ligne ou de l'arc : l'aperçu montre jusqu'où il ira.",
          "Cliquez pour prolonger. Échap revient à la sélection.",
        ],
        tip: "Refusé s'il n'y a aucune courbe à atteindre dans le prolongement, ou si l'extrémité est fixe (géométrie projetée).",
      }, {
        keys: ["data-sketch-tool:fillet", "data-sketch-tool:chamfer"], name: "Congé d'esquisse et Chanfrein d'esquisse",
        what: "Arrondit un coin (congé) ou le coupe en biais (chanfrein), là où deux lignes se rejoignent.",
        steps: [
          "Cliquez « Congé d'esquisse » ou « Chanfrein d'esquisse ».",
          "Cliquez un coin : seuls les points où exactement deux lignes se rejoignent sont pris.",
          "Dans la calculatrice, tapez le « Rayon du congé » ou la « Distance du chanfrein », puis validez.",
        ],
        tip: "Le chanfrein est mesuré depuis le coin, sur chacune des deux lignes. Refusé si les lignes sont alignées ou si la valeur est trop grande pour la ligne. Les cotes existantes continuent de valoir.",
      }, {
        keys: ["data-sketch-tool:project"], name: "Projeter",
        what: "Ajoute à l'esquisse les arêtes d'un corps comme repères fixes sur lesquels s'accrocher.",
        steps: [
          "Cliquez « Projeter ».",
          "Dans la vue, cliquez une arête d'un corps, ou une face pour en prendre tout le contour.",
          "Maj + clic sur un corps projette toutes ses arêtes.",
          "Échap revient à la sélection.",
        ],
        tip: "Les repères sont violets et fixes. Une arête vue de bout, ou une face vue de profil depuis le plan de l'esquisse, ne se projette pas.",
      }, {
        keys: ["data-sketch-tool:intersect"], name: "Intersection",
        what: "Ajoute à l'esquisse la trace où le plan de l'esquisse coupe un corps.",
        steps: [
          "Cliquez « Intersection ».",
          "Cliquez un corps que le plan de l'esquisse traverse.",
          "La coupe apparaît en violet, en repères fixes. Échap revient à la sélection.",
        ],
        tip: "Si le plan ne traverse pas le corps, un message l'indique et rien n'est ajouté.",
      }, {
        keys: ["data-sketch-tool:trim"], name: "Ajuster",
        what: "Supprime la partie d'une ligne, d'un arc ou d'un cercle comprise entre deux croisements.",
        steps: [
          "Cliquez « Ajuster ».",
          "Survolez la partie à retirer : elle s'affiche entre les deux croisements.",
          "Cliquez pour la supprimer. Échap revient à la sélection.",
        ],
        tip: "Sans croisement d'un côté, la partie va jusqu'au bout du trait. Un cercle que rien ne croise part entier ; un cercle avec un seul croisement est refusé. Les traits projetés ne se coupent pas.",
      }, {
        keys: ["data-sketch-tool:break"], name: "Couper",
        what: "Coupe un trait en morceaux là où d'autres traits le croisent, sans rien supprimer.",
        steps: [
          "Cliquez « Couper ».",
          "Survolez un trait : des croix rouges montrent où il sera coupé.",
          "Cliquez pour le couper. Échap revient à la sélection.",
        ],
        tip: "Refusé si aucun trait ne croise celui-ci. Chaque morceau devient un trait à part que l'on peut ensuite supprimer ou coter.",
      }, {
        keys: ["data-sketch-tool:move"], name: "Déplacer",
        what: "Déplace des points, lignes, cercles ou contours, à la souris ou par saisie.",
        steps: [
          "Cliquez « Déplacer » (ou M), puis cliquez les éléments dans l'esquisse. « Étendre aux contours » ajoute les contours entiers.",
          "Tirez la sélection ou ses flèches, ou choisissez la « Saisie » : Relatif (ΔX, ΔY), Distance et angle, ou Position absolue.",
          "Contrôlez l'aperçu en pointillés, qui tient compte des contraintes.",
          "C'est enregistré dès que c'est prêt, ou tout de suite avec « OK » (Entrée) : l'outil reste pour un autre déplacement ; « Terminer » (la croix ✕, Échap) le ferme.",
        ],
        tip: "Copies au lieu d'un déplacement : tapez « x5 » (ou 5) dans « Copies » pour cinq copies à la suite, chacune d'un déplacement plus loin, ou « /5 » pour cinq copies réparties jusqu'au point visé. L'origine et les axes ne bougent pas. Le panneau indique s'il manque encore des cotes après le déplacement.",
      },
      STRETCH,
      ...SMART_SELECT,
      {
        keys: ["data-sketch-command:skmirror"], name: "Symétrie dans l'esquisse",
        what: "Copie des traits en miroir autour d'une ligne ou d'un axe.",
        steps: [
          "Sélectionnez les traits à copier. Si l'axe est une ligne du dessin, sélectionnez-la en dernier.",
          "Cliquez « Symétrie dans l'esquisse ».",
          "Choisissez l'« Axe » : la ligne sélectionnée en dernier, l'axe X (horizontal) ou l'axe Y (vertical).",
          "Laissez cochée « Garder l'original (faire une copie) », puis « Appliquer ».",
        ],
        tip: "Autour d'une ligne de l'esquisse, la copie reste symétrique : elle suit quand vous changez l'original. Sans copie, les points fixes (projetés ou importés) sont refusés.",
      }, {
        keys: ["data-sketch-command:skrotate", "data-sketch-command:skscale"], name: "Rotation et Échelle dans l'esquisse",
        what: "Tourne les traits sélectionnés d'un angle, ou les agrandit ou réduit d'un facteur.",
        steps: [
          "Sélectionnez les traits, puis cliquez « Rotation dans l'esquisse » ou « Échelle dans l'esquisse ».",
          "Rotation : tapez l'« Angle (degrés, sens direct) » ; Échelle : le « Facteur » (2 pour deux fois plus grand).",
          "Choisissez le « Centre » : milieu de la sélection ou origine de l'esquisse.",
          "Cochez « Garder l'original (faire une copie) » pour une copie, sinon les traits sont transformés sur place, puis « Appliquer ».",
        ],
        tip: "L'échelle agit aussi sur les cotes et les rayons. Un facteur nul ou négatif est refusé.",
      }, {
        keys: ["data-sketch-command:skpolar"], name: "Réseau circulaire dans l'esquisse",
        what: "Répète des traits autour d'un centre : trous d'une rosace, pieds d'une table ronde.",
        steps: [
          "Sélectionnez les traits à répéter.",
          "Cliquez « Réseau circulaire dans l'esquisse ».",
          "Tapez le nombre en tout (l'original compris, de 2 à 200) et l'angle total (360 pour un tour complet).",
          "Choisissez le « Centre » (l'origine de l'esquisse au départ), puis « Appliquer ».",
        ],
        tip: "Sur un angle inférieur à 360, les copies vont de l'original à la dernière. Pour tourner autour d'un autre centre, choisissez « Milieu de la sélection » dans « Centre ».",
      }, {
        keys: ["data-sketch-tool:array"], name: "Réseau",
        what: "Copie des éléments en grille sur deux directions, ou répartit des lignes à égale distance dans un rectangle.",
        steps: [
          "Cliquez « Réseau » et cliquez les points, lignes, cercles ou arcs à copier (« Ajouter les contours entiers » prend les formes complètes).",
          "Choisissez « Placement » : Un pas entre copies, ou Réparties sur une distance.",
          "Direction 1 : « Angle », « Quantité » (l'original compris) et « Pas 1 ». Direction 2, perpendiculaire : « Quantité 2 » et « Pas 2 ».",
          "Vérifiez les copies en pointillés : enregistrées dès qu'elles sont prêtes.",
        ],
        tip: "Le « Type de réseau » « Linéaire dans un rectangle » répartit des lignes régulièrement entre les côtés d'un rectangle (« Choisir le rectangle », « Lignes », « Égaliser ») : n lignes font n + 1 ouvertures égales, pour des étagères par exemple.",
      }, {
        keys: ["data-sketch-command:delete"], name: "Supprimer",
        what: "Supprime la sélection : traits, points, cotes ou contraintes choisis.",
        steps: [
          "Sélectionnez ce qui doit disparaître.",
          "Cliquez « Supprimer », ou appuyez sur Suppr (ou Retour arrière).",
        ],
        tip: "Le bouton est grisé sans sélection. Un trait cliqué à un endroit où d'autres le croisent n'est supprimé que sur ce morceau, entre deux croisements. Sélectionné par l'intérieur d'une forme, il part en entier.",
      },
    ],
  },
  {
    title: "Esquisse : Cotes",
    where: "Barre d'outils de l'esquisse, groupe « Cotes ». La cotation automatique est rangée dans le menu du groupe (▾). Les valeurs des cotes se retrouvent dans le panneau des propriétés, rubrique « Cotes ».",
    tools: [
      {
        keys: ["data-sketch-tool:dimension"], name: "Cote",
        what: "Mesure un ou deux éléments et pose la cote : la dimension devient une règle que le dessin respecte.",
        steps: [
          "Cliquez « Cote » (ou D).",
          "Cliquez un élément : longueur d'une ligne, diamètre d'un cercle, rayon d'un arc. Cliquez-en deux pour la distance entre eux, ou l'angle entre deux lignes non parallèles.",
          "Recliquez l'élément (ou le second) pour poser la cote.",
          "Cliquez la valeur affichée, tapez la nouvelle mesure dans la calculatrice et validez.",
        ],
        tip: "Le cadenas de la calculatrice : fermé, la cote est imposée ; ouvert, la forme est redimensionnée une fois et la cote disparaît. Une mesure déjà imposée par le dessin est posée en cote de référence, entre parenthèses.",
      }, {
        keys: ["data-sketch-command:autodim"], name: "Cotation automatique",
        what: "Pose d'un coup les cotes de chaîne et hors tout en X et en Y, les diamètres et les rayons.",
        steps: [
          "Sélectionnez des traits, ou ne sélectionnez rien pour coter tout le dessin (hors construction).",
          "Cliquez « Cotation automatique ».",
          "Un message indique le nombre de cotes de référence posées.",
        ],
        tip: "Ce sont des cotes de référence : elles suivent le dessin sans le figer. Relancée, la commande remplace celles qu'elle avait posées. Sans trait, elle répond « Rien à coter ».",
      }, {
        keys: ["data-sketch-command:dimensionX", "data-sketch-command:dimensionY"], name: "Cote horizontale et Cote verticale",
        what: "Pose une cote qui mesure seulement l'écart en X (horizontal) ou en Y (vertical).",
        steps: [
          "Sélectionnez deux points, ou une seule ligne (hors axes).",
          "Cliquez « Cote horizontale » ou « Cote verticale ».",
          "Le panneau des propriétés s'ouvre sur la valeur de la cote : tapez-la et validez.",
        ],
        tip: "Sans bonne sélection, le bouton reste enfoncé et attend vos clics : cliquez deux points ou une ligne. Échap arrête.",
      },
      ...MORE_DIMENSIONS,
    ],
  },
  {
    title: "Esquisse : Contraintes",
    where: "Barre d'outils de l'esquisse, groupe « Contraintes ». Symétrie, Concentricité, Fixer, Point sur courbe et Milieu sont rangés dans le menu du groupe (▾). Les contraintes posées sont listées dans le panneau des propriétés, avec un ✕ pour les retirer.",
    tools: [
      {
        keys: ["data-sketch-command:coincident"], name: "Coïncidence",
        what: "Place deux points au même endroit et les lie pour de bon.",
        steps: [
          "Sélectionnez deux points (extrémités de lignes, centres, origine).",
          "Cliquez « Coïncidence ».",
        ],
        tip: "Refusé si les deux points sont déjà coïncidents ou s'ils appartiennent à la même courbe. Différent de « Point sur courbe », où le point peut glisser. Sans sélection, le bouton attend vos clics ; Échap arrête.",
      }, {
        keys: ["data-sketch-command:horizontal", "data-sketch-command:vertical"], name: "Horizontale et Verticale",
        what: "Rend une ligne horizontale, ou verticale.",
        steps: [
          "Sélectionnez une ou plusieurs lignes (pas les axes).",
          "Cliquez « Horizontale » ou « Verticale » : chaque ligne est contrainte.",
        ],
        tip: "Les côtés d'un rectangle le sont déjà. Sans sélection, le bouton attend que vous cliquiez une ligne.",
      }, {
        keys: ["data-sketch-command:parallel", "data-sketch-command:perpendicular"], name: "Parallèle et Perpendiculaire",
        what: "Rend deux lignes parallèles, ou à angle droit l'une de l'autre.",
        steps: [
          "Sélectionnez deux lignes.",
          "Cliquez « Parallèle » ou « Perpendiculaire ».",
        ],
        tip: "Sans sélection, le bouton attend vos deux clics de lignes.",
      }, {
        keys: ["data-sketch-command:tangent"], name: "Tangence",
        what: "Fait toucher un cercle ou un arc à une ligne, ou à un autre cercle ou arc, sans cassure.",
        steps: [
          "Sélectionnez une ligne et un cercle ou un arc, ou deux courbes dont l'une au moins est ronde. Aucun point.",
          "Cliquez « Tangence ».",
        ],
        tip: "Utile pour raccorder une ligne à un arrondi.",
      }, {
        keys: ["data-sketch-command:equal"], name: "Égalité",
        what: "Rend égales les longueurs de lignes, ou les rayons de cercles et d'arcs.",
        steps: [
          "Sélectionnez au moins deux lignes, ou au moins deux cercles ou arcs. Pas de mélange de lignes et de courbes rondes.",
          "Cliquez « Égalité ».",
        ],
        tip: "Avec plus de deux éléments, tous deviennent égaux entre eux. Cercles et arcs peuvent être mélangés.",
      }, {
        keys: ["data-sketch-command:symmetric"], name: "Symétrie",
        what: "Rend deux points symétriques par rapport à une ligne, ou à un point.",
        steps: [
          "Sélectionnez deux points, puis la ligne de symétrie (un axe de l'esquisse convient).",
          "Ou sélectionnez trois points : le troisième est le centre de symétrie.",
          "Cliquez « Symétrie ».",
        ],
        tip: "Ne confondez pas avec « Symétrie dans l'esquisse » du groupe Modifier, qui copie des traits.",
      }, {
        keys: ["data-sketch-command:concentric"], name: "Concentricité",
        what: "Donne le même centre à deux cercles ou arcs.",
        steps: [
          "Sélectionnez deux cercles ou arcs.",
          "Cliquez « Concentricité ».",
        ],
        tip: "Un cercle et un arc conviennent aussi.",
      }, {
        keys: ["data-sketch-command:fix"], name: "Fixer",
        what: "Bloque un point à sa place actuelle.",
        steps: [
          "Sélectionnez un ou plusieurs points (pas l'origine).",
          "Cliquez « Fixer ».",
        ],
        tip: "Un point fixé ne peut plus être tiré : le reste du dessin bouge autour de lui.",
      }, {
        keys: ["data-sketch-command:pointOnCurve"], name: "Point sur courbe",
        what: "Garde un point sur une ligne, un cercle ou un arc, tout en le laissant glisser dessus.",
        steps: [
          "Sélectionnez un point et une courbe.",
          "Cliquez « Point sur courbe ».",
        ],
        tip: "Différent de « Coïncidence » : deux points y sont liés pour de bon, ici le point reste libre de glisser le long de la courbe.",
      }, {
        keys: ["data-sketch-command:centerin"], name: "Centrer",
        what: "Met un dessin au milieu d'un autre — un rectangle dans un rectangle, un cercle dans un carré — et l'y garde.",
        steps: [
          "Cliquez « Centrer » (menu du groupe Contraintes), puis l'intérieur (ou un trait) de chacun des deux dessins : le plus petit va au milieu du plus grand.",
          "Ou choisissez d'abord les deux dessins — Maj + clic dans le second, un trait de chacun, ou une fenêtre —, puis « Centrer ».",
        ],
        tip: "Il y reste : si le grand change de taille ou bouge, le petit suit son milieu (un point de construction au centre du grand, le petit symétrique autour). Supprimez les contraintes de Symétrie pour le libérer.",
      }, {
        keys: ["data-sketch-command:midpoint"], name: "Milieu",
        what: "Place un point exactement au milieu d'une ligne.",
        steps: [
          "Sélectionnez un point et une ligne (pas un axe).",
          "Cliquez « Milieu ».",
        ],
        tip: "Pratique pour centrer un trou sur un côté.",
      },
    ],
  },
  {
    title: "Esquisse : Affichage",
    where: "Barre d'outils de l'esquisse, groupe « Affichage », tout à droite. Ces boutons restent enfoncés quand l'option est active ; votre choix est gardé d'une fois sur l'autre.",
    tools: [
      {
        keys: ["data-sketch-bodies:"], name: "Corps dans l'esquisse",
        what: "Montre les corps derrière l'esquisse (en transparence) ou les cache : les esquisses seules à l'écran.",
        steps: [
          "Dans une esquisse, cliquez « Corps » (menu du groupe Affichage) : les corps disparaissent, il ne reste que les esquisses.",
          "Recliquez pour les remettre.",
        ],
        tip: "Le choix vaut pour les esquisses suivantes. Corps cachés, on ne peut plus viser leurs arêtes ni leurs coins. En quittant l'esquisse, les corps reviennent toujours.",
      }, {
        keys: ["data-sketch-command:points"], name: "Points",
        what: "Montre ou cache les petits points ronds aux extrémités des lignes.",
        steps: [
          "Cliquez « Points » pour les afficher en permanence.",
          "Recliquez pour les cacher à nouveau.",
        ],
        tip: "Cachés, ils s'affichent quand vous les survolez, et restent cliquables.",
      }, {
        keys: ["data-sketch-command:glyphs"], name: "Symboles de contraintes",
        what: "Montre ou cache les symboles (H, V, ∥…) des contraintes posées sur le dessin.",
        steps: [
          "Cliquez « Symboles de contraintes ».",
          "Cliquez un symbole pour sélectionner sa contrainte, puis Suppr pour la retirer.",
        ],
      }, {
        keys: ["data-sketch-command:geomsnap"], name: "Accrochage à la géométrie",
        what: "Colle le pointeur aux points et aux traits de l'esquisse pendant le tracé.",
        steps: [
          "Cliquez le bouton pour activer ou désactiver l'accrochage ; un message confirme.",
          "Tracez : le pointeur devient un carré quand il est accroché.",
        ],
        tip: "Activé au départ. Le même réglage existe dans la barre de modélisation : les deux boutons vont ensemble.",
      }, {
        keys: ["data-sketch-command:smartsnap"], name: "Accrochage intelligent",
        what: "Aligne le pointeur sur les points déjà posés (même X, même Y), avec des guides en tirets.",
        steps: [
          "Cliquez le bouton pour activer ou désactiver l'accrochage ; un message confirme.",
          "Tracez : un guide en tirets apparaît quand le pointeur est aligné avec un point.",
        ],
        tip: "Activé au départ. Les points déjà cliqués par l'outil en cours servent aussi d'alignement.",
      }, {
        keys: ["data-sketch-command:gridsnap"], name: "Accrochage à la grille",
        what: "Place les points sur les lignes de la grille, au tracé comme quand on tire un point.",
        steps: [
          "Cliquez « Accrochage à la grille » (ou G).",
          "Un message indique s'il est activé ou désactivé.",
        ],
        tip: "Activé au départ. Désactivez-le pour poser un point à n'importe quelle valeur, puis cotez.",
      }, {
        keys: ["data-sketch-command:fit"], name: "Ajuster la vue à l'esquisse",
        what: "Recadre la vue pour montrer tout le dessin et ses cotes.",
        steps: [
          "Cliquez « Ajuster la vue à l'esquisse » (ou F).",
        ],
      },
    ],
  },
];
