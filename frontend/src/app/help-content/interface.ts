import type { HelpFamily } from "./types";

export const CURIC: HelpFamily[] = [
  {
    title: "Curic",
    where: "Ruban du haut, groupe « Curic ». Son nom ouvre le menu de tous ses outils : Dessiner sur le corps, Assemblage, Étirer, Tourner, Lignes tout autour et Arêtes cachées n'y restent rangés que tant que vous ne les épinglez pas dans la barre.",
    tools: [
      {
        keys: ["data-action:face-strip"], name: "Truelle (tracé et extrusion)",
        what: "Trace un trait sur une face depuis une arête ou un coin, puis ajoute ou creuse de la matière dans la bande tracée.",
        steps: [
          "Cliquez « Truelle » et survolez le corps : une arête orange donne un trait parallèle, un coin un trait en travers, l'intérieur d'une face se tire ou se pousse tel quel.",
          "Cliquez l'arête ou le coin de départ : le trait suit le pointeur, avec les distances aux bords. Ctrl bascule entre « Une ligne » et « Double trait ».",
          "Réglez « Distance » (ou « Retrait » et « Largeur »), puis cliquez pour poser le trait.",
          "Tirez pour ajouter, poussez pour creuser, ou saisissez la « Hauteur ». Tab inverse. Cliquez pour terminer.",
        ],
        tip: "« OK » avant de tirer crée le tracé seul, en esquisse. Visez un coin ou une arête d'un corps pour vous arrêter à son niveau. Échap revient d'une étape. Seules les faces planes se tirent.",
      },
      {
        keys: ["data-action:draw-on-face"], name: "Dessiner sur le corps",
        what: "Trace une ligne, un rectangle ou un cercle directement sur une face, avec les distances aux bords les plus proches.",
        steps: [
          "Dans le panneau, choisissez « Tracé » : « Ligne / polyligne », « Rectangle », « Cercle » ou « Décalage du contour ».",
          "Cliquez sur une face du corps : ce premier point fixe la face, et les distances aux bords s'affichent en bas.",
          "Cliquez le point suivant, le coin opposé ou un point du cercle. Entrée termine une ligne.",
          "Vous pouvez taper les mesures, séparées par « ; » (120;45), puis Entrée. Une forme fermée enchaîne avec l'extrusion si « Puis tirer / pousser » est coché.",
        ],
        tip: "Le point s'accroche aux coins et aux milieux des arêtes. Échap reprend le tracé. Le dessin est une esquisse posée sur la face.",
      },
      {
        keys: ["data-action:mirror"], name: "Symétrie",
        what: "Copie des corps ou des esquisses de l'autre côté d'un plan, contre l'un de leurs côtés ou au centre.",
        steps: [
          "Sélectionnez les corps, puis cliquez « Symétrie ». Sans sélection, l'outil prend le dernier corps créé.",
          "Choisissez l'« Axe » : X largeur, Y profondeur ou Z hauteur. Le plan orange dans la vue est le miroir.",
          "Placez-le avec « Côté − », « Centre » ou « Côté + », ou tapez « Plan à ».",
          "Cliquez un autre corps ou une esquisse pour l'ajouter ou le retirer, puis « OK ».",
        ],
        tip: "Les originaux restent en place. Une esquisse en biais par rapport au plan est refusée : changez d'axe.",
      },
      {
        keys: ["data-action:align"], name: "Aligner",
        what: "Accole ou aligne des corps et des esquisses sur un corps de référence, axe par axe.",
        steps: [
          "Cliquez « Aligner », puis choisissez la « Référence » dans la liste.",
          "Cliquez dans la vue les corps ou les esquisses à aligner dessus (un second clic les retire).",
          "Pour chaque axe (« X largeur », « Y profond. », « Z hauteur »), choisissez « Côté − aligné », « Centré », « Côté + aligné », « Accolé après (+) » ou « Accolé avant (−) ». Réglez l'« écart » si besoin.",
          "Cliquez « OK ».",
        ],
        tip: "Au départ : accolé après en X, côté − en Y et Z, comme des caissons côte à côte. « Méthode » propose aussi « Face sur face » et « Point sur point ». Un corps aligné suit sa référence quand elle change.",
      },
      {
        keys: ["data-action:mate"], name: "Assemblage",
        what: "Relie deux pièces face contre face pour que l'une suive l'autre quand celle-ci change.",
        steps: [
          "Cliquez une face de la pièce qui bouge, puis une face de la pièce fixe. Des faces opposées se touchent, des faces de même sens affleurent.",
          "Recommencez avec d'autres faces pour lier un autre axe : une liaison par axe, trois au plus.",
          "Pour chaque axe, choisissez « Contact, côté + », « Contact, côté − », « Affleurant, côté + », « Affleurant, côté − » ou « Centré », puis réglez « Jeu », « Retrait » ou « Décalage ».",
          "Le bouton ✕ retire une liaison. Cliquez « OK ».",
        ],
        tip: "Cliquez des faces planes parallèles aux axes, comme la face d'une planche. Le résultat se rouvre dans « Aligner ».",
      },
      {
        keys: ["data-action:stretch"], name: "Étirer",
        what: "Allonge un meuble en une fois : un plan le coupe, les panneaux traversés s'allongent, ceux au-delà se déplacent.",
        steps: [
          "Sélectionnez les corps à étirer (rien : tous les corps visibles), puis cliquez « Étirer ».",
          "Choisissez l'« Axe ». Cliquez un corps pour y placer le plan orange, ou tapez « Plan à ».",
          "Saisissez la « Distance » : positive, elle allonge ; négative, elle raccourcit. Cliquez « OK ».",
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
          "Réglez l'« Axe », les « Copies » (ou la « Quantité ») et le « Pas » (ou la « Distance »), puis « OK ».",
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
          "Cliquez « OK ».",
        ],
        tip: "Tirer une flèche courbe du pivot tourne de 5° en 5° (librement avec Maj). Une esquisse ne tourne que dans son plan.",
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
        tip: "Le nombre à droite du nom est le nombre de corps du calque.",
      },
      {
        keys: ["data-action:oi-intersect"], name: "Lignes tout autour",
        what: "Trace autour d'un corps une ligne parallèle à une face, à une distance donnée, sous forme d'esquisse.",
        steps: [
          "Sélectionnez une face plane puis cliquez « Lignes tout autour », ou cliquez l'outil puis la face.",
          "Tirez la flèche dans la face, ou tapez la « Distance de la face », puis le « Nombre de lignes ».",
          "Cochez « Répartir dans l'épaisseur » pour partager l'épaisseur en parts égales, ou « Tous les corps traversés » pour tracer aussi sur les autres corps coupés.",
          "Cliquez « OK ».",
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
    where: "Navigateur à gauche, vue au centre (onglets de projets au-dessus, Historique en dessous), panneau Propriétés à droite.",
    tools: [
      {
        keys: [], name: "Navigateur",
        what: "Liste les corps et les esquisses du projet pour les choisir, les montrer, les cacher ou les ranger en dossiers.",
        steps: [
          "Cliquez un nom pour le sélectionner dans la vue ; Ctrl, ⌘ ou Maj + clic en ajoute d'autres. Le triangle déplie un corps et montre les opérations qui l'ont fait.",
          "Double-cliquez une pièce (une étagère, une porte, un côté), ici ou dans la vue : tout le caisson est sélectionné, façades comprises, ou toute la Répartition.",
          "Clic droit sur une porte dans la vue : l'ouvrir ou la fermer, l'ouvrir de l'autre côté, ôter ses poignées, la renommer, sélectionner tout le meuble, la changer en tiroirs (ou en porte à cadre) ou la supprimer.",
          "L'œil montre ou cache la ligne. Le bouton « ⋯ » ouvre la fenêtre pour modifier, renommer ou supprimer. Le clic droit donne le même choix en menu.",
          "Pour un dossier : sélectionnez des corps, cliquez « Nouveau dossier » dans l'en-tête « Corps », puis double-cliquez son nom pour le renommer.",
          "Glissez un corps sur un dossier pour l'y ranger, ou sur l'en-tête « Corps » pour l'en sortir.",
        ],
        tip: "Un point de couleur signale une opération en erreur ou désactivée : survolez la ligne pour lire pourquoi. Seuls vos dossiers se renomment ; les pièces d'un caisson se rangent d'elles-mêmes.",
      },
      {
        keys: [], name: "Historique",
        what: "Montre sous la vue les opérations du projet, dans l'ordre où elles ont été faites.",
        steps: [
          "Survolez une icône pour lire le nom de l'opération.",
          "Cliquez-la : une petite fenêtre s'ouvre, avec le champ « Nom » pour la renommer.",
          "« Modifier » rouvre son outil, « Désactiver » la met de côté sans la perdre (« Réactiver » la remet), « Supprimer » l'efface.",
        ],
        tip: "Si d'autres opérations dépendent de celle que vous supprimez, l'éditeur vous prévient. Ctrl+Z annule.",
      },
      {
        keys: [], name: "Panneau Propriétés",
        what: "Affiche les valeurs de l'opération choisie et ce que vous avez cliqué dans la vue.",
        steps: [
          "Cliquez une opération (Historique ou Navigateur) : ses champs apparaissent. Tapez une valeur, puis Entrée. « Modifier dans la vue » rouvre son outil.",
          "Cliquez des faces, arêtes ou points dans la vue : le panneau donne leurs mesures et propose des actions (Congé, Chanfrein, Extruder, Esquisse sur la face, Combiner, Scinder le corps, Déplacer, Supprimer).",
          "« Tout désélectionner » vide la sélection.",
        ],
        tip: "La fenêtre d'un outil ouvert prend un onglet à côté de « Sélection ». Sur un écran étroit, ces fenêtres se posent sur la vue.",
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
      },
      {
        keys: [], name: "Mes outils",
        what: "Une barre à vous, posée en haut à gauche de la vue, avec les outils que vous utilisez le plus.",
        steps: [
          "Dans le menu d'un groupe du ruban, cliquez l'étoile d'un outil pour l'ajouter.",
          "Cliquez une icône de la barre pour lancer l'outil, même rangé ou replié dans le ruban. Clic droit sur une icône : elle quitte la barre.",
          "Glissez la poignée à points pour déplacer la barre (double-clic : elle revient). « ⇄ » ou « ⇅ » la met à l'horizontale ou à la verticale.",
        ],
        tip: "Chaque onglet a la sienne : Conception 3D (vide au départ), Dressing et Cuisine (avec leurs outils de tous les jours, à changer à votre goût). Une autre sert à l'esquisse.",
      },
      {
        keys: [], name: "Ruban : épingler et déplacer les groupes",
        what: "Choisit les outils qui restent dans la barre du haut et l'ordre des groupes.",
        steps: [
          "Cliquez le nom d'un groupe (« Créer ▾ ») : le menu liste tous ses outils, et un clic sur un nom lance l'outil.",
          "À droite d'un outil, l'épingle le met dans la barre ou le range dans le menu ; l'étoile l'ajoute à « Mes outils ».",
          "« Par défaut » remet le groupe comme à l'origine. Glissez le nom d'un groupe pour le déplacer : l'ordre est retenu.",
        ],
        tip: "Quand la fenêtre est trop étroite, des icônes se replient d'elles-mêmes (Client et Fabrication d'abord, Dressing et Cuisine en dernier) mais restent dans le menu de leur groupe.",
      },
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
        tip: "Modifier, Fabrication et Client sont dans les trois. Chaque onglet a sa barre « Mes outils » ; Conception 3D remet la Sélection à droite. Le dernier onglet choisi est retenu dans ce navigateur.",
      },
      {
        keys: [], selector: "[data-steps]", name: "Étapes de la cuisine et du dressing",
        what: "Sous les onglets Cuisine et Dressing : le travail en étapes, chacune avec ses outils, à la place du ruban entier.",
        steps: [
          "Cuisine : Pièce, Plan, Meubles, Électroménager, Finitions, Contrôle, Devis. Dressing : Pièce, Plan, Aménagement, Façades, Finitions, Contrôle, Devis.",
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
          "Sans outil en cours, cliquez une cote, tapez la nouvelle valeur et Entrée : le caisson ou la planche suit. Pour une pièce d'une Répartition, cliquez la cote de sa niche ou le total.",
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
      {
        keys: [], selector: "[data-xray]", name: "Rayons X",
        what: "Rend les corps translucides pour voir l'intérieur d'un meuble sans rien cacher.",
        steps: [
          "Cliquez « Rayons X » : les corps deviennent translucides.",
          "Recliquez pour les retrouver pleins.",
        ],
        tip: "Seul l'aspect change. Le choix est retenu.",
      },
    ],
  },
  {
    title: "Fichier et réglages",
    where: "Barre tout en haut : nom du projet à gauche, puis « Outils », « Mise en plan », annuler, rétablir, « Enregistrer », et le menu « ⋯ » à droite.",
    tools: [
      {
        keys: [], selector: "[data-project-menu] summary", name: "Menu du projet",
        what: "Revient à vos projets, ouvre la fiche du projet, la mise en plan d'un caisson ou le catalogue de l'atelier.",
        steps: [
          "Cliquez le nom du projet, en haut à gauche. « ← Mes projets » ramène à la liste des projets ; « Fiche du projet » ouvre sa fiche : le client, le statut (esquisse, devis envoyé, accepté, en fabrication, posé), la date de pose, les notes et le montant du devis.",
          "Rubrique « Mise en plan » : « Mise en plan du caisson sélectionné » (cliquez d'abord une de ses pièces dans la vue) ou « Mise en plan du projet ».",
          "Rubrique « Atelier » : « Catalogue de l'atelier » ouvre les matières, la quincaillerie et le profil de l'atelier, qui font les prix et l'en-tête du devis.",
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
        ],
        tip: "Elle propose les outils de la barre en cours (modèle ou esquisse), y compris ceux rangés dans les menus, et met en tête les derniers utilisés.",
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
        tip: "Les boutons sont grisés quand il n'y a rien à annuler. Un outil entier (Symétrie, Réseau, un import…) ne compte que pour une étape.",
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
        keys: [], selector: "header [data-theme-toggle]", name: "Thème et palettes de couleurs",
        what: "Passe de l'écran clair à l'écran sombre et change les couleurs du thème sombre.",
        steps: [
          "Cliquez « ⋯ », puis « Thème clair / sombre » pour passer de l'un à l'autre.",
          "Dans la rubrique « Palette », cliquez une pastille : Atelier, Navy Mirage, Ocean Sunset, Crimson Velvet, Amber Blaze, Crimson Braise, Royal Violet, Royal Charcoal, Crimson Terre ou Mocha Mist.",
        ],
        tip: "Les palettes ne concernent que le thème sombre. « Atelier » est la palette de départ.",
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
