# CAO Studio

Application web de conception mécanique paramétrique : Django (comptes, projets, versions)
+ éditeur 3D TypeScript (Three.js) + noyau B-rep exact OpenCascade (WASM, via replicad)
exécuté dans un Web Worker.

**État : phase 5 (opérations solides).** Noyau B-rep, historique paramétrique,
enregistrement, éditeur 3D, esquisses 2D contraintes (solveur planegcs), extrusion, révolution,
congés, chanfreins, combinaison de corps et perçages sur face fonctionnent.

## Installation (macOS)

Prérequis : Python 3.12 ou plus récent (Django 6.1), Node.js 20 ou plus récent (testé avec 24).

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install
.venv/bin/python manage.py migrate
npm run build                 # typecheck + Tailwind (static/css) + Vite (static/js)
.venv/bin/python manage.py createsuperuser   # ou /accounts/signup/
.venv/bin/python manage.py runserver 127.0.0.1:8765
```

Ouvrir http://127.0.0.1:8765/ → « Mes projets » → créer un projet. Chaque nouveau projet
contient la plaque de référence.

Développement (recompilation continue, dans deux terminaux) :

```bash
npm run watch:css
npm run watch:js
```

## Tests

```bash
.venv/bin/pytest          # backend Django : modèles, validation, API, CSRF, pages
npm test                  # Vitest : noyau OpenCascade et solveur planegcs réels, esquisses, historique
npm run typecheck         # TypeScript strict
.venv/bin/python manage.py check --deploy   # avec DJANGO_DEBUG=false et DJANGO_SECRET_KEY
```

Le test de référence (`tests/frontend/reference-plate.test.ts`) construit une plaque de
80 × 50 × 10 mm avec un perçage Ø10 et vérifie :

- le volume exact (40 000 − 250π mm³), l'aire, l'encombrement et la validité BRepCheck ;
- le recalcul quand la largeur passe à 60 mm, ainsi que le recalcul incrémental (seules les
  opérations en aval sont reconstruites) ;
- les erreurs explicites : diamètre nul, perçage hors du corps, plaque coupée en deux ;
- l'export STEP réimporté au même volume, et l'export STL binaire.

## Architecture

| Dossier | Rôle |
|---|---|
| `config/` | Réglages Django (variables d'environnement, SQLite par défaut, PostgreSQL via `POSTGRES_*`) |
| `apps/accounts/` | Connexion, déconnexion, inscription |
| `apps/projects/` | Projets, versions immuables avec checksum, API JSON, validation des documents |
| `templates/` | Pages Django + Tailwind ; `editor/editor.html` charge l'éditeur |
| `frontend/src/document/` | Format natif `cao-studio` v1, validation, éditions pures (annulables) |
| `frontend/src/geometry/` | Adaptateur du noyau, worker, protocole worker ↔ interface |
| `frontend/src/features/` | Constructeurs d'opérations : esquisse, extrusion, perçage |
| `frontend/src/constraints/` | Solveur planegcs (DDL, redondances, conflits), catalogue des contraintes |
| `frontend/src/sketcher/` | Repères de plan, outils de dessin, accrochage, profils fermés, rendu et mode esquisse |
| `frontend/src/history/` | Recalcul incrémental (cache par clé de dépendances), annuler/rétablir |
| `frontend/src/viewport/` | Scène Three.js en Z vers le haut, grille adaptative, gizmo, vues, sélection de faces |
| `frontend/src/ui/`, `app/` | Arbre, propriétés, session (enregistrement automatique, récupération) |
| `frontend/src/io/` | Export STEP/STL, import/export du format natif `.cao.json` |
| `frontend/src/persistence/` | API Django (CSRF, conflits de version), copie locale de secours |

Principes :

- Le document stocke l'historique paramétrique, jamais de maillage. Toutes les longueurs sont
  stockées en mm ; `units` ne sert qu'à l'affichage (cm par défaut pour un nouveau projet, ou mm, m,
  pouce).
- La géométrie est calculée dans le navigateur. Django ne reçoit que des documents complets :
  enregistrement automatique 4 s après une modification, manuel avec ⌘S, et envoi
  `keepalive` à la fermeture de la page.
- Chaque enregistrement crée une version. Un `base_version` périmé renvoie 409 et la copie
  locale est conservée.
- Une opération en échec est signalée dans l'arbre, ses dépendantes sont marquées
  « bloquées », et le dernier corps valide reste affiché.

## Esquisses (phase 4)

Le format natif v2 décrit une esquisse par des points, des courbes (ligne, cercle, arc, éventuellement
en construction) et des contraintes. Les documents v1 sont migrés automatiquement au chargement, et le
serveur accepte les deux versions.

- **Création** : « Esquisse » puis le plan XY, XZ ou YZ (avec décalage le long de la normale). « Modifier
  l'esquisse » rouvre une esquisse existante.
- **Esquisse sur une face** :
  - avec une face plane sélectionnée, « Esquisse » (ou « Esquisse sur la face » dans le panneau
    Sélection) démarre directement sur cette face, sans choix de plan ;
  - le contour de la face et ses trous sont projetés en violet comme géométrie de référence fixe, sur
    laquelle on s'accroche : tracer sur les coins projetés reproduit exactement les mesures du corps ;
  - l'extrusion d'une telle esquisse propose par défaut une union avec le corps de la face.
  - Limites : seules les faces parallèles aux plans XY, XZ et YZ sont prises en charge, et la
    projection n'est pas associative (si le corps change, l'esquisse ne suit pas).
- **Outils** : sélection (S), ligne et polyligne (L), rectangle (R), cercle (C), arc par centre (A),
  décalage (O), construction (X).
- **Décalage** (touche O, bouton « Décalage ») : copie parallèle de lignes, segments, arcs, cercles,
  polylignes et contours fermés, calculée par OpenCascade (`BRepOffsetAPI_MakeOffset`) :
  - cliquez les éléments (un clic prend toute la chaîne connectée, ou un seul élément si « Sélection en
    chaîne » est décochée), ou sélectionnez-les avant d'ouvrir l'outil ;
  - une flèche apparaît sur la forme sélectionnée : tirez-la pour régler la distance et le côté (vers
    l'extérieur ou l'intérieur d'un contour fermé), cliquez sa valeur pour la saisir à la calculatrice ;
    le champ « Distance » du panneau fait la même chose, et « Inverser » change le côté ;
  - « Direction » : un côté, ou deux côtés (une copie de chaque côté, à la même distance) ;
  - pour un contour fermé, positif = extérieur ; pour une chaîne ouverte, positif = à gauche du sens de
    tracé ;
  - coins arrondis (arc autour du coin) ou vifs (prolongés jusqu'à leur intersection) ;
  - l'aperçu est le résultat réel du noyau, recalculé à chaque changement ; OK (Entrée) ajoute les
    courbes à l'esquisse en une seule étape d'annulation, Échap annule ; l'original est conservé ;
  - une distance qui fait disparaître la forme, ou une auto-intersection que le noyau ne sait pas
    couper, donne un message d'erreur au lieu d'une géométrie fausse ;
  - appliqué aux arêtes projetées d'une face, il donne un profil réel (retrait de poche, rebord) ;
  - le décalage n'est pas associatif : si l'original change ensuite, la copie ne suit pas.
- **Accrochage** : un clic sur un point existant le réutilise comme sommet partagé ; un clic sur une
  courbe ajoute une contrainte « point sur courbe » ; un segment presque horizontal ou vertical reçoit la
  contrainte correspondante.
- **Grille** : le dessin s'accroche aux lignes de la grille affichée (touche G ou bouton « Grille » pour
  l'activer ou la couper, choix mémorisé) ; le pas suit le zoom (1, 10, 100 mm…) et les lignes passent
  par l'origine de l'esquisse. Un point ou une courbe existants gardent la priorité sur la grille.
  Le déplacement d'un point à la souris s'accroche aussi.
- **Contraintes** : coïncidence, horizontale, verticale, parallèle, perpendiculaire, tangence, égalité,
  symétrie (par rapport à un point ou une ligne), concentricité, fixation, point sur courbe, milieu.
  Seules celles qui s'appliquent à la sélection en cours sont actives.
- **Cotes** (D) : longueur, distance, distances horizontale et verticale signées, distance point-ligne,
  angle, rayon et diamètre. Une cote est créée avec la valeur mesurée, puis se modifie dans le panneau ou
  en cliquant son étiquette.
- **Résolution** : toute modification est résolue avant d'être enregistrée. Une modification qui rend
  l'esquisse impossible (contraintes en conflit) est refusée avec la liste des contraintes en cause. Les
  redondances sont signalées. L'état affiché est « Entièrement contrainte », « n DDL » ou « Redondante ».
- **Glisser** un point déplace la géométrie en respectant les contraintes ; le geste entier compte comme
  une seule étape d'annulation.
- **Profils** : les boucles fermées non construction suivent la règle pair-impair (une boucle intérieure
  fait un trou). Un profil ouvert ou ramifié est signalé avec la position du sommet fautif.
- **Cotes à l'écran**, style mise en plan :
  - le texte n'a pas de cadre et suit la ligne de cote : vert pour une cote pilotante, gris entre
    parenthèses pour une simple mesure ;
  - les cotes posées restent toujours affichées ; un clic sur la valeur ouvre la calculatrice, un
    glisser déplace la cote (sa position est enregistrée) ;
  - pendant le tracé, les dimensions de la forme s'affichent en direct.
- **Outil « Cote »** (touche D) : cliquez une ligne, un cercle, ou deux éléments (deux lignes, deux
  points, point et ligne, deux cercles). Leur mesure apparaît (distance, distance entre lignes
  parallèles, angle, entraxe) ; un clic dessus la transforme en cote. Hors de cet outil, cliquer une
  ligne la sélectionne seulement.
- **Symboles de contraintes** (H, V, ∥…) : masqués par défaut, affichés avec le bouton
  « Contraintes ». Une contrainte en conflit reste toujours visible en rouge.
- Les profils fermés sont légèrement teintés et la grille s'affiche sur le plan de l'esquisse.
- **Extrusion**, comme dans Fusion 360 :
  - le bouton (ou la touche E) surligne les profils fermés ;
  - chaque zone fermée de l'esquisse est un profil à part : pour deux rectangles imbriqués, le cadre
    entre les deux et le milieu se choisissent séparément (un îlot dans un trou aussi) ; par défaut
    les zones pleines sont extrudées, le premier clic en choisit une seule, les suivants en ajoutent
    ou en retirent ; si des esquisses se superposent dans le même plan, l'esquisse choisie passe
    d'abord, puis la plus petite zone ;
  - les zones choisies sont mémorisées par un point intérieur ; si l'esquisse change au point
    qu'une zone n'existe plus, l'extrusion le dit au lieu de produire une forme fausse ;
  - on clique un profil, puis on tire la flèche le long de la normale, ou on clique la valeur à son
    extrémité pour la saisir ;
  - l'aperçu est translucide ;
  - le panneau compact, à droite de la vue, règle l'opération (nouveau corps, union, soustraction) et
    le corps cible ;
  - Entrée valide, Échap annule ;
  - « Modifier avec la flèche » rouvre une extrusion existante.

## Opérations solides (phase 5)

Tous les outils s'ouvrent dans un panneau compact à droite de la vue. Ils affichent un aperçu
calculé par le vrai noyau (seule la nouvelle opération est recalculée). OK ou Entrée valide,
Annuler ou Échap abandonne. « Modifier dans la vue », dans les propriétés, rouvre l'outil d'une
opération existante.

- **Révolution** : un profil fermé, un axe (axe X ou Y de l'esquisse, ou une ligne de l'esquisse,
  de préférence en construction), un angle de 0 à 360°, puis l'opération.
- **Congé et chanfrein** : cliquez les arêtes, cliquez à nouveau pour en retirer une. Le rayon ou
  la distance se règle au clavier ou à la calculatrice.
- **Combiner** : union, soustraction ou intersection d'un corps cible avec un ou plusieurs corps
  outils. Les corps outils peuvent être conservés.
- **Perçage** : cliquez une face plane ; le trou est percé perpendiculairement à la face, traversant
  ou à une profondeur donnée.
- **Intersection** : disponible aussi pour l'extrusion et la révolution.
- **Sélection dans le modèle 3D** :
  - un clic sur une arête ou une face la sélectionne ; un nouveau clic la retire, un clic dans le vide
    vide la sélection ;
  - le filtre de la barre d'outils choisit ce qu'un clic sélectionne : « Auto » (arête en priorité,
    sinon face), « Faces », « Arêtes » ou « Corps » (le corps entier, avec « Combiner » pour plusieurs
    corps). Le choix est mémorisé ;
  - la cote de chaque arête sélectionnée s'affiche dans la vue (longueur, Ø ou R) ;
  - le panneau « Sélection » donne les mesures et propose les actions : congé ou chanfrein sur les
    arêtes, extrusion ou perçage sur les faces.
- **Extrusion de faces** (pousser-tirer) :
  - sélectionnez une ou plusieurs faces planes, puis Extrusion ;
  - tirez la flèche (ajout de matière) ou poussez-la (creusement), ou cliquez sa valeur pour la saisir.

**Références topologiques.** Une arête ou une face choisie est enregistrée par :
- son type (droite, cercle, plan…) ;
- sa direction ;
- sa position relative à la boîte englobante du corps.

Ainsi un congé posé sur les arêtes verticales des coins reste sur ces arêtes quand la plaque
s'élargit, et un perçage sur une face latérale suit cette face si la pièce s'allonge. Si aucune
arête ne correspond plus, l'opération passe en erreur avec le message « … introuvable après
recalcul : sélectionnez-la à nouveau » ; elle ne choisit jamais une autre arête en silence.

## Utilisation de l'éditeur

- **Esquisses visibles** : les esquisses restent affichées dans la vue 3D (nettes devant les corps,
  atténuées à travers) ; l'icône œil à côté de chaque esquisse, dans l'arbre, la masque ou la réaffiche.
  Le choix est enregistré avec le document (champ `hidden`) et s'annule comme le reste ; il ne
  recalcule rien. Les lignes de construction et les arêtes projetées ne sont pas dessinées.
- **Arbre** : sélectionner une opération, la désactiver (●/◌) ou la supprimer (✕). Supprimer
  un perçage relie les perçages suivants au corps précédent.
- **Propriétés** : saisir les cotes dans l'unité d'affichage (virgule acceptée), puis Entrée
  pour recalculer.
- **Plaque** : nouveau corps (esquisse rectangle + extrusion).
- **Perçage** : Ø10 traversant au point cliqué sur une face, sinon au centre du corps.
- **Raccourcis** : ⌘Z / ⇧⌘Z annuler/rétablir, ⌘S enregistrer, H perçage, F ajuster, Échap
  désélectionner, Suppr supprimer l'opération sélectionnée.
- **Navigation** : clic gauche pour l'orbite, clic droit ou molette-clic pour le panoramique,
  molette pour le zoom. Au doigt : un doigt pour l'orbite, deux doigts pour le zoom et le
  panoramique.
- **Petits écrans** (moins de 1024 px) : l'arbre et les propriétés s'ouvrent en feuilles
  basses.

## Limites connues (incrément 1)

- **Esquisses** :
  - Pas d'ellipse ni de polygone régulier.
  - Pas d'ajustement ni de prolongement de courbes.
  - Pas de détection des auto-intersections : les profils qui se croisent sont refusés par le noyau.
  - Les DDL sont globaux, il n'y a pas de couleur par entité.
  - Un îlot dans un trou donne un second solide, refusé (une extrusion produit un seul corps).
- **Décalage** : 2D seulement. Le noyau sait décaler une face 3D, mais le résultat est une surface
  (coque sans volume) et le modèle ne gère que des corps solides ; pour déplacer une face, utiliser
  l'extrusion de face.
- **Plans** : seul le plan XY est exposé dans l'interface. Le perçage suit toujours l'axe −Z
  depuis le dessus du corps.
- **Références topologiques** : la correspondance est heuristique (type, direction, position
  relative). Une modification qui change fortement la forme (par exemple ajouter des arêtes au
  même endroit relatif) peut demander de resélectionner les arêtes.
- **Congés et chanfreins** : rayon ou distance constants ; pas de congé à rayon variable ni de
  chanfrein à deux distances dans l'interface.
- **Chargement** : le noyau WASM pèse 23 Mo (7,3 Mo en gzip). Le premier chargement prend
  plusieurs secondes. En production, il faut servir les fichiers compressés (Brotli/gzip) et
  les mettre en cache (service worker PWA, phase 9).
- **PostgreSQL** : chemin non testé ; ajouter `psycopg[binary]` si `POSTGRES_DB` est défini.
- **Non encore implémenté** : DXF, SVG, PDF, mise en plan et assemblages.

## Dépendances et licences

| Paquet | Version | Licence |
|---|---|---|
| Django | 6.1.2 | BSD-3-Clause |
| three | 0.186 | MIT |
| replicad | 1.1.0 | MIT |
| replicad-opencascadejs (OCCT WASM) | 1.1.0 | LGPL-2.1 |
| @salusoft89/planegcs (solveur FreeCAD, WASM) | 1.3.0 | LGPL-2.0-or-later |
| tailwindcss | 4.3 | MIT |
| vite / vitest / typescript | 8.3 / 5.0 / 7.0 | MIT / MIT / Apache-2.0 |

OpenCascade et planegcs sont distribués sous forme de fichiers `.wasm` séparés, non modifiés et
remplaçables (`static/js/assets/*.wasm`), ce qui respecte la LGPL. Conserver leurs notices de
licence lors d'une distribution.
