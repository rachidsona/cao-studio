import { DRAG_HELP, OPEN_PROJECT_HELP, SIDE_HELP } from "./bars";
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
          "Cliquez « Magie extrusion » et choisissez le « Tracé » : « Trait depuis une arête (parallèle) » ou « Trait depuis un coin (en travers) », « Ligne / polyligne », « Rectangle », « Cercle » ou « Décalage du contour ». L'outil s'ouvre sur le dernier tracé choisi.",
          "Un trait : cliquez l'arête ou le coin de départ (un trait tracé avant sur la face compte comme une arête) ; le trait suit le pointeur, avec les distances aux bords. Ctrl bascule entre « Une ligne » et « Double trait ». Tapez la distance au clavier (retrait;largeur pour un double trait) puis Entrée, ou cliquez pour le poser.",
          "Une forme : cliquez sur une face (ce premier point la fixe, les distances aux bords s'affichent en bas), puis le point suivant, le coin opposé ou un point du cercle — Entrée termine une ligne. Les mesures se tapent séparées par « ; » (120;45).",
          "Tirez pour ajouter, poussez pour creuser — ou tapez la hauteur (− pour creuser) puis Entrée ; Tab inverse. « Nouveau corps » garde le corps cliqué tel quel. L'intérieur d'une face se tire ou se pousse tel quel.",
        ],
        tip: "Pour tracer sans extruder, décochez « Puis tirer / pousser » (un trait comme une forme) : le tracé est gardé seul, en esquisse, dès qu'il est posé ; la croix ✕ avant de tirer fait de même. Le point s'accroche aux coins et aux milieux des arêtes ; visez un coin ou une arête d'un corps pour vous arrêter à son niveau. Échap revient d'une étape. Seules les faces planes se tirent. Sur toutes les formes : triangle, polygone, bout de cylindre, face percée ; et sur le flanc d'un cylindre, « Rectangle » (deux coins, il suit la face), « Cercle » (centre puis bord : percé vers l'axe, ou en bossage avec une profondeur négative) et « Décalage du contour » (tout le tour) se creusent à la « Profondeur » du panneau, puis OK ; « Trait depuis une arête » près du bord rond creuse la bande entre ce bord et le trait, tout autour (négative : un collet).",
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

