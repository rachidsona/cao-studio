import { DRILL_TEMPLATES_HELP, ORDERS_HELP } from "./orders";
import { WALK_HELP } from "./walk";
import type { HelpFamily } from "./types";
const MENU = "Le nom d'un groupe ouvre un menu qui liste tous ses outils : plusieurs n'y sont rangés que dans ce menu, un clic les lance.";
const WHERE = `Barre d'outils du modèle, groupe « Atelier ». ${MENU}`;
const MAKING = `Barre d'outils du modèle, groupe « Fabrication ». ${MENU}`;

export const WORKSHOP: HelpFamily[] = [
  {
    title: "Atelier : formes, usinage et assemblages",
    where: WHERE,
    tools: [
      {
        keys: ["data-action:sweep"], name: "Suivre-moi",
        what: "Fait glisser un profil fermé le long d'un chemin pour fabriquer une plinthe, une moulure ou une corniche.",
        steps: [
          "Dessinez dans une esquisse le profil fermé, dans un plan qui passe par le début du chemin.",
          "Dessinez dans une autre esquisse le chemin, en lignes et en arcs.",
          "Cliquez « Suivre-moi » (vous pouvez d'abord sélectionner les deux esquisses).",
          "Vérifiez « Profil » et « Chemin », puis choisissez « Nouveau corps », « Joindre » ou « Couper ». Pour joindre ou couper, indiquez le corps dans « Cible ».",
          "Cochez « Suivre la courbure (repère de Frenet) » si le chemin est gauche : c'est enregistré aussitôt.",
        ],
        tip: "Si le profil est dessiné ailleurs, cochez « Poser le profil au début du chemin » : il est posé debout, perpendiculaire au chemin, et vous réglez le point, la rotation et le retournement.",
      },
      {
        keys: ["data-action:extrude-path"], name: "Extruder le long d'un chemin",
        what: "Même principe que « Suivre-moi », mais le profil peut être dessiné n'importe où, ou remplacé par un simple rectangle.",
        steps: [
          "Dessinez le chemin dans une esquisse (lignes et arcs) et sélectionnez-la.",
          "Cliquez « Extruder le long d'un chemin ».",
          "Dans « Profil », prenez « Rectangle (largeur × hauteur) » ou une esquisse fermée.",
          "Pour le rectangle, réglez « Largeur », « Hauteur » et « Alignement » (centré, à gauche ou à droite du chemin). « Commencer » choisit le bout de départ, repéré par un point rouge.",
          "Choisissez « Nouveau corps », « Joindre » ou « Couper » : c'est enregistré aussitôt.",
        ],
        tip: "Avec le rectangle, le chemin peut être fermé : un mur ou un bandeau tout autour d'une pièce.",
      },
      {
        keys: ["data-action:machining"], name: "Usinage",
        what: "Perce, rainure et assemble des planches : perçages de 32, charnières, rainure de fond, tourillons, confirmat, excentriques, mi-bois, tenon et mortaise.",
        steps: [
          "Cliquez « Usinage », puis choisissez le travail dans la liste « Usinage ».",
          "Pour les perçages de 32, les charnières ou la rainure, cliquez la face de la planche à travailler.",
          "Pour un assemblage, cliquez la planche A puis la planche B ; recliquer une planche déjà prise la retire. Pour le tenon, A porte le tenon et B reçoit la mortaise.",
          "Réglez les champs du panneau (« Côté », « Entraxe », « Diamètre », « Profondeur »…) : c'est enregistré aussitôt.",
        ],
        tip: "Les deux planches d'un assemblage doivent se toucher face contre chant, sauf le mi-bois qui demande deux planches croisées. La charnière proposée est celle choisie dans « Quincaillerie ».",
      },
      {
        keys: ["data-action:cutout"], name: "Découpes du plan de travail",
        what: "Perce dans un plan de travail l'évier, la plaque de cuisson, le robinet ou un passe-câble.",
        steps: [
          "Cliquez « Découpes du plan de travail », puis cliquez le plan de travail dans la vue.",
          "Choisissez dans « + Ajouter une découpe… » l'évier, la plaque, le robinet ou le passe-câble.",
          "Réglez « Milieu ← bout » (position le long du plan) et « Bord avant → » (distance depuis le bord avant).",
          "Mettez les cotes de la notice de l'appareil : « Largeur », « Profondeur » et « Rayon des angles » (0 pour des angles vifs). « Garder dans Mes découpes… » les garde sous un nom, pour les reposer d'un clic dans vos autres projets.",
          "Si le bord avant est du mauvais côté, changez « Bord avant ». C'est enregistré aussitôt.",
        ],
        tip: "Les cotes proposées sont courantes : remplacez-les par celles de la notice. Le panneau refuse une découpe qui sort du plan, laisse moins de matière au bord ou en recouvre une autre. Dans un Plan de cuisine, un meuble d'évier (« Évier » ou « Bas évier ») découpe le plan tout seul, et vos découpes faites à la main sont gardées quand la cuisine est refaite.",
      },
      {
        keys: ["data-action:overlap"], name: "Recouvrement",
        what: "Inverse, à un angle, la planche qui passe devant le chant de l'autre : l'une est raccourcie, l'autre rallongée de l'épaisseur.",
        steps: [
          "Cliquez « Recouvrement ».",
          "Cliquez la première planche de l'angle, par exemple un côté.",
          "Cliquez la seconde planche, par exemple le dessus : l'aperçu montre le résultat.",
          "C'est enregistré aussitôt. Un troisième clic recommence le choix.",
        ],
        tip: "Les usinages des planches suivent leur nouvelle longueur. Une seule annulation défait tout.",
      },
      {
        keys: ["data-action:layout-copy"], name: "Copier l'aménagement",
        what: "Donne à d'autres caissons le nombre d'étagères et les façades d'un caisson modèle.",
        steps: [
          "Cliquez « Copier l'aménagement ».",
          "Cliquez le caisson modèle.",
          "Cliquez un à un les caissons à aménager pareil ; recliquer un caisson déjà pris le retire.",
          "C'est enregistré dès que c'est valable : étagères et façades s'adaptent aux cotes de chaque caisson.",
        ],
        tip: "Chaque caisson garde ses dimensions et sa place. Cliquer de nouveau le modèle recommence. Un corps qui n'appartient pas à un caisson est refusé.",
      },
      {
        keys: ["data-action:assembly"], name: "Règles d'assemblage",
        what: "Pose d'un coup confirmat, tourillons ou excentriques sur toutes les jonctions entre planches ; la visserie est comptée dans le devis.",
        steps: [
          "Cliquez « Règles d'assemblage ». Sans sélection de deux planches ou plus, toutes les planches du meuble sont prises.",
          "Choisissez « Assemblage » : confirmat, tourillons ou excentriques Minifix.",
          "Réglez « Entraxe », « Marge bouts » et « Ignorer sous » (les panneaux plus minces, comme les fonds, sont laissés).",
          "Cliquez une planche pour l'ajouter ou la retirer ; le panneau compte planches, jonctions et pièces de visserie. C'est enregistré aussitôt.",
        ],
        tip: "Les planches de plus de 30 mm (plans de travail) et les façades ne sont pas assemblées par cette règle.",
      },
    ] },
  {
    title: "Apparence et matières",
    where: `Barre d'outils du modèle, groupes « Atelier » et « Client ». ${MENU}`,
    tools: [
      {
        keys: ["data-action:render-mode"], name: "Rendu",
        what: "Calcule une image réaliste du meuble, avec la lumière, le sol et la caméra au choix.",
        steps: [
          "Terminez l'esquisse en cours s'il y en a une, puis cliquez « Rendu ». La barre du rendu remplace les outils.",
          "Dans le panneau de droite, réglez « Environnement », « Sol », « Caméra », « Finitions » et « Qualité ».",
          "Laissez l'image s'affiner. « Pause » l'arrête, « Recommencer » repart de zéro.",
          "Choisissez le « Format » dans la section « Image », puis cliquez « Rendre l'image » : elle rejoint la galerie du panneau, où « Télécharger » l'enregistre en PNG.",
          "Cliquez « Quitter le rendu » ou appuyez sur Échap pour revenir à la modélisation.",
        ],
        tip: "Il faut au moins un corps affiché. « ⬇ Télécharger le rendu final » rend l'image au format choisi et l'enregistre aussitôt.",
      },
      {
        keys: ["data-workshop:render"], name: "Rendu des matières",
        what: "Montre ou cache les matières et le veinage du bois dans la vue ; sans lui, les corps sont gris.",
        steps: [
          "Cliquez « Rendu des matières » : le bouton reste enfoncé quand les matières sont affichées.",
          "Cliquez-le de nouveau pour les cacher.",
        ],
        tip: "Le choix est retenu par le navigateur. Le veinage suit le sens du fil réglé dans « Matière et chants ».",
      },
      {
        keys: ["data-workshop:appearance"], name: "Apparence",
        what: "Donne aux corps un aspect de bois, verre, marbre (Statuario, Calacatta Oro, Arabescato, Emperador…), pierre frittée Dekton (Aura, Entzo, Laurent, Kelya, Sirius, Kreta…), métal, laque, tissu ou béton, ou une couleur ou une photo de votre choix.",
        steps: [
          "Sélectionnez les corps (dans le navigateur ou dans la vue, Ctrl pour plusieurs), puis cliquez « Apparence ».",
          "Cherchez dans « Bibliothèque » (recherche et « Catégorie ») et cliquez une vignette, ou glissez-la sur un corps de la vue.",
          "Pour une couleur unie, réglez « Couleur au choix », le type de surface, puis cliquez « Appliquer ».",
          "Pour une photo, cliquez « Importer une image… » et donnez la largeur qu'elle couvre en mm ; elle reste dans « Mes motifs ».",
        ],
        tip: "Des faces choisies dans la vue : cochez « Seulement la face choisie » pour ne peindre qu'elles ; en glissant, Alt ne peint que la face sous le curseur. « Retirer l'apparence » rend celle de la matière. Plus vite, sans cet outil : une face choisie dans la vue, « Couleur de la face » du panneau Sélection la colore seule (« D'origine » lui rend celle de son corps).",
      },
      {
        keys: ["data-workshop:material"], name: "Matière et chants",
        what: "Règle la matière, le sens du fil et les chants plaqués des corps sélectionnés.",
        steps: [
          "Sélectionnez un ou plusieurs corps, ou une face, puis cliquez « Matière et chants ».",
          "Choisissez la « Matière » dans la liste (« Non défini » par défaut).",
          "Choisissez le sens du fil : « Fil en longueur », « Fil en largeur » ou « Sans fil ».",
          "Cochez les chants à plaquer : L1 et L2 sont les deux grands côtés, l1 et l2 les deux petits. Réglez l'épaisseur dans « Chant … mm ».",
          "Sélection de plusieurs façades : « Fil continu sur ces pièces » les garde côte à côte au calepinage, pour que le veinage court d'une porte à l'autre.",
        ],
        tip: "La liste de débit, le calepinage et le devis lisent ces réglages. Sans sélection, le panneau reste vide.",
      },
      {
        keys: ["data-workshop:edge-paint"], name: "Peindre les chants",
        what: "Pose les chants d'un clic sur les pièces : les chants posés se voient en vert, le bord visé en orange.",
        steps: [
          "Cliquez « Peindre les chants ».",
          "Réglez l'épaisseur, puis cliquez le bord d'une pièce : son chant se pose, ou s'enlève s'il y est.",
          "Choisissez « Les 4 chants » pour tout le tour d'un clic.",
          "Choisissez « Pipette », cliquez une pièce, puis les pièces qui prennent les mêmes chants.",
          "Fermez par la croix ✕ (ou Échap).",
        ],
        tip: "Chaque clic s'annule à part. Les chants sont les mêmes que ceux de « Matière et chants » : la liste de débit et le devis les lisent.",
      },
      { keys: ["data-workshop:pipette"], name: "Pipette", what: "Copie l'apparence d'un corps sur d'autres, telle qu'on la voit : sa couleur, la transparence d'un verre ou d'un plexiglas, ses faces peintes.", steps: ["Cliquez « Pipette » (groupe Atelier).", "Cliquez dans la vue le corps dont vous prenez l'apparence.", "Cliquez chacun des corps qui la prennent ; « Reprendre une autre apparence » pour en changer.", "Ctrl + clic (⌘ + clic sur Mac) sur un corps : tout son caisson la prend d'un coup — les panneaux de sa Répartition ou de son caisson, pas ses portes, tiroirs ni verres.", "Fermez par la croix ✕ (ou Échap)."], tip: "Seule l'apparence passe : la matière des corps, leur débit et le devis ne changent pas. Chaque clic s'annule à part." },
      { keys: ["data-workshop:form-pipette"], name: "Pipette de forme", what: "Donne la forme d'un meuble, d'une porte, de tiroirs, d'un caisson ou d'une niche équipée à d'autres de même sorte, telle quelle — mêmes cotes, même apparence —, chacun gardant sa place, son orientation et son nom.", steps: ["Cliquez « Pipette de forme » (groupe Atelier).", "Cliquez dans la vue l'élément dont vous prenez la forme : un meuble de cuisine, un caisson, ses façades, une porte, des tiroirs, une penderie.", "Cliquez chacun des éléments qui la prennent : un meuble de cuisine prend le modèle, les façades, l'intérieur, la largeur, la hauteur et la profondeur de l'autre ; un caisson ses cotes et sa construction ; des façades leur disposition, leur pose et leur style ; une niche la hauteur et la largeur de sa case (les étagères et cloisons autour suivent, les autres cases se partagent le reste), ses tiroirs, sa tringle, son accessoire ou sa porte telle quelle : son ouverture (de côté, relevante, abattante), sa poignée ou son absence, son jeu, sa ferrure et son style — la porte cliquée devient une copie de l'autre. Une porte de tout genre (de niche, de façades, d'un meuble de cuisine) donne aussi son style, son ouverture et sa poignée à une autre ; un corps (planche, côté, panneau) ses trois cotes, sa matière et son apparence ; une étagère ou une cloison la division de sa niche à une niche vide que vous cliquez, et à une autre étagère seulement son épaisseur, sa matière et son apparence (le nombre d'étagères reste). Chaque panneau prend aussi l'apparence du panneau de même rang. Une porte donne au moins son style et son apparence à toute autre porte ou à des tiroirs. « Reprendre une autre forme » pour en changer.", "Pour qu'un meuble ait l'organisation d'un autre en gardant ses cotes : cliquez un côté, le dessus ou le dessous de la Répartition modèle, puis n'importe quelle pièce de l'autre : ses cases, ses côtés, son épaisseur, son socle, ses portes et ce que tient chaque case (étagères, cloisons, penderie, tiroirs) sont refaits à ses cotes.", "Fermez par la croix ✕ (ou Échap)."], tip: "Un meuble bas ne donne pas sa forme à un meuble haut : le panneau dit pourquoi. La matière ne change pas : la liste de débit et le devis gardent la leur. Dans une cuisine, un meuble plus large pousse les suivants. Chaque clic s'annule à part." },
      {
        keys: ["data-workshop:replace"], name: "Remplacer partout",
        what: "Remplace une matière, ou une épaisseur de chant, par une autre dans tout le projet.",
        steps: [
          "Cliquez « Remplacer partout ».",
          "Pour une matière : choisissez celle à remplacer (avec le nombre de corps concernés) et la nouvelle, puis cliquez « Remplacer » sur sa ligne.",
          "Pour un chant : choisissez l'ancienne et la nouvelle épaisseur, puis cliquez « Remplacer » sur la ligne « Chant ».",
        ],
        tip: "Les standards de construction du projet qui nommaient l'ancienne matière sont changés aussi. Une seule annulation (Ctrl+Z). Il faut qu'au moins une matière soit déjà choisie.",
      },
    ],
  },
  {
    title: "Atelier : réglages du projet",
    where: WHERE,
    tools: [
      {
        keys: ["data-workshop:standard"], name: "Standard de construction",
        what: "Fixe une fois pour toutes comment le projet est construit : épaisseurs, fond, façades, matières, chants et assemblage.",
        steps: [
          "Cliquez « Standard de construction » et choisissez dans « Standard du projet » un modèle fourni, un de votre atelier, ou « Aucun ».",
          "Modifiez ce qui doit l'être : « Épaisseur du caisson », « Épaisseur du fond », « Jeu des façades », « Fond », « Assemblage », « Caisson en »…",
          "Cliquez le bouton « Appliquer : … caisson(s), … façade(s), … pièce(s) » pour reconstruire les caissons qui suivent le standard.",
          "Cliquez « Enregistrer dans l'atelier » pour le retrouver dans d'autres projets de ce navigateur.",
        ],
        tip: "Le panneau liste les caissons retouchés à la main qui ne le suivent plus. Un caisson peut suivre un autre standard, ou aucun, dans l'outil Caisson, ligne « Standard ». « Perçage des assemblages : Automatique » perce seul chaque jonction des caissons qui le suivent, refaite à chaque changement de cote et comptée au devis.",
      },
      {
        keys: ["data-workshop:hardware"], name: "Quincaillerie",
        what: "Choisit la charnière, la coulisse et la poignée du projet dans un catalogue.",
        steps: [
          "Cliquez « Quincaillerie ».",
          "Choisissez un modèle dans « Charnières », « Coulisses » et « Poignées » ; le panneau donne ses cotes et son prix HT.",
          "Lisez « Règles des fabricants » : une porte trop fine pour la cuvette, une porte battante de plus de 600 mm, une poignée trop longue pour sa façade, un tiroir plein trop lourd pour ses coulisses ; « Voir » sélectionne la pièce. En bas, « Quincaillerie du projet » compte tout.",
        ],
        tip: "Les façades, portes et tiroirs neufs sont percés aux cotes du modèle choisi ; une porte lourde reçoit seule les charnières que son poids demande (4,5 kg chacune). Le Contrôle ouvre chaque porte jusqu'à l'angle de la charnière choisie : contre un mur, un fileur ou un limiteur d'ouverture. Repères courants : la fiche du fabricant fait foi.",
      },
      {
        keys: ["data-workshop:parameters"], name: "Paramètres",
        what: "Donne un nom à des valeurs (largeur, épaisseur…) et les lie aux cotes par des formules : changer la valeur met à jour tout le meuble.",
        steps: [
          "Cliquez « Paramètres », écrivez un nom et une valeur (ou une formule) dans la ligne sous la liste, puis cliquez « Ajouter ».",
          "Dans « Liens avec les cotes », choisissez la « Fonction à lier » puis la « Cote à lier ».",
          "Écrivez la « Formule », par exemple largeur - 2 * ep, puis cliquez « Lier ».",
          "Changez ensuite la valeur du paramètre : toutes les cotes liées suivent.",
          "Dans « Configurations », nommez les valeurs actuelles et cliquez « Enregistrer » pour retrouver cette variante d'un clic.",
        ],
        tip: "Tout est en millimètres (1 cm = 10). Les cotes d'une esquisse se lient aussi : choisissez l'esquisse dans « Fonction à lier », le dessin suit. Une formule fausse est refusée et rien ne change. Supprimer un paramètre utilisé demande confirmation.",
      },
    ],
  },
  {
    title: "Mesures, vues et plans",
    where: `Barre d'outils du modèle, groupes « Atelier », « Fabrication » et « Client ». ${MENU}`,
    tools: [
      {
        keys: ["data-workshop:measure"], name: "Mètre et guides",
        what: "Mesure une distance ou un angle dans la vue, ou pose des lignes de guide enregistrées avec le projet.",
        steps: [
          "Cliquez « Mètre et guides » et choisissez « Mesurer », « Guide » ou « Angle ».",
          "« Mesurer » : cliquez deux points, ou choisissez « Traits », « Faces » ou « Corps » puis cliquez les deux éléments pour avoir la plus courte distance entre eux.",
          "« Guide » : cliquez deux points, une ligne pointillée est posée.",
          "« Angle » : cliquez le sommet, puis un point sur chaque côté.",
          "« Effacer les mesures » les retire ; Échap annule le point en cours.",
        ],
        tip: "Les points s'accrochent aux coins, aux arêtes et aux guides. Les mesures disparaissent à la fermeture du panneau, les guides restent. Après une mesure entre deux corps, « Changer cet espace… » ouvre l'outil Espacement.",
      },
      WALK_HELP,
      {
        keys: ["data-workshop:scenes"], name: "Scènes",
        what: "Garde des vues de la caméra sous un nom et y retourne d'un clic.",
        steps: [
          "Placez la vue comme vous voulez, ouvrez « Scènes », écrivez un nom, puis cliquez « Enregistrer la vue ».",
          "Cliquez le nom d'une scène pour y retourner.",
          "« ⟳ » remplace la scène par la vue actuelle ; « ✕ » la supprime.",
        ],
        tip: "Sans nom écrit, la scène s'appelle « Scène 1 », « Scène 2 »… Deux scènes ne peuvent pas porter le même nom. Ouvrir une scène ne change jamais le meuble.",
      },
      {
        keys: ["data-workshop:motion"], name: "Mouvements",
        what: "Ouvre une porte ou sort un tiroir dans la vue pour voir ce qu'il heurte, sans toucher au modèle.",
        steps: [
          "Sélectionnez la porte ou le tiroir, ou cliquez-le après avoir ouvert « Mouvements ».",
          "Vérifiez « Type de mouvement » : « Porte (charnière) » ou « Tiroir (glisse) ». Pour une porte, choisissez le côté de la charnière.",
          "Tirez le curseur « Ouverture » ou cliquez « ▶ Jouer ».",
          "Lisez le résultat : « Aucune collision » ou « Collision avec : … ». « Remettre » ferme.",
        ],
        tip: "Le contrôle se fait sur les boîtes englobantes : exact pour des planches. Échap ferme l'outil et remet tout en place.",
      },
      {
        keys: ["data-workshop:drawing"], name: "Mise en plan",
        what: "Ouvre l'écran de dessin de plans : vues cotées du meuble sur des feuilles A4 à A0 avec cartouche, à imprimer ou exporter.",
        steps: [
          "Cliquez « Mise en plan » : une première feuille s'ouvre avec la vue de face, la vue de dessus, la vue de côté et une vue isométrique.",
          "Ajoutez ce qu'il faut avec le ruban : « Vue de base », « Projetée », « Coupe », « Détail », « Plan de pose ». Une vue choisie peut être « Éclatée » (10 à 80 %) dans son panneau : ses pièces s'écartent.",
          "Cotez avec « Cote » ou « Cotes auto », puis « Réorganiser » pour ranger les cotes. Ajoutez « Texte », « Note », « Repère » ou « Nomenclature ».",
          "Réglez format, projection et cartouche dans le panneau « Feuille » à droite (le client y vient de la fiche du projet) ; « + Feuille » en bas en crée une autre.",
          "Exportez avec « Fichier PDF » (téléchargé directement, à l'échelle exacte, une page par feuille avec son cartouche), « Imprimer », « Dossier client », « DXF » ou « SVG », puis « Fermer la mise en plan ».",
        ],
        tip: "Sans rien sélectionner, « Cotes auto » et « Effacer » agissent sur toutes les vues de la feuille. Ctrl+Z annule. « Plan de pose » demande les murs de la pièce avec des meubles contre eux.",
      },
    ],
  },
  {
    title: "Fabrication : découpe et commande numérique",
    where: MAKING,
    tools: [
      ORDERS_HELP,
      DRILL_TEMPLATES_HELP,
      {
        keys: ["data-workshop:cutlist"], name: "Liste de débit",
        what: "Liste toutes les pièces du meuble avec leurs cotes, leur matière, leurs chants et leur quantité.",
        steps: [
          "Cliquez « Liste de débit » : le total du projet, puis un tableau par matière et par épaisseur. La colonne « Coupe » n'apparaît que si une cote à scier diffère de la cote finie.",
          "« Listes par », à côté du filtre, range la liste autrement : par type d'élément (une liste des côtés, une des dessus, une des étagères…), par type de bois, par épaisseur, ou par type d'élément et épaisseur à la fois. Chaque liste a son total.",
          "Cliquez une ligne pour sélectionner ces pièces dans le modèle.",
          "Cliquez « Exporter en CSV » pour le tableur, ou « Imprimer / PDF » : ils suivent la liste choisie.",
        ],
        tip: "Chaque ligne porte un repère (lettre) qu'on retrouve sur le calepinage. Le massif est donné avec sa surcote de débit brut. Les murs de la pièce et la quincaillerie ne sont pas listés. Un côté de caisson entaillé pour une gorge est marqué « entaillé » : le survol de la marque donne ses entailles, leur taille et leur hauteur depuis le bas du côté.",
      },
      {
        keys: ["data-workshop:import-parts"], name: "Importer une liste de pièces",
        what: "Transforme un tableau CSV de pièces en planches posées à plat à droite du modèle.",
        steps: [
          "Préparez un tableau avec nom, quantité, longueur, largeur, épaisseur et matière, enregistré en CSV.",
          "Cliquez « Importer une liste de pièces » et choisissez le fichier.",
          "Les planches apparaissent côte à côte à droite du modèle ; un message indique les lignes ignorées.",
        ],
        tip: "La première ligne peut nommer les colonnes, et l'unité entre parenthèses : « Longueur (cm) ». Sans cette ligne, l'ordre ci-dessus est suivi. La liste de débit exportée par CAO Studio se réimporte telle quelle.",
      },
      {
        keys: ["data-workshop:nesting"], name: "Optimisation de découpe",
        what: "Place les pièces sur les chutes du stock, puis sur des panneaux neufs, et dresse la liste d'achat.",
        steps: [
          "Cliquez « Optimisation de découpe » : les panneaux apparaissent avec leurs pièces ; les chutes à garder sont en vert.",
          "Décochez « Utiliser d'abord les chutes du stock » pour ne compter que des panneaux neufs.",
          "Cliquez « Garder les chutes » pour les ranger dans le stock, ou « Sortir les chutes utilisées » pour retirer celles que ce plan consomme.",
          "Cliquez « Imprimer / PDF » ou « Exporter en SVG ».",
        ],
        tip: "Les tasseaux sont débités sur des barres. Une pièce trop grande pour son panneau ou sa barre est signalée sous les dessins.",
      },
      {
        keys: ["data-workshop:offcuts"], name: "Stock de chutes",
        what: "Tient la liste des chutes que vous gardez, utilisées avant d'entamer un panneau neuf.",
        steps: [
          "Cliquez « Stock de chutes ».",
          "Pour en ajouter une, choisissez la matière, écrivez épaisseur, longueur et largeur, puis cliquez « Ajouter ».",
          "Cliquez « Retirer » sur une ligne pour la sortir du stock.",
        ],
        tip: "Le plus simple est « Garder les chutes » dans l'optimisation de découpe, qui range tout ce qui reste d'assez grand.",
      },
      {
        keys: ["data-workshop:batch"], name: "Fabrication groupée",
        what: "Débite ensemble plusieurs projets en quantité : un seul calepinage et une seule liste d'achat.",
        steps: [
          "Dans chaque projet, ouvrez « Fabrication groupée » et cliquez « Ajouter ce projet au lot ».",
          "Réglez la quantité de chaque projet du lot ; « Retirer » le sort.",
          "Cliquez « Calepinage et liste d'achat du lot ».",
        ],
        tip: "Chaque projet est pris avec sa liste de débit du moment : ajoutez-le de nouveau après un changement.",
      },
      {
        keys: ["data-workshop:dxf"], name: "DXF pour la commande numérique",
        what: "Exporte chaque panneau à plat, avec son contour exact, ses rainures et ses perçages, dans des calques nommés comme votre machine les attend.",
        steps: [
          "Cliquez « DXF pour la commande numérique ».",
          "Choisissez votre machine dans la liste : un modèle tout fait pour les logiciels de commande numérique courants, ou une de vos machines enregistrées.",
          "Au besoin, réglez les trois noms de calques comme le post-processeur de la machine les attend : contours, poches et rainures, perçages.",
          "Laissez « Contours enchaînés » coché si la machine compense la fraise : chaque contour tourne dans le sens des aiguilles d'une montre, la compensation à droite met la fraise dans la chute.",
          "Tapez le nom de la machine et cliquez « Enregistrer la machine » pour la reprendre d'un clic la prochaine fois. Cliquez « Exporter ».",
        ],
        tip: "Dans un nom de calque, {d} donne le diamètre, {z} la profondeur et {t} l'épaisseur du panneau. Une rainure ou une poche part dans son calque à sa profondeur, sans être découpée, même une rainure de fond qui traverse toute la pièce : la pièce garde sa vraie taille, posée sur le côté le plus usiné. Essayez le premier fichier sur la machine avant une série. Une pièce sans face plane est laissée de côté, les perçages sur chant sont à faire à part.",
      },
      {
        keys: ["data-workshop:gcode"], name: "G-code",
        what: "Écrit le programme de la défonceuse à commande numérique : perçages, cuvettes et contours, pièces rangées sur les panneaux bruts.",
        steps: [
          "Cliquez « G-code ».",
          "Réglez la machine : « Diamètre de la fraise », « Profondeur de passe », « Avance », « Vitesse de broche », « Écart entre pièces »…",
          "Lisez le résumé : nombre de pièces et de panneaux bruts, pièces non usinées.",
          "Cliquez « Télécharger le G-code ».",
        ],
        tip: "Les pièces sont imbriquées sur les panneaux par leur contour réel (un arrondi, une encoche, un triangle s'emboîtent), l'écart entre pièces plus la fraise entre deux ; un décor bois ne fait que des demi-tours, un panneau uni aussi des quarts de tour. Les réglages sont retenus par le navigateur. Vérifiez toujours le programme dans un simulateur avant de lancer la machine. Un perçage borgne sur l'autre face demande de retourner la pièce.",
      },
      {
        keys: ["data-workshop:production-folder"], name: "Dossier de production",
        what: "Réunit en un seul .zip tous les documents de l'atelier, après un contrôle du projet.",
        steps: [
          "Cliquez « Dossier de production » : le contrôle du projet se lance et donne son verdict.",
          "Cochez les documents voulus : liste de débit, calepinage, fiches, étiquettes, fichiers machine, notice, devis.",
          "Cliquez « Télécharger le dossier » (ou « Télécharger quand même » s'il reste des erreurs).",
        ],
        tip: "Le devis n'est pas coché au départ. Les documents reprennent les réglages déjà faits dans chaque outil. Le résultat du contrôle est écrit dans le dossier. Avec la liste de débit vient le fichier de la plaqueuse (01-plaqueuse.csv) : une ligne par pièce chantée, son repère en code-barres comme sur l'étiquette, un chant par colonne (L1, L2, l1, l2).",
      },
    ],
  },
  {
    title: "Fabrication : contrôles",
    where: MAKING,
    tools: [
      {
        keys: ["data-workshop:live-check"], name: "Contrôle en direct",
        what: "Entoure les pièces à problème pendant la conception, sans ouvrir le contrôle complet.",
        steps: [
          "Laissez « Contrôle en direct » enfoncé : après chaque changement, un cadre rouge (erreur) ou ambre (à regarder) entoure les pièces en cause. Relâché, il cache ces cadres ; leur nombre reste dans la barre d'état.",
          "Dans la barre d'état, cliquez « à vérifier » pour lire la liste dans le Contrôle avant fabrication.",
        ],
        tip: "Il voit les chevauchements, la pièce et son plan, les panneaux bruts et les portes, mais pas les pièces sans matière, qu'on choisit souvent à la fin. Le contrôle complet va plus loin : perçages, ouverture, flèche, stabilité.",
      },
      {
        keys: ["data-workshop:check"], name: "Contrôle avant fabrication",
        what: "Cherche ce qui gâcherait du panneau ou bloquerait le montage, avant de lancer la découpe.",
        steps: [
          "Cliquez « Contrôle avant fabrication ».",
          "Lisez le résumé, puis les listes rangées par sorte de problème. Un point rouge est une erreur, un point orange une chose à vérifier.",
          "Cliquez « Voir » sur une ligne pour sélectionner les pièces en cause.",
        ],
        tip: "Il vérifie les pièces qui se chevauchent, les pièces trop grandes pour leur panneau, les pièces sans matière, les perçages, les portes et tiroirs qui heurtent en s'ouvrant, les étagères qui fléchissent et le basculement. Deux pièces qui se chevauchent : « Couper « … » » coupe l'une par l'autre, qui reste entière ; « Corriger les N chevauchements » les fait tous d'un coup. Une cuisine aux cotes tapées qui entre dans les murs de la Pièce relevée : « Corriger : Poser la cuisine sur … » la pose sur la pièce (le mur qui la déplace le moins devient son mur A), ses longueurs et sa hauteur viennent des murs et elle est refaite ; ce qui ne tient plus est dit avant, ⌘Z revient. Le « ⚠ à vérifier » de la barre d'état ouvre ce contrôle.",
      },
      {
        keys: ["data-workshop:weight"], name: "Poids et stabilité",
        what: "Donne le poids du meuble, la hauteur de son centre de gravité et dit s'il bascule tiroirs sortis.",
        steps: [
          "Cliquez « Poids et stabilité » : le poids total et les cinq pièces les plus lourdes s'affichent.",
          "Choisissez « Tous les tiroirs sortis, chargés de » : tiroirs vides, 10, 15, 25 ou 35 kg.",
          "Choisissez la « Face avant » si le meuble n'est pas tourné vers −Y.",
          "Lisez le verdict : il reste debout ou bascule vers l'avant.",
        ],
        tip: "Un meuble haut et peu profond reçoit le conseil de le fixer au mur. La quincaillerie n'est pas pesée, et une pièce sans matière est comptée en aggloméré.",
      },
      {
        keys: ["data-workshop:sag"], name: "Flèche des étagères",
        what: "Calcule de combien chaque planche horizontale fléchit à long terme sous sa charge.",
        steps: [
          "Cliquez « Flèche des étagères ».",
          "Choisissez la « Charge » : livres, vaisselle, linge plié ou objets légers.",
          "Choisissez la « Flèche admise » : tolérant, courant ou exigeant.",
          "Lisez chaque planche : ✓ si elle tient, ✗ sinon, avec l'épaisseur qui suffit ou la portée maximale. « Voir » la sélectionne.",
        ],
        tip: "Les fonds, façades, plinthes et fonds de tiroir ne sont pas comptés. La planche est supposée posée sur ses deux bouts, charge répartie.",
      },
    ],
  },
  {
    title: "Documents et client",
    where: `Barre d'outils du modèle, groupes « Fabrication » et « Client ». ${MENU}`,
    tools: [
      {
        keys: ["data-workshop:variants"], name: "Variantes",
        what: "Garde plusieurs versions du projet et les compare côte à côte avec leur prix.",
        steps: [
          "Cliquez « Variantes », nommez la version en cours, puis « Garder cette version » : jusqu'à six versions, gardées dans le projet.",
          "Changez le projet : chaque carte montre son image, son prix et l'écart avec le projet en cours.",
          "Cliquez « Ouvrir » sur la version choisie : elle remplace le projet en cours, et Ctrl+Z revient en arrière.",
        ],
        tip: "Le prix affiché est celui du moment où la variante a été gardée.",
      },
      {
        keys: ["data-workshop:assembly"], name: "Notice de montage",
        what: "Montre le meuble étape par étape dans la vue, éclaté si vous voulez, et imprime la notice.",
        steps: [
          "Cliquez « Notice de montage ».",
          "Cliquez « Le meuble monté », ou une étape de la liste : les étapes passées restent en place, celle du moment s'écarte, les suivantes sont cachées.",
          "Avancez avec « Étape suivante › » et « ‹ Étape précédente ». Le curseur « Vue éclatée » écarte toutes les pièces.",
          "Cliquez « Imprimer la notice » : une page par étape, avec son image, ses pièces et sa quincaillerie.",
        ],
        tip: "La vue seulement : le modèle ne change pas, et tout revient en place à la fermeture du panneau.",
      },
      {
        keys: ["data-workshop:sheets"], name: "Fiches de fabrication",
        what: "Imprime une page par pièce, à l'échelle, pour usiner sans ouvrir la 3D.",
        steps: [
          "Cliquez « Fiches de fabrication ».",
          "Dans la fenêtre d'impression, imprimez ou choisissez « Enregistrer en PDF ».",
        ],
        tip: "Les pièces identiques tiennent sur une seule fiche, avec leur quantité. Chaque fiche donne cotes finies et de coupe, matière, chants, fil, perçages cotés depuis les bords et un QR code. Une pièce sans face plane n'a pas de fiche. Un côté entaillé pour une gorge a une ligne « Entailles » (combien, leur taille, leur hauteur depuis le bas du côté) ; le dessin, le DXF et le G-code suivent son contour entaillé.",
      },
      {
        keys: ["data-workshop:labels"], name: "Étiquettes à QR code",
        what: "Imprime une étiquette par pièce, à coller sur les panneaux à la sortie de la machine.",
        steps: [
          "Cliquez « Étiquettes à QR code » : le modèle et son aperçu s'ouvrent.",
          "Cochez ce qu'elle dit et rangez-le avec ↑ et ↓, choisissez le format de la planche, la place du QR code, et ajoutez votre logo.",
          "Cliquez « Imprimer ».",
        ],
        tip: "Le modèle reste dans ce navigateur, et le dossier de production l'imprime aussi. Le QR code ouvre la page de la pièce dans le suivi d'atelier.",
      },
      {
        keys: ["data-workshop:progress"], name: "Suivi d'atelier",
        what: "Montre où en est chaque pièce : débitée, chantée, percée, montée.",
        steps: [
          "Cliquez « Suivi d'atelier » : une barre par étape donne l'avancement du projet.",
          "Dans la liste des pièces, choisissez l'étape atteinte pour chacune.",
          "Ou scannez le QR code d'une étiquette avec un téléphone connecté à votre compte : un bouton fait passer la pièce à l'étape suivante.",
          "Cliquez « Actualiser » pour relire l'avancement.",
        ],
        tip: "L'avancement est gardé par le serveur, donc partagé entre l'atelier et l'ordinateur.",
      },
      {
        keys: ["data-workshop:quote"], name: "Devis",
        what: "Chiffre matières, chants, découpe, montage et quincaillerie d'après la liste de débit, en dirhams marocains (MAD).",
        steps: [
          "Cliquez « Devis ».",
          "Ouvrez « Tarifs (indicatifs, modifiables) » et corrigez les prix, « Chutes », « Marge » et « TVA » ; le devis se recalcule. Les tarifs de l'atelier (chutes, chant, découpe, montage, taux horaire, marge, TVA) sont grisés si votre compte n'est pas du personnel de l'atelier ; les prix des matières et de la quincaillerie restent modifiables.",
          "Cliquez « Exporter en CSV » ou « Imprimer / PDF ».",
          "Ouvrez « Versions du devis » pour garder le devis initial puis des avenants, avec les écarts entre eux.",
        ],
        tip: "« Scénario : et avec une autre matière ? » compare le prix si une matière en remplaçait une autre. Les tarifs sont retenus par le navigateur.",
      },
      {
        keys: ["data-workshop:assistant"], name: "Assistant de modélisation",
        what: "Vous décrivez en français ce que vous voulez construire ou modifier ; Claude propose des actions, vous décidez de les appliquer.",
        steps: [
          "Cliquez « Assistant de modélisation » et écrivez votre demande dans la zone de texte, ou cliquez un exemple.",
          "Cliquez « Envoyer » (⌘ ou Ctrl + Entrée marche aussi).",
          "Lisez la réponse et la liste numérotée des actions proposées.",
          "Cliquez « Appliquer » pour les faire, en une seule annulation.",
        ],
        tip: "Rien ne change sans votre clic sur « Appliquer ». Les actions que le modèle ne sait pas faire sont refusées avec un message. La conversation est perdue en quittant la page.",
      },
      {
        keys: ["data-workshop:share"], name: "Lien client",
        what: "Crée un lien où le client voit le meuble en 3D, le pose chez lui en réalité augmentée et laisse des commentaires, sans compte.",
        steps: [
          "Cliquez « Lien client » et vérifiez le titre du lien.",
          "Cochez « Afficher le prix TTC du devis », « Permettre les commentaires » et « Permettre au client d'accepter ce projet en ligne » selon le cas.",
          "Cliquez « Créer un lien client » : le lien est copié ; « Copier » et « QR » le redonnent.",
          "« Révoquer » coupe l'accès à un lien.",
        ],
        tip: "Le lien montre le meuble tel qu'il est à cet instant : créez-en un nouveau après un changement. Avec au moins deux configurations (Paramètres), vous pouvez proposer chaque variante avec son prix. Quand le client accepte, son nom, la date, la variante et le prix s'affichent sous le lien, et un commentaire vous prévient : c'est un accord de principe, pas une signature électronique.",
      },
      {
        keys: ["data-workshop:comments"], name: "Commentaires des clients",
        what: "Liste ce que vos clients ont écrit sur le lien partagé et permet de répondre.",
        steps: [
          "Cliquez « Commentaires des clients » (le bouton s'entoure d'orange quand il y a du nouveau).",
          "Cliquez « Voir » sur un commentaire pour montrer dans la vue le point visé du meuble.",
          "Écrivez votre réponse en bas et cliquez « Envoyer ».",
          "Cochez la case « Traité » quand c'est réglé.",
        ],
        tip: "Les commentaires viennent d'un lien créé avec « Permettre les commentaires » coché.",
      },
    ],
  },
];