export const SCREEN: HelpFamily[] = [
  {
    title: "Se repérer à l'écran",
    where: "Colonne Projets tout à gauche, Navigateur à côté, sept colonnes d'outils à côté, vue au centre (onglets de projets au-dessus, Historique en dessous), panneau Propriétés à droite.",
    tools: [
      {
        keys: [], name: "Navigateur",
        what: "Liste les corps et les esquisses du projet pour les choisir, les montrer, les cacher ou les ranger en dossiers.",
        steps: [
          "Cliquez un nom pour le sélectionner dans la vue ; Ctrl, ⌘ ou Maj + clic en ajoute d'autres. Le triangle déplie un corps et montre les opérations qui l'ont fait.",
          "Double-cliquez une pièce (une étagère, une porte, un côté), ici ou dans la vue : tout le caisson est sélectionné, façades comprises, ou toute la Répartition.",
          "Clic droit sur une porte dans la vue : « Modifier les portes… » règle celles d'un caisson sur place — une ou deux, pose en applique ou encastrée, jeu, épaisseur, style, charnières, poignées — ou rouvre l'outil de celles d'une Répartition ; aussi l'ouvrir ou la fermer, l'ouvrir de l'autre côté, ôter ses poignées, la renommer, sélectionner tout le meuble, la changer en tiroirs, en porte plate, à cadre ou vitrée (cadre alu), ou la supprimer. Clic droit sur un tiroir (sa façade, son caisson ou sa poignée) : « Modifier les tiroirs… » règle ceux d'un caisson sur place — nombre, pose en applique ou encastrés, jeu, épaisseur, poignées — ou rouvre l'outil Tiroirs pour ceux d'une niche ; on peut aussi sélectionner tout le meuble, les changer en porte ou les supprimer.",
          "L'œil montre ou cache la ligne. Le bouton « ⋯ » ouvre la fenêtre pour modifier, renommer ou supprimer. Le clic droit donne le même choix en menu.",
          "Pour un dossier : sélectionnez des corps, cliquez « Nouveau dossier » dans l'en-tête « Corps », puis double-cliquez son nom pour le renommer.",
          "Glissez un corps sur un dossier pour l'y ranger, ou sur l'en-tête « Corps » pour l'en sortir.",
          "Tapez dans « Rechercher… » sous le titre : seuls restent les corps, dossiers et esquisses dont le nom contient ce texte (Échap vide le champ). Le bouton à l'œil barré montre seulement les éléments cachés ; cliquez leur œil pour les réafficher.",
          "La flèche ‹ à droite du titre « Navigateur » le replie : la vue prend sa place. L'onglet « › Navigateur » en bas du bord gauche de la vue le rouvre.",
        ],
        tip: "Un point de couleur signale une opération en erreur ou désactivée : survolez la ligne pour lire pourquoi. Seuls vos dossiers se renomment ; les pièces d'un caisson se rangent d'elles-mêmes.",
      },
      {
        keys: [], name: "Historique",
        what: "Montre sous la vue les opérations du projet, dans l'ordre où elles ont été faites.",
        steps: [
          "Survolez une icône pour lire le nom de l'opération.",
          "Cliquez-la : ce qu'elle a fait est sélectionné dans la vue, et une petite fenêtre s'ouvre, avec le champ « Nom » pour la renommer.",
          "« Modifier » rouvre son outil, « Désactiver » la met de côté sans la perdre (« Réactiver » la remet), « Supprimer » l'efface.",
          "Pour en supprimer plusieurs : Ctrl (⌘ sur Mac) + clic sur chacune, ou Maj + clic pour toutes celles entre deux ; elles s'entourent de rouge. Cliquez « Supprimer » dans la barre qui apparaît (ou la touche Suppr). Le ✕ ou Échap les dé-choisit.",
        ],
        tip: "Si d'autres opérations dépendent de celles que vous supprimez, l'éditeur vous prévient. Plusieurs étapes supprimées ensemble reviennent d'un seul Ctrl+Z.",
      },
      {
        keys: [], name: "Panneau Propriétés",
        what: "Affiche les valeurs de l'opération choisie et ce que vous avez cliqué dans la vue.",
        steps: [
          "Cliquez une opération (Historique ou Navigateur) : ses champs apparaissent. Tapez une valeur, puis Entrée. « Modifier dans la vue » rouvre son outil.",
          "Cliquez des faces, arêtes ou points dans la vue : le panneau donne leurs mesures et propose des actions (Congé, Chanfrein, Extruder, Esquisse sur la face, Combiner, Scinder le corps, Déplacer, Supprimer).",
          "« Tout désélectionner » vide la sélection.",
        ],
        tip: "Survolez une icône d'outil (dessin compris) : son nom s'affiche dessous, dans une pastille orange comme les cotes des pièces. Chaque champ d'un nombre a sa calculatrice : le bouton ⌨ à sa droite (un calcul, des unités : 60 cm − 2*18 mm), ✓ écrit le résultat dans le champ ; et tout champ de nombre prend un calcul tapé directement — (190+100)/2, 2*70, 80-2,5 —, son résultat écrit à Entrée. Un outil ouvert (Extrusion, Perçage, Congé, Réseau…), tapez la valeur sans cliquer de champ : elle va dans le premier champ de nombre de sa fenêtre, entouré de bleu, calcul compris, et Entrée l'applique (Échap l'abandonne) ; Magie extrusion, Déplacer et Pousser la prennent dans leur case des mesures, calcul compris. Sur un clavier AZERTY, la touche 5 sans Maj donne 5, qu'une « ) » refait parenthèse ; ce que fait l'outil est ici, dans l'Aide, et « Outils » (Ctrl + K) le trouve aussi par ce qu'il fait. La fenêtre d'un outil ouvert prend un onglet à côté de « Sélection ». Sur un écran étroit, ces fenêtres se posent sur la vue. Chaque outil a « Terminer » et « OK » en bas de sa fenêtre : chaque réglage valable est enregistré aussitôt (Ctrl + Z le reprend) ; « OK » (ou Entrée) garde l'opération et l'outil reste ouvert, à neuf, pour la suivante — plusieurs opérations à la suite, chacune son étape d'historique ; seul « Terminer » (la croix ✕, Échap) ferme l'outil, et ce qu'il proposait sans avoir été réglé n'est pas gardé. L'opération se change ensuite par son étape dans l'Historique (« Modifier »). Le ruban et la barre des étapes du haut sont cachés d'office : les cases « Ruban d'outils en haut » et « Barre des étapes » du menu ⋯ les remettent chacun (sans la barre des étapes, le ruban montre tous les outils de l'onglet).",
      },
      {
        keys: [], name: "Colonne Projets",
        what: "Tous vos projets, rangés dans vos dossiers, dans une colonne à gauche du Navigateur : pour ouvrir un autre projet et ranger vos projets sans quitter l'éditeur.",
        steps: [
          "Cliquez un projet pour l'ouvrir dans un onglet. Le projet de la page est en bleu ; un point bleu marque ceux déjà ouverts dans un onglet.",
          "Pour ranger un projet, glissez-le sur un dossier, ou cliquez son « ⋯ » puis « Ranger dans « … » ». « Sortir du dossier » le remet dans « Sans dossier ».",
          "Le « + » du titre crée un dossier : tapez son nom, puis Entrée (Échap annule). Le « ⋯ » d'un dossier le renomme, le vide (« Vider le dossier » supprime ses projets, le dossier reste) ou le supprime (« Supprimer le dossier » : ses projets restent, sans dossier).",
          "Pour supprimer un projet : son « ⋯ » puis « Supprimer le projet… », ou amenez-y le focus avec Tab et appuyez sur Suppr. Suppr sur le nom d'un dossier supprime le dossier (ses projets restent). Chaque suppression demande une confirmation.",
          "Cliquez le nom d'un dossier pour le plier ou le déplier. Tapez dans « Chercher un projet » pour ne garder que les projets dont le nom contient ce texte.",
          "La flèche ‹ à droite du titre « Projets » replie la colonne : la vue prend sa place. L'onglet « › Projets » en bas du bord gauche de la vue la rouvre.",
        ],
        tip: "Un projet supprimé l'est définitivement, avec ses versions et ses liens partagés : son onglet se ferme, et si c'est le projet de la page, l'éditeur revient à « Mes projets ». Ce sont les mêmes dossiers que sur la page d'accueil (« Mes projets »). Ranger un projet ne change pas sa date de modification. La colonne repliée et les dossiers pliés sont retenus par le navigateur ; elle est cachée sur un écran étroit et pendant le rendu.",
      },
      {
        keys: [], name: "Onglets de projets",
        what: "Garde plusieurs projets ouverts à la fois, chacun avec son historique et sa vue.",
        steps: [
          "Cliquez un onglet pour passer à ce projet. Un point après le nom signale des modifications non enregistrées.",
          "Le « × » ferme l'onglet ; s'il y a des modifications, l'éditeur propose « Enregistrer et fermer ».",
          "Le « + » ouvre un menu : tapez un « Nom du nouveau projet » puis « Créer », ou choisissez un projet dans « Ouvrir un projet ».",
        ],
        tip: "Huit onglets au plus : fermez-en un pour en ouvrir un autre.",
      }, OPEN_PROJECT_HELP,
      {
        keys: [], name: "Mes outils",
        what: "Une barre à vous, posée en haut à gauche de la vue, avec les outils que vous utilisez le plus.",
        steps: [
          "Dans le menu d'un groupe du ruban, cliquez l'étoile d'un outil pour l'ajouter.",
          "Cliquez une icône de la barre pour lancer l'outil, même rangé ou replié dans le ruban. Glissez-y une icône d'une autre barre pour l'ajouter ; glissez-en une hors des barres, ou clic droit : elle la quitte.",
          "Glissez la poignée à points pour déplacer la barre (double-clic : elle revient). « ⇄ » ou « ⇅ » la met à l'horizontale ou à la verticale.",
          "Cliquez « – » pour cacher la barre : seule une étoile ★ reste à sa place ; cliquez-la pour la faire réapparaître.",
        ],
        tip: "Chaque onglet a la sienne : Conception 3D (vide au départ), Dressing et Cuisine (avec leurs outils de tous les jours, à changer à votre goût). Une autre sert à l'esquisse.",
      },
      {
        keys: [], name: "Sept colonnes d'outils",
        what: "Sept colonnes d'icônes entre le Navigateur et la vue, vides au départ, que vous garnissez vous-même avec les outils du ruban (par leur « + », ou en les y glissant).",
        steps: [
          "Cliquez le « + » en bas d'une colonne : la liste de tous les outils s'ouvre, rangés par groupe. Tapez un nom pour le trouver, cliquez-le pour l'ajouter (cliqué à nouveau, il est retiré). Échap ou « Fermer » referme la liste.",
          "Cliquez une icône d'une colonne pour lancer l'outil, le même que dans le ruban. Pour la retirer, glissez-la hors des colonnes (elle devient rouge) et lâchez-la, ou faites un clic droit dessus.",
          "Pour changer l'ordre, glissez une icône plus haut ou plus bas : un trait bleu montre où elle se pose. Glissée dans une autre colonne, elle y passe. Au clavier, Alt + ↑ ou Alt + ↓ la monte ou la descend d'une place.",
          "Pour séparer des icônes, cliquez dans la liste du « + » « ＋ Ligne » (un trait fin) ou « ＋ Espace vide » (une place vide de la taille d'une icône) : il s'ajoute au bas de la colonne ; glissez-le entre les icônes voulues. Un clic droit le retire.",
          "La flèche ‹ en haut d'une colonne la replie : elle disparaît et la vue reprend sa place. Un petit onglet numéroté (› 1, › 2…) reste en bas du bord gauche de la vue ; cliquez-le pour rouvrir la colonne.",
        ],
        tip: "Ce sont les mêmes colonnes en Conception 3D, en Dressing et en Cuisine : elles restent en place quand vous changez d'onglet. Vos choix et les colonnes repliées sont retenus. Les colonnes sont cachées pendant une esquisse, pendant le rendu et sur un écran étroit.",
      },
      {
        keys: [], name: "Ruban : épingler et déplacer les groupes",
        what: "Choisit les outils qui restent dans la barre du haut et l'ordre des groupes.",
        steps: [
          "Cliquez le nom d'un groupe (« Créer ▾ ») : le menu liste tous ses outils, et un clic sur un nom lance l'outil.",
          "À droite d'un outil, l'épingle le met dans la barre ou le range dans le menu ; l'étoile l'ajoute à « Mes outils ». « Par défaut » remet le groupe comme à l'origine. Glissez le nom d'un groupe pour le déplacer : l'ordre est retenu.",
        ],
        tip: "Quand la fenêtre est trop étroite, des icônes se replient d'elles-mêmes (Client et Fabrication d'abord, Dressing et Cuisine en dernier) mais restent dans le menu de leur groupe. Un petit point orange marque un outil nouveau — sur son icône, sa ligne de menu et le nom de son groupe s'il y est rangé — jusqu'à ce que vous vous en serviez une fois.",
      },
      DRAG_HELP,
    ],
  },
  {
    title: "Vue et sélection",
    where: "Colonne verticale « Sélection et vue » à droite de la vue. Elle disparaît pendant une esquisse et pendant le rendu.",
    tools: [
      {
        keys: [], selector: "[data-ribbon-tab]", name: "Onglets Conception 3D, Dressing et Cuisine",
        what: "Au-dessus du ruban : chaque onglet montre les outils de son travail.",
        steps: [
          "« Conception 3D » : esquisse, volumes, formes et réglages.",
          "« Dressing » : plan, Répartition, Étagères, Cloisons, modules, avec la pièce ; le Plan de dressing s'ouvre à droite.",
          "« Cuisine » : implantation, meubles de cuisine, découpes du plan de travail, avec les meubles et la pièce ; le Plan de cuisine s'ouvre à droite.",
        ],
        tip: "Chaque projet est un projet 3D, une cuisine ou un dressing, et s'ouvre sur son onglet. L'onglet d'un autre espace propose d'ouvrir ou de créer un projet de cet espace dans un autre onglet de projet (ou d'utiliser ses outils ici). Modifier, Fabrication et Client sont dans les trois ; chaque onglet a sa barre « Mes outils ».",
      },
      {
        keys: [], selector: "[data-steps]", name: "Étapes de la cuisine et du dressing",
        what: "Sous les onglets Cuisine et Dressing : le travail en étapes, chacune avec ses outils, à la place du ruban entier.",
        steps: [
          "Cuisine : Pièce, Plan, Meubles, Électroménager, Finitions, Fabrication, Client. Dressing : Pièce, Plan, Aménagement, Façades, Finitions, Fabrication, Client. Fabrication réunit ce qui va à l'atelier (contrôle, débit, calepinage, dossier de production, mise en plan, CNC, étiquettes, notice) ; Client, ce qui va au client (devis, variantes, rendus, lien client, commentaires).",
          "Cliquez une étape : ses outils s'affichent avec leur nom. Le bouton à droite (« Électroménager › ») passe à l'étape suivante.",
          "Une étape faite (une pièce posée, un plan, des meubles, de l'électroménager…) prend une coche verte.",
          "« Tous les outils » remet le ruban entier ; recliquez pour revenir aux outils de l'étape.",
        ],
        tip: "L'étape choisie est retenue pour chaque onglet, et « Tous les outils » aussi, dans ce navigateur. L'étape Plan ouvre aussi le plan à droite.",
      },
      {
        keys: [], name: "Barre contextuelle",
        what: "En haut de la vue, seuls les outils utiles à ce que vous venez de cliquer.",
        steps: [
          "Cliquez dans une niche : la barre donne sa taille et ses outils (Étagères, Cloisons, Hauteur, Penderie, Tiroirs, Module), la niche étant déjà choisie.",
          "Cliquez une pièce, un caisson, une répartition ou le plan : la barre propose les outils qui leur servent, même rangés dans un menu.",
          "Elle s'efface quand un outil travaille, avec Échap, ou d'un clic dans le vide.",
        ],
      },
      {
        keys: [], name: "Sélection dans la vue",
        what: "Choisit ce que vous voulez travailler en cliquant dans le modèle.",
        steps: [
          "Cliquez un élément pour le sélectionner ; cliquez dans le vide pour tout désélectionner.",
          "Ctrl, ⌘ ou Maj + clic ajoute ou retire un élément. Avec le filtre « Auto », Maj + clic sur une face ajoute le corps entier.",
          "Cliquez de nouveau au même endroit : la sélection passe à l'élément suivant dessous (arête, face, corps derrière).",
          "Maj + glisser dessine une fenêtre : de gauche à droite, ce qui est entièrement dedans ; de droite à gauche, tout ce qui est touché.",
        ],
        tip: "Échap quitte l'outil ouvert, puis vide la sélection. La fenêtre ne prend que des corps entiers et des esquisses.",
      },
      {
        keys: [], selector: "[data-select-filter]", name: "Filtres de sélection",
        what: "Règle ce qu'un clic sélectionne : arête ou face, face, arête, point ou corps entier.",
        steps: [
          "« Auto » : un clic prend l'arête si le pointeur est dessus, sinon l'esquisse ou la face.",
          "« Faces », « Arêtes » ou « Points » : un clic ne prend que ce type, sur les corps comme sur les esquisses.",
          "« Corps » : un clic prend le corps ou l'esquisse en entier, et plusieurs à la fois.",
        ],
        tip: "Changer de filtre vide la sélection. Le choix est retenu.",
      },
      {
        keys: ["data-select-window:"], name: "Sélection par fenêtre",
        what: "Fait dessiner une fenêtre de sélection, au lieu de tourner la vue, quand vous glissez.",
        steps: [
          "Cliquez le bouton : il reste enfoncé. Glissez dans la vue.",
          "De gauche à droite, la fenêtre prend ce qui est entièrement dedans ; de droite à gauche, tout ce qu'elle touche.",
          "Recliquez le bouton pour retrouver la rotation de la vue.",
        ],
        tip: "Sans le bouton, Maj + glisser donne le même résultat. Pas pendant qu'un outil est ouvert.",
      },
      {
        keys: ["data-select-plus:"], name: "Sélection++",
        what: "Au survol d'un corps, propose les niveaux ensemble, pièce et face, pour viser le bon d'un clic.",
        steps: [
          "Survolez un corps : une carte liste les niveaux, et le niveau courant s'éclaire en vert dans la vue.",
          "Appuyez sur Ctrl, sans cliquer, pour descendre d'un niveau ; après la face, on revient en haut.",
          "Cliquez pour sélectionner le niveau vert ; Maj + clic l'ajoute à la sélection.",
        ],
        tip: "Actif avec les filtres « Auto » et « Corps », à la souris seulement. En « Auto », un clic sur une arête reste un clic d'arête.",
      },
      {
        keys: ["data-action:fit"], name: "Ajuster",
        what: "Cadre le modèle entier dans la vue.",
        steps: [
          "Cliquez « Ajuster », ou appuyez sur F.",
          "La vue se recentre et s'éloigne ou s'approche pour montrer le modèle.",
        ],
      },
      {
        keys: [], selector: "[data-orbit]", name: "Orbite",
        what: "Fait tourner la vue autour d'un centre que vous choisissez.",
        steps: [
          "Cliquez « Orbite » : le bouton reste enfoncé et trois choix apparaissent dessous.",
          "Glissez dans la vue pour tourner autour du point vert, le centre d'orbite (au milieu de la vue au départ). Cliquez un point du modèle pour y placer le centre.",
          "« Orbite contrainte » garde le haut en haut. « Orbite libre » trace un anneau : dedans, tous les sens ; poignées gauche et droite, autour de la verticale ; haut et bas, autour de l'horizontale ; hors de l'anneau, la vue roule.",
          "« Centre au milieu » remet le centre au milieu de la vue. Échap termine.",
        ],
        tip: "Sans le bouton, Maj + bouton du milieu glissé tourne autour du point sous la souris. Molette et clic droit gardent leur rôle.",
      },
      {
        keys: [], selector: "[data-piece-dims]", name: "Cotes des pièces",
        what: "Écrit sur la vue la largeur et la hauteur de chaque pièce.",
        steps: [
          "Cliquez « Cotes des pièces » : chaque pièce vue de face reçoit sa largeur et sa hauteur, une planche vue par la tranche sa longueur.",
          "Sélectionnez un caisson pour ne garder que ses cotes. Recliquez le bouton pour tout effacer.",
          "Sans outil en cours, cliquez une cote : elle devient un petit champ, à sa place ; tapez la nouvelle valeur ou un calcul (80 − 2 × 1,8, 1 m + 5 cm ; « + 5 » tapé tout de suite s'ajoute à la valeur) et Entrée : le caisson ou la planche suit. Au doigt, la calculatrice et son pavé s'ouvrent à côté. Pour une pièce d'une Répartition, cliquez la cote de sa niche ou le total — aussi pendant qu'Étagères, Cloisons, Tiroirs ou un autre outil y travaille : il reste ouvert et suit.",
        ],
        tip: "Seules les cotes visibles s'écrivent (une porte cache le caisson derrière). Une Répartition a ses cotes de plan, affichées d'elles-mêmes pendant que vous y travaillez.",
      },
      {
        keys: [], selector: "[data-part-tags]", name: "Repères des pièces",
        what: "Écrit sur chaque pièce la lettre qu'elle porte dans la liste de débit.",
        steps: [
          "Cliquez « Repères des pièces » : A, B, C… s'écrivent au milieu de chaque pièce vue.",
          "Recliquez pour les effacer.",
        ],
        tip: "Les pièces identiques ont la même lettre. Une pièce cachée derrière une autre n'a pas la sienne.",
      },
      {
        keys: [], selector: "[data-grid-toggle]", name: "Grille",
        what: "Montre ou cache la grille de la vue 3D.",
        steps: [
          "Cliquez « Grille » : elle disparaît de la vue. Recliquez pour la remettre.",
          "Cachée, elle garde son pas : le dessin s'y accroche toujours.",
        ],
      },
      ...SIDE_HELP,
      {
        keys: [], selector: "[data-xray]", name: "Rayons X",
        what: "Rend les corps translucides pour voir l'intérieur d'un meuble sans rien cacher.",
        steps: [
          "Cliquez « Rayons X » : les corps deviennent translucides.",
          "Recliquez pour les retrouver pleins.",
        ],
        tip: "Seul l'aspect change. Le choix est retenu.",
      },
      {
        keys: [], selector: "[data-isolate-selection]", name: "Isoler la sélection",
        what: "Garde seuls dans la vue les éléments choisis, pour travailler sur eux sans être gêné par le reste.",
        steps: [
          "Sélectionnez les éléments : cliquez le premier, puis Ctrl ou Maj + clic pour en ajouter (ou une fenêtre de sélection, ou le navigateur).",
          "Cliquez « Isoler la sélection » (ou la touche I, ou clic droit → « Isoler la sélection ») : les autres sont cachés et la vue se cadre sur eux.",
          "Travaillez : tous les outils marchent, et ce que vous créez s'affiche aussi.",
          "« Tout montrer », en bas de la vue (ou I sans rien de sélectionné), rend le reste.",
        ],
        tip: "Un élément est le meuble entier : cliquer une porte ou un côté suffit pour isoler son caisson avec ses façades, ou sa Répartition avec ses niches. Seule la vue change, pas le projet.",
      },
    ],
  },
  {
    title: "Fichier et réglages",
    where: "Barre tout en haut : nom du projet à gauche, puis « Outils », « Mise en plan », annuler, rétablir, « Enregistrer », et le menu « ⋯ » à droite.",
    tools: [
      {
        keys: [], selector: "[data-project-menu] summary", name: "Menu du projet",
        what: "Revient à vos projets, ouvre la fiche du projet, ce qui va à l'atelier ou au client, et les paramètres de l'atelier.",
        steps: [
          "Cliquez le nom du projet, en haut à gauche. « ← Mes projets » ramène à la liste des projets ; « Fiche du projet » ouvre sa fiche : le client, le statut (esquisse, devis envoyé, accepté, en fabrication, posé), la date de pose, les notes et le montant du devis.",
          "Rubrique « Pour l'atelier » : le dossier de production, la liste de débit, la mise en plan du caisson sélectionné (cliquez d'abord une de ses pièces dans la vue) ou du projet. Rubrique « Pour le client » : le devis et le lien client.",
          "Rubrique « Atelier » : « Paramètres de l'atelier » ouvre les matières, la quincaillerie, les tarifs du devis et le profil de l'atelier, qui font les prix et l'en-tête du devis, les mêmes sur tous les ordinateurs. Seul le personnel de l'atelier les modifie ; les autres comptes les lisent.",
        ],
        tip: "Sans pièce cliquée, la mise en plan du caisson prend le caisson du modèle s'il n'y en a qu'un ; sinon un message vous demande d'en cliquer une.",
      },
      {
        keys: [], selector: "[data-command-palette]", name: "Outils (palette de commandes)",
        what: "Retrouve un outil en tapant quelques lettres de son nom, sans chercher dans le ruban.",
        steps: [
          "Cliquez « Outils », ou appuyez sur ⌘K ou Ctrl+K.",
          "Tapez quelques lettres : accents et majuscules n'ont pas d'importance, et tous les mots tapés doivent se trouver.",
          "Choisissez avec les flèches haut et bas, puis Entrée lance l'outil. Échap ferme la palette.",
          "Pour donner un raccourci à un outil : cliquez « + touche » au bout de sa ligne, puis appuyez sur la combinaison voulue (Retour l'enlève, Échap annule). Elle lance ensuite l'outil depuis la vue ; l'aide (?) la liste sous « Mes raccourcis ».",
        ],
        tip: "Elle propose les outils de la barre en cours (modèle ou esquisse), y compris ceux rangés dans les menus, et met en tête les derniers utilisés. Les raccourcis de l'éditeur (enregistrer, annuler, Échap…) ne se donnent pas ; vos raccourcis sont gardés dans ce navigateur.",
      },
      {
        keys: [], selector: "[data-live-price]", name: "Prix en direct",
        what: "Affiche dans la barre du bas le prix TTC du devis, recalculé après chaque modification.",
        steps: [
          "Modifiez le projet : le prix change en bas à droite, et dans le Plan de dressing.",
          "Cliquez le prix pour ouvrir le devis.",
        ],
        tip: "Le calcul reprend les tarifs enregistrés dans le Devis. Il compte les pièces affichées : ce qui est caché n'est pas chiffré.",
      },
      {
        keys: ["data-action:undo", "data-action:redo"], name: "Annuler et Rétablir",
        what: "Défait la dernière modification, ou la remet.",
        steps: [
          "Cliquez « ↶ » ou appuyez sur ⌘Z (Ctrl+Z) pour annuler.",
          "Cliquez « ↷ » ou appuyez sur ⇧⌘Z (Ctrl+Y) pour rétablir.",
        ],
        tip: "Les boutons sont grisés quand il n'y a rien à annuler. Un outil entier (Symétrie, Réseau, un import…) ne compte que pour une étape. Un recalcul de plus de 90 secondes est arrêté et le noyau 3D redémarre : annulez alors la dernière modification si elle en est la cause.",
      },
      {
        keys: ["data-action:save"], name: "Enregistrer",
        what: "Enregistre le projet maintenant, sans attendre l'enregistrement automatique.",
        steps: [
          "Cliquez « Enregistrer », ou appuyez sur ⌘S (Ctrl+S).",
          "En bas à droite, l'état passe de « Modifications non enregistrées » à « Enregistrement… », puis « Enregistré ».",
        ],
        tip: "Chaque enregistrement crée une version du projet. « Conflit de version » veut dire que le projet a été modifié ailleurs : vos modifications restent sur cet ordinateur, rien n'est écrasé.",
      },
      {
        keys: ["data-action:export-step", "data-action:export-stl", "data-action:export-native"], name: "Exporter",
        what: "Écrit le modèle dans un fichier à emporter, nommé d'après le projet.",
        steps: [
          "Ouvrez le menu « ⋯ », rubrique « Exporter ».",
          "« STEP (solide exact) » donne les solides exacts, lisibles par la plupart des logiciels de CAO ; « STL (impression 3D) » donne un maillage.",
          "« Projet natif (.cao.json) » garde le projet tel quel, avec son historique.",
        ],
      },
      {
        keys: ["data-action:import-native"], name: "Importer",
        what: "Charge un projet natif enregistré plus tôt dans le projet ouvert.",
        steps: [
          "Ouvrez le menu « ⋯ », rubrique « Importer », cliquez « Projet natif (.cao.json) » et choisissez le fichier.",
          "Son contenu remplace celui du projet ouvert et le modèle est recalculé.",
        ],
        tip: "C'est une seule étape d'annulation : Ctrl+Z ramène le projet d'avant. Un fichier illisible est refusé avec un message.",
      },
      {
        keys: ["data-action:view:iso", "data-action:view:front", "data-action:view:top", "data-action:view:right"], name: "Vues standard",
        what: "Place la caméra sur un point de vue classique autour du modèle.",
        steps: [
          "Ouvrez le menu « ⋯ », rubrique « Vue ».",
          "Cliquez « Vue isométrique », « Vue de face », « Vue de dessus » ou « Vue de droite » : la vue se cadre sur le modèle.",
        ],
      },
      {
        keys: [], selector: "header summary[aria-label='Fichier et réglages']", name: "Unités et enregistrement automatique",
        what: "Choisit l'unité des cotes et si le projet s'enregistre tout seul.",
        steps: [
          "Cliquez « ⋯ » en haut à droite, rubrique « Réglages ».",
          "« Unités » : Millimètre, Centimètre, Mètre ou Pouce. Les cotes s'affichent dans cette unité.",
          "« Enregistrement automatique », coché au départ, enregistre quelques secondes après chaque modification. Décoché, utilisez « Enregistrer ».",
        ],
        tip: "Le changement d'unité s'annule avec Ctrl+Z. Sans enregistrement automatique, l'éditeur prévient avant de quitter avec des modifications non enregistrées.",
      },
      {
        keys: [], selector: "header [data-theme-toggle]", name: "Thème, style et palettes de couleurs",
        what: "Passe de l'écran clair à l'écran sombre, change le style de l'interface (ses formes et ses matières) et les couleurs du thème sombre.",
        steps: [
          "Cliquez « ⋯ », puis « Thème clair / sombre » pour passer de l'un à l'autre.",
          "Dans la rubrique « Style », choisissez « Classique » (angles droits, cartes en dégradé), « Verre » (panneaux de verre givré sur un fond coloré, coins très arrondis, comme les apps récentes de macOS) ou « Minimal clair » (panneaux blancs collés bord à bord par un filet fin, sans ombre, un seul accent ; il passe en thème clair). Le style va avec n'importe quelle palette.",
          "Dans la rubrique « Icônes (le dessin) », choisissez le modèle des icônes : « Volumes » (petits volumes en relief, par défaut), « Studio » (petits solides en 3D, gris clair ombrés, ce qui compte en bleu), « Glyphe » (formes plates grises, un accent de couleur) ou « Croquis » (petits solides vus de face, en couleurs vives, au trait de croquis qui dépasse des coins). Chaque modèle redessine tous les outils : ruban, colonne de sélection, esquisse, modélisation, menuiserie, vues, fabrication et documents.",
          "Dans la rubrique « Icônes (le rendu des volumes) », avec le modèle « Volumes », choisissez comment ils sont peints : « Relief » (blancs, en dégradés doux, par défaut), « Contour » (au trait), « Plein » (silhouettes d'une seule couleur) ou « Deux tons » (la couleur de l'accent, en teinte claire et en plein).",
          "Dans la rubrique « Palette », cliquez une pastille : Atelier, Navy Mirage, Ocean Sunset, Crimson Velvet, Amber Blaze, Crimson Braise, Royal Violet, Royal Charcoal, Crimson Terre, Mocha Mist, Forêt Profonde, Graphite Laiton, Indigo Nuit ou Chêne Sable.",
        ],
        tip: "Les palettes ne concernent que le thème sombre. « Atelier » est la palette de départ, « Classique » le style de départ, « Volumes » et « Relief » les icônes de départ ; ces choix sont gardés dans ce navigateur.",
      },
    ],
  },
  {
    title: "Barre du rendu",
    where: "Elle remplace le ruban quand le rendu est ouvert avec le bouton « Rendu » du groupe Client. Un panneau de réglages s'ouvre aussi à droite.",
    tools: [
      {
        keys: [], selector: "[data-render=capture]", name: "Barre du rendu",
        what: "Pilote le calcul de l'image réaliste du modèle.",
        steps: [
          "Le texte au centre donne l'avancement du calcul, en échantillons.",
          "« Pause » arrête l'affinage de l'image ; un second clic le reprend. « Recommencer » le relance depuis le début.",
          "« Rendre l'image » produit une image au format choisi dans la section « Image » du panneau et l'ajoute à la galerie, d'où elle se télécharge en PNG.",
          "« Quitter le rendu », ou Échap, revient à la modélisation.",
        ],
        tip: "Le rendu ne s'ouvre pas pendant une esquisse, ni sans corps affiché.",
      },
    ],
  },
];
