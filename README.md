# CAO Studio

Application web de conception paramétrique de meubles : Django
(comptes, projets, versions, catalogue de l'atelier) + éditeur 3D TypeScript (Three.js) + noyau B-rep exact
OpenCascade (WASM, via replicad) exécuté dans un Web Worker.

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
.venv/bin/python manage.py compte <nom>      # crée un compte (l'inscription libre est fermée)
.venv/bin/python manage.py runserver 127.0.0.1:8765
```

Ouvrir http://127.0.0.1:8765/ → la **page d'accueil** (`/projects/`, lien « Accueil » de l'en-tête) a deux
cartes, chacune avec sa photo (un meuble télé et une cuisine, `static/img/accueil/`) et son titre centré :
**Conception 3D** (nommer le projet, « Créer et ouvrir », ou « Ouvrir le projet exemple ») et **Conception Cuisine & Dressing** (nommer une
cuisine ou un dressing, puis « Créer une cuisine » ou « Créer un dressing » : le projet s'ouvre dans l'éditeur sur
l'onglet Cuisine ou Dressing, son plan à droite, `?onglet=kitchen`). Dessous, « Mes projets » : les dossiers, la
recherche, et **chaque projet en carte** — l'image de son modèle (prise par l'éditeur après un enregistrement,
`app/project-preview.ts`), ou le dessin de son espace tant qu'il n'en a pas, son statut, son client, son dossier, sa dernière version,
son devis ; un clic sur la carte l'ouvre, « Fiche » et la corbeille sont dessus (`templates/projects/_project_card.html`). Chaque
nouveau projet contient la plaque de référence ; « Ouvrir le projet exemple » crée un caisson de cuisine (mélaminé
chêne, fond HDF) pour découvrir la liste de débit, le calepinage, la mise en plan, l'export DXF et le devis. Dans
l'éditeur, le bouton **Aide** à côté d'Enregistrer (ou touche **?**) ouvre la prise en main, tous les raccourcis
clavier et une fiche par outil, avec une recherche : à quoi il sert, comment s'en servir, où le trouver.

**Un projet par espace.** Chaque projet est un **projet 3D**, une **cuisine** ou un **dressing** (un placard compris) :
il s'ouvre sur son onglet (Conception 3D, Cuisine, Dressing), et une cuisine ou un dressing neuf démarre vide, son
plan à droite. L'onglet d'un autre espace n'affiche pas le projet ouvert : depuis un placard, « Cuisine » propose
d'**ouvrir une cuisine** existante ou d'en **créer une nouvelle**, dans un autre onglet de projet ; le placard reste
dans son projet (`app/space-switch.ts`). Ses outils peuvent tout de même servir dans ce projet-ci, sur demande
(« Utiliser les outils Cuisine dans ce projet-ci »). L'espace se voit dans la liste « Mes projets » et se change sur la
fiche du projet ; les projets d'avant les espaces ont été classés d'après leur contenu et leur nom (un plan de cuisine,
de l'électroménager ou « cuisine » : une cuisine ; un plan de dressing, des Répartitions, « dressing » ou « placard » :
un dressing ; sinon un projet 3D).

**Dossiers de projets** : sur « Mes projets », « + Nouveau dossier » en crée un (200 au plus par compte) ; on coche des
projets, on choisit le dossier dans « Ranger dans… » puis « Ranger » (ou « Sans dossier » pour les en sortir). Un clic
sur un dossier ne montre que ses projets, avec leur nombre ; « Sans dossier » ceux qui n'en ont pas. Le dossier montré
se renomme ou se supprime : ses projets restent, sans dossier. Chaque compte n'a que les siens (`apps/projects/folders.py`).

**Le suivi des affaires.** Chaque projet a sa **fiche** (bouton « Fiche » de la liste, ou « Fiche du projet » du menu
du nom dans l'éditeur, `/projects/<id>/fiche/`) : le **client** (nom, téléphone, e-mail, adresse du chantier), le
**statut** — Esquisse, Devis envoyé, Accepté, En fabrication, Posé, Sans suite —, la **date de pose prévue**, des
**notes**, le **montant du devis** et les liens envoyés au client (avec son accord). Le montant est celui que l'éditeur
calcule aux tarifs de l'atelier : il l'envoie au serveur quand il change (`POST /api/projects/<id>/price/`, sans
changer la date de modification). Le statut avance aussi tout seul : un **lien client** créé fait passer une esquisse
à « Devis envoyé », l'**accord du client** sur son lien la fait passer à « Accepté ». Sur l'accueil, la liste « Mes
projets » est un **tableau de bord** : une case par statut avec son nombre (et la somme des devis envoyés, acceptés et
en fabrication) ; un clic n'y montre que ces projets ; une recherche sur le nom du projet ou du client ; chaque ligne
montre son statut, son client, sa date de pose et son montant (`apps/projects/views.py`,
`templates/projects/project_sheet.html`).

Le **guide illustré** (http://127.0.0.1:8765/guide/, lien « Guide » de l'en-tête, ou « Guide illustré » du menu
« ⋯ » de l'éditeur) suit une cuisine et un dressing de l'accueil au devis, avec des captures des vrais écrans :
l'accueil et ses affaires, le plan de cuisine, la cuisine proposée, un linéaire, l'électroménager, la liste de débit,
le devis, la fiche du projet, un dressing rempli et les paramètres de l'atelier (`templates/guide.html`,
`static/guide/`). Les captures se refont d'une commande après un changement de l'interface :
`GUIDE=1 npx playwright test tests/e2e/guide.spec.ts`.

Chaque projet a un bouton **Supprimer** ; on peut aussi en cocher plusieurs (ou « Tout sélectionner ») et les
supprimer ensemble avec **« Supprimer la sélection »**. La page demande confirmation : un projet part avec ses
versions et ses liens partagés (seul son propriétaire peut le supprimer ; `static/home/home-delete.js`).

Les **paramètres de l'atelier** se gèrent dans l'application, http://127.0.0.1:8765/catalogue/ (lien « Paramètres »
de l'en-tête, ou « Paramètres de l'atelier » du menu du nom du projet dans l'éditeur ; connexion requise) : un onglet
par partie — **matériaux** (liste, ajout, modification, suppression ; un seul par défaut), **quincaillerie** (articles
et quantité automatique), **tarifs du devis** (chutes, chant collé, découpe et perçage par pièce, montage par pièce,
taux horaire, trou percé, marge, TVA : gardés par le serveur, les **mêmes sur tous les ordinateurs** ; les changer dans
le devis de l'éditeur les change ici aussi, `POST /api/catalog/rates/` ; des tarifs réglés dans un navigateur avant
sont repris tant que le serveur a ceux d'origine) et **profil de l'atelier** (coordonnées et logo des documents
imprimés). Les prix des matières et de la quincaillerie changés dans le devis restent ceux du navigateur ; les
standards de construction se règlent dans l'éditeur. Ces paramètres sont communs à tous les comptes : **seul le
personnel de l'atelier** les modifie (pages, `POST /api/catalog/rates/` : 403 sinon) ; les autres comptes les lisent,
sans boutons pour les changer, et dans le devis de l'éditeur les tarifs de l'atelier sont grisés (`GET /api/catalog/`
dit `canEdit`). Un compte entre dans le personnel par `python manage.py personnel <nom>` (`personnel` seul : la
liste ; `--retirer` : l'en sort). Les suppressions
demandent confirmation dans la page (`static/home/confirm.js`). Il est garni au premier `migrate` ; l'administration
Django reste disponible pour un superutilisateur. Ce que l'éditeur en fait :

- **Catalogue de l'atelier** (`apps/catalog`, pages `/catalogue/`, `GET /api/catalog/`) : les **matières** (nom,
  épaisseur, famille — mélaminé, bois, verre, marbre, pierre, métal, stratifié, uni —, format de plaque, prix au m²),
  23 au départ (aggloméré, MDF laqué, chênes, noyer, hêtre, marbres, quartz, granit, inox, aluminium, verres, béton
  ciré, terrazzo, laqués) ; les **règles de quincaillerie** à quantité automatique (par caisson, par porte, charnières
  selon la hauteur des portes, par étagère, par niche, par côté ou cloison), 9 au départ ; le **profil de l'atelier**
  (nom, slogan, adresse, téléphone, e-mail, site, logo). L'éditeur les charge à l'ouverture : les matières du
  catalogue s'ajoutent aux matières intégrées partout où on en choisit une (Matière et chants, Remplacer partout,
  Implantation…) avec leur prix dans les tarifs du devis ; les règles ajoutent au devis les articles comptés d'après
  le meuble ; le profil fait l'**en-tête** de tous les documents imprimés (liste de débit, calepinage, devis, fiches,
  notice, étiquettes ; pas la mise en plan ni le dossier client, qui ont leur mise en page). Sans serveur à jour, les
  matières intégrées seules (`document/catalog.ts`, `persistence/catalog.ts`).
- **Rayons X** (colonne Vue, sous « Grille ») : les corps translucides pour voir l'intérieur d'un meuble sans rien
  cacher (`app/display-toggles.ts`).
- **Affichage par famille** (colonne Vue, à côté) : une case par famille de corps — façades, carcasse, fonds,
  étagères, plinthes et socles, pièce (murs), électroménager, autres —, **Vue de travail** (façades, murs et
  électroménager cachés d'un clic) et **Tout afficher**. La vue seulement : le document, le débit et le devis ne
  changent pas ; retenu par le navigateur (`document/display-families.ts`).
- **Isoler la sélection** (bouton de la colonne Vue, touche **I**, ou clic droit → « Isoler la sélection ») : les
  éléments choisis — un clic, puis Ctrl ou Maj + clic pour en ajouter, une fenêtre de sélection ou le navigateur —
  restent seuls dans la vue pour y travailler, les autres cachés, comme « Isoler » de Fusion. Un élément est le meuble
  entier dont on a choisi une pièce, une face ou une arête : un caisson avec ses façades, une Répartition avec ses
  panneaux et ses niches, sinon le corps lui-même (`elementOf`). La vue garde son sens et se cadre sur eux ; tous les
  outils marchent, ceux de niche dans chacune des Répartitions isolées, et ce qu'on crée pendant ce temps se voit
  aussi. Une barre en bas dit ce qui est isolé (« 3 éléments isolés ») ; « Tout montrer », ou I sans sélection, rend
  le reste. Tant que des éléments sont isolés, les murs ne sont plus masqués d'eux-mêmes. La vue seulement
  (`app/isolate-selection.ts`, `app/zone-view.ts`).
- **Murs qui cachent la vue masqués** (case du menu Affichage, cochée d'office, ou bouton « Cacher les murs qui gênent
  la vue » de la colonne à droite de la vue : relâché, murs et caissons restent tous affichés) : la vue tournée, le mur qui se
  trouve entre l'œil et la pièce n'est plus dessiné, et un clic le traverse ; il revient dès qu'on repasse devant
  lui. Un mur est reconnu à sa forme (une dalle verticale, mince et haute) parmi les corps de la pièce : ceux d'un
  plan de cuisine ou de dressing, ou d'une pièce relevée. Le sol reste.
  - **avec leurs meubles** (seconde case, cochée d'office) : les meubles du mur masqué, dont on ne verrait que le dos,
    s'effacent avec lui, **entiers et eux seuls**. Un meuble est celui du mur auquel il tourne le dos
    (`document/furniture-facing.ts`) : un caisson de cuisine et ses façades, un appareil, un caisson de dressing, et
    tout ce qu'un linéaire a fait avec ses caissons (plan de travail, crédence, plinthe, fileurs), ses finitions. Les
    meubles des autres murs restent entiers, même dans l'angle ; l'îlot aussi.
  - **Dans un dressing** de même : la zone du mur masqué (sa Répartition, ses étagères, cloisons, penderies, tiroirs,
    portes et fond) s'efface avec lui, le tracé de son esquisse aussi ; les zones des autres murs restent entières. Ce
    qui ferme une zone autour de sa Répartition (le côté d'un angle, sa porte et ses charnières, un fileur) est de
    cette zone : le côté de l'angle gauche reste avec l'angle quand la zone du mur B s'efface, comme celui de droite. Ce
    qui équipe une zone sans avoir de sens à soi — charnières, portes coulissantes, accessoires, lumières — va avec le
    meuble sur lequel il se trouve (`pieceOf` : à moins de 15 cm de sa boîte). **Sans pièce** (aucun mur dessiné),
    chaque Répartition du dressing fait office de mur : la vue tournée de façon à voir son dos (l'œil passé derrière
    sa face arrière, vu de dessus), elle s'efface entière, avec tout ce qu'elle porte, celle qu'on voit le plus de dos
    d'abord, jamais tout le dressing (`piecesInTheWay`, `piecesOut`) ; elle revient dès qu'on repasse devant.
  - Les meubles d'un mur masqué s'effacent toujours avec lui, même s'il ne reste plus rien d'autre à regarder : un
    dressing ou une cuisine sur un seul mur, vu de derrière ce mur, s'efface avec lui ; derrière l'angle d'une cuisine
    en L, les rangées des deux murs masqués s'effacent.
  - Les cadres du contrôle en direct des pièces masquées s'effacent aussi. La vue seulement ; retenu par le navigateur
    (`viewport/wall-cutaway.ts`, `app/wall-cutaway.ts`).
- **Un fond contre un mur ne le traverse plus par plaques** : un panneau de fond, un caisson ou un meuble posé contre
  un mur de la pièce est dans son plan même, et la carte graphique, ne sachant lequel dessiner devant, les mêlait par
  taches (le blanc du mur dans le beige du fond). Les murs de la pièce sont dessinés un rien en retrait (`setBehind`,
  `viewport/body-layer.ts`) : ce qui est contre eux se voit entier. La vue seulement ; le document n'en change pas.
- **Contrôle d'implantation** (dans le Contrôle avant fabrication, et dans le panneau Implantation de cuisine avant
  l'OK) : meuble ou appareil qui sort de la pièce relevée, plaque sans plan de travail, hotte au-dessus d'aucune
  plaque, trop basse (moins de 60 cm) ou trop haute (plus de 80 cm ; 65 à 75 conseillés), plaque à moins de 60 cm de
  l'évier, moins de 80 cm devant un four, un réfrigérateur, un lave-vaisselle ou un lave-linge, meuble haut à moins de
  45 cm au-dessus de la plaque, tringle de penderie hors de 170 à 190 cm (`document/layout-check.ts`,
  `app/workshop/layout-check.ts`).

Développement (recompilation continue, dans deux terminaux) :

```bash
npm run watch:css
npm run watch:js
```

## Tests

Deux niveaux, à lancer d'un mot :

```bash
npm run test:rapide       # build, Vitest, backend, et les 9 parcours marqués @rapide (environ 2 minutes)
npm run test:tout         # build, Vitest, backend, et tous les parcours du navigateur (environ 12 minutes)
```

La série rapide pour chaque changement ; la suite complète avant chaque commit. Le détail :

```bash
.venv/bin/pytest          # backend Django : modèles, validation, API, CSRF, pages
npm test                  # Vitest : noyau OpenCascade et solveur planegcs réels, esquisses, historique
npm run typecheck         # TypeScript strict
npm run test:e2e          # Playwright : parcours dans un vrai navigateur (après npm run build)
npm run test:e2e:rapide   # les parcours essentiels seulement ({ tag: "@rapide" })
GUIDE=1 npx playwright test tests/e2e/guide.spec.ts   # refait les captures du guide (static/guide/)
.venv/bin/python manage.py check --deploy   # avec DJANGO_DEBUG=false et DJANGO_SECRET_KEY
```

Les tests de bout en bout (`tests/e2e/`) lancent leur propre serveur Django sur le port 8799 avec une base à part
(`.e2e/db.sqlite3`, recréée à chaque fois) : ouvrir un projet, tracer une ligne dans une esquisse et la retrouver
après rechargement, ouvrir le projet exemple (six panneaux, devis, aide), la liste de débit. En local ils utilisent
Google Chrome ; la CI installe Chromium.

**Intégration continue** (`.github/workflows/ci.yml`, à chaque push) : types, styles et build, tests Vitest, tests
Playwright, migrations à jour, `check --deploy` et tests backend sur PostgreSQL.

## Mise en production

- **Sécurité par défaut** : sans `DJANGO_DEBUG`, le serveur (`wsgi.py`, `asgi.py`) tourne en production — la clé
  secrète est alors exigée. Seul `manage.py` (les commandes du développement, dont `runserver`, et les tests par
  `config/settings_test.py`) se met en mode debug s'il n'est pas réglé. Une **Content-Security-Policy** est envoyée
  sur chaque page (`CONTENT_SECURITY_POLICY` dans `config/settings.py`) : seuls les scripts du site, et ceux de
  `base.html` par leur nonce, s'exécutent ; le WebAssembly du noyau est permis. `DJANGO_CSP_REPORT_ONLY=true` la fait
  seulement signaler par les navigateurs, sans l'appliquer, pour l'essayer d'abord sur un déploiement. Les événements
  de sécurité (refus CSRF, hôte refusé, connexion refusée) sont écrits dans le journal (`django.security`,
  `apps.security`). Les **tentatives de connexion** sont limitées (`apps/accounts/throttle.py`) : après 5
  échecs sur un même nom, ou 30 depuis une même adresse, en 15 minutes, la connexion attend la fin de ces 15 minutes,
  sur la page de connexion comme dans l'administration ; une connexion réussie remet le compte de son nom à zéro.
  **Plafonds par compte** (`apps/projects/quotas.py`) : 500 projets, 2 Go en tout (versions, modèles des liens clients,
  bibliothèque), 50 liens clients actifs de 40 Mo au plus (modèle et variantes), 5 000 pièces suivies par projet ;
  rien n'est effacé pour faire de la place, ce qui dépasse est refusé avec ce qu'il faut faire. Les modèles 3D publics
  d'un lien se téléchargent 120 fois au plus en 10 minutes depuis une même adresse. **L'inscription libre est
  fermée** (`SIGNUP_OPEN`) : `/accounts/signup/` dit de demander un compte à l'atelier, et les pages n'y mènent plus ;
  le personnel crée les comptes (`manage.py compte <nom>`, le mot de passe est demandé deux fois ; `--mot-de-passe`
  le change). `DJANGO_SIGNUP_OPEN=1` la rouvre (le serveur des tests e2e s'en sert). **Mon compte** (`/accounts/`,
  le nom du compte dans l'en-tête) : changer son mot de passe (l'ancien, puis le nouveau deux fois), télécharger le
  ZIP de toutes ses données (la dernière version de chaque projet en `.cao.json` à réimporter, fiches, clients,
  historiques, commentaires, liens clients sans leurs jetons, modules, chutes, fabrication groupée ; 5 exports en
  10 minutes au plus), supprimer son compte avec son mot de passe et une case à cocher (tout ce qu'il possède part
  avec lui ; un compte du personnel ne se supprime pas là). Les mauvais mots de passe de ces deux formulaires
  comptent comme des connexions refusées. Sur la page d'un lien client, les réponses de l'atelier sont signées du
  **nom de l'atelier** (son profil, `/catalogue/`), jamais du nom de connexion, même les réponses écrites avant. Le
  serveur vérifie aussi les **variantes** d'un projet enregistré (`apps/projects/validation.py`) comme l'éditeur :
  6 au plus, une image en data URL seulement (jamais une adresse ailleurs), un document valide sans autres variantes.
  Le **noyau 3D a un délai** (`frontend/src/geometry/client.ts`, `TIME_LIMITS`) : un recalcul de plus de 90 s, un
  export de plus de 180 s, une autre demande de plus de 30 s (comptés une fois le noyau chargé) arrêtent le worker,
  qui redémarre ; un message propose d'annuler la dernière modification.
  Tests : `tests/e2e/csp.spec.ts` (aucune violation sur les parcours principaux), et la garde du
  skill `.claude/skills/secure-application-guardian`.
- Variables : `DJANGO_DEBUG=false`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`,
  `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_HOST` (avec `psycopg[binary]`) ;
  `DJANGO_TRUST_X_FORWARDED_PROTO=true` derrière un proxy HTTPS ; `DJANGO_ADMINS` (adresses) pour recevoir les erreurs
  serveur par courriel ; `ANTHROPIC_API_KEY` (clé de l'API Claude) pour l'assistant de modélisation — sans elle,
  l'assistant répond « non configuré » et le reste fonctionne.
- `python manage.py migrate` à chaque mise à jour (la migration `0002_sharing` ajoute liens client et commentaires).
- `npm run build` puis `python manage.py collectstatic` : WhiteNoise sert les fichiers statiques compressés (gzip et
  brotli : le noyau de 23 Mo descend à 5 Mo) ; les fichiers nommés d'après leur contenu (`js/chunks/`, `js/assets/`)
  sont mis en cache un an, `editor.js` porte un numéro de version. Three.js et les bibliothèques sont dans des fichiers
  à part, gardés en cache d'une version de l'application à l'autre.
- `GET /healthz` répond `{"status": "ok"}` (503 si la base ne répond pas) pour la surveillance de l'hébergeur.
- Les erreurs de l'éditeur dans le navigateur des utilisateurs sont envoyées au journal du serveur
  (`POST /api/client-errors/`, journal `apps.client`), chaque erreur une seule fois et dix au plus par page.
- Au chargement, un écran suit le téléchargement du noyau 3D (barre de progression), puis le calcul du projet.

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
| `apps/accounts/` | Connexion, déconnexion, inscription (fermée par défaut), « Mon compte » (mot de passe, export, suppression), commandes `compte` et `personnel` |
| `apps/projects/` | Projets, versions immuables avec checksum, API JSON, validation des documents |
| `templates/` | Pages Django + Tailwind ; `editor/editor.html` charge l'éditeur |
| `frontend/src/document/` | Format natif `cao-studio` v1, validation, éditions pures (annulables) |
| `frontend/src/geometry/` | Adaptateur du noyau, worker, protocole worker ↔ interface |
| `frontend/src/features/` | Constructeurs d'opérations : esquisse, extrusion, perçage |
| `frontend/src/constraints/` | Solveur planegcs (DDL, redondances, conflits), catalogue des contraintes |
| `frontend/src/sketcher/` | Repères de plan, outils de dessin, accrochage, profils fermés, rendu et mode esquisse |
| `frontend/src/history/` | Recalcul incrémental (cache par clé de dépendances), annuler/rétablir |
| `frontend/src/viewport/` | Scène Three.js en Z vers le haut, grille adaptative, gizmo, vues, sélection de faces |
| `frontend/src/ui/`, `app/` | Navigateur, ligne de temps, propriétés, session (enregistrement automatique, récupération) |
| `frontend/src/io/` | Export STEP/STL, import/export du format natif `.cao.json` |
| `frontend/src/persistence/` | API Django (CSRF, conflits de version), copie locale de secours |

Principes :

- Le document stocke l'historique paramétrique, jamais de maillage. Toutes les longueurs sont
  stockées en mm ; `units` ne sert qu'à l'affichage (cm par défaut pour un nouveau projet, ou mm, m,
  pouce).
- La géométrie est calculée dans le navigateur. Django ne reçoit que des documents complets :
  enregistrement automatique 4 s après une modification, manuel avec ⌘S, et envoi
  `keepalive` à la fermeture de la page.
- Chaque enregistrement crée une version, sauf si le document est identique au dernier (rien ne change : pas de
  copie de plus). La réponse ne renvoie que la version et l'empreinte. Un `base_version` périmé renvoie 409 : la
  copie locale est conservée et l'éditeur demande quoi faire — **garder sa version** (enregistrée par-dessus celle
  du serveur, qui reste dans l'historique) ou recharger celle du serveur (la sienne est encore proposée à
  l'ouverture). Après un échec réseau, l'enregistrement **réessaie seul** (5 s, 10 s… jusqu'à une minute) et dès
  le retour du réseau ; une page revenue du cache du navigateur se recharge (`app/session.ts`).
- **Plusieurs étapes supprimées d'un coup** dans l'Historique : Ctrl (⌘) + clic choisit une étape (encadrée de
  rouge), Maj + clic toutes celles entre deux ; « Supprimer » (ou Suppr) les efface ensemble, en une seule
  annulation, en prévenant si d'autres en dépendent ; ✕ ou Échap les dé-choisit (`ui/timeline.ts`).
- Une opération en échec est signalée dans le navigateur et la ligne de temps, ses dépendantes sont marquées
  « bloquées », et le dernier corps valide reste affiché.
- **Un projet s'ouvre toujours** (`document/validate.ts`, `openDocument`) : une opération que l'éditeur ne sait pas
  utiliser est désactivée et dite à l'ouverture, au lieu de refuser tout le projet ; seule une faute du document
  lui-même (format, version, ses listes) l'empêche d'ouvrir. À l'inverse, une modification qui rendrait le projet
  impossible à rouvrir est refusée avec son message, avant d'être enregistrée.
- **Un seul contrat de document** : ce que chaque contrainte d'esquisse désigne (un point, une ligne, un cercle…)
  est écrit une fois, dans `frontend/src/document/sketch-constraints.json`, lu par l'éditeur et par le serveur ;
  les documents de `tests/fixtures/documents/` sont vérifiés des deux côtés (vitest et pytest). Une esquisse a au
  plus 600 contraintes, sous le plafond où le solveur manque de mémoire.
- **Léger sur iPad et portable** : la vue dessine à chaque image pendant un geste (souris, doigt, clavier) et
  2 secondes après, puis 4 images par seconde au repos, au lieu de 60 (`viewport/redraw.ts`). Les ombres ne sont
  recalculées que quand les corps changent (soleil fixe), sur une carte de 2048 (1024 au doigt) ; un écran tactile
  dessine à une netteté de 1,5 au plus. Les objets que le noyau crée pour lire une forme (arêtes, faces, points,
  sections) sont libérés aussitôt lus. À chaque recalcul, seuls les corps qui ont changé sont remaillés et envoyés
  à la vue ; les autres gardent leur maillage et leur géométrie (`geometry/worker.ts` `meshesOf`, `BodyLayer.replace`).
  Au doigt, un geste annulé par la tablette rend la caméra (elle ne reste plus figée), un deuxième doigt posé pendant
  qu'on tire une poignée ne la déplace pas, et la flèche et le manipulateur sont plus grands
  (`viewport/pointer-input.ts`).
  En vue en coupe, ce que la coupe cache ne se choisit plus à travers elle.

## Esquisses (phase 4)

Le format natif v2 décrit une esquisse par des points, des courbes (ligne, cercle, arc, éventuellement
en construction) et des contraintes. Les documents v1 sont migrés automatiquement au chargement, et le
serveur accepte les deux versions.

- **Création** : « Esquisse » puis le plan XY, XZ ou YZ (avec décalage le long de la normale). « Modifier
  l'esquisse » rouvre une esquisse existante.
- **Plan de construction** (« Esquisse › Plan de construction… », comme les plans de Fusion) : un plan principal
  **décalé et incliné** d'un angle autour de son axe x ou y, ou le plan passant par **trois coins** de corps
  cliqués. Le plan est montré dans la vue (carré orange, axe x en rouge) pendant le réglage, puis « Esquisser sur ce
  plan ». Le plan est enregistré avec l'esquisse (`frame` : origine, axe x, normale) ; le noyau extrude, tourne et
  balaie exactement ce qui est dessiné. Le « décalage du plan » du panneau déplace le plan le long de sa normale.
- **Esquisse sur une face** :
  - avec une face plane sélectionnée, « Esquisse » (ou « Esquisse sur la face » dans le panneau
    Sélection) démarre directement sur cette face, sans choix de plan ;
  - le contour de la face et ses trous sont projetés en violet comme géométrie de référence fixe, sur
    laquelle on s'accroche : tracer sur les coins projetés reproduit exactement les mesures du corps ;
  - l'extrusion d'une telle esquisse propose par défaut une union avec le corps de la face.
  - une face **inclinée** reçoit un plan de construction, son axe x le long de sa plus grande arête ;
  - Limites : faces planes seulement (pas de face courbe), et la projection n'est pas associative (si le corps
    change, l'esquisse ne suit pas).
- **Outils** : sélection (S), ligne et polyligne (L), rectangle (R), cercle (C), arc par centre (A),
  décalage (O), construction (X).
- **Polygone et oblong** (comme Fusion) : *polygone régulier* (centre puis un sommet ; chiffres 3 à 9 pour le
  nombre de côtés), côtés égaux et sommets sur un cercle de construction, libre en centre, taille et orientation ;
  *oblong* de centre à centre (deux centres puis la largeur), deux demi-cercles de même rayon.
- **Ovale et courbe lissée** : l'*ovale à quatre centres* du tracé de menuiserie (centre puis un coin du rectangle
  qui l'entoure) et la *courbe lissée* passant par des points cliqués (recliquer le dernier point pour finir, le
  premier pour fermer). Les deux sont faits d'arcs tangents (« biarcs ») : ajuster, décaler, extruder et l'export DXF
  en arcs fonctionnent comme pour le reste ; à chaque raccord, les deux centres et le point restent alignés.
- **Texte** : cliquez où commence la ligne de base, tapez le texte, sa hauteur et son angle (Roboto, licence OFL) ;
  recliquez un texte pour le modifier ou le supprimer. Les lettres sont extrudées avec le profil de l'esquisse : pour
  **graver**, écrivez le texte dans une esquisse sur la face et extrudez-la en « Couper ». Un texte de plusieurs
  lettres ne peut pas faire seul un « Nouveau corps » (chaque lettre serait un solide à part).
- **Importer un plan DXF** (menu « Créer ▾ » de l'esquisse) : le plan d'un architecte, d'un client ou d'un autre
  logiciel entre dans l'esquisse ouverte. Sont lus : lignes, cercles, arcs, polylignes avec leurs arrondis, ellipses
  et splines (approchées par des segments), dans l'unité du fichier ramenée en mm. Textes, cotes, blocs et hachures
  sont comptés et laissés de côté, comme les traits aux valeurs illisibles. Un fichier de plus de 20 Mo est refusé ;
  une ellipse ne fait jamais plus d'un tour, et un plan s'arrête à 200 000 traits. Deux façons de le poser :
  - **comme référence** : des traits de construction fixes, pour s'y accrocher et dessiner le meuble par-dessus ;
  - **comme dessin** : des traits ordinaires, à extruder.
  On le garde à ses coordonnées ou on pose son coin bas-gauche sur l'origine. Les bouts de traits qui se touchent
  deviennent un seul point, pour que les contours se ferment ; une seule annulation (`io/dxf-import.ts`,
  `sketcher/import-shapes.ts`).
- **Image de référence** (menu « Créer ▾ » de l'esquisse) : une photo ou un croquis posé sous l'esquisse, pour
  décalquer un meuble à refaire ou un mur photographié.
  - On l'importe depuis son ordinateur ; elle est réduite à 1600 px et gardée avec le projet.
  - On règle sa largeur (la hauteur suit), son coin et son opacité.
  - **« Caler avec deux points »** : on clique deux points de l'image dont on connaît la distance (deux angles d'un
    meuble, une cote du croquis), on donne cette distance, et l'image se met à l'échelle autour du premier point.
  Elle est dessinée sous les traits, n'est jamais construite, et « Ajuster la vue » la prend en compte. Chaque réglage
  est une annulation (`app/sketch-underlay.ts`).
- **Projeter** (comme Projeter / Inclure de Fusion) : cliquez une arête, une **face** (tout son contour) ou, **Maj +
  clic**, un **corps entier** (toutes ses arêtes, en une annulation). Elles s'ajoutent en violet comme repères fixes
  (exactes quand elles sont parallèles au plan de l'esquisse, sinon en points reliés).
- **Intersection** (comme Fusion, à côté de Projeter) : cliquez un corps ; là où le plan de l'esquisse le coupe
  s'ajoute en violet, repère fixe (la coupe est calculée par le noyau : la part du plan dans le corps).
- **Congé et chanfrein de coin** : cliquez un coin où deux lignes se rejoignent, tapez le rayon (arc tangent aux
  deux lignes) ou la distance (ligne de coupe). Le coin d'origine reste comme *coin virtuel* sur les deux lignes
  prolongées : les cotes qui le visaient continuent de valoir et l'esquisse garde la même liberté.
  Une fois une forme terminée (rectangle, cercle, arc, polyligne refermée), on revient à l'outil Sélection ;
  Échap termine une polyligne ouverte et revient aussi à la Sélection. Les autres outils (cotes,
  contraintes, Décalage, Déplacer) ne changent pas.
- **Décaler l'arête** (bouton à côté de « Décalage », comme Shapr3D) : **sans fenêtre**. Dans l'esquisse, un clic sur
  un trait, une **arête d'un corps** ou une **face** (toutes ses arêtes) en fait aussitôt la copie parallèle, à la
  **dernière distance utilisée** (gardée d'une fois sur l'autre), vers l'intérieur de la forme ou de la face. Une flèche
  sur la copie se **tire** pour régler la distance (au-delà du trait : l'autre côté), ou bien on **tape** la valeur : un
  chiffre (aussi la rangée du haut d'un clavier AZERTY sans Maj) l'ouvre à sa place, Entrée l'applique, « - » passe
  de l'autre côté ; le champ **calcule** (« 250-180 », « (250-180)/2+5 », « 1 m - 20 cm ») ; un **clic sur l'étiquette**
  ouvre la **calculatrice** (touches, parenthèses, mm / cm / m) avec la distance dedans, pour calculer une mesure. Chaque réglage est une étape d'annulation. Un autre clic fait une autre copie
  (aussi de la copie qu'on vient de faire) ; l'outil reste actif jusqu'à **Échap**, et les copies restent. Les arêtes
  des corps sont projetées en repères violets (sans doubler celles déjà dans l'esquisse) ; les copies sont de vrais
  traits, listées dans l'historique (« Arête décalée n »). Le calcul est dans `sketcher/edge-offset-tool.ts` et
  `sketcher/offset-edge.ts`.
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
- **Lire et choisir les traits** (mode esquisse) : les traits sont dessinés **épais** (2,2 px, 3,2 px quand ils sont
  survolés ou choisis) pour être faciles à viser. Le trait sous le pointeur — celui qu'un clic choisirait — passe en
  **jaune** ; les traits et points **choisis** sont en **vert** (#63DF0F, comme les arêtes choisies et l'esquisse sélectionnée dans la vue 3D) ; les **zones fermées** sont teintées en bleu
  (#2078CF), plus fort sous le pointeur quand aucun trait n'est visé. Un clic **à l'intérieur d'une forme** choisit ses
  côtés (la plus petite zone sous le pointeur, même un rectangle dans un autre) ; un second clic les relâche. Quand deux
  traits sont superposés (un côté commun), **recliquer au même endroit** passe au trait suivant.
- **Couper** (bouton « Couper », groupe Modifier), comme le « Couper » (Break) de Fusion : coupe une ligne, un arc ou
  un cercle **en morceaux** là où d'autres courbes le croisent, **sans rien supprimer**. En survolant la courbe, des
  **croix rouges** montrent où elle sera coupée (les deux croisements autour du pointeur, ou un seul vers le bout) et le
  morceau sous le pointeur s'affiche ; un clic coupe. Une ligne ou un arc donne jusqu'à trois morceaux, un cercle deux
  arcs. Les morceaux partagent leurs bouts, tenus sur la courbe qui croise ; une ligne horizontale ou verticale le reste
  morceau par morceau ; les cotes et égalités de la courbe entière sont retirées. Une courbe que rien ne croise ne se
  coupe pas.
- **Supprimer un morceau** (comme Shapr3D) : avec l'outil Sélection, cliquez une ligne là où d'autres la croisent — le
  morceau compris entre les deux croisements autour du clic s'affiche en pointillés — puis **Suppr** : seul ce morceau
  part (le bout d'un montant qui dépasse dans une traverse…), le reste de la ligne reste. Une ligne que rien ne croise,
  ou choisie par fenêtre ou en cliquant dans une forme, part entière comme avant (`sketcher/segment-delete.ts`).
- **Ajuster** (bouton « Ajuster », groupe Modifier), le « Ajuster » (Trim) de Fusion : en survolant une ligne, un arc
  ou un cercle, la partie **entre les deux croisements** autour du pointeur s'affiche ; un clic la supprime. Sans croisement d'un côté, la
  partie va jusqu'au bout de la courbe (elle est raccourcie) ; sans aucun croisement, la courbe entière disparaît. Une ligne
  coupée au milieu devient deux lignes, un arc deux arcs, un cercle coupé entre deux croisements l'arc qui reste. Les
  nouvelles extrémités sont sur les croisements (un point existant y est réutilisé, sinon un point « sur courbe » les y
  maintient) ; les cotes de la courbe coupée sont retirées (leur valeur n'est plus la sienne). Les courbes de construction
  et projetées ne se coupent pas ; les courbes qui se croisent sont celles de l'esquisse (construction exclue).
- **Prolonger** (bouton « Prolonger », groupe Modifier), comme dans Fusion : en survolant une ligne ou un
  arc, le prolongement de l'extrémité la plus proche du curseur jusqu'à la première courbe rencontrée
  (ligne, cercle, arc, géométrie de construction ou projetée) s'affiche en pointillés ; un clic le fait.
  L'extrémité est alors liée à cette courbe (contrainte « point sur courbe ») ; l'outil reste actif,
  Échap revient à la Sélection. Une extrémité reliée à une autre courbe (un coin) se prolonge aussi :
  elle se détache et l'autre courbe garde le coin. Une extrémité fixe (projetée) ou qui ne rencontre rien
  n'est pas prolongée (un message l'explique). Une ligne garde sa direction, un arc son cercle. Prolongée à nouveau, une
  extrémité traverse la courbe qu'elle avait atteinte jusqu'à la suivante : la courbe traversée reste en place, entière.
- **Symétrie, Rotation, Échelle** (menu « Modifier ▾ » de l'esquisse), sur les traits sélectionnés. Une petite
  fenêtre demande les réglages ; chaque geste est une seule annulation.
  - **Symétrie** : une copie en miroir, autour de la dernière ligne sélectionnée ou de l'axe X ou Y. La copie reste
    liée à l'original par des contraintes de symétrie (et un rayon égal pour ses cercles et ses arcs), comme dans
    Fusion : elle suit quand on change l'original, sans contrainte redondante. Une forme posée sur l'axe garde ses
    points de l'axe en commun avec sa copie, et son côté sur l'axe n'est pas doublé. Décoché « Garder l'original »,
    le miroir se fait sur place.
  - **Rotation** : d'un angle (sens direct), autour du milieu de la sélection, de l'origine ou du point sélectionné.
  - **Échelle** : d'un facteur, autour des mêmes centres ; les rayons et les cotes de longueur suivent.
  Rotation et échelle se font sur place ou en copie. Les contraintes entre traits transformés suivent quand elles
  ont encore un sens : horizontale et verticale sont gardées, échangées à un quart de tour, retirées à un autre
  angle. Un arc retourné par une symétrie échange ses bouts. Un repère fixe (projeté, importé) ne se transforme
  qu'en copie (`sketcher/transform-selection.ts`).
- **Réseau circulaire** (menu « Modifier ▾ » de l'esquisse) : les traits sélectionnés répétés autour d'un centre
  (l'origine, le milieu de la sélection ou un point), pour des trous en couronne, une rosace ou les pieds d'une
  table ronde. On donne le nombre d'éléments en tout, original compris, et l'angle total : sur un tour complet,
  les copies sont réparties régulièrement ; sur un angle plus petit, de l'original à la dernière. Les copies
  gardent les contraintes qui lient leurs traits entre eux ; une seule annulation.
- **Déplacer** (touche M, bouton « Déplacer ») : déplace des points, segments, cercles, arcs, un
  rectangle ou un contour entier, ou plusieurs éléments à la fois.
  - On clique les éléments (« Étendre aux contours » ajoute tout le contour d'une courbe choisie), puis on
    les **tire à la souris** (le départ et l'arrivée s'accrochent aux points et à la grille) ou on
    **saisit le déplacement** : relatif (ΔX, ΔY), distance et angle, ou position absolue du point de base
    (le point sélectionné, sinon le centre de la sélection).
  - L'**aperçu** en pointillés est le résultat résolu avec les contraintes ; rien n'est enregistré avant
    OK, qui compte pour une seule étape d'annulation.
  - Ce n'est pas un décalage visuel : les points déplacés sont imposés à leur nouvelle place et le solveur
    recalcule l'esquisse. Les points liés par une contrainte (coïncidence, perpendiculaire, cote) suivent
    comme le solveur le décide ; un déplacement qui contredit les contraintes (un point fixé, une cote
    vers l'origine) est refusé avec les contraintes nommées. L'origine et les points fixes projetés d'un
    corps ne se déplacent pas ; un cercle se déplace par son centre, son rayon est conservé.
- **Accrochage** : un clic sur un point existant le réutilise comme sommet partagé ; un clic sur une
  courbe ajoute une contrainte « point sur courbe » ; un segment presque horizontal ou vertical reçoit la
  contrainte correspondante.
- **Grille** : le dessin s'accroche aux lignes de la grille affichée (touche G ou bouton « Grille » pour
  l'activer ou la couper, choix mémorisé) ; le pas suit le zoom (1, 10, 100 mm…) et les lignes passent
  par l'origine de l'esquisse. Un point ou une courbe existants gardent la priorité sur la grille.
  Le déplacement d'un point à la souris s'accroche aussi.
- **Accrochage à la géométrie** et **accrochage intelligent** (deux boutons à côté de « Grille », comme les
  « Toggle Geometry Snapping » et « Toggle Smart Snapping » de Vectric Aspire ; actifs au départ, choix mémorisés) :
  - à la géométrie : le pointeur se colle aux points et aux traits de l'esquisse ; coupé, il reste libre (ou sur la
    grille) même tout près d'eux ;
  - intelligent : le pointeur prend le même X ou le même Y qu'un point de l'esquisse, que le milieu d'une ligne ou
    que le point qu'on vient de cliquer (une ligne part droite à l'horizontale ou à la verticale). Des **guides en
    tirets** roses vont de ce point au pointeur, et la croix devient un carré rose. Aligné sur les deux à la fois, il
    tombe au croisement.
  - L'ordre est le suivant : un point, puis un trait, puis un alignement, puis la grille.
  Le calcul est dans `sketcher/smart-snap.ts`.
- **Les mêmes accrochages pour les corps en 3D** : deux boutons dans le groupe Modifier, après Déplacer et
  Coïncidence. Ce sont les mêmes choix que dans l'esquisse : couper l'un coupe l'autre.
  - À la géométrie : Déplacer (pivot et cible), Coïncidence et Mesurer se collent aux coins, aux milieux de faces, aux
    arêtes et aux points d'esquisse. Coupé, le point pris est celui de la face sous le pointeur, où qu'il soit.
  - Intelligent, un point : un point d'une face qui tombe en ligne avec un coin d'un corps (même X, Y ou Z, sur les
    axes de la face) ou avec le point déjà cliqué se prend aussi, montré par un guide rose en tirets.
  - Intelligent, un glissé : un corps tiré par une flèche ou une tuile de Déplacer (repère global) s'arrête quand une
    de ses faces, ou son milieu, arrive au niveau d'une face ou du milieu d'un autre corps. On le pose face contre
    face, au ras ou centré, sans taper de cote. Un guide rose montre le plan où ils se rejoignent.
  Le calcul est dans `features/smart-align.ts`, le branchement dans `app/body-snap.ts`.
- **Curseur de dessin** (comme Fusion) : avec la ligne, le rectangle, le cercle ou l'arc, le curseur est une **croix** ;
  dès que le pointeur s'accroche — à un point de la grille ou à un point existant (carré orange), à une courbe (losange
  vert) — la croix devient ce **carré** posé exactement sur le point d'accrochage, avec quatre petits bras.
- **Contraintes** : coïncidence, horizontale, verticale, parallèle, perpendiculaire, tangence, égalité,
  symétrie (par rapport à un point ou une ligne), concentricité, fixation, point sur courbe, milieu.
  Toutes sont toujours disponibles, comme dans Fusion : avec la bonne sélection, la contrainte
  s'applique aussitôt ; sinon elle attend les clics (« Horizontale : cliquez une ligne » dans la barre d'état,
  seuls les éléments qui conviennent se laissent choisir), s'applique dès que tout est choisi, puis attend
  les suivants ; Échap arrête et revient à la Sélection.
- **Coïncidence** (⦿) : deux points exactement au même endroit, par le solveur (planegcs), pas par un
  simple rapprochement visuel. Elle s'applique à deux points quelconques : extrémités de lignes et
  d'arcs, centres de cercles et d'arcs, points de construction, origine.
  - Distincte de « Point sur courbe » (⊸) : celle-ci laisse le point glisser le long de la courbe
    (1 degré de liberté en moins), la coïncidence retire les deux coordonnées.
  - Son symbole ⦿ est toujours affiché au point ; cliquez-le pour sélectionner la contrainte, Suppr
    la supprime sans toucher aux géométries (ou la croix de la liste « Contraintes » du panneau).
  - Les points fixes ne bougent pas : l'autre vient à eux. Deux points fixes éloignés, ou une cote
    incompatible, sont refusés avec les contraintes en conflit nommées ; une coïncidence déjà
    impliquée par les autres est acceptée et signalée comme redondante.
  - Refusées d'emblée : deux points d'une même courbe (elle serait écrasée), une paire déjà liée.
  - La relation tient après déplacement, changement de cote, enregistrement et rechargement,
    annulation et rétablissement.
  - **Entre corps** : tant qu'une esquisse est ouverte, les sommets de tous les corps affichés sont
    projetés sur son plan en points violets fixes. On s'y accroche en traçant, ou on les sélectionne
    avec un point de l'esquisse pour appliquer « Coïncidence » (ou une cote). Seuls les points utilisés
    sont enregistrés avec l'esquisse ; comme pour la projection d'une face, ils ne suivent pas le corps
    s'il change ensuite. Un sommet est projeté orthogonalement : un coin à une autre hauteur que le
    plan tombe à la verticale du plan.
- **Cotes** (D) : longueur, distance, distances horizontale et verticale signées, distance point-ligne,
  angle, rayon et diamètre. Une cote est créée avec la valeur mesurée, puis se modifie dans le panneau ou
  en cliquant son étiquette. « Cote horizontale » et « Cote verticale » se posent sur deux points ou sur
  une ligne (entre ses deux bouts) ; la valeur proposée est toujours positive.
- **Résolution** : toute modification est résolue avant d'être enregistrée. Une modification qui rend
  l'esquisse impossible (contraintes en conflit) est refusée avec la liste des contraintes en cause. Les
  redondances sont signalées. L'état affiché est « Entièrement contrainte », « n à fixer » (cotes ou contraintes manquantes) ou « Redondante ».
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
- **Cotation automatique** (menu « Cotes ▾ » de l'esquisse) : d'un coup, les cotes des traits sélectionnés, sinon de
  tout le dessin hors construction :
  - les cotes de chaîne, d'un niveau de points au suivant, en X sous le dessin et en Y à sa gauche ;
  - les cotes hors tout, au-delà des chaînes ;
  - les diamètres des cercles et les rayons des arcs.
  Ce sont des **cotes de référence** (entre parenthèses) : mesurées, jamais imposées, elles suivent le dessin sans le
  figer ni le contredire. Relancée, elle remplace celles qu'elle avait posées ; au-delà de 40 niveaux sur un axe,
  seule la cote hors tout est posée (`sketcher/auto-dimensions.ts`).
- **Outil « Cote »** (touche D) : cliquez une ligne, un cercle, ou deux éléments (deux lignes, deux
  points, point et ligne, deux cercles). Leur mesure apparaît (distance, distance entre lignes
  parallèles, angle, entraxe) ; un clic dessus la transforme en cote. Hors de cet outil, cliquer une
  ligne la sélectionne seulement.
- **Cote suivante** (comme Fusion) : dans le pavé de saisie d'une cote de longueur, le bouton « Cote suivante → »,
  Tab ou les flèches ↑ ↓ valident la valeur et ouvrent aussitôt la cote du côté suivant du contour (la largeur
  d'un rectangle, puis sa hauteur). Si ce côté, ou son côté opposé, a déjà une cote, c'est elle qui est
  modifiée ; sinon une cote de longueur est proposée avec la longueur actuelle.
- **Symboles de contraintes** (H, V, ∥…) : masqués par défaut, affichés avec le bouton
  « Contraintes ». Une contrainte en conflit reste toujours visible en rouge.
- Les profils fermés sont légèrement teintés et la grille s'affiche sur le plan de l'esquisse.
- **Extrusion**, comme dans Fusion 360 :
  - le bouton (ou la touche E) surligne les profils fermés ; quand l'esquisse a **plusieurs zones**, aucune n'est
    choisie d'avance (comme Shapr3D) : cliquez celle à extruder, la flèche vient dessus, puis d'autres pour les
    ajouter. Une esquisse d'une seule zone, ou une extrusion qu'on modifie, garde ses zones ;
  - **plusieurs solides séparés** : des profils écartés extrudés ensemble (les quatre pieds d'une table), un îlot dans
    un trou, ou une coupe qui traverse tout un panneau donnent **un corps par solide** (« Extrusion 1 — pièce 1 », « — pièce 2 »…,
    numérotés de gauche à droite), au lieu d'une erreur. Même chose pour la révolution, le lissage et le balayage ;
  - **départ** : « Plan du profil », ou « Décalé » comme dans Fusion — l'extrusion commence à une distance du plan de
    l'esquisse, le long de sa normale (négative : de l'autre côté), puis s'étend de sa distance ; l'aperçu et la flèche
    partent du plan décalé. Le décalage est enregistré avec l'extrusion (`startOffset`, en mm) et peut être lié à un
    paramètre ;
  - **viser facilement un arrêt** : ce qu'un clic prendrait s'allume avant de cliquer — un anneau orange sur un coin,
    une ligne orange sur une arête, la teinte de survol sur une face — et le curseur devient une croix. Un coin se prend
    jusqu'à une quinzaine de pixels, une arête jusqu'à une dizaine, **même par-dessus une zone de l'esquisse** ; seul un
    coin ou une arête au niveau du profil lui-même laisse le clic choisir la zone. Même chose pour l'extrusion de faces ;
  - **prendre une mesure sur le modèle** : pendant qu'on règle la distance, cliquez un **point** (coin), une **arête** ou
    une **face** d'un corps (le même, ou un autre) : un coin ou une face donne son **niveau** — l'extrusion s'arrête
    exactement là, au-dessus ou en dessous du profil — et une arête donne son niveau ou sa **longueur** (choix « Arête »
    du panneau). Le coin est cherché à quelques pixels, puis l'arête, puis la face ; un clic sur une zone du profil
    choisit toujours la zone. Même chose pour l'*Extrusion de faces* ;
  - les zones sont calculées en découpant les courbes là où elles se croisent ou se touchent
    (croisements, jonctions en T, arêtes partagées) : deux rectangles côte à côte ou qui se
    chevauchent, une ligne qui traverse une forme, un cercle qui en coupe une autre donnent chacun
    leurs zones, comme dans Fusion 360 ; une courbe qui ne ferme rien (un segment qui dépasse, une
    chaîne ouverte) est ignorée et ne bloque plus les zones fermées ; sans aucune zone fermée,
    l'esquisse est signalée « ouverte » avec l'endroit ;
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
  - **Rayon variable** (case du Congé) : un rayon de début et un rayon de fin. Le rayon passe de l'un à l'autre le
    long de chaque arête ; « Inverser début et fin » échange les deux.
  - **Deux distances** (case du Chanfrein) : la première se prend sur la plus grande des deux faces de chaque arête
    (la face d'une planche), la seconde sur l'autre (son chant). « Inverser les faces » échange les deux côtés.
  Ces réglages se gardent dans l'opération et se rouvrent avec elle (`features/solids.ts`,
  test `tests/frontend/edge-variants.test.ts`).
- **Combiner** : union, soustraction ou intersection d'un corps cible avec un ou plusieurs corps
  outils. Les corps outils peuvent être conservés. Les corps se **cliquent dans la vue** : « Cible » enfoncé, le
  corps cliqué devient la cible, puis « Corps outils » s'enfonce et chaque corps cliqué s'ajoute aux outils (un autre
  clic, ou ✕, l'en retire) ; le résultat montré par l'aperçu tient lieu de la cible. Le panneau ne liste que les
  outils choisis ; « Choisir dans la liste » déplie tous les corps, à cocher. Sans sélection d'avance, rien n'est
  choisi d'office (`app/combine-pick.ts`). Des corps **réunis en un seul** (Union, à la création) font un corps
  **bleu #2078CF** (une laque satinée), qui se lit d'un coup comme un seul ; sa couleur se change ensuite dans
  Apparence.
  - **Comme le Combiner de Fusion 360** : deux champs de sélection, « Corps cible » et « Corps outils » (« 2
    sélectionnés »), celui qui prend le prochain clic cerné de bleu, ✕ pour le vider ; l'opération en trois boutons
    (∪ Joindre, − Couper, ∩ Intersection) ; la cible marquée en orange, les corps outils en bleu, en rouge pour
    Couper. **Rien n'est gardé avant OK** (ou Entrée) ; **Terminer** (Échap, la croix) laisse le modèle tel qu'il était
    (`storesLive` de `app/panel-tool.ts`). OK attend tant que le noyau refuse la combinaison.
- **Une calculatrice à chaque champ d'un nombre** (`ui/field-keypads.ts`) : tout champ numérique de l'éditeur qui
  n'avait pas la sienne — réglages de « Modules à glisser » et de l'outil Module, Répartition, Étagères, Niche, Réseau,
  panneaux de la cuisine… — reçoit un bouton « ⌨ » à sa droite : la calculatrice (`ui/calculator.ts`) s'ouvre sur sa
  valeur, un calcul ou des unités (« 60 cm − 2*18 mm »), et ✓ écrit le résultat dans le champ comme s'il était tapé
  (évènements `input` et `change`). Une longueur (son nom dit son unité : « Hauteur (cm) ») se calcule en unités, un
  nombre sans unité tel quel (`plain`). Les champs qui avaient déjà leur « ⌨ » (outils à panneau) n'en ont pas un
  second ; un champ tapé sur place (`data-no-keypad`) non plus. **Dans l'esquisse**, un clic sur une case de cote
  d'une forme en train d'être tracée (largeur, hauteur, longueur, angle, diamètre) ouvre la calculatrice : ✓ garde la
  valeur, comme Tab. Les icônes des outils de dessin disent aussi leur nom au survol.
- **Les messages de l'éditeur** (« Version 4 enregistrée », « Niche équipée », une modification refusée…)
  s'affichent **en bas de la colonne de gauche, en petit** (11 px), le plus récent en bas, au-dessus de la barre
  d'état — jamais par-dessus la vue, où ils cachaient ce qu'on voulait cliquer (`data-ref="toasts"` de
  `templates/editor/editor.html`, `toast` de `ui/dom.ts`).
- **Survolée, une icône d'outil dit son nom seulement** (« Coque », « Vider un corps »), dans une **pastille au style
  des cotes des pièces** (contour et texte orange #f8500a sur blanc, `.cad-icon-tip`), sous l'icône — au-dessus près
  du bas de la fenêtre. `ui/icon-titles.ts` ôte le `title` de chaque bouton-icône (une image, pas de texte) : son nom
  devient `data-tip` (et son `aria-label` s'il n'en avait pas), son explication `data-hint`, que « Outils » (Ctrl + K)
  cherche encore ; ce qui s'ajoute ensuite (colonnes d'outils, barres) est traité de même. Les boutons à texte gardent
  la bulle du navigateur.
- **« Terminer » et « OK » en bas de chaque outil** (`panelFooter` de `ui/panel-close.ts`) : **OK** (ou Entrée) garde
  l'opération — grisé tant que le réglage n'est pas complet ou que le noyau le refuse — **et l'outil reste ouvert pour
  la suivante** : le même outil, à neuf, chaque opération son étape d'historique (`finish` et `again` de
  `app/panel-tool.ts`, `again` du contexte dans `app/tool-launcher.ts`). Ce que l'outil remis à neuf propose aussitôt
  (le caisson suivant, à côté du dernier) n'est qu'une proposition : rien n'est enregistré tant qu'on n'a rien réglé
  ni cliqué (`rest`, `touched`), ou redit OK. **Seul « Terminer »** (la croix ✕, Échap) ferme l'outil, en gardant ce
  qui est fait (un outil qui attend OK, comme Combiner, ne garde alors rien de plus). Une opération reprise depuis
  l'Historique garde son outil ouvert après OK. Combiner et Prolonger élément ont « OK » et « Terminer » (au lieu
  d'« Annuler ») et restent ouverts de même ; la Répartition, le Module, la hauteur de Niche et le Réseau d'esquisse
  ont les deux boutons (OK enregistre tout de suite, l'outil reste) ; Copier une niche, Façades du dressing et
  l'Électroménager, où chaque clic est gardé aussitôt, n'ont que « Terminer ».
- **Ce qu'un outil a choisi reste marqué** tant qu'il est ouvert : Combiner (la cible en orange, les corps outils en
  bleu), Coller par face, Prolonger élément, Assemblage, Aligner face sur face (la face qui bouge ou se prolonge en
  orange, la face d'arrivée en bleu), Scinder (les corps à couper en orange, la face de coupe en bleu), Coïncidence (le
  corps qui bouge). Le survol reste vert. Chaque marque garde la forme qu'avait la face au clic : l'aperçu ne l'efface
  pas ; elle s'en va quand l'outil se ferme (`viewport/chosen-marks.ts`).
- **Perçage** : cliquez une face plane ; le trou est percé perpendiculairement à la face, traversant
  ou à une profondeur donnée.
- **Intersection** : disponible aussi pour l'extrusion et la révolution.
- **Déplacer** (bouton « Déplacer », ou dans le panneau Sélection) : ce qui est déplacé dépend de la
  sélection. Pour un corps, l'option **« Copier »** (comme Curic Gizmo) garde l'original et pose 1 à 10 copies, la k-ième
  décalée k fois du déplacement (une opération « Copie n » de type réseau).
  - un **corps** (filtre « Corps », navigateur, ou un sommet ou une arête de ce corps) : nouvelle opération
    « Déplacement » dans l'historique, où le noyau translate le **solide réel** (volume, boîte englobante,
    exports et opérations suivantes le voient à sa nouvelle place ; rien n'est seulement décalé à
    l'écran) ;
  - une **esquisse** sélectionnée dans le navigateur ou dans la vue : elle se déplace d'un bloc, comme dans
    Fusion, avec le même principe de pivot et cible (le pivot est un point de l'esquisse : tous ses points
    sont affichés ; la cible est un point ou une face d'un corps, ou un point d'une autre esquisse). Le long
    de sa normale, le décalage de son plan change ; dans son plan, c'est son origine qui se déplace
    (« shift » de l'esquisse) : la géométrie et les contraintes ne changent pas, même si elles la lient à
    l'origine. Les corps extrudés de cette esquisse suivent ;
  - une **face** : « Face seule (pousser/tirer) » passe à l'extrusion de faces, qui déplace la face
    en modifiant le corps ; « Le corps entier » déplace le corps — ou le **meuble dont il est une pièce** : un
    caisson par son origine, ses façades suivant ; une Répartition par son esquisse, ses panneaux, portes et niches
    suivant, en une seule annulation (`app/move-whole.ts`) — et la normale de la face sert de repère local. Le corps
    entier commence comme un nouveau déplacement, en « Pivot et cible » : on clique le point du meuble où poser les
    flèches (un coin, le milieu d'une face — pour une Répartition, un coin d'un de ses panneaux ou un point de son
    esquisse), puis le point où l'amener ; ses flèches ne restent plus au milieu du caisson ;
  - un **composant** : le document n'a pas d'assemblage, un composant est un corps.
  - Le **manipulateur** est petit (environ 50 px, de taille constante à l'écran), dessiné comme le repère d'axes
    du coin de la vue :
    - une **flèche fine** par axe, à la couleur de l'axe (X rouge, Y vert, Z bleu), avec une pointe en cône,
      déplace le long de l'axe ;
    - une **petite tuile** translucide de la même couleur déplace dans un plan (XY, XZ ou YZ) ;
    - le **point central** blanc, avec son anneau, déplace librement dans le plan de l'écran ;
    - trois **flèches courbes** colorées font tourner autour de X, Y ou Z.
    La poignée survolée s'éclaircit et grossit. Une flèche courbe ouvre l'outil **Tourner** sur
    le même corps (ou la même esquisse), autour de cet axe, et le geste continue : l'angle suit le curseur par pas
    de 5° (Maj : angle libre) avec l'aperçu en direct, et se règle aussi dans le panneau ; le pivot est le centre
    de la sélection ou un coin cliqué. Les flèches courbes tournent autour des axes globaux : elles sont masquées
    dans un repère local. Le même manipulateur, avec les seules flèches du plan et le point, sert à déplacer une
    esquisse. On peut aussi saisir le déplacement relatif (Δ), la distance sur un axe, ou la position absolue du
    centre.
  - **Pivot et cible** (mode par défaut, comme le déplacement de Fusion) : en survolant un élément, ses coins (ceux
    d'un panneau mince en entier, pas seulement ceux de la face visée) et le **milieu** de la face peuvent être pris.
    Seul le point sous le curseur apparaît, en **petit point rond orange (#f8500a)**, et le manipulateur suit ce
    point ; le pivot choisi est un petit point rose, la cible un petit point vert. Un clic y place le **pivot** (les
    flèches). Ensuite :
    - un clic sur un coin ou le milieu d'une face d'**un autre corps** amène le pivot sur ce point ;
    - un clic à l'intérieur d'une **face plane** d'un autre corps amène le corps sur le plan de cette face
      (déplacement le long de sa normale seulement) ;
    - ou bien on tire les flèches depuis le pivot, ou on saisit ΔX, ΔY, ΔZ.
    Les **points d'esquisse** (extrémités, centres, milieux des lignes) des esquisses visibles servent
    aussi de cible quand on s'en approche.
  - **Direction gardée** (Déplacer et Coïncidence) : **Ctrl** garde le déplacement **horizontal** (la hauteur ne
    change pas : une étagère reste au même niveau), **⌘** (Commande, sur Mac) le garde **vertical** (seulement
    monter ou descendre). Appuyée seule puis relâchée, la touche allume ou éteint cette direction (une nouvelle
    pression la rend libre) ; maintenue pendant le clic de la cible, elle vaut pour lui. Elle vaut aussi pour la
    tuile et le point central du manipulateur, pas pour les flèches (qui ont déjà leur axe). Le panneau la montre et
    la règle aussi : « Direction : Libre, Horizontale (Ctrl), Verticale (⌘) ».
    Rose = pivot, vert = cible ; « Changer le pivot » et « Changer la cible » recommencent un choix. Un
    pivot pris sur un autre corps fait de ce corps celui à déplacer. Raccourci : avec le filtre
    « Points », cliquez un sommet du corps puis un sommet d'un autre corps, puis « Déplacer ».
  - **Type de déplacement** (boutons, comme Fusion 360) : « Point à point », « Translation » (ΔX, ΔY, ΔZ), « Sur un
    axe », « Position » (absolue, du centre). **Pivot** : boutons « Centre », « Bas », « Coin » (« Définir le pivot »
    de Fusion, le pivot de 3ds Max) en plus du point cliqué (`app/move-panel.ts`).
  - **À la façon de SketchUp** : le pivot pris, ce qu'on déplace **suit la souris** — jusqu'au point accroché (coin,
    milieu, point d'esquisse), sinon jusqu'au point de la face visée, sinon sur le sol passant par le pivot (dans le
    plan de l'écran quand on regarde de face) — et un clic le pose ; la cible est cherchée à travers ce qui bouge
    (`app/move-follow.ts`). Au clavier, sans cliquer dans un champ (`app/move-keys.ts`) : une **distance** puis
    Entrée (le long de la direction montrée, ou de l'axe bloqué), un **vecteur** « 10;20;0 », **« x5 »** (ou « *5 »,
    « 5x ») cinq copies au même pas, **« /5 »** cinq copies réparties jusqu'au point visé ; les **flèches bloquent
    un axe** — → X, ← Y, ↑ Z, ↓ (ou la même flèche) le libère — avec sa ligne dessinée ; **Alt** (⌥) allume ou
    éteint la copie. La case du panneau montre ce qui est tapé, sinon la longueur du déplacement, l'axe bloqué et
    les copies.
  - **À la façon de 3ds Max** : **Maj + glisser** une flèche ou une tuile du manipulateur fait une copie (l'original
    reste). Les copies se font sur un corps ; un meuble entier ou une esquisse le dit.
  - **Repère** : global, ou local (axes de la face plane choisie, ou de l'esquisse). Le déplacement est
    toujours enregistré dans le repère global.
  - L'aperçu est calculé par le noyau dans le navigateur (aucune requête au serveur pendant le geste) ;
    OK reste désactivé tant qu'il échoue. Un déplacement se modifie, se supprime (les perçages, extrusions et
    déplacements qui le suivaient restent sur le corps d'origine), s'annule et se rétablit comme les autres
    opérations.
- **Coïncidence** (bouton du groupe **Modifier**, à côté de « Déplacer ») : colle une esquisse ou un corps par un
  de ses points, en trois clics. On clique d'abord **ce qu'il faut déplacer** : un corps (une de ses faces, il
  s'éclaire au survol) ou une esquisse ; ce qui était sélectionné en ouvrant l'outil compte comme ce premier clic.
  On clique ensuite **un de ses points** : seuls les coins de la pièce choisie (ou les points de l'esquisse) se
  prennent, si bien qu'un coin partagé avec une pièce voisine (l'étagère contre son côté) reste à la pièce choisie.
  « Choisir un autre point de la pièce » garde la pièce, « Recommencer » repart du premier clic. On clique enfin où le coller : un point d'un autre corps ou
  d'une autre esquisse, ou un **trait** (une arête de corps, une ligne d'esquisse). Sur un trait, le point vient
  **au plus près**, ou **à l'endroit cliqué** (au choix dans le panneau). On peut aussi cliquer une **face plane**
  d'un autre corps, éclairée au survol quand aucun point ni trait n'est sous le pointeur. Au plus près, ce qu'on
  déplace vient droit dans le plan de la face (le chemin le plus court, perpendiculaire à elle) : un panneau se pose
  contre un autre ou au ras de lui. À l'endroit cliqué, le point vient exactement où l'on a cliqué la face. Seul le point sous le curseur
  apparaît, en petit point orange (#f8500a), comme dans Déplacer. Le point de départ est marqué d'un petit point rose, l'arrivée d'un
  point vert, et le résultat se voit avant OK. Un corps est déplacé par une opération « Coïncidence » (un
  déplacement), une esquisse avec son plan et tout ce qui en est extrudé. Pour un corps, **« Copier »** fonctionne
  comme dans Déplacer : de 1 à 10 copies, l'original reste en place. La première copie vient sur le point visé, la
  suivante deux fois plus loin, et ainsi de suite. Une opération « Copie » les fait. **« Ajuster à la niche »** :
  un corps calé entre deux voisins (une étagère entre ses côtés, à 2 mm près) se recale entre ceux de l'endroit où il
  arrive, avec les mêmes jeux : élargi dans une niche plus large, raccourci dans une plus étroite. Le panneau montre la
  longueur avant → après ; « Non » garde ses mesures. Des opérations « Ajustement » (étirements, et pour une copie un
  petit déplacement) le font. **Direction gardée**, comme dans Déplacer : **Ctrl** horizontale (la pièce reste au
  même niveau), **⌘** verticale ; le point d'arrivée s'affiche alors à la hauteur du point de départ (ou à sa
  verticale) avec un guide rose vers le point visé. Une seule annulation
  (`app/coincide-tool.ts`, `features/coincide.ts`, `app/axis-lock.ts`).
- **Prolonger élément** (bouton du groupe **Modifier**, après « Coller par face ») : on sélectionne (ou on clique,
  l'outil ouvert) la face d'un caisson, d'une pièce d'une Répartition ou de toute autre pièce, du côté à prolonger,
  puis la face
  d'un autre élément : il s'allonge jusqu'à son plan, ou se raccourcit (`document/extend-element.ts`,
  `app/extend-tool.ts`). Un caisson change de largeur, de profondeur ou de hauteur avec ses façades — son origine recule
  quand c'est son côté gauche, son devant ou son dessous qui avance ; une Répartition de longueur ou de hauteur avec ses
  cases, son esquisse décalée de même. Un meuble du Plan de cuisine (un haut d'angle prolongé jusqu'au voisin) fait
  suivre le plan.
  - **Toute autre pièce** — une plinthe, un fileur, un plan de travail, une crédence, une planche — se prolonge de
    même : sa face cliquée est tirée jusqu'au plan de l'autre (ou rentrée), par une opération « Prolongement » sur le
    corps, comme « Tirer une face », qui se retouche ou se supprime dans l'historique. Exemple : le bout d'une plinthe
    de cuisine, puis le bout de la plinthe d'en face, pour fermer le vide sous un four. Sur une pièce du Plan de
    cuisine, l'opération est gardée quand la cuisine est refaite.
  - **Une étagère ou une cloison seule** : la face d'une pièce à l'intérieur d'un caisson ou d'une Répartition (le bout,
    le dessus ou le dessous d'une étagère, d'une cloison) prolonge cette pièce seule par défaut, comme toute autre pièce
    (une opération « Prolongement » sur son corps), jusqu'à la face d'un autre élément ou d'une autre pièce du même
    meuble ; une face sur le dehors du meuble (un côté, le dessus, une façade) le prolonge entier. « Prolonger » change
    ce choix (`onEnvelope` de `document/extend-reach.ts`).
  - **Face d'arrivée inclinée** (un mur en biais, un rampant) : un caisson ou une Répartition s'allonge jusqu'à la
    toucher de son premier coin ; une autre pièce va jusqu'à son plan et son bout en prend la pente
    (`document/extend-reach.ts`, `features/face-until.ts`).
  - **Aperçu, OK** : le résultat se voit avant d'être gardé ; OK (ou Entrée) le garde en une annulation, Annuler (ou
    Échap) ne change rien.
  - **Suivre l'autre élément** (coché par défaut) : quand l'élément d'arrivée change ensuite (élargi, déplacé, une
    cote), l'élément prolongé le suit. Une pièce reçoit une opération qui va jusqu'à la face à chaque recalcul ; un
    caisson ou une Répartition garde une liaison (`extendLinks` du document), refaite après chaque modification dans la
    même annulation (`app/extend-follow.ts`). Le panneau liste les éléments qui en suivent un autre ; ✕ retire une
    liaison.
- **Pousser** (bouton du groupe **Modifier**, après « Prolonger élément ») : les éléments sélectionnés — un caisson avec
  ses façades, une Répartition avec ses pièces, sinon le corps seul ; un clic dans la vue en choisit un, Maj + clic en
  ajoute — avancent d'un **pas** à chaque flèche du clavier. Le pas se tape au clavier, l'outil ouvert (les chiffres vont
  dans le champ « Pas »), et la flèche suivante pousse de ce pas. Les flèches suivent la vue : ← et → le long de l'axe du
  sol le plus proche de la droite de l'écran, ↑ et ↓ vers le fond ou vers soi ; **Page↑ / Page↓** (ou Maj + ↑ / ↓)
  montent et descendent. Six boutons font de même, le total poussé s'affiche, « Remettre à zéro » l'annule. On voit le
  résultat à chaque pas ; **OK** (ou Entrée) le garde en une annulation, **Annuler** (ou Échap) remet tout
  (`app/push-tool.ts`). Un élément poussé vers un autre corps — le caisson voisin, un mur, un haut au-dessus —
  **s'arrête à son contact**, sans y entrer, et un message dit contre quoi (« Déjà contre « Bas 1 porte 400 » » s'il le
  touche déjà) ; ce qu'il touche déjà en passant (le plan de travail au-dessus, une plinthe) ne l'arrête pas.
  Un caisson poussé **emporte son électroménager** (un four dedans, une plaque ou un évier sur le plan au-dessus, une
  hotte au-dessus, un groupe filtrant dessous) ; un four ou un micro-ondes encastré cliqué pousse son caisson ; une
  plaque, un évier, une hotte, un appareil posable cliqué se poussent entiers. La découpe du plan de travail suit
  l'appareil, le long du plan.
- **Coller par face** (bouton du groupe **Modifier**, après « Coïncidence », sur les onglets Conception 3D, Dressing et
  Cuisine) : on sélectionne une face de l'élément à déplacer (ou on la clique, l'outil ouvert), puis on clique une face
  d'un autre élément, et le premier **se colle sur l'autre** aussitôt, en une annulation. Des faces qui se regardent
  (le côté d'un caisson et celui du voisin, le dessous d'un haut et le dessus d'une colonne), ou d'équerre (le côté
  d'un haut et le devant d'une colonne) : la face se **pose sur l'autre** — tournée d'abord s'il le faut, un caisson
  entier par quarts de tour autour de la verticale, une pièce seule de l'angle qu'il faut —, ses **bords affleurant
  ceux de l'autre au coin le plus proche du clic** ; pas seulement mise dans son plan. Des faces de même sens (deux
  façades, deux dessus) affleurent seulement, le long de leur normale (`features/face-glue.ts`). Un caisson bouge avec
  ses façades, par ses **faces extérieures** (la face cliquée ne dit que le côté, jamais il n'entre dans l'autre), ou
  la pièce seule (« Ce qui bouge ») ; deux faces d'un même caisson ne bougent que la pièce. Un « Jeu » écarte (ou met
  en retrait) (`app/face-glue-tool.ts`).
- **Caisson** (groupe « Meuble ») : un meuble complet à partir de ses cotes extérieures, chaque pièce étant un
  corps nommé (« Caisson 1 — Côté gauche », « — Dessus », « — Fond », « — Étagère 2 »…).
  - *Modèles* pour démarrer : bas de cuisine 600 × 870 (socle 150), haut de cuisine 600 × 700, colonne 600 × 2200,
    penderie 1000 × 2400, placard 800 × 2000, **vitrine à portes en verre noir 800 × 2000**, haut vitré en verre noir
    600 × 700 ; tout reste modifiable.
  - *Portes* (à la création) : sans portes, pleines, ou **vitrées (cadre alu)** avec le verre (clair… **noir**) et le
    cadre (brossé ou noir) — les Façades du caisson sont faites avec lui, dans la même annulation : une porte jusqu'à
    600 mm de large, deux au-delà, à la pose, au jeu et à l'épaisseur de son standard ; avec « Remplir une largeur »,
    chaque caisson a les siennes. Elles se règlent ensuite avec l'outil Façades ; le choix est retenu pour le caisson
    suivant de la séance.
  - *Largeur, hauteur, profondeur, épaisseur* ; *socle* (le dessous est relevé, les côtés descendent au sol) ;
    *étagères* (0 à 10, réparties également) ; *fond* vissé derrière (taille extérieure, le caisson est moins
    profond d'autant), encastré entre les côtés, ou sans fond ; *construction* côtés toute hauteur ou dessus et
    dessous toute largeur. Les pièces ne partagent jamais de matière.
  - Un nouveau caisson se place à droite des corps existants, sur le même sol et le même alignement avant
    (position X, Y, Z modifiable : coin avant gauche en bas). Il se modifie depuis l'historique ou les Propriétés.
- **Répartition** (bouton du ruban **3D**, groupe **Dressing**, à côté d'« Étagères » et « Cloisons ») : elle se
  travaille **directement dans la vue 3D**, comme dans Polyboard, la caméra libre et les corps opaques : les panneaux
  qu'elle fera sont montrés en **volumes orange** (à la profondeur demandée) pendant qu'on règle les valeurs, un clic
  dans la vue pose son coin bas-gauche sur le plan de face, et l'OK (Entrée) les fait. Ses lignes vont dans une
  **nouvelle esquisse du plan XZ** (de face : le meuble est debout, ses niches ouvertes vers l'avant), qu'on n'a pas
  à ouvrir ; « Extruder les panneaux » est coché. C'est un rectangle de **hauteur × longueur** (par exemple 250 × 180 cm) divisé en
  **2 à 12 cases égales, une par porte**, avec ses côtés dessinés à leur épaisseur (deux traits, 18 mm par défaut).
  - **Côtés** : chacun est **simple** (un panneau) ou **double** (deux panneaux dos à dos, où deux modules se
    rejoignent). Au départ : 2 cases = un simple ; 3 = simple et double ; 4 = simple, double, simple ; 5 = simple,
    double, double, simple (les doubles au milieu) ; et chaque côté se change un par un (« Côté 1 », « Côté 2 »…).
  - **Largeur d'une case** : `(longueur − 2 × épaisseur − côtés) / cases` (1500 mm, 18 mm, 3 cases : 470 mm, comme
    l'esquisse du lit), écrite dans la vue pendant qu'on règle.
  - **Face du mur** (en haut du panneau, sous son titre, comme la bande du linéaire de la cuisine) : la Répartition
    vue de face, à l'échelle — ses panneaux, ses niches, les étagères et cloisons qui les divisent, et ce qui les
    équipe (façades de tiroirs, tringles, portes en pointillés ; les poignées n'y sont pas dessinées) — et ses cotes
    (en cm, en **rouge**), **dehors comme sur un plan**, chacune entre deux lignes d'attache : au-dessus, la largeur
    de chaque case, puis la longueur ; à gauche, bout à bout, la hauteur libre des niches de la première case (socle
    compris dans le dessin) ; à droite, celle des niches de la dernière case, puis la hauteur. Dans le dessin restent
    l'épaisseur des panneaux (« ép. 1,8 », sous le coin gauche), celle d'une étagère ou d'une cloison quand elle
    n'est pas celle des panneaux, la hauteur libre des niches des cases du milieu (et la largeur d'une niche plus
    étroite que sa case), la hauteur de
    chaque façade de tiroir sur elle, la hauteur d'une tringle depuis le sol sous elle (« tringle 180 ») et celle du
    socle ; toutes viennent du calcul de la 3D, et une niche trop petite pour sa cote n'en a pas. Chaque cote se lit
    sur une **ligne de cote fléchée** qui va d'un bout à l'autre de ce qu'elle mesure — d'une étagère à la suivante,
    de côté à côté, du haut au bas d'une façade, du sol à la tringle, sur toute la longueur, la hauteur et la largeur
    de chaque case — la valeur à côté (seules les épaisseurs, trop minces, n'ont que leur chiffre). Elle suit le
    panneau (hauteur, cases, largeurs, côtés), étagères refaites comprises. Un
    clic dans une case ne choisit rien (pas de cadre). Chaque côté entre deux cases se tire (curseur ↔ au survol,
    sa poignée laiton cachée jusque-là) : la case de gauche change de largeur au centimètre, celle de droite prend la
    différence, la longueur reste, et « Largeur des cases » passe en proportions. Sur la face encore :
    - **Déplacer** : une étagère ou une cloison cliquée (cadre laiton, une barre sous la face) se tire le long de son
      axe ; elle s'accroche au **pas de 32 mm** du système de perçage (`DRILLING_32`), compté depuis le bas de sa
      niche, ou à **l'étagère d'une case voisine** quand elle passe à moins d'un demi-pas (Alt : librement), jamais à
      moins d'un pas de ses voisines ; ses deux niches s'affichent pendant le geste et se partagent le changement. Les
      flèches la poussent d'un pas. Des tiroirs ou une tringle se tirent dans une **niche vide** pour y être portés ;
      une tringle se monte ou se descend (au centimètre depuis le sol, accrochée aux autres tringles ; flèches : 1 cm).
    - **Dupliquer** (Ctrl + D) : une étagère de plus juste au-dessus, au même écart que sous elle (au milieu de la niche
      quand la place manque) — ce qui équipait les niches du dessus monte d'un rang avec elles ; des tiroirs ou une
      tringle copiés dans la niche vide la plus proche (même rangée d'abord). « + tiroir » / « − tiroir » (1 à 8).
    - **Aligner** : l'étagère (ou la cloison, ou la tringle) va à la hauteur de la plus proche d'à côté.
    - **Supprimer** (Suppr) : une étagère ou une cloison retirée, ses deux niches n'en font plus qu'une, les autres
      restent en place ; la niche fusionnée garde ce que contenait celle du bas (de gauche), ou celle du haut quand
      celle du bas était vide, et ce que contenait l'autre s'en va ; la dernière d'une division emporte son étape, ses
      traits et ses corps. Des tiroirs ou une tringle supprimés.
    - **Cotes sur place** : un clic sur n'importe quelle cote l'ouvre dans un champ, dans l'unité du projet — longueur,
      hauteur, largeur d'une case (les autres se partagent le reste), épaisseur des panneaux, d'une étagère (toute sa
      division), du socle, hauteur d'une niche (les niches de la même mesure que sa voisine se partagent la différence et restent égales, une niche de sa propre mesure garde la sienne ; la largeur se règle de même entre
      cloisons), d'une façade de tiroir (la niche grandit d'autant par façade), d'une tringle depuis le sol. Entrée
      règle, Échap laisse. Une cote impossible est refusée avec la raison.
  - **Tout apparaît aussitôt dans la 3D** : chaque réglage du panneau — hauteur, longueur, épaisseur, cases, largeurs, côtés,
    dessus et dessous, socle, qui passe aux angles, extrusion et profondeur, portes et leurs réglages, sens
    d'ouverture, fond, position — et chaque geste sur la face est enregistré dès qu'il est fait (un champ chiffré à
    Entrée ou en le quittant) : la 3D est refaite, le panneau reste ouvert, une étape d'historique et une annulation
    (Ctrl + Z) chacun ; après une annulation, le panneau reprend les valeurs du document. La croix ✕ (ou Échap)
    ferme l'outil sans rien défaire, Entrée enregistre et ferme. Une **nouvelle** Répartition est faite dès son
    premier réglage ou son premier clic dans la vue, puis se règle comme une autre.
  - **Les murs du dressing** (en haut du panneau, sous son titre, comme les linéaires de la cuisine) : pour une
    Répartition faite sur un Plan de dressing, un bouton par zone du plan (« Mur A », « Mur B », les coins…), celle
    qu'on règle marquée ; un clic ouvre la Répartition d'une autre zone — faite d'abord, en une étape, si elle ne
    l'est pas encore. « Voir mur A isolé » la montre seule, de face, avec ses cotes (rien ne change dans le projet),
    « Tout montrer » rend tout ; une autre zone ouverte pendant ce temps est celle qu'on voit seule.
  - **Le panneau et la 3D en même temps** : pendant qu'une Répartition déjà faite est ouverte dans son panneau, la
    vue 3D reste libre — sélectionner, tourner, tirer une étagère par sa poignée, supprimer un corps, ouvrir une
    porte — sans message qui l'empêche ; chaque changement fait dans la 3D (ou ailleurs) est relu aussitôt par le
    panneau et sa face, ce qui y était choisi le restant. Échap ou la croix ✕ ferme le panneau.
  - **Socle** (option, décochée au départ) : le **dessous est relevé** de la hauteur du socle (4 cm proposés, à régler) ;
    il reste de la même épaisseur que le reste, et le vide du socle dessous est une zone à part. Les côtés qui
    « passent » descendent jusqu'en bas, au travers du socle ; les autres s'arrêtent sur le dessous relevé.
  - **Sans côté** : chaque liste « Côté n » (quel que soit le nombre de cases, de 2 à 12) propose, en plus de Simple
    et Double, **« Sans côté »** : les deux cases voisines ne font qu'une niche, large des deux cases **plus
    l'épaisseur du côté absent** (les cases gardent la largeur qu'elles auraient avec lui). Par exemple 3 cases,
    Côté 1 Double et Côté 2 Sans côté : une niche étroite et une niche de 2 cases + 1 épaisseur. Le panneau donne la
    largeur de chaque niche.
  - **Largeur des cases** : « Égales » par défaut, ou **« En proportions »** : chaque case reçoit un nombre de parts
    (Case 1, Case 2…), et le panneau montre sa largeur à côté. 1 et 2 : la seconde case est deux fois plus large
    (une armoire d'1 porte + 2 portes) ; 1, 2, 1 : la case du milieu deux fois plus large que les deux autres.
    Les côtés et les dessus gardent leur épaisseur, seule la longueur libre est partagée.
  - **Côté double (3 cases)** : trois niches égales avec un seul côté double, **à droite** (2 portes + 1, par défaut)
    ou **à gauche** (1 + 2 portes), choisi d'une liste ; les listes Côté 1 et Côté 2 suivent.
  - **Qui passe aux angles** : pour les côtés extérieurs, les simples et les doubles, on choisit « Le dessus passe » (le
    dessus et le dessous d'un seul tenant, le côté s'arrête contre eux) ou « Le côté passe » (il monte de bout en bout
    et **coupe** le dessus et le dessous en morceaux). Par défaut les **doubles coupent** le dessus et le dessous : 3
    cases = 2 modules, 5 cases = 3 modules (2 + 1 + 2 portes). Les **côtés extérieurs** peuvent aussi être assemblés
    **« D'onglet (45°) »** : le dessus et le côté se rejoignent sur la diagonale de l'angle, coupés tous deux à 45°, et
    de même pour le dessous quand il n'y a pas de socle (avec un socle, le côté descend jusqu'au sol et le dessous
    s'appuie contre lui). Les panneaux d'onglet sont montrés avec leur coupe dans l'aperçu en volume.
  - **Extrusion** (option « Extruder les panneaux », avec sa **profondeur**, 50 cm au départ) : en même temps que la
    répartition, **chaque élément est extrudé en un corps à part** (les panneaux se touchent : une seule extrusion les
    souderait), **nommé** d'après ce qu'il est : **Dessous** et **Dessus** (« Dessous 1 », « Dessous 2 »… quand les
    côtés qui passent les coupent en morceaux) et **Côté 1, 2, 3…** de gauche à droite (la suite si on en ajoute
    d'autres) ; les niches restent vides. L'esquisse et toutes les extrusions forment une seule étape d'annulation.
  - **Position** : un clic dans la vue pose le coin bas-gauche (ou « Coin X / Y »), et la répartition se voit en
    pointillés dans l'esquisse avant OK ; elle s'ajoute à l'esquisse ouverte (qui garde ce qu'elle a), en une étape
    d'annulation. **Chaque panneau, chaque morceau de dessus et de dessous et chaque case est une zone fermée**, prête
    à extruder zone par zone, et chaque niche se divise ensuite avec **Étagères**. Le calcul est dans
    `sketcher/partition.ts`, l'outil dans `sketcher/partition-tool.ts`.
- **Points des lignes** : les petits carrés noirs aux extrémités des lignes ne sont plus affichés au départ (ils
  restent cliquables, et s'affichent quand on les survole ou les choisit) ; le bouton « Points » du groupe Affichage
  les montre de nouveau, le choix est retenu. Les points violets (arêtes de corps) et l'origine restent visibles.
- **Historique paramétrique de la Répartition** : la répartition et chaque division de ses niches par des étagères
  sont des **étapes de l'historique** (la barre « Historique » en bas), dans l'ordre : « Répartition 3 cases »,
  « Étagères 1 », « Étagères 2 »… Cliquez une étape pour ouvrir sa fiche (nom, **Modifier**, **Supprimer**) : **Modifier**
  rouvre l'outil avec ses valeurs, et à l'OK **tout est refait dans l'ordre** : on change le nombre de cases, les côtés,
  l'épaisseur, le socle, ou le nombre d'étagères d'une niche, et les étagères suivent leur niche (une niche désignée
  par sa case, puis par les divisions faites dedans). Une division dont la niche n'existe plus (moins de cases) est
  retirée, en le disant. Les corps extrudés sont refaits aussi (les anciens sont remplacés, et chacun garde sa matière,
  ses chants, son calque et son apparence). Une **pièce sélectionnée** mène à son étape : le panneau Sélection d'une
  étagère propose « **Modifier Étagères 2** », où « Celle du haut fixe » met par exemple 40 cm sous le dessus et répartit
  le reste, les cotes de la vue suivant le réglage avant l'OK. Supprimer la répartition
  supprime aussi les divisions de ses niches. Seules les répartitions faites avec cette version ont leur historique ;
  les anciennes restent des lignes ordinaires. Le moteur est dans `sketcher/partition-history.ts`.
- **Étagères** (bouton du ruban **3D**, groupe **Dressing**, comme la division d'un compartiment de Polyboard) :
  elle se travaille **dans la vue 3D** : les niches de la répartition (celle choisie dans le navigateur, sinon la
  dernière) qui peuvent encore être divisées sont des **volumes bleus** entre les panneaux, celui sous le pointeur
  s'éclaire, un clic le choisit (vert), les étagères à faire sont montrées en **volumes orange**, et l'OK (Entrée)
  les fait, « Extruder les étagères » coché à la profondeur des panneaux ; les niches obtenues sont aussitôt
  cliquables, « Terminer » (Échap) ferme l'outil. Dans l'esquisse de la **Répartition**, on clique une **niche** (une case, une zone fermée rectangulaire) et on la
  divise par des étagères, dessinées à leur épaisseur (deux traits). On peut **choisir plusieurs niches** (un clic
  ajoute une niche, un clic sur une niche choisie la retire) : elles reçoivent toutes les mêmes étagères, en un seul OK. On règle le **nombre d'étagères** (1 à 20),
  l'**épaisseur** (18 mm au départ) et le partage de la hauteur : **niches égales**, ou la **niche du bas** (ou **du
  haut**) à une hauteur donnée, les autres se partageant le reste. Entre le dessous et une étagère, entre deux
  étagères ou entre une étagère et le dessus, on obtient une **niche**, que l'on peut cliquer et **diviser à son
  tour** : l'outil reste actif jusqu'à Échap (« Terminer »). Les étagères se voient en pointillés avant OK, et chaque
  niche et chaque étagère est une zone fermée, à extruder. L'option **« Extruder les étagères »** (même
  profondeur que celle de la Répartition) fait de **chaque étagère un corps** nommé **Étagère 1, 2, 3…** (la suite
  d'une niche à l'autre). Le calcul est dans `sketcher/shelves.ts`.
- **Onglets de projets** (comme Fusion) : une barre au-dessus de la vue, un onglet par projet ouvert, et un **+** pour
  créer un projet ou en ouvrir un autre, jusqu'à 8. Chaque projet garde son éditeur, donc son historique, sa vue et ce qui
  n'est pas enregistré, et passer d'un onglet à l'autre est immédiat. Fermer un onglet modifié propose de l'enregistrer.
  La liste est gardée dans ce navigateur et revient au rechargement, chaque onglet ne se chargeant qu'au premier clic
  (`app/project-tabs.ts`).
- **Supprimer une étagère ou une cloison** d'une Répartition la retire de sa division : ses traits s'en vont, les deux
  niches qu'elle séparait n'en font plus qu'une, les autres pièces restent où elles sont et gardent matière et
  apparence. Ce que contenait une niche fusionnée (divisions, penderie, tiroirs) part avec elle, après confirmation ; la
  dernière étagère d'une étape emporte l'étape, et Supprimer une étape « Étagères n » dans l'Historique emporte ses
  étagères. Une **esquisse dont le dernier corps est supprimé** s'en va avec lui, ses traits et ses équipements compris,
  et supprimer une Répartition dans l'Historique emporte ses corps. Le tout est une annulation
  (`document/shelf-removal.ts`).
- **Niche** (bouton du ruban **3D**, groupe **Dressing**, à côté d'« Étagères » et « Cloisons ») : on clique une niche
  d'une Répartition et on tape sa **hauteur** ; les étagères qui la bordent se déplacent, ce qu'elle contient suit, les
  niches déjà réglées gardent la leur et les autres se partagent le reste. L'aperçu et les cotes suivent le champ, OK est
  une annulation, et l'outil reste pour régler d'autres niches. « Partager avec les autres niches » rend une niche réglée
  au partage. L'étape « Étagères n » garde ces hauteurs (`app/dressing/niche-height-tool.ts`, `heights` de `sketcher/shelves.ts`).
- **Cloisons** (bouton du ruban **3D**, groupe **Dressing**, à côté d'« Étagères ») : la même division que les
  étagères, mais **en travers** : des panneaux **debout**, du bas au haut de la niche, qui la coupent **de gauche à
  droite**. On clique une ou plusieurs niches de la répartition, on règle le **nombre de cloisons** (1 à 20), leur
  **épaisseur** et le partage de la largeur (niches **égales**, ou **celle de gauche** / **celle de droite** à une
  largeur fixe) ; elles sont dessinées en pointillés avant l'OK. Chaque cloison devient un corps « **Cloison n** »
  (extrusion cochée, à la profondeur des panneaux). Les niches obtenues se divisent à leur tour, par des étagères ou
  d'autres cloisons. Chaque division est une étape « **Cloisons n** » de l'historique paramétrique, modifiable ou
  supprimable comme celles des étagères ; quand la répartition est refaite, les corps refaits sont numérotés à partir
  de 1. Changer une étape (Répartition, Étagères, Cloisons) depuis l'**Historique** rouvre son outil dans la vue 3D,
  sa niche choisie. Le calcul est celui des étagères (`sketcher/shelves.ts`, champ `vertical`) ; la vue 3D de ces
  outils est dans `app/joinery-3d.ts` et `viewport/joinery-view.ts`.
- **Portes à cadre** (rubrique « Portes » de la Répartition, « Style des portes ») : une porte plate, ou **à cadre**,
  dite « shaker » : un cadre (70 mm par défaut) autour d'un panneau en retrait (6 mm), usinée dans la masse comme
  en MDF. La porte reste une seule pièce dans la liste de débit ; charnières, poignées, ouverture d'un clic et sens
  d'ouverture ne changent pas. Un cadre trop large pour la porte, ou un panneau de moins de 3 mm, sont refusés.
- **Portes vitrées (cadre alu)** (« Style des portes » de la Répartition et de Façades sur une Répartition, Porte sur
  niches, Façades d'un caisson de cuisine, clic droit sur une porte) : un cadre en profilé aluminium (20 mm de large
  par défaut, réglable ; brossé ou noir) autour d'un verre trempé de 4 mm (clair, extra-clair, dépoli, fumé, bronze ou noir),
  au milieu de l'épaisseur, engagé de 5 mm dans la rainure du profilé. Le verre est un corps à part (« Vitre porte n »)
  qui pivote avec sa porte ; cadre et verre prennent l'apparence de l'aluminium et du verre choisis (tant qu'on ne
  leur en donne pas une autre). Ni l'un ni l'autre ne se scie : ils sortent de la liste de débit et vont au devis et
  à la liste d'achat, le verre au m² (« Verre trempé 4 mm … »), le profilé au mètre (tour de chaque porte), avec des
  charnières pour cadre alu ; tarifs indicatifs en MAD (`features/glass-door.ts`). Un cadre de moins de 10 mm, trop
  large pour la porte, ou une porte de moins de 8 mm d'épaisseur sont refusés.
- **Poignées en 3D** : les portes de la Répartition et les tiroirs des niches qui ont leurs trous de poignée
  reçoivent aussi la poignée elle-même, devant ses trous, à l'entraxe de la poignée choisie dans la Quincaillerie :
  deux pieds et une barre qui dépasse de 15 mm, ou un bouton. C'est de la quincaillerie (hors liste de débit, comptée
  au devis). Une poignée de porte tourne avec sa porte quand on l'ouvre d'un clic (un clic sur la poignée ouvre
  aussi la porte), une poignée de tiroir sort avec son tiroir.
- **Portes de la Répartition** (rubrique « Portes » de son panneau, quand les panneaux sont extrudés) : « Une porte
  par case » pose une porte en applique devant chaque case. Elle couvre le dessus, le dessous (au-dessus du socle) et
  le **côté extérieur** en entier. Sur un **côté simple**, deux portes voisines s'en partagent l'épaisseur (la moitié
  chacune). Sur un **côté double**, chaque porte couvre en entier le panneau de sa case. Des cases **sans côté**
  entre elles ont chacune leur porte, jointives au milieu de la place du côté absent (le fond « un par case » reste
  d'un seul tenant derrière elles). Réglages : le jeu entre les portes (3 mm, la moitié aux bords extérieurs),
  l'épaisseur (18 mm) et les trous de poignée (entraxe 128 mm, le long du bord opposé aux charnières). Le **sens
  d'ouverture** se choisit porte par porte (« S'ouvre à gauche » ou « à droite », charnières de ce côté) ; par défaut
  il alterne, gauche puis droite. Dans la vue 3D, un clic sur une porte l'**ouvre** (elle tourne de 100° vers l'avant
  autour de ses charnières) et un second clic la referme, comme les tiroirs. Un clic donné pendant qu'un outil
  est ouvert va à cet outil seul : il n'ouvre aucune porte, même si l'outil se ferme sur ce clic. Les portes sont fabriquées par une opération « Portes » qui suit la répartition quand on la
  modifie ; décocher, ou ne plus extruder, les retire. Les charnières (2 à 4 par porte selon la hauteur) et les
  poignées vont au devis (`document/partition-doors.ts`, `features/niche-parts.ts`).
- **Fond de la Répartition** (rubrique « Fond », quand les panneaux sont extrudés) : « Panneau de fond » pose un fond
  en applique **derrière** les panneaux. Il couvre jusqu'à leurs bords le dessus, le dessous et les côtés, sur toute
  la hauteur et toute la longueur du placard. Réglages :
  - l'épaisseur (8 mm par défaut) : jusqu'à 10 mm le fond est en HDF, au-delà il est de la matière des panneaux ;
  - la découpe : **un seul fond** pour tout le placard, ou **un fond par case**. Par case, le fond suit les côtés comme
    les portes : coupé au milieu d'un côté simple, entier sur un côté double, un seul pour des cases sans côté.

  Une opération « Fond » le fabrique. Elle suit la répartition quand on la modifie ; décocher la rubrique, ou ne plus
  extruder les panneaux, retire le fond.
- **Penderie** et **Tiroirs** (groupe **Dressing**, pour les dressings) : on **équipe une niche** d'une répartition,
  dans la vue 3D comme avec Étagères — on clique une ou plusieurs niches (une niche choisie se reclique pour la
  retirer), on règle, les pièces sont montrées en **orange**, puis OK (une seule annulation). La liste « Équipement »
  du panneau passe de l'un à l'autre.
  - **Penderie** : une **tringle Ø25** (diamètre réglable de 10 à 50 mm) d'un côté à l'autre de la niche, à
    **mi-profondeur**, son axe à **6 cm sous le haut** (réglable), sur **deux supports** contre les côtés. Le panneau
    donne la longueur de la tringle et sa hauteur au-dessus du bas de la niche. Tringle et supports comptent au
    **devis** (la tringle **au mètre**, 86,40 MAD HT/m, les supports à la pièce, 27 MAD, prix réglables) mais **ni au débit
    ni à l'export CNC**. Pour une double penderie, on divise d'abord la niche par une étagère, puis une tringle dans
    chaque niche.
  - **Tiroirs** : **1 à 8 tiroirs encastrés** qui se partagent la hauteur de la niche : façades au nu des panneaux,
    avec un **jeu en haut** (au-dessus de la première façade), un **jeu entre façades** et un **jeu en bas** (au-dessous
    de la dernière), 3 mm chacun et réglés à part (les anciens tiroirs gardent le même jeu partout), et un **jeu de côté**
    (à gauche et à droite, 3 mm), réglés à part, à l'**épaisseur** voulue (18 mm), chacune avec son
    **caisson** (côtés, avant, arrière en contreplaqué bouleau, fond en HDF) sur **coulisses** de 12,5 mm, de la
    longueur du commerce qui tient dans la profondeur (350 mm pour 40 cm de profondeur), et ses **trous de poignée**
    (entraxe 128 mm) si on le demande. Coulisses et poignées vont au devis, les pièces au débit. Pour des tiroirs sous
    une penderie, on divise d'abord la niche par une étagère.
  - **Pose des façades** (liste « Façades » des Tiroirs, « Pose » de la Porte sur niches) : **encastrée** (dans la
    niche, au nu des panneaux) ou **en applique** (devant les panneaux, sur la moitié de ceux autour de la niche — le
    panneau entier au bord du meuble —, comme une porte de case). Des tiroirs encastrés d'office, en applique au choix :
    leurs jeux de bord (haut, bas, côtés) sont alors partagés avec la façade voisine (la moitié de chaque côté), et
    leurs caissons restent dans la niche. Une porte sur niches en applique d'office, encastrée au choix : un jeu tout
    autour dans ses niches (`NicheFeature.mount`, `drawerFronts` et `doorBox` dans `features/niche-parts.ts`).
  - Chaque niche équipée est une opération de l'historique (« **Penderie 1** », « **Tiroirs 1** »), dont les pièces
    sont des corps (« Penderie 1 — Tringle », « Tiroirs 1 — Façade tiroir 1 »…). Elle **suit sa niche** : changer la
    répartition, ses étagères ou ses cloisons la refait à la nouvelle taille ; si la niche disparaît, l'opération le
    dit. La modifier depuis l'historique rouvre l'outil, sa niche choisie. Les calculs sont dans
    `features/niche-parts.ts` (pur), la construction dans `features/niche.ts`, l'outil dans `app/dressing/niche-tool.ts`.
- **Panneaux** (groupe « Meuble », comme la conception de squelette de JoinerCAD) : on dessine le squelette
  du meuble dans une esquisse (par exemple sur le plan de face : le contour du caisson et une ligne par
  étagère), puis chaque ligne devient une planche, un corps à part.
  - *Épaisseur* (18 mm par défaut) et *profondeur* (le long de la normale de l'esquisse, signée) ;
  - *Côté* : sur le contour, les planches vont vers l'intérieur (les traits sont les cotes extérieures), sont
    centrées sur les traits, ou vont vers l'extérieur ; une ligne intérieure (étagère) est toujours centrée ;
  - *Aux coins* : les montants passent (dessus, dessous et étagères s'arrêtent entre eux) ou l'inverse ; les
    planches ne partagent jamais de matière ;
  - les corps s'appellent « Panneaux 1 — panneau n » ; l'opération se modifie depuis l'historique ou le panneau
    Propriétés, et suit l'esquisse quand on la modifie.
  - **Extruder une esquisse de lignes seules** (deux traits en L au sol…) ouvre Panneaux sur elle : chaque ligne
    devient une planche debout, sa profondeur étant sa hauteur depuis l'esquisse. C'est le moyen de monter des
    parois à partir de leur tracé au sol.
- **Toit à deux pans ou arrondi** (bouton « Toit » du groupe Créer, à côté d'Extrusion ; comme dans SketchUp) : on trace une
  seule ligne sur le dessus d'un bloc, parallèle à un de ses bords, puis **Toit** (ou Extruder sur cette ligne). Sans
  sélection, l'outil prend la dernière ligne tracée sur un dessus.
  - Une flèche plantée sur la ligne se tire vers le haut, ou on tape la hauteur du faîtage.
  - Le dessus se plie en toit à deux pans, soudé au bloc : une niche à chien, une cabane, un abri.
  - **Forme** : deux pans, ou **arrondi** (une voûte : l'arc passe par les deux bords du dessus et par la ligne
    levée ; levée de la moitié de la largeur, c'est un demi-cercle, plus basse une voûte surbaissée).
  - La coupe (triangle ou arc) est une esquisse sur le pignon, extrudée sur toute la longueur du dessus. Une ligne
    hors du milieu donne deux pans inégaux.
  - Une annulation ; la ligne tracée est cachée (`features/gable.ts`, `app/gable-tool.ts`).
- **Dessiner sur le corps** (groupe « Curic », comme les outils Ligne, Rectangle et Cercle de Curic DIO — *Draw In Object*) :
  on trace directement sur une face d'un corps, depuis la vue 3D, sans ouvrir d'esquisse. Choisissez *Ligne / polyligne*,
  *Rectangle* ou *Cercle*, survolez une face : les **distances aux bords les plus proches** (les « SnapDims » de DIO, ↔ et
  ↕, ici en pointillés rouge et bleu avec leur valeur) s'affichent et peuvent être **saisies** (« Bord ↔ », « Bord ↕ »)
  pour placer le premier point exactement. Le **centre de la face** et le **milieu de chaque trait** (arête) sont marqués d'une
  **croix** bleue : le pointeur s'y accroche (de loin : une dizaine de pixels pour un coin, dix-huit pour une croix),
  la croix visée devient orange et la boîte du bas dit « Centre de la face » ou « Milieu du trait » ; les croix restent
  pendant le tracé. Sinon les distances aux bords sont arrondies. Ensuite : *longueur* et *angle* d'une ligne, *largeur* et *hauteur* d'un rectangle,
  *rayon* d'un cercle, à saisir ou à cliquer ; une ligne se poursuit jusqu'à Entrée (ou un clic sur son dernier point),
  Échap reprend le tracé. Le résultat est une esquisse sur la face (le contour de la face en référence), et, comme le
  mode 3D de DIO, un tracé **fermé** (rectangle, cercle) enchaîne avec **tirer / pousser** (case « Puis tirer / pousser »).
  Survoler une autre face avant le premier point change d'objet (le « Get Object » de DIO). Les maths sont dans
  `sketcher/face-draw.ts`.
  Les mesures ne s'écrivent plus dans la vue : elles s'affichent dans une **boîte de valeur en bas** de la vue (comme la
  boîte « Mesures » de SketchUp), en direct quand le pointeur bouge, et les chiffres tapés au clavier y vont
  **directement**, sans cliquer de champ — Entrée les applique : deux distances aux bords pour le premier point
  (`120;45`), puis longueur et angle (`500;90`), largeur et hauteur (`300;150`), rayon, ou décalage ; « ; » sépare deux
  valeurs, une valeur vide est laissée au pointeur, Retour arrière efface, Échap vide la saisie. Seuls restent dans la vue
  les pointillés rouge et bleu qui montrent d'où les distances aux bords sont mesurées.
  **Décalage du contour** (même outil) : le contour de la face survolée, décalé vers l'intérieur de la distance qui sépare
  le pointeur du bord le plus proche (ou de la distance tapée ; négative : vers l'extérieur), angles vifs conservés, même
  pour une face en L. Un clic le pose en esquisse sur la face et enchaîne avec tirer / pousser (cadre, feuillure,
  panneau en creux) ; un décalage trop grand pour la face est refusé.
  - Une face plane bordée d'un arc (le pignon d'un toit arrondi) : son décalage longe l'arc, et l'esquisse reprend
    un vrai arc (concentrique), pour une paroi creusée lisse, sans facettes.
  - Une **face plane inclinée** (le pan d'un toit à deux pans) : le tracé se pose dans le plan de la face, son axe x
    le long de son plus grand bord (l'égout). Ligne, rectangle, cercle et décalage y marchent comme sur les autres
    faces, et tirer / pousser suit la pente.
  - **Sur une face courbe** (le dessus d'une voûte, un morceau de cylindre d'axe X, Y ou Z) : le Décalage suit la
    face.
    - Le contour reste sur elle, à la distance du bord mesurée sur la face, le long de l'axe comme de l'arc.
    - Un clic le fixe ; le panneau règle le décalage et la **profondeur** : un panneau courbe creusé (un trou s'il
      traverse la paroi), ou en relief si elle est négative.
    - C'est une couronne dessinée sur le pignon et extrudée le long de la face, en une annulation
      (`features/curved-offset.ts`, `app/curved-offset.ts`).
    - Les autres tracés (ligne, rectangle, cercle) restent sur les faces planes ; pour évider tout le volume,
      **Coque** (groupe Modifier).
  - **Décalage sur tout le toit** (choix « Décalage sur : Tout le toit (les deux pans) ») : en survolant un pan d'un
    toit à deux pans, le contour passe par-dessus le faîtage, à la même distance des deux égouts (le long des pans)
    et des deux pignons.
    - Un clic le fixe ; la profondeur creuse un panneau en V d'épaisseur constante sous les deux pans, ou le met en
      relief.
    - C'est une coupe dessinée sur le pignon et extrudée le long du faîtage (`features/roof-offset.ts`). L'autre
      égout est pris au bord du corps, à la hauteur du premier, comme les toits de l'outil Toit.
- **Magie extrude — tracé et extrusion** (groupe « Curic », comme Curic DIO 2) : on trace sur une face et on tire ou pousse
  aussitôt, en trois gestes :
  1. **Survoler** : un coin de la face sous le pointeur (point orange), une arête (en vert #63df0f, épaissie) ou l'intérieur de la face
     (teintée). **Ctrl** passe d'une ligne au double trait.
  2. **Après un clic sur une arête**, sa copie parallèle suit le pointeur — sur sa face, ou **sur une autre face**
     où on l'amène (arête du haut d'une cloison copiée sur le sol…). **Après un clic sur un coin**, le trait traverse la
     face, à la distance du coin comptée le long du côté suivi. Les **cotes vers les deux bords** s'affichent dans la vue
     et dans le panneau ; la distance se tape aussi (elle fige le trait). En **double trait**, la largeur proposée est
     l'**épaisseur du panneau** ; **Tab** place le pointeur sur le 1er trait, le 2e ou au centre ; le retrait peut
     valoir 0 (le premier trait est l'arête) ; la largeur proposée est l'épaisseur réelle sous le pointeur. Un clic pose le trait ; OK à cette étape crée le tracé seul.
  3. **Tirer ou pousser** la bande (ou la face cliquée à l'étape 1) : **tirer ajoute** de la matière (union : une
     cloison qui sort d'un mur), **pousser creuse** (soustraction : une rainure, une feuillure) ; **Tab** inverse. La
     hauteur suit le pointeur ou se tape. **Viser un coin ou un trait** d'un corps — un autre, ou le même — arrête la
     hauteur à son niveau (point vert), comme la cible de « Déplacer » dans Fusion : une cloison s'arrête pile à la
     hauteur de la paroi d'en face. Clic, OK ou Entrée termine ; Échap revient d'une étape.
  - **Zone d'esquisse** : à l'étape 1, l'intérieur d'une zone fermée d'une esquisse (devant les corps) se tire comme
    une face : un nouveau corps, ou, pour une esquisse dessinée sur un corps, un ajout (tirer) ou un creusement (pousser).
  - Le résultat : une esquisse « Tracé n » sur la face et une « Extrusion n » de sa bande sur le corps, en une seule
    annulation ; la bande suit la forme de la face (face en L, face trouée).
- **Double-clic : le meuble entier** (`app/select-whole.ts`) : un double-clic sur une pièce, dans la vue ou dans le
  navigateur, sélectionne tout le meuble dont elle est une pièce — un caisson avec ses côtés, dessus, dessous, fond,
  étagères, portes et tiroirs, une Répartition avec ses panneaux, portes et niches. Déplacer, Supprimer, Copier, les
  cotes prennent alors le meuble entier. Hors d'un outil et d'une esquisse ; une pièce seule reste seule.
- **Sélection++** (comme Curic Select++ ; bouton en bas de la colonne Vue, sous « Affichage », pour l'allumer ou l'éteindre, retenu par le navigateur) : en survolant un corps à la souris, ses niveaux
  s'affichent près du pointeur — l'ensemble (toutes les pièces d'un caisson, de panneaux, d'une symétrie…), la pièce,
  la face — et le niveau courant est en vert dans la vue. **Ctrl** descend d'un niveau (puis revient en haut) ; le
  niveau choisi est gardé en passant d'une pièce à l'autre. Un clic sélectionne le niveau courant, Maj + clic l'ajoute.
  Actif avec les filtres « Auto » et « Corps » (en « Auto », une arête sous le pointeur garde son clic habituel) ;
  rien au doigt. Sur une esquisse, les niveaux sont
  l'esquisse puis le trait ou la zone sous le pointeur (avec sa longueur ou son aire).
- **Les outils Curic marchent aussi sur les esquisses** (sélection multiple, esquisse choisie dans l'arbre, ou clic
  sur une esquisse dans la vue pendant l'outil) :
- **Symétrie** (groupe « Curic », comme Curic Mirror) : copie miroir des corps et des esquisses choisis par rapport à
  un plan perpendiculaire à X, Y ou Z, dessiné en orange. Le plan se place contre le côté + de la sélection (les copies
  viennent juste à côté), au centre, contre le côté −, ou à une position saisie. Les originaux restent ; les copies de
  corps s'appellent « … — symétrie », celles d'esquisses « … (symétrie) » (nouvelles esquisses, retournées dans leur
  plan ou posées sur un plan parallèle).
- **Aligner** (groupe « Curic », comme Curic Align) : les corps et les esquisses choisis s'alignent sur une référence —
  un corps ou une esquisse — axe par axe : côté − aligné, centré, côté + aligné, accolé après (+) ou avant (−), ou sans
  bouger. Par défaut : accolé après en X, même face avant (Y), même sol (Z) — des caissons côte à côte. Avec plusieurs
  éléments sélectionnés, le dernier est la référence. Un corps aligné sur un corps suit sa référence si l'historique
  change ; sur une esquisse, il est déplacé ; une esquisse est déplacée (son plan et son origine). Une seule annulation.
  Chaque axe aligné a un **écart** : le jeu entre deux faces accolées, le retrait d'une face alignée à l'intérieur de
  celle de la référence, ou le décalage du centre vers +.
  - **Face sur face** (méthode d'Aligner, gardée pour la session ; une face sélectionnée avant d'ouvrir l'outil la
    choisit) : on clique une face plane du corps à déplacer, puis la face où la coller, sur un autre corps — **droite
    ou inclinée**, comme le pan d'un toit. Le corps tourne du plus petit angle pour que sa face se plaque contre
    l'autre, puis **ses bords affleurent ceux de l'autre au coin le plus proche du clic** (« Où » : « Bords affleurés
    au coin cliqué », par défaut) — deux faces de même taille se posent exactement l'une sur l'autre, une plus petite
    se cale dans ce coin ; ou bien le centre de sa face va au point cliqué, ou au centre de l'autre face. Les bords
    sont pris d'équerre au plus long côté de l'autre face (`flushSlide`). **Le meuble entier** : la face d'une pièce
    d'un caisson (un côté, une façade) ou d'une Répartition cliquée, c'est par défaut tout le meuble qui se pose
    (« Ce qui bouge » : le meuble entier ou la pièce seule) — le caisson par son origine, avec ses façades et
    l'électroménager posé dedans, tourné s'il le faut par quarts de tour autour de la verticale ; la Répartition par
    son esquisse, sans tourner — comme Pousser, sans opération par pièce (`app/align-whole.ts`). Le meuble entier se
    plaque par ses **faces extérieures** : la face cliquée ne dit que le côté (l'intérieur du côté gauche d'un caisson
    donne le dehors de ce côté), et c'est la face de la boîte du meuble de ce côté qui vient exactement sur celle de
    l'autre meuble — jamais dedans (`envelopeFace`). On règle un **jeu** et un
    quart de tour sur la face (0°, 90°, 180°, 270°) ; « Recommencer » reprend les deux clics. Le résultat est une
    rotation autour d'un axe quelconque, puis un déplacement, en une annulation (`features/face-mate.ts`,
    `app/align-faces.ts`).
  - **Point sur point** (méthode d'Aligner) : on clique un point du corps à déplacer — un **coin s'accroche** à
    quelques pixels (croix orange), sinon le point de la face —, puis le point où l'amener sur un autre corps : l'élément
    entier glisse pour que les deux points se touchent (un caisson avec ses façades, par sa position ; deux points d'un
    même caisson ne bougent que la pièce). « Bouger » garde certains sens : les trois, à plat (X et Y, même hauteur),
    ou un seul axe. Point rose : il part ; point vert : il arrive (`app/align-points.ts`).
- **Assemblage** (groupe « Curic », masqué par défaut) : relier deux pièces face contre face, pour que l'une suive
  l'autre. On clique une face de la pièce qui bouge, puis une face de la pièce fixe :
  - des faces opposées se mettent **en contact**, avec un jeu (0 par défaut) ;
  - des faces de même sens **affleurent**, avec un retrait ;
  - deux faces non parallèles sont refusées ; le type se change ensuite dans la liste (contact, affleurant, centré).
  Une liaison par axe, X, Y et Z, jusqu'à trois. Les faces sont celles qui bordent la pièce (la face d'une planche),
  et seuls les corps prennent le clic (pas l'esquisse sous une planche). Le résultat est un alignement calculé sur
  les pièces elles-mêmes : quand la pièce fixe change (un caisson élargi, une cote d'esquisse), l'autre suit. Il se
  rouvre dans Aligner (`app/mate-tool.ts`, test `tests/frontend/mate.test.ts`).
- **Étirer** (groupe « Curic », comme Curic Stretch) : un plan à travers le meuble (orange), perpendiculaire à X, Y ou Z,
  et une distance. Les corps traversés par le plan s'allongent (la section au plan est prolongée, le résultat reste une
  seule planche), ceux au-delà se déplacent, ceux avant restent : un caisson de 600 passe à 800 en une fois. Les
  esquisses aussi : leurs points au-delà du plan bougent, les traits qui le traversent s'allongent, les cotes suivent.
  Distance négative : raccourcir. Ce qui est concerné : la sélection, sinon tous les corps visibles et les esquisses
  libres (une esquisse déjà extrudée n'est pas étirée deux fois). Un clic sur un corps place le plan à cet endroit.
- **Réseau** (groupe « Curic », comme les « *n » et « /n » de Curic DIO) : copies répétées des corps et esquisses choisis
  le long de X, Y ou Z — avec un **pas** entre copies (une étagère tous les 32 cm), ou **réparties sur une distance**
  (3 copies sur 60 cm : une tous les 20 cm). 1 à 30 copies ; le pas proposé est la taille de ce qui est copié (copies
  accolées). Les originaux restent ; les copies de corps s'appellent « … — Réseau 1 (2) », celles d'esquisses
  « … (copie 2) ». Une seule annulation ; le réseau se modifie depuis l'historique.
  **Réseau rectangulaire** (bouton dans le groupe « Créer », comme le réseau rectangulaire de Fusion) : une grille sur
  **deux directions**, chacune avec son axe, sa quantité (l'original compris : 3 = 2 copies) et son pas ou sa distance
  répartie ; le panneau donne le nombre total de copies. Pour les corps comme pour les esquisses (les copies
  d'esquisses sont de nouvelles esquisses). Une quantité de 1 dans une direction la désactive ; au plus 400 copies.
  **Dans l'esquisse** : le même *Réseau rectangulaire* est dans le groupe « Modifier » de l'éditeur d'esquisse. Cliquez
  points, lignes, cercles ou arcs (ou « Ajouter les contours entiers »), réglez l'**angle** de la direction 1 (0° = le long
  de X ; la direction 2 lui est perpendiculaire), la quantité et le pas ou la distance de chaque direction : les
  copies s'affichent en pointillés, OK les crée en une seule annulation. Les copies gardent les contraintes qui lient
  leurs éléments entre eux (un rectangle reste un rectangle, une cote garde sa valeur) mais ne sont liées ni à
  l'original ni à l'origine.
  **Linéaire dans un rectangle** (même outil, menu « Type ») : choisissez une ligne (un côté du rectangle convient) et un
  nombre de lignes n : elles sont réparties à **égale distance à l'intérieur d'un rectangle** de l'esquisse (n lignes
  font n + 1 espaces égaux) — cloisons, étagères, façades de tiroirs. Le rectangle est celui qui entoure la sélection,
  ou celui dont vous touchez un côté (« Choisir le rectangle ») ; le sens est automatique (une ligne verticale se répartit
  en X, une horizontale en Y) ou imposé. Par défaut chaque copie va **d'un côté à l'autre** et ses extrémités sont
  **liées aux côtés** (point sur courbe) : elle suit le rectangle quand on le redimensionne ; sans cette case, ce sont
  de simples copies de la sélection centrées sur chaque coupe.
  « **Égaliser** » choisit ce qui est égal : par défaut **les ouvertures entre les panneaux** — pour des planches de
  l'épaisseur indiquée (celle de l'outil *Panneaux*, réglage partagé) dont celles du contour sont dans, sur ou hors du
  contour — les lignes sont posées pour que les n + 1 ouvertures libres aient exactement la même largeur (des lignes à
  égale distance donneraient une ouverture du milieu plus large d'une demi-épaisseur) ; ou **les lignes** (axes à égale
  distance). L'aperçu affiche la **mesure de chaque ouverture** (n lignes = n + 1 cotes) sur le bord bas ou gauche du
  rectangle, pour la lire avant de valider.
  **Réseau circulaire** : choisissez « Autour d'un axe » — les copies tournent de k × l'angle autour d'un axe parallèle
  à X, Y ou Z passant par le centre de ce qui est copié (cercle complet à égale distance, ou angle saisi) : pieds de
  table, tiroirs en étoile. Les copies de corps seulement (pas d'esquisses).
  **Composants liés** : une copie est une fonction du corps d'origine ; modifier l'original (cotes de son esquisse, du
  caisson…) met à jour toutes ses copies (test `composants liés` dans `tests/frontend/curic.test.ts`).
- **Tourner** (groupe « Curic », comme Curic Rotate) : corps et esquisses choisis tournent autour d'un axe parallèle à
  X, Y ou Z, par quarts de tour (−90°, +90°, 180°) ou d'un angle saisi, autour du centre de la sélection ou d'un **coin
  de corps cliqué** (point vert). Une esquisse ne tourne que dans son plan (autour de sa normale) ; ses contraintes
  horizontale/verticale s'échangent au quart de tour.
- **Coupe** (groupe « Curic », comme Curic Section) : un plan perpendiculaire à X, Y ou Z cache ce qui est au-delà, pour
  voir l'intérieur d'un meuble ; un curseur le déplace, « Garder l'autre côté » inverse. C'est la vue seulement : rien
  n'est coupé ni enregistré ; le bouton (ou « Fermer la coupe ») l'enlève.
- **Arêtes cachées** (menu du groupe « Curic », comme Curic Hidden) : un interrupteur qui efface les lignes de joint
  entre les pièces qui se rejoignent **à fleur** — deux planches côte à côte, une planche posée sur une autre de même
  largeur, un côté sous le dessus qui le recouvre — pour voir le meuble comme une seule surface lisse ; les pièces
  restent séparées (débit, devis, mise en plan inchangés). Un vrai angle reste dessiné : une marche plus basse, une
  planche plus étroite posée sur une autre, deux corps qui ne se touchent que par une arête. Une arête plus longue que
  le joint n'est effacée que le long du voisin. Seuls les corps en boîte (planches, blocs) comptent comme voisins. La
  vue seulement ; l'état est gardé dans ce navigateur (`viewport/joint-edges.ts`, `app/hidden-joints.ts`).
- **Lignes tout autour** (menu du groupe « Curic », comme l'outil Intersect de Curic OI) : on clique une face plane
  d'un corps, puis on tire la flèche plantée dedans ou on tape la distance : une ligne fait le tour du corps,
  parallèle à la face, à cette distance. C'est la coupe du corps par ce plan, posée en esquisse (« Intersection 1 »,
  un profil fermé qui se tire ensuite avec Extruder ou Magie extrude) ; le corps reste entier. « Nombre de lignes » les
  répète au même pas (le « *n » de Curic), « Répartir dans l'épaisseur » partage l'épaisseur du corps en parts égales
  (son « /n »), « Tous les corps traversés » trace aussi la ligne sur les autres corps que le plan coupe (son « Ctrl :
  prendre un objet »). Les deux autres outils de Curic OI sont déjà là : le *ChalkLine* est **Magie extrude** (trait
  simple ou double depuis une arête), son *Offset* le décalage de **Dessiner sur le corps** (`app/intersect-tool.ts`).
- **Barre d'outils** (comme Fusion) : les outils sont rangés en groupes ; chaque groupe montre ceux dont on se sert le
  plus et son nom (« CRÉER ▾ », « ATELIER ▾ »…) ouvre la liste de **tous** ses outils. Un clic lance l'outil ;
  l'**épingle** 📌 l'affiche dans la barre ou le range dans le menu. Au départ, les outils moins courants sont rangés
  (révolution, coque, lissage, étirer, mise en plan, G-code, lien client, Pièce, Finitions, Ma bibliothèque,
  Quincaillerie, Contrôle, Notice de montage, Fiches, Suivi d'atelier, Standard de construction, Remplacer partout,
  Recouvrement, Copier l'aménagement, Stock de chutes, Fabrication groupée…, et en esquisse polygone, ovale, texte,
  projeter…). Le choix est mémorisé par barre (modèle, esquisse) dans le navigateur ; « Par défaut » dans un menu remet
  son groupe comme à l'origine. Les **icônes sont au trait seul**, vides dedans (aucun aplat ni dégradé : seulement les traits, les
  points et les lettres) ; les outils 3D (Extruder, Panneau, Perçage, Congé, Chanfrein, Coque, Combiner, Scinder,
  Réseau, Miroir, Coupe, Usinage…) sont de petits cubes en perspective comme dans Fusion, les autres une vue à plat **en trois couleurs** : le trait en couleur du texte (blanc en thème sombre), la géométrie
  en bleu (points, traits dessinés, contours des faces), et ce qui agit en orange (flèches, crayons, outils, plans de coupe) ; le
  bleu et l'orange ne changent pas avec la palette (`templates/editor/_icons.html`, `--ic-accent` et `--ic-action`). Les **groupes changent de place** en faisant glisser leur nom (« CRÉER ▾ »…) ;
  l'ordre est retenu. Un groupe dont tous les outils sont rangés garde son menu. La barre reste **sur une
  seule ligne** : quand la fenêtre est trop étroite, les icônes se replient une à une dans le menu de leur groupe —
  celles de **Client d'abord**, puis Fabrication, Atelier, Curic, Créer, Modifier, Pièce, Meuble et Dressing (en esquisse : Affichage, Contraintes, Cotes,
  Modifier, Créer), chaque groupe en commençant par sa dernière icône — et reviennent quand la fenêtre s'élargit.
- **Coins carrés partout** : cartes, boutons, champs de saisie, menus, panneaux d'outils, étiquettes et pages n'ont
  plus de coins arrondis (les rayons du thème sont à zéro et les classes d'arrondi retirées) ; seules les pastilles
  rondes (flèche de défilement, points de couleur) restent rondes.
- **Thèmes de « gestion menuiserie »** : l'interface reprend les thèmes de l'application de gestion (Atelier des
  Nobles). En sombre, la palette **Atelier** par défaut (fond bleu nuit #0B1428, accent cyan #08B8FF) ou l'une des
  **neuf palettes** : Navy Mirage, Ocean Sunset, Crimson Velvet, Amber Blaze, Crimson Braise, Royal Violet, Royal
  Charcoal, Crimson Terre et Mocha Mist (la seule claire). On la choisit dans le menu **« ⋯ » → Palette**, sur des
  vignettes qui montrent son dégradé et son accent ; le choix est gardé dans le navigateur (`localStorage`
  « palette ») et posé avant le premier affichage, sur toutes les pages. Les cartes (barre d'outils, cartes du
  navigateur et des propriétés) prennent le **dégradé de la palette**, un cadre et un halo de son accent ; les
  boutons principaux (Enregistrer, Créer, les OK) son dégradé de boutons, en blanc, qui se lève au survol. Le thème
  **clair** l'emporte sur les palettes (fonds blancs, accent bleu), les boutons gardant le dégradé de la palette,
  comme dans la gestion. Techniquement, les gris et les bleus de Tailwind (`gray`, `sky`) sont tirés des variables
  de la palette (`styles/palettes.css`) : tout le reste suit sans toucher aux gabarits.
- **Écriture des tableaux de « gestion menuiserie »** : la police **Inter** (chargée depuis Google Fonts ; sans
  réseau, la police du système), et le navigateur écrit comme les lignes de ses tableaux : noms des corps,
  esquisses et dossiers **en gras gris argent** (#c0c0c0), **vert vif** (#00ff00) sous le pointeur, la ligne
  sélectionnée gardant ses couleurs ; les en-têtes (« CORPS (n) », « ESQUISSES », titres des panneaux) en petites
  majuscules espacées, de la couleur d'accent. En thème clair et en Mocha Mist : l'encre de la page, un vert foncé.
- **Chiffres sans Maj** (clavier français AZERTY) : dans tous les champs de nombres (cotes, épaisseurs, distances,
  calculatrice…), les touches de la rangée des chiffres tapent leur chiffre même sans Maj ni Verr. Maj (& é " ' ( § è
  ! ç à → 1 2 3 4 5 6 7 8 9 0). Le « - » reste un signe moins ; dans les champs qui calculent (calculatrice,
  distance de « Décaler l'arête »), la « ( » reste une parenthèse (`ui/digit-keys.ts`).
- **Fond de la vue 3D** : un dégradé bleu nuit, de #1f2f40 en haut à #101d26 en bas (barre d'historique comprise),
  dans les deux thèmes ; la grille et les couleurs d'esquisse sont choisies pour ce fond sombre (variables
  `--viewport-gradient`, `--viewport-grid`, `--sketch-*` de `app.css`).
- **Couleur des corps par défaut** : #F8F8F8 pour tous, dans la vue, le rendu réaliste et le lien client, tant
  qu'ils n'ont ni apparence ni matière affichée. Leurs arêtes sombres distinguent les pièces
  (`BODY_COLOR` de `viewport/body-layer.ts`).
- **Qualité du rendu des corps** : éclairage de studio (lumière d'ambiance et reflets doux), lumière principale et
  lumière d'appoint qui suivent la caméra, et **ombres douces** portées par une lumière fixe : les étagères ombrent
  leur niche, les faces se distinguent nettement. Les matières unies sont mates (non métalliques). Les **arêtes et
  traits choisis** (vue 3D) sont dessinés en lignes de 2,5 px en vert #63DF0F, lisibles sur tous les corps ; une arête
  droite choisie porte une **flèche à chaque bout** (comme une cote) qui montre où elle commence et s'arrête, de taille
  constante à l'écran (`viewport/edge-arrows.ts`).
  **Pré-sélection et curseur** : comme dans Fusion, ce qu'un clic choisirait s'éclaire en **bleu clair** sous la
  souris, avant le clic : la **face** teintée, l'**arête** (ou le trait d'une esquisse) en trait large, le **point**
  marqué (les coins ne sont plus tous pointés avec le filtre « Points » : seul celui sous la souris s'affiche), ou tout
  le **corps** avec le filtre « Corps » — selon le filtre de la sélection (Auto, Faces, Arêtes,
  Points, Corps), le même choix que le clic (`viewport/preselection.ts`). Rien ne s'éclaire pendant un outil, un
  glissé, une fenêtre de sélection ou Sélection++ (qui montre ses propres niveaux). Le curseur de la vue 3D est une
  **petite croix aux traits très fins** (un pixel blanc bordé d'ombre, lisible sur tous les corps, `ui/cursor.ts`), aussi
  pour les outils qui visent un point.
  **Écart entre deux arêtes parallèles** : quand on choisit exactement deux arêtes droites et parallèles (les deux
  faces d'un panneau, les bords d'une niche), la vue trace en ambre la distance perpendiculaire entre elles, avec sa
  cote, et le panneau Sélection l'affiche (« Écart entre les arêtes ») ; les longueurs des deux arêtes restent dans le
  panneau (`viewport/parallel-gap.ts`).
  La **profondeur de la caméra suit sa distance** (plan proche à 1/200 de la distance) : la précision reste sous le
  centième de millimètre, si bien que deux panneaux qui se touchent et leurs arêtes ne se chevauchent plus en
  pointillés. Les ombres sont calculées en 4096 × 4096.
  Les **coutures** ne sont pas dessinées : une planche extrudée d'un contour dont un bord est en plusieurs morceaux
  (le dessus d'une Répartition, coupé là où les côtés le rejoignent) a une face faite de plusieurs morceaux plats ;
  les arêtes entre deux faces d'un même plan (`geometry/seams.ts`) restent sélectionnables mais ne sont pas tracées,
  et la planche apparaît d'un seul tenant. La numérotation des faces et des arêtes ne change pas : les lignes dessinées
  gardent la table de l'arête que chacune est (`drawnEdges`), si bien qu'un clic sur une arête d'un côté, d'un dessus,
  d'un dessous ou d'une étagère choisit bien cette arête, et non sa voisine.
  Parmi les traits à portée du pointeur, c'est le **plus proche du pointeur à l'écran** qui est pris (à égalité,
  celui de devant), et pas le plus proche de l'œil ; un trait caché derrière une face est ignoré. Les traits serrés
  d'un côté double (trois traits en 3,6 cm) se choisissent donc chacun là où on clique.
  Une esquisse sur le plan **XY** est « à plat » : le meuble dessiné dedans est couché (les étagères font face à la
  vue de face et ferment les niches) ; pour un meuble debout, on dessine dans une esquisse du plan **XZ**, ce que la
  Répartition fait d'elle-même.
- **Présentation en cartes** (grand écran) : la barre d'outils, le navigateur, la vue 3D, la colonne de sélection et
  le panneau de droite sont des cartes aux coins carrés, avec une ombre portée, posées sur un fond gris et séparées
  d'un petit espace (thèmes clair et sombre). Sur téléphone et tablette, les panneaux restent des feuilles qui montent
  du bas.
  Le titre **« Navigateur »** est lui aussi une carte, alignée sur celles des corps et des esquisses. Chaque **corps** (une Répartition, avec ses divisions et les Penderies et Tiroirs de ses niches) a **son propre dossier**, au nom de son esquisse (« Dressing — mur A »…), ouvert au départ. À l'intérieur, ses pièces sont **rangées par sorte**, dans un dossier chacune dès qu'il y en a deux : **Dessous, Dessus, Côtés, Étagères, Cloisons** (avec leur nombre), fermés au départ, ouverts d'un clic (l'état est retenu). Les Étagères de deux meubles ne sont donc jamais mélangées. Chaque dossier (corps, sorte de pièces, penderie, tiroirs, caisson) a **son œil** : un clic masque tous les corps qu'il contient, un autre les réaffiche. On crée aussi **ses propres dossiers**, comme dans Fusion (« Placard », « Dressing »…). Le bouton dossier+ du titre « Corps » en crée un, avec les corps sélectionnés s'il y en a. On y range des corps en les **glissant** sur le dossier, ou par le **clic droit**. Un double clic renomme le dossier. Glisser un corps sur le titre « Corps » le sort de son dossier. Les dossiers sont enregistrés avec le projet (`document/folders.ts`).
  Le **clic droit** ouvre un menu sur tout ce qu'on veut (`ui/browser-actions.ts`) :
  - sur un corps, un groupe ou plusieurs corps sélectionnés : Masquer/Afficher, Modifier, Nouveau dossier, Ranger dans un dossier, Sortir du dossier, Supprimer ;
  - sur un dossier : Renommer, Défaire (garder ses corps), Supprimer avec ses corps ;
  - sur une esquisse : Masquer/Afficher, Modifier, Supprimer ; sur plusieurs esquisses sélectionnées : Masquer/Afficher et Supprimer, toutes d'un coup.

  Le titre **« Esquisses »** a lui aussi son œil (masquer ou afficher toutes les esquisses) et sa corbeille. La corbeille supprime toutes les esquisses en une seule annulation : elle demande d'abord, puis nomme les corps qui partent avec elles.

  Tous les corps que touche la sélection (entiers, ou par une face, une arête ou un coin) sont éclairés dans le
  navigateur. L'élément **sélectionné** (dans le navigateur ou dans la vue 3D) est éclairé en **#F8F8F8**, écrit en encre foncée, avec un liseré bleu à gauche. S'il est dans un dossier fermé, ce dossier s'ouvre. S'il est plus bas dans la liste, elle défile jusqu'à lui.
  Sur Mac, Ctrl + clic ajoute toujours à la sélection. L'écriture du navigateur est plus petite (12 px), et les yeux, les ⋯ et les icônes sont plus petits, en trait fin. Les autres corps et les dossiers d'un caisson restent comme avant (`ui/body-kinds.ts`). La liste du navigateur défile **sans barre de défilement** : une petite flèche ▼ en bas (▲ en haut) montre qu'il y a une suite et y fait défiler d'un clic ; la molette, le pavé tactile et le doigt défilent comme d'habitude (`ui/scroll-arrows.ts`).
- **Fenêtres des outils à droite, en onglets** : les fenêtres des outils (mètre, calques, paramètres, scènes, coupe,
  extrusion, caisson, façades, usinage, réseau, décalage, apparence, rendu…) s'ouvrent dans le panneau de droite,
  chacune dans son **onglet** en haut du panneau, à côté de l'onglet **Sélection** (les propriétés) : l'outil qu'on
  ouvre s'affiche aussitôt, sans faire défiler ; un clic sur un onglet passe de l'outil aux propriétés et
  inversement ; quand l'outil se ferme, son onglet disparaît. La vue 3D reste dégagée. Sur un écran étroit (moins de
  1024 px), où ce panneau est replié, elles restent posées sur la vue.
- **Les étapes** (onglets Cuisine et Dressing, `app/workflow-steps.ts`) : sous les onglets, une barre d'étapes comme
  dans un logiciel de cuisiniste — cuisine : Pièce, Plan, Meubles, Électroménager, Finitions, Fabrication, Client ;
  dressing : Pièce, Plan, Aménagement, Façades, Finitions, Fabrication, Client. Les deux dernières **séparent ce qui
  va à l'atelier** (contrôle avant fabrication, liste de débit, calepinage, dossier de production, mise en plan, DXF,
  étiquettes, notice) **de ce qui va au client** (devis, variantes, rendus, scènes, lien client, commentaires) ; le
  menu du nom du projet a de même ses rubriques « Pour l'atelier » et « Pour le client ». L'étape choisie montre ses outils, avec
  leur nom, à la place du ruban entier (sept à neuf à la fois) ; « Étape › » passe à la suivante ; une étape faite (une
  pièce, un plan, des meubles, de l'électroménager, des façades, des finitions) prend une coche verte ; l'étape Plan
  ouvre le plan à droite. **« Tous les outils »** remet le ruban. L'étape de chaque onglet et ce choix sont retenus par
  le navigateur. Conception 3D garde le ruban seul.
- **Mes outils** (comme le grand jeu d'outils de SketchUp) : une barre verticale à gauche de la vue, avec les outils
  qu'on utilise souvent. On les choisit avec l'étoile ⭐ des menus de groupe (« CRÉER ▾ », « ATELIER ▾ »…) ; un clic
  droit sur une icône la retire. Chaque icône lance l'outil (même rangé ou replié dans la barre du haut) et en reprend
  l'état (enfoncé quand l'outil est actif). Une barre pour l'esquisse, et une par onglet du modèle : Conception 3D (vide
  au départ), **Dressing** et **Cuisine**, qui commencent avec leurs outils de tous les jours (Plan de dressing,
  Répartition, Étagères, Penderie, Tiroirs, Façades, Style du dressing… ; Plan de cuisine, Meubles de cuisine,
  Électroménager, Découpes…), chacune retenue par le navigateur. Cliquer l'onglet Dressing ou Cuisine ouvre aussi son
  plan à droite (Plan de dressing, Plan de cuisine ; un linéaire en cours reste où il en est), Conception 3D la
  Sélection (`ui/favorites.ts`, `app/tab-panels.ts`).
  La barre se **déplace** où l'on veut sur la vue en la saisissant par sa poignée ⠿ (elle reste dans la vue, même
  quand on la redimensionne) ; le bouton ⇄ / ⇅ la met à l'horizontale ou à la verticale ; un double-clic sur la
  poignée la remet en haut à gauche. Sa place et son sens sont retenus. Son « – » la **cache** : il n'en reste
  qu'une étoile ★ à sa place, qui la fait réapparaître (cachée ou non, retenu pour toutes les barres).
- **Recherche du Navigateur** : le champ « Rechercher… » sous son titre garde seulement les corps, dossiers et esquisses
  dont le nom contient le texte tapé, sans tenir compte des accents ni des majuscules (un dossier trouvé par son nom
  garde tout ce qu'il contient ; Échap vide le champ). Le bouton à l'œil barré montre **seulement les éléments
  cachés**, pour les retrouver et les réafficher par leur œil ; les deux vont ensemble. Pendant un filtre, les dossiers
  sont ouverts et la corbeille du titre « Corps » n'est pas proposée (`ui/browser-filter.ts`).
- **Navigateur replié** (grands écrans) : la flèche ‹ de son titre le fait disparaître et la vue prend sa place ; l'onglet
  « › Navigateur », en bas du bord gauche de la vue avec ceux des colonnes repliées, le rouvre. Retenu par le navigateur.
  Sur les petits écrans, le bouton « Arbre » l'ouvre toujours en feuille (`ui/navigator-fold.ts`, `ui/edge-tabs.ts`).
- **Colonne « Projets »** (grands écrans), à gauche du Navigateur : les projets du compte rangés dans leurs dossiers, les
  mêmes que sur « Mes projets » (« Sans dossier » en dernier). Un clic ouvre un projet dans son onglet ; le projet de la
  page est en bleu, un point marque ceux ouverts dans un onglet. On range un projet en le **glissant** sur un dossier ou
  par son « ⋯ » (« Ranger dans… », « Sortir du dossier ») ; le « + » du titre crée un dossier, le « ⋯ » d'un dossier le
  renomme, le **vide** (ses projets supprimés pour de bon, le dossier reste) ou le supprime (ses projets restent, sans
  dossier). Un projet se **supprime** par son « ⋯ » ou la touche **Suppr** sur lui (Suppr sur un dossier : le dossier),
  toujours après confirmation, définitivement avec ses versions et ses liens partagés : son onglet se ferme, et le
  projet de la page supprimé ramène à « Mes projets » ; un clic sur un dossier le plie ; « Chercher un projet »
  filtre par nom. La flèche ‹ la **replie** comme le Navigateur, l'onglet « › Projets » la rouvre ; replis retenus par le
  navigateur. API : `GET/POST /api/folders/`, `PATCH/DELETE /api/folders/<id>/`, `POST /api/folders/<id>/empty/`,
  `DELETE /api/projects/<uuid>/`, `PUT /api/projects/<uuid>/folder/`
  `{folder}` — chaque compte n'a que les siens, ranger ne change pas « modifié le » (`app/project-organizer.ts`,
  `apps/projects/folders_api.py`).
- **Sept colonnes d'outils**, entre le Navigateur et la vue : sept colonnes d'icônes, **vides au départ**, que l'on
  garnit soi-même. Le **« + »** en bas d'une colonne ouvre la liste de tous les outils du ruban et de la colonne de
  sélection et de vue, rangés par groupe, avec une recherche ; un clic ajoute l'outil à la colonne, ou l'en retire s'il
  y est (coché). Un clic sur une icône lance l'outil, le même que celui du ruban (même rangé ou replié), et en reprend
  l'état (enfoncé, grisé). On la **retire** en la glissant hors des colonnes (elle devient rouge) et en la lâchant
  ailleurs, ou par un clic droit ; Échap pendant le glisser l'annule. **L'ordre** des icônes se change en les glissant
  plus haut ou plus bas (un trait bleu montre où elle se pose), ou dans une autre colonne ; au clavier, **Alt + ↑ / ↓**
  monte ou descend l'icône d'une place. Pour **séparer** les icônes, le « + » a en haut **« ＋ Ligne »** (un trait fin
  entre deux icônes) et **« ＋ Espace vide »** (une place vide de la taille d'une icône) : ajoutés au bas de la colonne,
  ils se glissent à leur place, se déplacent, se retirent (clic droit, ou glissés dehors) et sont retenus comme une
  icône (« sep:line:1 », « sep:space:2 »). La **flèche ‹** en haut d'une colonne la replie : elle disparaît sans laisser de bande et la vue
  reprend sa place ; seul un petit **onglet numéroté** (› 1, › 2…) reste en bas du bord gauche de la vue, par-dessus,
  pour la rouvrir. Ce sont **les mêmes colonnes** en Conception 3D, en Dressing et en Cuisine : elles restent en place
  quand on change d'onglet. Les outils, leur ordre et les colonnes repliées sont retenus par le navigateur. Cachées en
  esquisse, en rendu et sur les écrans étroits (`ui/tool-columns.ts`, `ui/tool-columns-picker.ts`,
  `ui/tool-columns-store.ts`).
- **Colonne de sélection et de vue**, à droite de la vue 3D (contre le panneau Mesures) : les cinq filtres
  (Auto, Faces, Arêtes, Points, Corps) et la sélection par fenêtre, puis « Ajuster » (Échap désélectionne). Elle reste
  en mode modèle (l'esquisse a ses propres outils). Les vues isométrique, de face, de dessus et de droite sont dans le
  menu ⋯ (rubrique « Vue ») et sur le cube de navigation.
- **Atelier** (groupe « Atelier », ébénisterie) :
  - *Standard de construction* (comme les méthodes de fabrication de Polyboard ou les principes de construction
    d'imos) : une façon de construire nommée, que les caissons suivent au lieu de la porter chacun.
    - Un standard dit l'épaisseur du caisson et du fond, le fond vissé, rainuré ou absent, les côtés toute hauteur
      ou dessus et dessous toute largeur, le socle, les façades (en applique ou rentrées, jeu, épaisseur), les
      matières du caisson, des façades et des fonds, le chant des chants visibles, à partir de quelle épaisseur un
      chant est déduit de la cote de coupe, et l'assemblage (confirmat, tourillons ou excentriques Minifix, entraxe).
    - Trois niveaux : les modèles fournis (mélaminé 19 mm système 32, 16 mm économique, démontable 18 mm à
      excentriques, contreplaqué bouleau, haut de gamme 22 mm laqué) et ceux qu'on « enregistre dans l'atelier » (ce
      navigateur) ; le standard du projet ; celui d'un caisson, qui l'emporte (outil Caisson, ligne « Standard » :
      celui du projet, un autre, ou « réglé à la main »).
    - Régler un champ fait du standard une copie propre au projet (gardée dans le document). « Appliquer » dit ce qui
      va changer (caissons, façades, pièces) puis reconstruit tout d'un coup, en une annulation : cotes du caisson,
      façades, matières, chants (le chant avant des pièces du caisson, les quatre chants des façades).
    - Le panneau dit quels caissons « ne suivent plus » leur standard (retouchés à la main), pour les remettre
      d'accord. Un nouveau caisson, de nouvelles façades et les Règles d'assemblage partent du standard
      (`document/standards.ts`, `app/workshop/standards-panel.ts`).
  - *Remplacer partout* (le « Modify Style » de Polyboard) : une matière par une autre, ou une épaisseur de chant par
    une autre, dans tout le projet d'un coup, standards du projet compris, en une annulation (`document/replace.ts`).
  - *Matière et chants* : un panneau flottant règle, pour les corps (ou la face) sélectionnés, la matière (mélaminés,
    MDF, contreplaqué, massif, fond HDF), le sens du fil, les chants (L1/L2 : grands côtés, l1/l2 : petits) et leur
    épaisseur. Enregistré dans le document (`bodyInfo`), avec la pièce qui l'a créée. Les matières sont typées comme
    dans OpenCutList : panneau, massif, panneau de fond, et **tasseau** (sapin raboté en barres de 2,40 m, chêne en
    barres de 2 m). Le massif est **débité avec une surcote** (20 mm en longueur, 10 en largeur pour le chêne) puis
    raboté : la liste de débit montre son « débit brut » et le calepinage le place à cette taille.
  - *Liste de débit* (comme celle d'OpenCutList) : toutes les pièces, groupées quand elles sont identiques (quantité),
    le total du projet, puis un tableau par matière et épaisseur avec ses totaux (m², mètres de chant ; mètres bout à
    bout pour les tasseaux). Une colonne sans information disparaît (coupe égale à la cote finie, fil commun, débit
    brut), les chants sont dessinés sur un petit panneau, et la même présentation sert à l'impression et au téléphone.
    Chaque pièce a son **repère** (A, B, C… puis AA) : il est écrit sur le calepinage et, avec le bouton **Repères des
    pièces** de la colonne Vue, au milieu de chaque pièce vue dans la 3D (les pièces identiques ont le même ; une
    pièce cachée derrière une porte n'a pas le sien). Un **clic sur une ligne** ferme la liste et sélectionne ses
    pièces dans le modèle, ramenées dans la vue si elles n'y sont pas (`app/part-tags.ts`). Cotes finies (L ≥ l ≥
    épaisseur) et **cotes de coupe** (moins les chants), fil, chants. Export CSV (séparateur « ; », repère en
    première colonne, ouvert directement dans un tableur) ou impression / PDF.
  - *Importer une liste de pièces* (l'« Importateur » d'OpenCutList, menu Atelier) : un CSV de tableur, une ligne
    par pièce — nom, quantité, longueur, largeur, épaisseur, matière — devient autant de planches posées à plat
    côte à côte à droite du modèle (rangées de 3 m), nommées « Côté (1) », « Côté (2) »… et dans leur matière, en
    une annulation. Séparateur « ; », « , » ou tabulation, virgule décimale acceptée. L'en-tête dit quelle colonne
    est quoi et l'unité (« Longueur (cm) ») ; sans en-tête, l'ordre ci-dessus ; épaisseur absente : 19 mm. Les lignes
    fausses sont ignorées et signalées. La liste de débit exportée se réimporte telle quelle
    (`document/parts-import.ts`).
  - *Optimisation de découpe* : les pièces placées sur les panneaux standard de leur matière (2800×2070 pour les
    mélaminés), en bandes comme une scie à format, trait de scie 4 mm, marge 10 mm, fil respecté (une pièce sans fil
    peut tourner). Un schéma SVG par panneau avec le taux de chutes ; impression / PDF.
    - **Stock de chutes** : les chutes de l'atelier (même matière, même épaisseur) sont remplies **avant** les
      panneaux neufs, les plus grandes d'abord. Ce qui reste d'un panneau et mesure au moins 300 × 150 mm est
      dessiné en vert : « Garder les chutes » le range dans le stock, « Sortir les chutes utilisées » retire celles
      que le calepinage a prises. Le stock se gère aussi à la main (bouton *Stock de chutes*). Il est gardé par le
      serveur, par compte (`/api/offcuts/`).
    - **Liste d'achat** sous le calepinage : les panneaux neufs par matière et épaisseur (et leur taux
      d'utilisation), les chutes du stock à sortir, le chant au mètre par épaisseur avec 50 mm de surlongueur par
      chant, la quincaillerie arrondie au conditionnement (vis confirmat et tourillons par boîtes de 100,
      excentriques par 50, pieds par 4), et les tasseaux en barres par section (`document/purchase.ts`,
      `app/workshop/production.ts`).
    - **Débit en barres** (le débit 1D d'OpenCutList) : les tasseaux ne vont pas sur des panneaux. Ils sont coupés
      dans des barres du commerce de leur section, mis bout à bout, les plus longs d'abord, chacun dans la première
      barre où il tient (trait de scie 4 mm, 10 mm d'équerrage au début de la barre). Un schéma par barre avec les
      repères et longueurs des pièces, la chute hachurée au bout ; une pièce plus longue qu'une barre est signalée.
      Au devis, les tasseaux se comptent **au mètre** (sapin 32,40 MAD HT/m, chêne 129,60 MAD HT/m, réglables)
      (`document/bars.ts`).
  - *Fabrication groupée* (comme le mode catalogue de Polyboard) : plusieurs projets débités ensemble, chacun en
    quantité. « Ajouter ce projet au lot » y met sa liste de débit et sa quincaillerie du moment (l'ajouter de
    nouveau la remplace). Le lot donne un seul calepinage, avec le stock de chutes, et une seule liste d'achat ; ses
    pièces sont préfixées du nom de leur projet. Gardé par le serveur (`/api/batch/`, `apps/projects/production.py`).
  - *Export DXF commande numérique* : chaque panneau mis à plat sur celle de ses deux grandes faces qui porte le plus
    de perçages (une porte montre ses cuvettes), avec le **contour exact** du noyau (lignes, arcs) et les **perçages
    en cercles**, posés côte à côte avec leur nom et leur épaisseur. DXF R12 en mm, calques CONTOUR, PERCAGE et
    TEXTE, lu par les logiciels de FAO.
    - **Noms des calques pour la machine** : beaucoup de logiciels de commande numérique usinent d'après le nom du
      calque. À l'export, on choisit « Générique », « Diamètre et profondeur » (`PERCAGE_D8_Z12`, `CONTOUR_Z19`),
      « Court » (`Z12-D8`, `Z19`) ou un modèle à soi, où `{d}` est le diamètre, `{z}` la profondeur et `{t}`
      l'épaisseur du panneau. Le choix est retenu par le navigateur.
    - Les **perçages sur chant** (tourillons, excentriques : perçage horizontal) ne sont pas sur la pièce à plat :
      l'export les signale, et les fiches de fabrication les cotent, chant par chant (« chant court côté X− :
      2 × Ø8 prof. 34 à 50, 306 », `document/face-ops.ts`).
  - *G-code* : le programme de la défonceuse, prêt à lancer. Les pièces d'une même matière et épaisseur sont rangées
    en bandes sur les panneaux bruts (une pause M0 entre deux panneaux) ; pour chacun, les perçages au foret de leur
    diamètre (T2, T3…) et à leur **vraie profondeur** (lue sur le maillage : borgne ou traversant), les grands trous
    (cuvettes Ø35) vidés en cercles concentriques à la fraise (T1), les découpes intérieures, puis le contour détouré
    en plusieurs passes jusque dans le martyr. La fraise est compensée dans le calcul (arcs aux angles saillants,
    angles rentrants coupés à l'intersection ; une partie plus étroite que la fraise est signalée), en opposition.
    Réglages retenus par le navigateur : diamètre de fraise, passe, avances, broche, hauteur de sécurité, martyr,
    foret maximal, écarts. Les perçages borgnes de l'autre face sont signalés (pièce à retourner).
  - *Étiquettes* : une par pièce, avec un **QR code**, à imprimer et coller à la sortie de la machine. Un éditeur règle
    ce qu'elle dit et dans quel ordre, la place du QR code, le logo et le format de la planche A4 (3 × 8, 3 × 7, 2 × 4),
    avec son aperçu ; le modèle est gardé par le navigateur et repris par le dossier de production. Le QR code ouvre la
    page de la pièce du Suivi d'atelier.
  - *Peindre les chants* : les chants posés se voient en vert sur les pièces, un clic sur un bord pose ou retire son
    chant, ou les 4 ; une pipette reporte ceux d'une pièce sur d'autres.
  - *Fil continu* (dans Matière et chants) : des façades sélectionnées se suivent au calepinage, côte à côte, pour que
    le veinage continue de l'une à l'autre ; une rangée trop grande pour son panneau est signalée.
  - *Façades communes* : une seule porte sur plusieurs cases voisines d'une Répartition, et le sens d'ouverture de ses
    portes, par paires en miroir ou d'un seul côté.
  - *Liste de débit* : un champ filtre les pièces par nom, repère, matière, épaisseur ou chant.
    - **Listes au choix** (« Listes par », à côté du filtre, retenu par le navigateur) : par matière et épaisseur
      (comme avant), par **type d'élément** (une liste des côtés, une des dessus, une des étagères, des portes…), par
      **type de bois**, par **épaisseur**, ou par **type d'élément et épaisseur** à la fois. Chaque liste a son total
      (pièces, m², chant) ; les colonnes « Matière » et « Ép. » apparaissent quand le titre de la liste ne les dit pas.
    - Le type d'une pièce se lit dans son nom, sans son meuble, son numéro ni son côté : « Bas 2 portes (A1) — Côté
      gauche » est un « Côté » (`partKind`). Une ligne qui réunit des pièces identiques de types différents (une
      cloison et une étagère de mêmes cotes) est partagée entre leurs listes, sous le même repère
      (`document/cut-groups.ts`). Le filtre, le clic sur une ligne, l'impression et le CSV suivent la liste choisie ;
      le CSV a une colonne « Type ».
  - *Saisie rapide* dans Étagères et Cloisons : `*3` (3 pièces), `/4` (4 niches égales), `30;40;50` (ces hauteurs de niches, puis le reste).
  - *Suivi d'atelier* : où en est chaque pièce. Les étapes sont « Débitée », « Chantée », « Percée » et « Montée ».
    - Sur un téléphone connecté au compte, le QR code d'une étiquette ou d'une fiche ouvre la page de la pièce
      (`/atelier/<projet>/?piece=…`). Un gros bouton par étape la fait avancer, et la page liste les autres pièces
      suivies avec leur étape.
    - Dans l'éditeur, le panneau montre une barre d'avancement par étape (pièces arrivées au moins à cette étape sur
      toutes celles de la liste de débit), et chaque pièce se règle aussi à la main.
    L'avancement est gardé par le serveur, par projet et par nom de pièce : renommer une pièce la fait repartir de
    zéro (API `/api/projects/<id>/workshop/`, `apps/projects/workshop.py`, `app/workshop/workshop-progress.ts`).
  - *Quincaillerie* : on choisit pour le projet la charnière, la coulisse et la poignée dans un catalogue réel :
    - charnières Blum CLIP top (BLUMOTION 110°, réf. 71B3550, ou 155°), Hettich Sensys, Grass Tiomos, Häfele Metalla,
      petit boîtier Ø26 ;
    - coulisses Blum TANDEM et MOVENTO, Hettich Actro 5D et Quadro V6, Grass Dynapro, à billes ;
    - poignées d'entraxe 96 à 320 mm, ou bouton à un trou.
    Chaque modèle montre ses cotes (cuvette, profondeur, distance au bord, entraxe, charge, sortie) et un prix
    indicatif. Le choix est gardé dans le document, en une annulation, et tout le suit :
    - les perçages des façades, des portes et des tiroirs (entraxe et trou des poignées, cuvettes des charnières) ;
    - un nouvel usinage « Charnières » (un usinage déjà fait garde ses cotes) ;
    - le devis et la notice, avec le nom, la référence et le prix du modèle. Un tarif mis à la main dans le devis
      l'emporte.
    Le panneau compte aussi toute la quincaillerie du projet. Les cotes sont les valeurs courantes de chaque gamme :
    à vérifier sur la fiche du fabricant avant une série (`document/hardware-catalog.ts`, `app/workshop/hardware-panel.ts`).
    - **Règles de quincaillerie de l'atelier** : les articles du catalogue de l'atelier
      (pages `/catalogue/`) comptés d'après le meuble — par caisson, par porte, charnières selon la hauteur des
      portes (2 jusqu'à 90 cm, 3 jusqu'à 1,60 m, 4 au-delà), par étagère, par niche, par côté ou cloison — s'ajoutent
      au devis, à leur prix (modifiable dans les tarifs) ; un article « manuel » donne seulement son prix
      (`document/catalog.ts`).
  - *Flèche des étagères* : pour chaque planche horizontale chargée (étagères, dessus, dessous ; pas les fonds de
    tiroir ni les panneaux de fond), la flèche à long terme sous la charge choisie : livres 25 kg/m, vaisselle
    15 kg/m, linge 10 kg/m, objets légers 5 kg/m.
    - Le calcul est celui d'une planche posée sur ses deux bouts, charge répartie : 5·q·L⁴ / (384·E·I). Le fluage
      des panneaux s'y ajoute (×3,25 pour l'aggloméré et le MDF, ×1,8 pour le contreplaqué, ×1,6 pour le chêne
      massif).
    - La flèche est comparée à une limite : portée / 150, / 200 (par défaut) ou / 300.
    - Une planche qui fléchit trop reçoit l'épaisseur du commerce qui suffit et la portée la plus longue à son
      épaisseur actuelle (un montant, un taquet au milieu). « Voir » la sélectionne.
    Le Contrôle avant fabrication signale aussi les planches qui fléchissent sous 15 kg/m (`features/shelf-sag.ts`,
    `app/workshop/sag-panel.ts`).
  - *Poids et stabilité* : le poids du meuble (volume × masse volumique de chaque matière : aggloméré mélaminé
    650 kg/m³, MDF 750, contreplaqué 680, chêne 700, HDF 900 ; une pièce sans matière est comptée en aggloméré),
    ses cinq pièces les plus lourdes et la hauteur de son centre de gravité.
    - **Essai de basculement** : tous les tiroirs sortis comme un clic les ouvre, chargés de 0 à 35 kg chacun ; le
      centre de gravité doit rester derrière l'arête avant du pied (la face avant se choisit).
    - Un meuble haut d'au moins 1 m et plus de 2,5 fois plus haut que profond est signalé à fixer au mur.
    Le Contrôle avant fabrication reprend l'essai à 15 kg par tiroir (`features/stability.ts`,
    `app/workshop/weight-panel.ts`).
  - *Découpes du plan de travail* (bouton de l'Atelier, masqué par défaut) : sur le plan de travail cliqué ou
    sélectionné, des découpes choisies dans un catalogue aux cotes courantes du commerce : évier 1 cuve (780 × 480),
    1 cuve ½ (960 × 480), 2 cuves (1140 × 480), évier sous plan (500 × 400), plaque de cuisson 60, 80 ou 90 cm
    (560, 750 ou 880 × 490), robinet (Ø35) et passe-câble (Ø60).
    - Chaque découpe se place par son milieu le long du plan et par sa distance au bord avant (centrée dans la
      profondeur par défaut) ; le bord avant se choisit (−Y pour un plan le long de X, +X pour un plan le long de
      Y, comme les fait la Cuisine).
    - Une nouvelle découpe se met au milieu du plan, le robinet derrière l'évier, sinon à la première place libre.
    - Sont refusées une découpe qui sort du plan, qui laisse moins de 50 mm de matière au bord, ou qui en chevauche
      une autre.
    - **Cotes de la notice et angles arrondis** : chaque découpe a sa « Largeur », sa « Profondeur » et son « Rayon des
      angles » (un trou rond, son « Diamètre »), qui remplacent celles du catalogue. Les éviers du catalogue ont des
      angles de 10 mm, les plaques des angles vifs. Une découpe arrondie est faite d'une croix de deux boîtes et d'un
      trou rond dans chaque angle : pas d'usinage nouveau.
    - **Mes découpes** : « Garder dans Mes découpes… » garde ces cotes sous un nom (celui de l'évier ou de la plaque),
      pour tous les projets ; elles s'ajoutent d'un clic depuis « + Ajouter une découpe… » et s'oublient par ✕
      (`app/kitchen/my-cutouts.ts`, gardées par le navigateur).
    - **Dans un Plan de cuisine**, un meuble d'évier découpe le plan de travail tout seul : l'« Évier » de l'onglet
      Électro., et aussi le « Bas évier » de l'onglet Bas (ou un meuble à soi sur deux traverses), sauf sous un évier
      de la bibliothèque posé à la main, qui a sa propre découpe. Une découpe ajoutée ou retouchée à la main dans les
      découpes du plan (une plaque, les cotes d'un évier) est gardée quand la cuisine est refaite (`mergedCutouts`) ;
      la découpe du plan lui laisse la place quand elles se recouvrent.
    - C'est un usinage du plan (une boîte retirée de part en part, un trou), qui suit la planche. Il se rouvre avec
      « Modifier » (`features/worktop-cutouts.ts`, `app/kitchen/cutout-tool.ts`). Les cotes sont à vérifier sur la notice
      de l'appareil.
  - *Contrôle avant fabrication* : un bouton liste ce qui gâcherait du panneau ou bloquerait le montage, rangé par
    sorte. Chaque ligne a un bouton « Voir » qui sélectionne les pièces en cause.
    - Pièces qui se chevauchent : erreur pour deux panneaux droits, « peut-être » pour une pièce façonnée. Deux
      pièces qui se touchent ne comptent pas.
    - Pièce plus grande que le panneau brut de sa matière, le sens du fil respecté.
    - Pièce sans matière.
    - Perçage qui déborde du bord, qui laisse moins de 1 mm jusqu'au bord, ou qui en mord un autre (deux cercles
      de même centre sont un lamage, pas une erreur).
    - Porte ou tiroir qui heurte un autre corps en s'ouvrant (murs compris), testé à 30 %, 60 % et en entier.
    - Meuble qui entre dans un mur, une retombée ou sous un rampant de la Pièce relevée, ou qui cache une prise.
    - **Implantation** : meuble ou appareil qui sort de la pièce, plaque sans plan de travail, hotte
      sans plaque, trop basse ou trop haute, plaque trop près de l'évier, moins de 80 cm devant un four, un
      réfrigérateur, un lave-vaisselle ou un lave-linge, meuble haut trop près de la plaque, tringle hors de 170 à
      190 cm (`document/layout-check.ts`). Le panneau Implantation de cuisine le dit aussi avant l'OK.
    - **Jonctions sans assemblage** : deux planches qui se touchent (le chant de l'une contre la face de l'autre)
      sans vis, tourillon, excentrique, tenon ni mi-bois ; quand rien n'est encore assemblé, une seule ligne le dit.
    - **Charnières** : une porte plus lourde que ses charnières ne portent (≈ 4,5 kg par charnière, repère courant :
      le nombre qu'il faudrait), une charnière qui tombe sur une étagère. Les perçages des façades décalent déjà une
      charnière de 32 mm (le pas du système 32) quand son embase tomberait sur une étagère ; reste ce qu'on ne peut
      pas décaler (`document/hardware-rules.ts`).
    Quand tout va bien, le contrôle le dit (`document/fabrication-check.ts`, `app/workshop/fabrication-check.ts`).
  - *Notice de montage* : un panneau range les pièces en étapes, dans l'ordre où l'on monte un meuble. Les étapes
    sont le bâti (dessous, côtés, dessus, cloisons, avec les vis confirmat et tourillons des usinages), le fond, les
    étagères, les penderies, les tiroirs, les portes, puis le reste. Chaque étape a sa quincaillerie (coulisses,
    charnières, poignées, tringles).
    - Un clic sur une étape la montre dans la vue : les étapes passées restent en place, les pièces de l'étape
      s'écartent du meuble, les suivantes sont cachées. Les boutons « Étape précédente » et « Étape suivante » font
      défiler les étapes.
    - Le curseur « Vue éclatée » écarte toutes les pièces. Chacune part le long de l'axe où elle dépasse le plus, et
      une pièce du milieu vient vers l'œil.
    - « Imprimer la notice » donne une page de garde (le meuble monté et éclaté, toute la quincaillerie), puis une
      page par étape avec son image prise dans la vue, ses pièces et sa quincaillerie.
    Tout est en vue seulement : le document ne change pas, et tout revient en place à la fermeture
    (`document/assembly-steps.ts`, `app/workshop/assembly-guide.ts`).
  - *Fiches de fabrication* : une page A4 à l'italienne par pièce, pour usiner sans ouvrir la 3D. Les pièces
    identiques de la liste de débit partagent une fiche, avec leur quantité. Chaque fiche porte :
    - la pièce à plat à l'échelle, vue de sa face percée, avec son contour exact et ses perçages ;
    - les cotes hors tout ;
    - chaque perçage coté depuis le bord gauche (en haut) et depuis le bas (à droite) ;
    - les chants en trait orangé (L1 en bas, L2 en haut, l1 à gauche, l2 à droite) et le fil en flèche ;
    - les cotes finies et de coupe, la matière, le tableau des perçages (« 4 × Ø5 prof. 12 ») et un QR code (la
      page de la pièce dans le Suivi d'atelier) ;
    - un avertissement quand la pièce doit être retournée (perçages borgnes sur l'autre face).
    Impression ou PDF (`document/part-sheet.ts`, `app/workshop/workshop-sheets.ts`).
  - *Devis* : d'après la liste de débit, les panneaux au m² par matière (chutes comprises), les chants au mètre, la
    découpe par pièce et le montage à l'heure, puis la marge et la TVA. Tarifs indicatifs réglables (retenus par le
    navigateur ; au départ, le prix au m² des matières du catalogue de l'atelier) ; impression / PDF et CSV, avec
    l'en-tête de l'atelier (profil du catalogue).
    - **En dirhams marocains (MAD)** : tous les prix (devis, prix TTC en bas de l'éditeur, quincaillerie, catalogue
      de l'atelier, liste des projets, fiche et lien client) s'écrivent en MAD. Les tarifs d'origine, fixés en euros,
      ont été convertis à **10,8 MAD l'euro** (`EURO_IN_MAD`, `mad()` dans `document/quote.ts`) : ceux de l'éditeur,
      ceux du catalogue du serveur (migration `catalog/0004_prices_in_mad`, une fois) et ceux qu'un navigateur
      gardait (convertis une fois à leur lecture, `savedRates`). Les montants déjà enregistrés dans un projet (son
      prix dans la liste, les versions de devis, les variantes d'un lien client) ne sont pas réécrits : le prix d'un
      projet se met à jour à sa prochaine ouverture dans l'éditeur.
    - **Perçages** au prix de l'unité si on le veut (le « Tooling Price » de Polyboard) — ceux des usinages et ceux
      que percent les façades (boîtiers de charnière, trous de poignée, `features/fronts-drillings.ts`) — et **remises par paliers**
      (« 30000:5, 60000:8 » : 5 % dès 30 000 MAD HT, 8 % dès 60 000 MAD).
    - Le prix **au mètre linéaire** du meuble, pour comparer avec les prix du marché.
    - **Scénario** (le « What if » de Mozaik) : une matière remplacée par une autre, le prix des deux et l'écart.
    - **Versions** : « Enregistrer comme devis initial » garde le devis dans le projet ; chaque version suivante est
      un **avenant**, avec ce qui a changé ligne par ligne et l'écart TTC, imprimable (`app/workshop/quote-versions.ts`).
  - *Usinage* : un outil, sept préréglages, tous des coupes exactes du noyau (une opération « Usinage » par planche,
    qui remplace la planche et la **suit** quand elle se déplace) —
    sur une **face** cliquée : *perçages 32* (rangée de trous Ø5 × 12 tous les 32 mm, à 37 mm du bord, 1 ou 2 files),
    *charnières* (cuvettes Ø35 × 13 à 22,5 mm du bord, 2 à 5), *rainure de fond* (4 × 8 mm à 10 mm du bord) ; entre
    **deux planches** : *tourillons* (Ø8 × 15, un tous les 96 mm), *confirmat* (Ø7 traversant, Ø5 en pilote),
    *mi-bois* (chaque planche perd la moitié de la hauteur commune), *tenon et mortaise* (tiers de l'épaisseur,
    épaulements de 10 mm). Un usinage qui ne touche pas le corps est une erreur, jamais un silence. Chaque trou suit
    le bout de la planche dont il était le plus près : un dessous allongé emporte ses avant-trous de droite. Une
    rainure qui court sur au moins 80 % de la planche s'allonge avec elle (chaque bout suit le sien) ; une mortaise
    courte se déplace seulement (`features/machining-follow.ts`).
  - *Règles d'assemblage* : une règle (confirmat Ø7 tous les 128 mm, tourillons Ø8 tous les 96 mm, ou excentriques
    Minifix 15 tous les 256 mm, avec la marge aux bouts ; celle du standard de construction pour commencer)
    appliquée d'un coup à toutes les jonctions des planches choisies — la sélection, sinon tout ce qui est
    visible ; un clic ajoute ou retire une planche. Une jonction est le chant d'une planche contre la face d'une autre ;
    les panneaux plus minces qu'un seuil (fonds) ou plus épais que 30 mm (plans de travail), les murs et les
    façades sont ignorés. Une opération « Usinage » par planche, et la visserie
    (vis confirmat, tourillons, excentriques) est comptée dans le devis.
    - **Minifix** (aussi dans l'outil Usinage) : la tige Ø5 × 11 dans la face de la planche contre laquelle l'autre
      vient, le perçage Ø8 depuis le chant de l'autre et le boîtier Ø15 par sa face intérieure (sous un dessus, sur
      un dessous), à 24 mm (ou 34) du chant, 12,5 mm de profondeur jusqu'à 16 mm d'épaisseur, 13,5 au-delà. Cotes
      courantes, à vérifier sur la fiche du fabricant.
  - *Paramètres* : des valeurs nommées (`largeur`, `ep`…), qui peuvent être des formules d'autres paramètres, et des
    **liens** entre une cote d'une fonction (largeur du caisson, déplacement, distance…) et une formule
    (`largeur - 2 * ep`). Changer un paramètre réécrit toutes les cotes liées, en une seule annulation. Formules :
    `+ − * / ^ ( )`, `pi`, `min(a; b)`, `max`, `abs`, `round`, `floor`, `ceil`, `sqrt` (analyseur sûr, sans `eval`) ;
    cycles et noms inconnus signalés.
  - *Configurations* (dans le panneau Paramètres) : des variantes nommées du meuble (« Petit 600 », « Grand 900 »),
    chacune un jeu de valeurs des paramètres. Un clic applique la variante (les formules et les cotes liées suivent,
    en une annulation) ; la variante active est en surbrillance ; ↻ la remplace par les valeurs du moment.
  - *Calques* (groupe Vue, comme les étiquettes de SketchUp) : créer un calque, le renommer, y mettre les corps
    sélectionnés, le montrer ou le cacher d'un clic sur l'œil ; un calque caché cache ses corps dans la vue, le
    navigateur et la liste de débit. Supprimer un calque rend ses corps (sans calque).
  - *Rapporteur* : troisième mode du mètre (« Angle ») : le sommet puis un point de chaque côté ; l'angle s'affiche.
  - *Scènes* : des vues de la caméra nommées, enregistrées dans le document ; un clic y emmène la caméra.
  - *Mètre et guides* (comme le mètre de SketchUp) : deux clics, accrochés aux coins, arêtes et guides, donnent la
    distance et ΔX, ΔY, ΔZ ; en mode « Guide » le second clic pose une ligne de guide enregistrée. « Mesurer entre »
    choisit ce que les deux clics désignent : **points**, **traits** (arêtes), **faces** ou **corps** — la plus courte
    distance entre les deux éléments, calculée exactement sur leur maillage et tracée entre leurs points les plus
    proches (0 quand ils se touchent), avec, pour deux faces planes ou deux traits droits, « parallèles »,
    « perpendiculaires » ou leur angle. Le premier élément choisi est souligné en orange. Après une mesure entre deux
    corps ou deux faces, « Changer cet espace… » ouvre **Espacement** sur ces deux éléments.
  - *Rendu des matières* : chaque corps prend la couleur de sa matière, avec le veinage du bois dans le sens du fil
    (bouton à bascule, mémorisé). Le motif est **décalé d'une planche à l'autre** (d'après l'identifiant du corps,
    toujours le même pour une planche) : deux planches voisines ne montrent pas le même veinage, dans la vue, le rendu
    réaliste et le lien client (`appearance/assign.ts`).
  - *Apparence* (comme la bibliothèque d'apparences de Fusion) : plus de 100 apparences réelles, en vignettes
    sphériques, par catégorie et avec recherche (accents ignorés) : **bois** (chêne naturel, blanchi, fumé, verni,
    brut, noyer, noyer américain, hêtre, frêne, érable, merisier, pin, teck, wengé, acajou, bouleau, bambou, zebrano),
    **mélaminés et panneaux** (blanc, gris perle, anthracite, noir, chêne, noyer, MDF, HDF, contreplaqué, OSB),
    **laques et peintures** (24 teintes RAL du mobilier, laques brillantes, laque satinée et peinture mate à la
    couleur choisie), **verres et miroirs** (clair, extra-clair, dépoli, fumé, bronze, noir, vert, laqué, miroir), **marbres
    et pierres** (Carrare, Calacatta, Statuario et Calacatta Oro à grandes veines, Arabescato, Emperador foncé et
    clair, Marquina, vert, rose, quartzite Taj Mahal, travertin, granits, quartz, terrazzo, ardoise), **Dekton et
    céramiques frittées** pour plans de travail, crédences et façades (Aura, Entzo, Opera, Rem, Laurent veinés ;
    Zenith, Danae, Kreta, Bergen, Keon, Kelya, Sirius, Trilium unis : motifs « veined » et « sintered » de
    `appearance/textures.ts`, calculés et raccordés sans couture),
    **métaux** (inox et aluminium brossés, anodisé noir, chrome, laiton, or, cuivre, acier), **plastiques** (dont
    plexiglas transparent et opale), **tissus et cuirs** (lin, chiné, velours, cuirs cognac, noir, blanc), **bétons et
    sols** (béton ciré, brut, liège, enduit). Les textures sont calculées (veines du marbre, mouchetures du granit,
    armure du tissu, grain du cuir, métal brossé), avec leur relief, et se raccordent sans couture.
    **Le veinage des bois est un fil droit tiré d'une vraie photo** : chaque essence (chênes, noyers, hêtre, frêne,
    érable, merisier, pin, teck, wengé, acajou, bouleau, bambou, zebrano, mélaminés chêne et noyer, contreplaqué)
    prend les lignes et les pores du placage « noyer fil » ci-dessous (tranché sur quartier), recolorés dans ses
    propres teintes. Les fentes et les nœuds en travers du fil sont lissés, et la photo se raccorde sans couture dans
    les deux sens (`seamlessGrain`). Le relief vient de ce veinage, à l'échelle réelle (un carreau de 1 m). Pour un
    ramage ou un autre dessin, on choisit un bois en photo. Le motif suit le fil de chaque planche, décalé d'une planche à
    l'autre : deux portes voisines n'ont jamais le même dessin. Les matières de l'atelier en profitent, en vue comme au
    rendu : le chêne massif, par exemple, prend le « Chêne verni ».
    **Bois en photo** : 10 vrais bois photographiés. Huit viennent d'ambientCG sous licence CC0 : chêne clair, chêne,
    noyer, wengé, hêtre, bouleau, merisier et pin noueux. S'y ajoutent deux placages de noyer à partir de photos
    fournies : **noyer fil** (tranché sur quartier, fil droit, une photo pour 1 m) et **noyer ramage** (tranché à plat,
    avec ses dessins en cathédrale, une feuille de 600 × 450 mm). Tout est dans `static/textures/bois/`, avec
    `LICENCE.txt`. Leur relief est calculé d'après leurs nuances, et leur fil suit celui de chaque planche. Chaque
    panneau reçoit **une seule photo, d'un seul morceau**, étirée sur toute sa longueur dans le sens du fil et sur
    toute sa largeur, comme une feuille de placage, même pour un panneau de 20 m : jamais de raccord répété. Les
    images de « Mes motifs » gardent la taille qu'on leur a donnée.
    **Mes motifs** : « Importer une image… » fait une apparence d'une image prise ailleurs, depuis son ordinateur
    (photo de bois, de pierre, de tissu… en PNG, JPEG ou WebP). L'image est réduite à 1024 px et gardée avec le
    projet ; la taille en millimètres dit combien elle couvre. Elle est appliquée aux corps sélectionnés et rangée
    dans la catégorie « Mes motifs (images importées) », où ✕ la retire (`appearance/custom.ts`).
    **À qui donner le motif** : un clic sur une vignette le donne à ce qui est sélectionné.
    - Dans le navigateur, une ligne de corps ; Ctrl ou Maj pour en ajouter. Un clic sur le titre d'un groupe
      (« Portes 1 », « Étagères », un dossier) sélectionne toutes ses pièces.
    - Dans la vue, une pièce ou une face. Quand des faces sont choisies, le panneau demande « La pièce entière »
      (par défaut) ou « Seulement la face choisie » : le dessus d'un plan en marbre, le côté visible d'un caisson
      en noyer, le reste de la pièce gardant le sien.
    - Une vignette glissée sur la vue donne le motif à la pièce lâchée dessous, ou seulement à la face dessous avec
      Alt.
    Une face est retrouvée par son orientation et la place de son centre dans la pièce, donc aussi quand la pièce
    change de taille. Donner un motif à la pièce entière efface ceux de ses faces. Les motifs des faces se voient
    dans la vue et dans le Rendu, et sont comptés dans « Dans ce modèle » (`appearance/face-looks.ts`).
    Un clic sur une vignette la donne aux corps
    sélectionnés ; on peut aussi **glisser une vignette sur un corps** de la vue (surligné pendant le glisser) ; lâchée sur un corps
    sélectionné ou à côté des corps, elle va à toute la sélection.
    « Couleur au choix » applique une couleur à une laque, une peinture, un plastique ou un tissu ; « Dans ce
    modèle » montre les apparences utilisées ; « Retirer l'apparence » rend celle de la matière. L'apparence est
    gardée dans le document (annulable), en plus de la matière d'atelier : elle ne change ni la liste de débit ni le
    devis. Elle s'affiche dans la vue d'édition (reflets d'un studio, verre transparent) et dans le Rendu.
  - *Rendu* (comme l'espace Rendu de Fusion, avec des idées de KeyShot et d'Enscape) : la vue passe en **lancer de
    rayons progressif** (three-gpu-pathtracer) — l'image s'affine tant que la caméra est immobile, en basse
    résolution pendant qu'on tourne autour. La barre du rendu remplace les outils de modélisation (Pause,
    Recommencer, Rendre l'image, Quitter le rendu ; Échap pour quitter) et le panneau de droite règle :
    - **Environnement** : studio clair, studio sombre (boîtes à lumière), intérieur avec fenêtre, extérieur avec le
      soleil selon l'**heure** (6 h – 20 h, levant à l'est, plein sud à 13 h), ciel couvert ; luminosité,
      **rotation** de l'éclairage ; fond = l'environnement (flou réglable), une couleur unie ou le fond de l'éditeur.
      Les environnements sont calculés (images HDR équirectangulaires), sans fichier à télécharger.
    - **Sol** : ombres seules (attrape-ombres : le fond reste visible, assombri par les ombres et éclairci par les
      reflets), sol de studio coloré, parquet, ou aucun ; reflets réglables.
    - **Caméra** : focale (12–200 mm), exposition (IL), tonalité (filmique ACES, naturelle AgX, neutre),
      **profondeur de champ** (ouverture f/1,4 à f/22, mise au point au centre du modèle ou sur un point cliqué).
    - **Finitions** : pour chaque apparence du modèle (bois, mélaminés, laques, pierres, plastiques, bétons), celle de
      l'apparence ou mat, satiné, brillant, laqué. Le verre laisse passer la lumière (transmission, réfraction).
    - **Qualité** (échantillons, rebonds) et **Image** : HD, 4K, carré, A4 paysage 300 dpi ou la vue actuelle,
      rendue avec le nombre d'échantillons choisi puis rangée dans la **galerie** du panneau (téléchargement PNG).
    - **Télécharger le rendu final** (bouton en haut du panneau, toujours visible) : rend l'image au format et au
      nombre d'échantillons de la section Image, puis l'enregistre aussitôt en PNG (`rendu_<largeur>x<hauteur>_<date>.png`).
      Elle va aussi dans la galerie ; le bouton dit « Rendu en cours… » jusqu'à la fin.
    Les réglages sont gardés dans le navigateur. La scène du rendu est une copie : elle suit les régénérations, les
    portes ouvertes et les matières, sans toucher au modèle. Le moteur n'est chargé qu'à la première ouverture.
  - *Mouvements* : un corps glisse (tiroir) ou tourne autour d'une charnière (porte) avec un curseur ou en animation,
    et le panneau dit ce qu'il heurte (contrôle sur les boîtes englobantes, exact pour des planches). La vue
    seulement : le modèle ne change pas.
  - *Tiroirs d'un clic* : dans la vue 3D, un clic sur un tiroir (sa façade ou une pièce de son caisson, d'un Tiroirs
    de niche ou de façades de caisson) l'**ouvre** : toutes ses pièces glissent ensemble du côté de sa façade. Un
    second clic le **referme**. La vue seulement, comme Mouvements : une régénération du modèle les referme ; rien
    pendant un outil ni avec Ctrl, Cmd ou Maj (`app/drawer-toggle.ts`, `features/drawer-open.ts`).
  - *Mise en plan* (bouton 📐 de la barre du haut, comme l'espace Dessin de Fusion) : un écran à part avec son ruban,
    la feuille au centre (molette : zoom ; glisser le fond : se déplacer ; F : toute la feuille), les onglets des
    feuilles en bas et les réglages à droite. Les feuilles sont gardées avec le projet, et Ctrl+Z annule comme partout.
    Groupe *Affichage* du ruban : *Zoom fenêtre* (tracer la zone à agrandir, en glissant ou par deux coins : elle
    remplit l'écran) et *Ajuster* (toute la feuille à l'écran, comme F).
    - **Mise en plan du caisson sélectionné** (menu du nom du projet, en haut à gauche) : une feuille pour un seul
      caisson — celui dont une pièce est cliquée dans la vue (un côté, une porte, une étagère ; ou le seul caisson du
      modèle) —, nommée « Caisson — … », avec ses vues de face, de dessus, de côté et isométrique à une échelle qui
      tient sur la feuille ; les autres corps n'y sont pas. Un caisson, c'est sa carcasse, ses façades et ses
      finitions, ou une Répartition avec ses étagères, ses cloisons et l'équipement de ses niches, comme dans le
      navigateur. Rouverte, la même feuille est mise à jour et garde ses cotes et ses textes (`document/cabinet-of.ts`,
      `app/drawing/standard-views.ts`, `app/project-menu.ts`).
    - **Feuilles** : A4 à A0 paysage, cartouche à remplir (titre, n° de plan, dessiné par, société, date, matière ;
      échelle, format et « feuille n / N » remplis seuls), projection européenne ou américaine. « + Feuille » en
      ajoute une. La première s'ouvre avec les vues standard (face, dessus, gauche, isométrique) à une échelle
      normalisée qui tient sur la feuille. Comme dans Fusion, le **cadre** et le **cartouche** se sélectionnent d'un clic
      (le cartouche n'importe où dedans, le cadre sur son trait) et **Suppr** les retire de la feuille, du SVG, du PDF
      et du DXF ; on les remet par leur œil dans le navigateur ou leurs cases « Cadre » / « Cartouche » du panneau.
      Une vue se prend aussi par son nom (« Vue de face (1:10) ») : même vide, quand il n'y a rien à dessiner, elle
      se sélectionne et se retire avec Suppr.
    - **Plan de pose** (groupe *Vues*) : une feuille par mur (« Pose — Mur A »…), l'élévation vue de la pièce de ce
      qui est posé contre lui (les meubles à moins de 80 cm de sa face, rangés avec le mur le plus proche ; le mur
      avec ses fenêtres et portes), le reste caché, à une échelle qui tient sur l'A3, cotée tout de suite (Cotes
      auto). Les murs sont les corps « Mur … » de la Pièce relevée ou dessinés par l'Implantation et le Dressing
      (`drawing/pose.ts`).
    - **Dossier client** (groupe *Exporter*) : un seul PDF — la vue 3D du projet en couverture, toutes les feuilles,
      puis le devis aux tarifs enregistrés dans Atelier › Devis (`app/drawing/client-file.ts`).
    - **Vues** : *vue de base* (face, arrière, gauche, droite, dessus, dessous, isométriques), posée d'un clic à
      l'échelle choisie ou ajustée. *Vue projetée* : tirée d'une vue, à côté, dessus ou dessous (la vue de gauche à
      droite en projection européenne), ou en biais pour une isométrique ; elle reste alignée sur sa vue mère, qui
      l'emmène quand on la glisse. Chaque vue a son nom, son échelle et ses lignes cachées en pointillés. Toutes
      suivent le modèle : une cote d'esquisse changée, la vue est redessinée.
    - **Coupe** : un trait sur une vue (Maj : d'équerre), puis la place de la coupe. Elle montre ce qui reste derrière
      le plan, les faces coupées hachurées (une pièce sur deux dans l'autre sens). Le trait de coupe porte ses flèches
      et ses lettres (A-A, B-B…), et le sens s'inverse dans les réglages.
    - **Détail** : un cercle sur une vue, puis la place du détail, agrandi deux fois et demie.
    - **Cotes** : *Cote* (un trait, ou deux points accrochés aux coins et aux centres, puis tirer : horizontale au-dessus ou
      dessous, verticale à côté, alignée avec Maj), *Diamètre* et *Rayon* (un cercle vu de face), *Angle* (deux
      traits). La valeur est mesurée sur le modèle et le suit (un caisson élargi, sa cote change) ; on peut imposer
      un texte. Une cote glissée change de place.
    - **Cote d'un trait** : avec l'outil *Cote*, un clic sur un trait (loin de ses coins) pose aussitôt sa cote,
      horizontale, verticale ou alignée selon le trait, hors de la vue du côté le plus proche, sur le premier rang
      libre (jamais sur une cote déjà posée). Les chiffres s'écrivent toujours à l'horizontale, dans la ligne de cote
      coupée autour d'eux (« ←— 123 cm —→ »), cotes verticales comprises. Si la cote est trop courte pour les tenir
      entre ses flèches, ils passent au-dessus, ou à côté vers l'extérieur.
    - **Traits des cotes** (comme les styles de cote de Fusion) : fin ou épais ; lignes d'attache continues ou en
      petits traits, la ligne de cote (flèches et chiffres) restant toujours continue. Le choix se fait pour toute la
      feuille (panneau de la feuille, « Traits des cotes ») ou pour une cote (« Comme la feuille » sinon), et passe
      aussi au PDF et au DXF.
    - **Côté d'une cote** : dans son panneau, « Côté » met une cote verticale à gauche ou à droite de sa vue, une
      horizontale au-dessus ou au-dessous, sur le premier rang libre. Toutes les cotes sélectionnées (Maj + clic) de
      ce sens changent de côté ensemble.
    - **Effacer** (groupe Cotes) retire les cotes des vues sélectionnées, sinon toutes celles de la feuille ; Ctrl+Z
      les rend. En mode *Choisir*, un
      trait cliqué dans une vue donne sa longueur dans le panneau (« Trait cliqué : 50 cm »), avec « Coter ce trait ».
    - **Déplacer et ranger les cotes** (comme Fusion) : une cote glissée suit la souris. En travers de sa ligne, la
      cote s'éloigne ou se rapproche de la vue ; le long de sa ligne, son texte glisse, et hors des lignes d'attache
      la ligne de cote le rejoint.
      - Près d'une autre cote parallèle, elle s'aligne sur elle. Elle s'accroche aussi aux rangs réguliers autour de
        sa vue (tous les 7 mm), avec un guide rose en tirets.
      - Le texte revient au milieu quand on le ramène près du centre.
      - *Réorganiser* range les cotes des vues sélectionnées (sinon de toutes) de chaque côté de la vue : la plus
        courte près d'elle, celles qui ne se chevauchent pas (une chaîne) sur le même rang, sans croisement, textes
        recentrés (`drawing/arrange.ts`).
    - **Cotes auto** : la cotation automatique des vues sélectionnées, sinon de toutes les vues visibles (hors
      isométriques et détails). Elle pose les cotes hors tout (largeur sous la vue, hauteur à sa gauche ; au-dessus
      ou à droite quand une autre vue est tout près de ce côté), les chaînes de cotes entre les niveaux des coins, et
      un diamètre par taille de cercle assez grand pour être lu. Les niveaux à moins de 7 mm l'un de l'autre sur le
      papier sont fondus : l'épaisseur d'une planche ne fait pas une cote illisible. Toutes restent lisibles : les
      chiffres d'une cote se mettent entre ses flèches, sinon au-dessus de sa ligne s'ils tiennent entre ses lignes
      d'attache. Sinon, ils passent au-delà d'un de ses bouts, la ligne prolongée jusqu'à eux, sur le premier rang
      où ils ne touchent ni une autre cote ni une ligne d'attache. Plusieurs petites cotes qui se suivent (un fileur,
      une colonne étroite) font ainsi un escalier. La cote hors tout vient au rang d'après, et le nom de la vue passe
      sous ses cotes, jamais traversé par leurs lignes d'attache. Relancée, elle remplace les siennes.
    - **Navigateur** (à gauche, comme dans Fusion) : les feuilles, et pour la feuille ouverte ses vues, ses pièces,
      ses cotes et annotations, son dessin 2D. Un œil cache ou montre une vue entière, une pièce dans une seule vue
      (en dépliant la vue), une pièce dans toutes les vues de la feuille, une cote ou un trait. Une vue sans ses
      portes montre l'intérieur du meuble. Un clic sur une ligne la sélectionne.
    - **Annoter** : *Texte*, *Note* avec ligne de rappel, *Repère* (bulle numérotée d'une pièce, au numéro de la
      nomenclature) et *Nomenclature* (repère, désignation, quantité, matière, dimensions, tirée de la liste de
      débit).
    - **Dessin 2D libre** : *Ligne*, *Rectangle*, *Cercle* en millimètres réels à l'échelle du dessin de la feuille
      (1:10 par défaut). Ils s'accrochent aux bouts des traits, Maj les garde d'équerre, et la longueur (ou la largeur,
      le rayon) se tape au clavier puis Entrée. Le style du trait se choisit : continu fort ou fin, interrompu, mixte
      (axe). Une feuille sans vue fait ainsi un plan 2D.
    - **Exporter** : *PDF* (impression de toutes les feuilles), *DXF* de la feuille par calques (CADRE, CONTOUR,
      CACHE, COUPE, COTES, DESSIN), *SVG*.
    Le moteur est dans `drawing/` (projection, vues posées, cotes, SVG, DXF), l'écran dans `app/drawing/`.
- **Coque** (groupe Modifier, comme Fusion) : le corps est creusé à une épaisseur de paroi, les faces planes
  cliquées restant ouvertes (un bac, un tiroir, une boîte sans couvercle) ; sans face, il devient creux et fermé.
- **Magie extrude : départ et mesures tapées** (`app/face-strip-tool.ts`, `ui/typed-values.ts`) : « Départ » choisit d'où
  part le trait — *sur un trait* (les arêtes seules, même près d'un coin : un trait parallèle) ou *sur un point* (les
  coins seuls : un trait en travers). Pendant le tracé, la **distance** (retrait;largeur d'un double trait) puis la
  **hauteur** (− : creuser) se tapent au clavier sans cliquer de champ, comme dans « Dessiner sur le corps » : elles
  s'écrivent dans la case des mesures en bas de la vue, et **Entrée** pose le trait, puis termine la poussée ;
  Retour arrière efface, Échap vide la saisie. La case dit aussi, au survol, de quoi partirait un clic (cette arête,
  ce coin, toute la face). **« Nouveau corps »** (étape tirer/pousser, retenu pour la séance) fait de ce qui est
  extrudé un corps à part — la bande, la face ou la zone d'esquisse —, le corps cliqué restant tel quel
  (`operation: "new"`).
- **Les outils de dessin de l'esquisse restent actifs** (Ligne, Rectangle, Cercle, Arc, Polygone, Oblong, Ovale,
  Courbe ; `lay` de `sketcher/shape-entry.ts`) : une forme posée, l'outil attend la suivante — plusieurs formes à la
  suite, chacune son étape d'annulation. **Échap** (ou l'outil Sélection) le quitte ; un second Échap, sans outil ni
  sélection, quitte l'esquisse, comme « Terminer l'esquisse ».
- **Cotes tapées pendant le tracé, comme Fusion 360** (esquisse : Ligne, Rectangle, Cercle ;
  `sketcher/typed-dims.ts`, `sketcher/shape-entry.ts`) : le premier point cliqué, les mesures en direct de la forme
  sont des **cases** (`[data-dim-field]`). On tape une valeur, dans l'unité du projet : elle s'écrit dans la case en
  bleu et la forme la prend aussitôt ; **Tab** la garde (cadenas) et passe à la suivante ; **Entrée** — ou un clic —
  pose la forme ; Retour arrière efface, puis libère la valeur gardée. Rectangle : largeur puis hauteur ; ligne :
  longueur puis angle sur l'horizontale ; cercle : diamètre. La souris donne le sens et tout ce qui n'est pas tapé.
  Chaque valeur tapée devient une **cote de l'esquisse** (longueur, diamètre), sauf si l'esquisse ne peut pas la
  prendre ; l'angle oriente le trait sans poser de cote. Sur un clavier AZERTY, les chiffres se tapent sans Maj.
  Une valeur tapée qui fait sortir la forme de l'écran fait **reculer la vue** pour la montrer entière, avec ses
  cases (`showShape` de `sketcher/mode.ts`).
- **Vider un corps** (groupe Modifier, après Coque ; `data-action="hollow"`) : un clic sur un corps le vide à
  l'intérieur, **quelle que soit sa forme** — prisme à base de triangle, de carré, de cercle, côtés de biais, sphère,
  plaque percée. La face par laquelle on le prend est son **devant** ; **« Ouvertures »** dit ce qui s'ouvre :
  *devant et derrière* (au départ : un **caisson**, les côtés autour **tous de la même épaisseur**), *le devant seul*,
  ou *aucune* (corps creux fermé). On saisit l'**épaisseur des côtés** et on choisit les **côtés** : *chaque côté seul*
  (au départ : un corps par côté, « Corps vidé 1 — côté n », chaque côté plat un panneau pris vers l'intérieur) ou
  *joints* (un seul corps creux) ; l'**assemblage** des panneaux : **bout à bout** (au départ : les plus grands côtés
  passent, les deux d'une paire ensemble — les montants d'un caisson vont sur toute sa hauteur, dessus et dessous
  entre eux) ou **en onglet** à tout angle. Un côté courbe garde sa paroi d'un seul corps (un cylindre : ses deux fonds
  et le tube entre eux). **« Fond »** ferme l'ouverture de derrière d'un panneau à lui (« Corps vidé 1 — fond »,
  premier corps, HDF au départ), de l'épaisseur voulue (8 mm au départ) : *encastré entre les côtés*, au ras du
  dehors, ou *vissé derrière*, toute la face, les côtés s'arrêtant avant lui (`ShellFeature.back`, `backPanel`) —
  un vrai caisson. Une face cliquée ensuite s'ouvre (orange) ou se referme. Un côté d'un corps déjà vidé ne se
  vide pas à son tour : l'outil le dit et renvoie à son étape de l'Historique. C'est une Coque qui dit ce que sont ses
  côtés (`ShellFeature.sides`, `joint`) : elle se rouvre depuis l'historique avec le même outil. Dans le noyau
  (`features/shell-loft.ts`), le corps est creusé par lui-même rentré de l'épaisseur (`makeOffset`, `carved`) quand
  la coque du noyau ne donne rien — un corps fermé, un trou à travers une face ouverte —, la Coque en profite aussi ;
  des parois que plus rien ne tient ensemble font plusieurs corps ; les côtés plats viennent de `facePanels`
  (`features/paneling.ts`), les côtés courbes de ce qui reste de la paroi une fois ôtés les panneaux.
- **Panneaux sur faces** (groupe Modifier, après Coque), dans l'historique : les faces planes cliquées d'un volume
  deviennent des panneaux de l'épaisseur voulue, pris dans le volume ; un clic prend aussi les **faces pareilles**
  (même aire, même périmètre, à plat : les côtés d'un seau à pans, les deux côtés d'un caisson, `app/face-twins.ts`),
  recliquer retire. Deux assemblages : **en onglet, à tout angle** (deux panneaux voisins se partagent leur coin par
  le plan bissecteur de leurs faces — le seau à 8 pans, la boîte en onglets) ou **bout à bout** (la première face
  cliquée passe, les suivantes s'arrêtent contre les panneaux déjà faits). Les faces non choisies restent ouvertes ;
  les faces se prennent sur le volume d'avant l'opération, comme pour la Coque ; l'opération se rouvre pour la
  reprendre (`features/paneling.ts`, `app/paneling-tool.ts`).
- **Lissage** (groupe Modifier, comme Fusion) : un solide passant par les profils fermés de plusieurs esquisses, dans
  l'ordre de l'historique, courbe ou droit entre eux (pied galbé, trémie, moulure qui change de section) ; nouveau
  corps, joindre ou couper. Chaque profil doit être un seul contour fermé, sans trou, dans des plans séparés.
- **Modificateur de planche** (groupe Modifier, comme les modificateurs de 3ds Max), dans l'historique : la planche
  (une boîte droite) est reconstruite exactement depuis sa section — *cintrée* sur sa longueur (rayon au milieu de
  l'épaisseur, la longueur est gardée), *effilée* (section réduite à un pourcentage au bout) ou *vrillée* (section
  tournée jusqu'à un angle au bout).
- **Déformer** (groupe Modifier, comme l'échelle centrée de SketchUp, Option · Ctrl), dans l'historique : un clic sur
  une face plane y pose un cadre jaune, aligné sur les axes du modèle, et ses poignées vertes. Tirer un coin agrandit
  ou réduit la face dans les deux sens, tirer le milieu d'un côté dans ce sens seulement, toujours depuis son centre
  (le point rouge) ; le champ « Échelle » la donne au chiffre. Les points du corps sur cette face s'écartent du
  centre, tout le reste reste en place et les côtés vont droit de l'ancien bord au nouveau : le dessus d'un prisme
  agrandi fait un seau à pans. La déformation se rouvre pour reprendre le cadre (`features/face-scale.ts`,
  `app/face-scale-tool.ts`).
- **FFD 3×3×3** (l'ancien « Déformer », comme la FFD de C. Phillips dans JHS PowerBar ; plus de bouton, les
  déformations FFD déjà dans les projets se rouvrent toujours), dans l'historique : une grille orange de 3 × 3 × 3 points se tend sur la boîte du corps choisi (sélectionné ou cliqué).
  Un clic sur un point le choisit, Maj + clic en ajoute, Maj + glisser prend tous ceux d'un rectangle (comme la
  fenêtre de sélection de SketchUp), « Choisir » en prend une rangée (les 9 du dessus, du dessous, du milieu, le
  milieu du dessus pour un dôme, les 27). Les trois flèches X, Y, Z tirent les points choisis, ou leurs champs donnent
  le déplacement au millimètre ; « Échelle » rapproche les points choisis de leur centre ou les en écarte (le dessus
  à 50 % fait d'un cylindre un obus, comme dans la démonstration de JHS) ; le corps suit en douceur (polynômes de
  Bernstein). Il marche
  sur n'importe quel corps : le corps est maillé, ses triangles recoupés finement, déformés, puis recousus en un
  vrai solide (environ 1,5 s de calcul) ; comme dans SketchUp, les arêtes entre facettes sont adoucies (moins de
  25°). La déformation se rouvre pour reprendre la grille (`features/ffd.ts`, `app/ffd-tool.ts`).
- **Échanger** (menu du groupe Modifier, comme le Composwapper de JHS PowerBar) : Alt + clic choisit l'élément
  source (un corps, ou toutes les pièces d'un caisson avec ses façades ; l'élément sélectionné en ouvrant l'outil
  l'est d'office) ; chaque clic ensuite remplace l'élément cliqué, et Ctrl (⌘) + clic remplace d'un coup **tous les
  éléments pareils** — tous les caissons du même modèle, toutes les pièces de même taille, tournées ou non. Maj + clic
  rend un élément ; l'élément sous le pointeur s'éclaire. Chacun devient une **copie liée** de la source (elle
  suit l'original), posée à sa place : centrée sur le même sol, centre sur centre, ou coin sur coin. Les remplacés
  sont retirés (ou gardés, si on le coche) ; une seule annulation (`document/swap.ts`, `app/swap-tool.ts`).
- **Espacement** (menu du groupe Modifier) : un clic sur un élément, un clic sur un autre — deux corps, deux
  caissons avec leurs façades, ou une esquisse — et l'espace entre eux s'affiche en cote rouge ; on tape le nouvel espace et le second
  élément s'écarte ou se rapproche (ou le premier, ou les deux de moitié chacun), le long de la plus courte distance
  ou d'un axe X, Y, Z. Un caisson glisse par sa position (ses façades suivent) ; un autre corps, par un déplacement
  dans l'historique ; une **esquisse** aussi se clique (ou se sélectionne dans le navigateur) : elle glisse par son
  plan, et ce qui en est extrudé la suit. Deux pièces d'un même caisson (deux étagères) bougent seules. L'outil s'ouvre aussi sur deux
  éléments déjà sélectionnés, ou depuis le Mètre ; une seule annulation (`document/spacing.ts`,
  `app/spacing-tool.ts`).
- **Copie liée** (groupe Modifier, comme les composants de SketchUp) : une copie des corps sélectionnés, posée à côté,
  qui suit toute modification de l'original ; on la place avec Déplacer ou Tourner, elle reste liée (c'est un réseau
  d'une copie dans l'historique).
- **Assistant de modélisation** (groupe « Atelier », l'étincelle violette) : on écrit en français ce qu'on veut
  (« un bas de 600 avec trois tiroirs à droite du caisson », « implante une cuisine en L de 3 m sur 2,4 m »,
  « passe les façades en chêne », ou une question de métier). Claude (Opus 5.5, par l'API Anthropic, appelé **depuis
  le serveur** : la clé reste dans la variable d'environnement `ANTHROPIC_API_KEY`) répond et propose des actions
  d'une liste fermée — ajouter ou modifier un caisson, l'habiller de façades, implanter une cuisine, changer une
  matière ou un paramètre, renommer, supprimer — imposée par un schéma JSON (sorties structurées). Les actions
  s'affichent en clair et ne s'appliquent qu'au clic sur « Appliquer », par les mêmes fonctions que les outils, en
  une seule annulation ; une action impossible est refusée avec sa raison. L'assistant reçoit un résumé du modèle
  (opérations, cotes des caissons, paramètres, matières), jamais la géométrie. 40 demandes par utilisateur et par
  heure ; en cas de refus de sécurité, la demande est reprise par le modèle de repli recommandé (`fallbacks`).
- **Lien client et commentaires** (groupe « Atelier ») : *Lien client* fige le meuble affiché (sans les murs) en un
  modèle GLB en mètres, posé au sol, avec un résumé (dimensions, nombre de pièces, prix TTC du devis si on le veut),
  et donne une adresse publique `/s/<jeton>/` à envoyer au client (copiée, avec son QR code), révocable d'un clic.
  Sans compte, le client tourne le meuble en 3D, le **pose chez lui en réalité augmentée** depuis son téléphone
  (Scene Viewer sur Android, Quick Look sur iPhone avec un USDZ fabriqué dans la page ; sur ordinateur, un QR code
  ouvre la page sur le téléphone) et laisse des **commentaires**, attachés s'il le veut à un point du meuble (pastille
  numérotée). Dans l'éditeur, *Commentaires* les liste (le bouton s'entoure d'orange quand il y en a à traiter) :
  « Voir » marque le point dans la vue, on répond (le client lit la réponse sur sa page) et on coche « Traité ».
  Côté serveur : modèles `ShareLink` et `Comment` (migration `0002_sharing`), modèle GLB de 20 Mo au plus, messages
  limités (2000 caractères, 10 par adresse et par lien toutes les 10 minutes, 300 par lien), pages non indexées.
  - **Variantes pour le client** (un configurateur borné) : quand le projet a au moins deux configurations
    (Paramètres › Configurations, par exemple « Petit 600 » et « Grand 900 »), le lien peut les proposer toutes
    (huit au plus). Chacune est montrée à son tour, sans toucher au document ni à l'annulation, et figée avec son
    modèle 3D et le prix TTC de son devis. Le client passe de l'une à l'autre (modèle, dimensions, prix, réalité
    augmentée) et « Je choisis cette variante » écrit son choix dans un message. Serveur : modèle `ShareVariant`
    (migration `0005_production`), adresse `/s/<jeton>/variants/<n>.glb`.
- **Implantation de cuisine** (groupe « Cuisine ») : une cuisine entière le long d'un mur (I), de deux murs en
  angle (L) ou de trois (U), avec un îlot si on veut. Chaque mur est découpé en modules du commerce (600 d'abord, puis le plus grand de 300 à 900 qui tient, le
  reste en fileur) ; meubles bas (hauteur, profondeur, socle réglables) avec leurs façades (tiroirs et portes en
  alternance, tiroirs ou portes partout ; deux portes au-delà de 600), plan de travail débordant de 20 mm, meubles
  hauts au-dessus si on veut, et les murs. En L, l'angle est un angle mort fermé par deux fileurs, pour que portes et
  tiroirs s'ouvrent sans se heurter ; les meubles du mur B sont des caissons tournés de 90°. Tout arrive dans
  l'historique en une annulation et reste modifiable pièce par pièce ; les matières sont posées (caissons mélaminé
  blanc, fonds HDF, façades et plan de travail au choix), les murs vont sur le calque « Pièce », hors du débit, du
  devis et du fichier DXF.
  - **Sur la Pièce relevée** (« Murs : Pièce : mur X en mur A », proposé dès qu'il y a une Pièce) : longueurs et
    plafond viennent du relevé ; le mur B est celui d'avant le mur A (la pièce tourne à droite), le mur C celui
    d'après ; la cuisine est tournée et posée contre eux (les angles utilisés doivent être droits). Les meubles bas
    s'arrêtent à 5 cm d'une porte (deux plans de travail de part et d'autre), les meubles hauts aussi devant une
    fenêtre, et un plafond bas près du mur (retombée, rampant) les ôte ; le panneau dit ce qui a été évité.
  - **Angle** (L, U) : mort et fermé par deux fileurs, ou **meuble d'angle** (un caisson qui file dans l'angle, une
    porte de 45 cm et un panneau fixe dans l'angle).
  - **Électroménager** : l'**évier** sous la fenêtre du mur A (sinon vers son premier tiers), le **lave-vaisselle**
    juste à côté (sa façade, sans caisson), la **plaque** à deux modules au moins de l'évier, pas sous une fenêtre
    ni au bout du plan, avec le **four** sous elle (ou en **colonne**), la **hotte** et son conduit à la place du
    meuble haut au-dessus, la **colonne réfrigérateur** au bout libre (du mur A, du mur B en U). Le plan de travail
    est **découpé** pour l'évier et la plaque (usinages « Découpes », comme l'outil Découpes) ; les appareils vont
    sur le calque « Électroménager », hors débit et devis.
  - **Crédence** (jusqu'aux meubles hauts, ou 60 cm ; sous une fenêtre, jusqu'à son allège) et **plinthes**.
  - **Îlot** : face au mur A, centré, au **passage** voulu (110 cm proposés), ses meubles tournés vers le mur.
  - **Ergonomie**, dans le panneau : le **triangle** évier – plaque – réfrigérateur (4 à 7 m, chaque côté de
    1,20 à 2,70 m), le passage devant l'îlot (90 cm au moins, 1,20 m pour deux), la plaque contre une colonne ou sous
    une fenêtre, le lave-vaisselle loin de l'évier (`features/kitchen-layout.ts`, `features/kitchen-appliances.ts`,
    `features/room-runs.ts`, `document/kitchen-plan.ts`).
- **Plan de cuisine** (onglet Cuisine, groupe « Cuisine ») : une cuisine commence par son **plan vu de dessus**,
  comme un dressing. On choisit un modèle — droite, en L à gauche ou à droite, en U, **en G** (un mur B ou C et une
  **péninsule**, un retour libre au bout du mur A) ou **parallèle** (deux murs face à face, au passage voulu) —, avec ou
  sans **îlot** face au mur A (110 cm de passage proposés) ; les cotes des murs, la hauteur sous plafond, la profondeur
  des bas (60) et des hauts (35), la hauteur du plan de travail (90) et les matières. « Créer le plan » pose une esquisse
  au sol « Plan de la cuisine », découpée en **linéaires** (un par mur, un pour la péninsule, un pour l'îlot) séparés par
  leurs côtés, comme les zones du Plan de dressing dont elle reprend les murs (`document/kitchen-plan-shapes.ts`). À
  chaque angle, on choisit le mur qui passe — il va jusqu'au mur et l'angle est à lui —, l'autre s'arrête contre lui.
  - **Angles** (`document/kitchen-corners.ts`, `app/kitchen/kitchen-corner-choice.ts`) : chaque angle a sa solution, choisie
    dans l'éditeur de linéaire (bloc « L'angle », chaque solution dessinée vue de dessus), dans l'onglet « Angles » de
    Meubles de cuisine, ou dans « Modifier le plan ». **Angle mort** fermé par deux fileurs ; **meuble d'angle à
    étagère**, panneau devant l'angle et porte de 45 cm, sur le mur qui passe ; **meuble d'angle LeMans**, même
    caisson, deux plateaux pivotants (sur le calque « Quincaillerie », hors débit et devis) ; **meuble d'angle en L
    90 × 90**, un caisson sur chaque mur et une porte pliante. Le meuble d'angle choisi se bâtit même sur un linéaire
    encore vide, et la bande de face le dessine. Ses cotes se règlent : la **porte** du meuble d'angle (30 à 60 cm)
    ou le **côté du L** depuis le mur. **En haut**, chaque angle reçoit aussi, au choix, rien, un **haut d'angle à
    porte** (panneau devant l'angle et porte de 30 cm, sur le mur qui passe ; un fileur sur l'autre) ou un **haut
    d'angle en L** (60 × 60), porte ou côté réglables ; les hauts des deux murs s'arrêtent contre lui.
  - **Réglages de l'Implantation** : le plan a aussi le **socle**, l'**épaisseur du plan de travail**, la
    **crédence** et les **plinthes** (bâtis), et ce que « Proposer une cuisine » met : les **façades des bas**
    (tiroirs et portes en alternance, tiroirs partout, portes partout), les **meubles hauts**, l'**électroménager**,
    la **colonne réfrigérateur** et le **four en colonne** (la plaque seule dessous ; la colonne four à côté du
    réfrigérateur, au bout libre).
  « Mur A dans la pièce » pose le plan sur la Pièce relevée :
  cotes et plafond en viennent, ses portes, fenêtres, prises et retombées sont marquées sur le schéma, les meubles bas
  laissent les portes libres, les hauts les fenêtres, et un plafond bas ôte les hauts (`document/kitchen-plan-room.ts`).
  - **Le plan et la 3D restent d'accord, dans les deux sens** (`document/kitchen-sync.ts`) : le plan refait la cuisine
    quand il change ; et un meuble qu'il a fait, changé dans la 3D — sa largeur sous la vue ou dans ses propriétés, une
    cote tapée, Prolonger élément, Déformer — change le plan : la largeur, la profondeur (et la hauteur d'un haut ou
    d'une colonne) de son meuble du linéaire, la porte ou le côté d'un meuble d'angle, bas ou haut. La cuisine est alors
    refaite avec lui dans la même annulation : les voisins se placent, fileurs et plan de travail suivent. Un clic sur
    un angle de la bande de face ouvre ses réglages.
  - **Un meuble poussé le long de son mur** dans la 3D (Pousser, Déplacer) y reste : le linéaire garde la place libre
    qu'il laisse, un « Espace libre » de sa rangée devant lui, hachuré sur la bande et compté dans la place libre
    (`document/kitchen-moves.ts`). Les meubles poussés ensemble gardent leurs écarts. Le linéaire les liste dans
    « Place libre » → « Espaces gardés », chacun à sa largeur tapée ou supprimé (ses meubles se resserrent). Poussé dans
    son voisin ou au-delà du mur, le plan ne peut pas le dire et ne change pas. Des meubles poussés avant que le plan
    ne les suive : le linéaire le signale, et « Garder leurs places » les reprend.
  - **L'électroménager posé à la main** (« Électroménager ») se voit sur la bande du linéaire devant lequel il est, en
    sombre, là où la 3D l'a (`document/kitchen-hand-appliances.ts`). Quand la cuisine est refaite, ce qui a été fait à
    la main sur ses pièces — la découpe du plan de travail sous une plaque ou un évier, une face tirée d'un fileur — est
    remis sur la pièce du même nom, avec son nom et son apparence.
  - **Voir un linéaire isolé**, comme un mur du Plan de dressing : « Voir » dans la liste des linéaires (ou « Voir mur A
    isolé » dans l'éditeur) ne garde dans la vue que ce que le plan a fait pour lui, vu de face, avec **ses cotes**
    (`document/kitchen-run-dims.ts`, `app/kitchen/kitchen-run-dims-view.ts`) : en bas la chaîne des largeurs — meubles,
    colonnes, fileurs, places libres, angles — et la longueur du mur ; en haut celle des meubles hauts ; à gauche la
    hauteur du plan de travail, la rangée haute et le plafond. **Un clic sur une cote la change** dans la
    **calculatrice** qui s'ouvre à côté d'elle (pavé, + − × ÷, parenthèses, unités : « 360 − 2 × 60 », « 1,2 m + 15 cm » ;
    une valeur refusée y dit pourquoi, `app/dim-editor.ts`, `ui/calculator.ts`)
    (`document/kitchen-dim-edit.ts`) : la largeur d'un meuble (refusée s'il ne tient plus, avec le plus large possible ;
    un appareil garde ses largeurs), la porte ou le côté d'un meuble d'angle, bas ou haut, la longueur du mur, la
    hauteur du plan de travail ou sous plafond (pas celles qui viennent de la Pièce) ; un fileur ou une place libre se
    calculent. La cuisine est refaite d'un coup. L'isolement tient quand la cuisine est refaite ; ouvrir
    un autre mur le montre à son tour ; « Tout montrer » rend tout (`app/zone-view.ts`). La vue seulement.
  - **Agir sur la bande** (`app/kitchen/kitchen-strip-actions.ts`) : ce qui est choisi sur la bande — un meuble (ou
    plusieurs, Maj + clic), un appareil posé à la main, le plan de travail — se règle sans ouvrir un volet.
    - Une **barre sous la bande** : « ← » et « → » (un cran dans sa rangée), « Dupliquer » (une copie juste après, si
      elle tient), « Supprimer ».
    - Le **clavier**, la bande ayant la main : Suppr supprime, Ctrl + D duplique, ← et → déplacent d'un cran.
    - Le **clic droit** sur un meuble : Dupliquer, Un cran à gauche ou à droite, Supprimer.
    - Un **appareil posé à la main** (Électroménager), cliqué sur la bande, se supprime avec la découpe du plan de
      travail faite pour lui (`document/appliance-remove.ts`).
    - Le **plan de travail**, cliqué, se supprime pour ce linéaire (ni plan ni découpes ; la crédence reste) et se remet
      par « Remettre le plan de travail ». La bande le dessine là où il est : au-dessus des meubles.
    - Un meuble ajouté ou dupliqué qui pousserait un autre hors du linéaire est refusé, avec la place qui reste.
    - **Aligner sur le bas** (un meuble haut choisi ; aussi au clic droit) : son bord gauche vient au-dessus de celui
      du meuble bas qu'il recouvre le plus, sinon leurs bords droits, sinon il s'aligne sur le meuble bas suivant. Le
      décalage se fait par de la place gardée libre en haut, mise avant ou après lui ou reprise à celle qui s'y
      trouve ; refusé quand un meuble haut n'aurait plus sa place (`features/kitchen-run-align.ts`).
  - **Dans la 3D**, la barre du caisson choisi a « ✥ Déplacer » (glisser le long du mur, aimanté aux voisins, aux murs
    et au bout du plan ; un clic puis un clic sur une face ou un coin l'y colle), « ↻ », et maintenant
    « ⧉ Dupliquer » (Ctrl + D) — le même juste après lui sur son linéaire quand le Plan de cuisine l'a fait, sinon sa
    copie à sa droite avec ses façades et ses matières (`document/unit-duplicate.ts`) — et « ✕ » qui le supprime.
  - **Éditeur de linéaire** : un clic sur un linéaire ouvre « Linéaire — mur A », sa **bande de face à l'échelle**
    (dessinée avec les dessins du catalogue) sur deux rangées : en bas les meubles bas et les colonnes, en haut les
    meubles hauts, la hotte et le micro-ondes. On y ajoute un meuble du catalogue (largeurs du commerce de 300 à 1200),
    de « Mes meubles » ou un **appareil** — évier, plaque de cuisson, plaque et four, four sous plan, lave-vaisselle,
    colonne réfrigérateur, colonne four, hotte, micro-ondes —, après celui qui est choisi ; on le glisse pour changer
    sa place, on l'échange contre un autre modèle. Un meuble choisi se fait **sur mesure** : sa largeur se tape (ou se
    prend parmi les largeurs courantes) ou se **tire par son bord droit** sur la bande, au centimètre ; un **clic sur
    une largeur écrite sur la bande** — sous un meuble, ou celle d'une porte d'angle, en bas comme en haut, la porte
    pliante d'un L comprise (son bras suit) — ouvre la **calculatrice** à côté d'elle : une valeur ou un calcul, refusé
    hors limites avec ses bornes (`app/kitchen/kitchen-strip-edit.ts` ; la partie fixe d'un angle vient de la
    profondeur de l'autre mur et ne se change pas) ; la hauteur d'un
    haut ou d'une colonne et la profondeur de tout meuble se tapent aussi, dans leurs limites (un bas garde la hauteur
    du plan de travail), et « Cotes du modèle » les rend ; la cuisine 3D est bâtie à ces cotes (`itemSize`). Un appareil
    garde ses largeurs. **Plusieurs meubles** se choisissent ensemble : **Maj (ou Ctrl, ⌘) + clic** sur la bande en
    ajoute ou en retire un (surlignés), « Choisir tous les bas » / « Tous les hauts » les prend d'un coup. Le bloc
    « Meubles choisis (n) » leur donne une **largeur, une profondeur (et la hauteur des hauts et colonnes) commune**
    (« À tous »), la **même largeur pour tous** (leur largeur totale partagée au millimètre), leur **partage la place
    libre** de leur rangée (et ses fileurs), les **échange** tous contre un autre modèle, les **duplique** après eux ou les
    **retire** ; chacun reste dans ses limites, un appareil garde ses largeurs (`features/kitchen-run-multi.ts`,
    `app/kitchen/kitchen-run-multi-view.ts`). **Chaque changement se voit aussitôt dans la 3D**, en aperçu (et sur le mur isolé, avec ses
    cotes) sans être enregistré : **OK** le garde en refaisant la cuisine en une seule annulation, **Annuler** (ou
    fermer le panneau) remet la cuisine d'avant (`app/kitchen/kitchen-run-preview.ts`). Dans l'aperçu, les portes et les tiroirs
    s'ouvrent d'un clic (ou par les boutons de l'atelier) ; un clic droit propose de **garder** l'aperçu (OK) ou de
    l'annuler, ses pièces n'étant pas encore dans le projet. Sur la bande, chaque façade d'un angle — la **porte**, la
    **partie fixe**, un fileur — porte sa largeur (cm), en bas comme en haut. Le reste du mur va **à gauche**, **à droite**
    ou **partagé en deux** — une moitié contre chaque angle ou chaque bout —, ou, avec un meuble d'angle sur un
    linéaire qui va jusqu'au mur, **contre les murs** : le meuble d'angle s'écarte du mur et un **fileur mural** ferme
    l'écart. Des boutons placés sous « Place libre » font ce choix, chacun disant ce qu'il donnera (« 2 fileurs de
    12,1 cm », « 2 fileurs muraux de 12,1 cm ») ; une colonne au bout reste contre lui : jusqu'à 15 cm, un **fileur** le ferme ; au-delà, la **place
    reste libre**, sans panneau ni plinthe, dessinée en pointillés et **hachurée** avec sa largeur sur la bande (les angles,
    pris par les meubles de l'angle, ne le sont pas), et « Place libre » dit
    combien il en reste en bas et en haut. Le bloc « À revoir » dit ce qui ne tient pas, la hotte hors de la plaque, la plaque sans 30 cm de plan de chaque côté ou sous
    une fenêtre, le lave-vaisselle loin de l'évier (`features/kitchen-run-items.ts`, `app/kitchen/kitchen-run-editor.ts`,
    `app/kitchen/kitchen-run-strip.ts`).
    - En tête du linéaire, **un bouton par mur** (Mur A, Mur B, Mur C, Péninsule, Îlot), gardé en vue quand le
      panneau défile, ouvre un autre linéaire ; ce qui est changé et pas encore appliqué l'est d'abord, sur un oui.
    - Sous la bande, **chaque titre se plie** (`ui/fold.ts`) : Place libre, Meuble choisi, Ajouter des meubles, Les
      angles, À revoir, Prix du projet. Tous sont fermés au départ ; un clic ouvre, un autre ferme, et ouvrir un titre
      ferme les autres ; choisir un meuble sur la bande ouvre ses réglages. La vue des linéaires plie de même
      Ergonomie, À revoir et Prix du projet (avec « Ouvrir le devis »).
    - **Fileurs** : des fileurs posés à la main, **en bas** (entre socle et plan de travail) et **en haut** (dans la
      rangée des hauts), au début de la rangée, après le meuble choisi ou à la fin, à la largeur tapée (1 à 30 cm).
      Ils prennent leur place sur le linéaire comme un meuble — se glissent, se règlent, se retirent sur la bande, leur
      largeur se tape sur sa cote — et se bâtissent en panneaux, « Fileur posé A1 », « Fileur posé haut A2 », sans
      caisson ; le reste du mur se partage toujours autour. La liste « Fileurs posés », sous les boutons, les nomme
      (bas ou haut, largeur, place) avec un bouton **Supprimer** chacun, et **Supprimer les fileurs** les ôte tous.
    - **Ajouter des meubles** montre le catalogue comme « Meubles de cuisine » (`app/kitchen/kitchen-catalog-view.ts`) :
      chaque modèle dessiné de face, ce qu'il contient, ses cotes, redessiné à la largeur survolée ; un clic l'ajoute
      après le meuble choisi. Onglets Bas, Hauts, Colonnes, Électro. et Mes meubles.
    - **Largeur libre** : après les largeurs du modèle, « Autre… » ouvre un champ où taper n'importe quelle largeur, dans
      l'unité du projet (28,6 cm par exemple). Entrée l'ajoute, Échap le referme ; une largeur hors limites (10 à 240 cm
      pour un meuble) est refusée. « Place libre · 91,4 » ajoute le meuble à la largeur exacte de la plus grande place
      qui reste dans sa rangée, sans compter celles qu'un caisson aménagé tient (`widestRoom`). Les appareils gardent
      leurs largeurs. Dans « Meubles de cuisine », « Autre… » y est aussi.
    - **Un meuble prend la place gardée libre** : quand il ne reste pas de place ouverte, le meuble ajouté va dans un
      « Espace libre » de sa rangée (la place hachurée), à l'endroit de cet espace, qui garde ce qui reste de lui
      (`settledItems`). La place qu'un caisson aménagé tient n'est pas prise ; ce caisson supprimé, elle redevient libre
      (`kitchenPlanIn` oublie le lien vers un caisson qui n'existe plus).
    - **Un meuble qui ne tient pas est refusé** à l'ajout, avec la place qui reste (« il reste 60 cm au plus en bas ») :
      il ne reste plus dans le linéaire sans être vu. Ceux qui s'y trouvent déjà sans place (ajoutés avant, un meuble
      élargi, le mur raccourci) sont listés sous « À revoir », chacun avec « Retirer »
      (`app/kitchen/kitchen-run-missing.ts`).
    - **Voir** un linéaire montre aussi ses caissons aménagés, pas seulement ce que le plan a bâti (`runFeatures`).
    - **Supprimer un meuble dans la 3D** (le caisson choisi entier, puis Suppr) le supprime vraiment : l'opération
      elle-même part, avec ses façades, au lieu de ses planches une à une (`deletionOf`). Sur un linéaire du plan, sa
      place devient un « Espace libre » de sa largeur : il ne revient pas quand la cuisine est refaite, ses voisins ne
      bougent pas, et le prochain meuble ajouté assez étroit va dans cette place (`inKeptRoom`), une seule fois — la
      place prise, un autre meuble est refusé. Un caisson aménagé dont on supprime les panneaux disparaît en entier,
      son esquisse avec, et sa place redevient libre (`document/kitchen-delete-sync.ts`). Pour refermer le vide,
      « Place libre » du linéaire retire l'espace.
  - **OK** refait **toute la cuisine** en une seule annulation, ce que l'Implantation sait bâtir : caissons tournés selon
    leur mur, façades, plan de travail **au-dessus des meubles** de chaque linéaire avec les découpes de l'évier et de
    la plaque, crédence, plinthes — qui passent aussi **sous chaque angle** (« Plinthe d'angle A ») jusqu'au bout de ses façades,
    meuble d'angle, LeMans, L ou fileurs d'angle mort, le linéaire qui passe fermant le coin et l'autre s'arrêtant
    contre lui —, électroménager sur le calque « Électroménager », murs sur le calque « Pièce », matières posées
    (`document/kitchen-plan-build.ts`, `document/kitchen-floor.ts`). « Modifier le plan » change les cotes ou le modèle :
    la cuisine est refaite, et ce qu'un autre modèle n'a plus part après confirmation.
  - **Le plan de travail suit les meubles** : il s'arrête au dernier meuble du linéaire au lieu de couvrir tout le
    mur, et la crédence avec lui ; ils s'allongent quand on ajoute un meuble. Il s'interrompt sur une place gardée
    libre (celle d'une cuisinière à poser) et à une colonne, qu'il ne traverse plus : un linéaire a alors plusieurs
    plans (« Plan de travail A », « Plan de travail A2 »), chacun avec les découpes des meubles qu'il couvre. Il passe
    sur un lave-vaisselle, sur la place d'un caisson aménagé et sur une place libre de moins de 5 cm. Une découpe
    d'évier ou de plaque a besoin de 5 cm de plan à chaque bout : un meuble d'évier tout au bout du plan est signalé.
  - **Proposer une cuisine** remplit tous les linéaires avec l'algorithme de l'Implantation (600 d'abord, puis le plus
    grand qui tient, un fileur ; évier, lave-vaisselle, plaque et four, hotte, colonne réfrigérateur au bout libre) :
    la même cuisine que l'Implantation, à retoucher meuble par meuble (`document/kitchen-propose.ts`).
  - Le **prix TTC** du devis et l'**ergonomie** (triangle d'activité, passage devant l'îlot) s'affichent dans le panneau.
    Cliquer l'esquisse « Plan de la cuisine », ou un meuble fait par le plan, dans le navigateur ou la vue, rouvre l'outil
    sur son linéaire (`app/kitchen/kitchen-plan-tool.ts`).
- **Ouvrir / fermer les portes** et **Ouvrir / fermer les tiroirs** (onglets Dressing et Cuisine, à côté l'un de
  l'autre) : un clic ouvre toutes les portes du modèle autour de leurs charnières, ou sort tous les tiroirs avec leurs
  caissons, et le bouton reste enfoncé ; un second clic les referme ou les rentre. Si certains sont déjà ouverts, le
  premier clic ouvre les autres ; sans porte ou sans tiroir, un message le dit. L'un ne touche pas à l'autre, et un
  clic sur une porte ou un tiroir n'ouvre toujours que lui. La porte d'un **meuble d'angle** (bas ou haut), bâtie en
  panneau, s'ouvre aussi : sur son bord loin de l'angle, sa poignée côté angle (`ExtrudeFeature.door`) ; dans une
  cuisine bâtie avant cette version, le Plan de cuisine qui l'a faite donne sa charnière (`madeDoor`), sans rien refaire. La vue seulement : le
  modèle ne change pas (`app/drawer-toggle.ts`).
- **Électroménager** (groupe « Cuisine », après « Meubles de cuisine ») : la **bibliothèque d'appareils de cuisine**,
  par familles — **Fours** (pyrolyse 60 cm, 90 cm, compact 45 cm, vapeur), **Plaques** (induction 60, 80 ou 90 cm,
  gaz 60, 75 ou 90 cm, domino), **Hottes** (murale cheminée, inclinée en verre, îlot, groupe filtrant intégré),
  **Réfrigérateurs** (combiné intégrable, combiné posable, américain), **Caves à vin** (sous plan 60 ou 30 cm, en
  colonne), **Lave-vaisselle** (tout intégrable à porte à habiller, posable), **Micro-ondes** (encastrable 38 ou 45 cm,
  posable), **Éviers** (inox 1 bac et égouttoir, inox 2 bacs, granit) et **Robinets** (col de cygne, douchette,
  semi-pro à ressort) —, des modèles **génériques, sans marque**, chacun **dessiné** dans sa carte (de face, de dessus ou
  de profil, dans sa finition) avec ses cotes et son **prix indicatif en MAD** (TTC, par taille : pour information, le
  devis ne compte pas l'électroménager), à ses tailles du commerce (four 595 × 595 × 548, lave-vaisselle
  598 × 815 × 550…) et dans ses **finitions** (inox, noir, blanc ; chromé, noir mat, laiton). On en choisit un puis
  on **clique le caisson** où le poser (ou le plan de travail au-dessus, ou un appareil déjà dedans) : un four ou un
  micro-ondes va **dans** le caisson, centré, au nu de sa face (un four de colonne vers 85 cm du sol) — ses façades et
  ses étagères ôtées ; une plaque, un évier ou un micro-ondes posable **sur le plan de travail**, centrés, le plan
  **découpé** dessous ; un robinet au fond du plan, **percé** Ø35 ; une hotte murale **à 65 cm au-dessus** du plan, contre
  le mur (une hotte îlot au milieu du caisson) ; un groupe filtrant **sous** un meuble haut ; un réfrigérateur ou un
  lave-vaisselle posable **debout** à la place du caisson, contre le mur ; une cave à vin sous plan au sol comme un
  lave-vaisselle (ses façades ôtées), en colonne sur le socle. L'outil reste ouvert pour le suivant ; chaque pose est une annulation.
  Un second clic sur le même caisson ne pose pas un deuxième appareil du même genre par-dessus le premier : on
  le supprime d'abord. Un appareil **suit son caisson** : poussé, déplacé ou mis ailleurs quand la cuisine est refaite,
  le caisson emporte ce qui est dedans, dessus, dessous ou au-dessus de lui, et la découpe du plan de travail faite
  pour lui (`document/appliance-follow.ts`). Chaque appareil est
  une opération « Électroménager » (`ApplianceFeature`) bâtie **pièce par pièce** par le noyau, avec ses détails réels :
  - un **four** : porte en verre noir et son hublot teinté, joint, bandeau de commande avec écran, afficheur et
    manettes à jupe, poignée barre sur ses pieds ; un **micro-ondes** : porte vitrée, colonne de commandes, afficheur ;
  - une **plaque induction** en vitrocéramique noire, ses foyers cerclés et ses commandes tactiles ; une **plaque gaz** :
    brûleurs et chapeaux émaillés, **grilles en fonte** sur leurs pieds, manettes ;
  - une **hotte** : casquette, corps au devant incliné, cheminée télescopique, filtres en cassettes et éclairage ; la
    hotte en verre a sa façade vraiment inclinée ; la hotte îlot sa cheminée au milieu ;
  - un **réfrigérateur** : portes de 55 mm, joint sombre entre elles, poignées, afficheur (l'américain son
    distributeur) ; une **cave à vin** : porte vitrée dans son cadre et clayettes en bois derrière ; un
    **lave-vaisselle** tout intégrable : porte à habiller, bandeau et touches sur la tranche ;
  - un **évier** : plage, bacs, bonde, trop-plein, égouttoir ; un **mitigeur** : col de cygne, manette, mousseur.

  Chaque pièce a son **apparence réelle** (inox brossé, verre laqué noir, verre de four teinté, vitrocéramique, fonte,
  émail, caoutchouc des joints, afficheurs lumineux — catégorie « Électroménager » de la bibliothèque d'apparences),
  visible dans la vue réaliste et le rendu, et tient dans l'encombrement de son appareil (sa boîte, plus sa porte et
  ses poignées devant, les grilles d'une plaque gaz dessus). Pour qu'une cuisine en porte des dizaines, ce ne sont que
  des pavés, des cylindres et des prismes **mis ensemble sans opération booléenne** (seuls les bacs d'un évier sont
  creusés). Les premières pièces de chaque modèle gardent leur ordre : un projet enregistré avant s'ouvre avec ses
  apparences, et les pièces ajoutées depuis prennent la leur à l'ouverture (`document/appliance-looks.ts`). Sur le
  calque « Électroménager », **hors liste de débit et devis**
  (`features/appliance-library.ts`, `features/appliance-parts*.ts`, `features/appliance-shapes.ts`, `features/appliance.ts`,
  `document/appliance-place.ts`, `app/appliances/appliance-tool.ts`, `app/appliances/appliance-drawings.ts`). Le **Plan de cuisine** et
  l'**Implantation** posent ces mêmes appareils à la place des anciens blocs : plaque induction, four encastrable (sous
  la plaque ou en colonne), hotte cheminée jusqu'au plafond, lave-vaisselle intégrable derrière sa façade, micro-ondes,
  réfrigérateur intégrable dans sa colonne, évier sur sa découpe et robinet derrière. Les dessins sont faits par
  l'application (SVG) : ce ne sont pas des photos de produits de marque.
- **Meubles de cuisine** (groupe « Cuisine ») : la liste des meubles du commerce, chacun à ses largeurs.
  - Chaque modèle montre son **dessin de face** à l'échelle, comme sur une planche de cuisiniste (caisson, socle,
    portes, tiroirs, poignées, four, robinet de l'évier — tout calculé depuis ses cotes, aux tons du thème, les
    poignées en laiton), ce qu'il contient et ses cotes (« L 80 · H 87 · P 56 cm ») ; survoler une largeur redessine
    le meuble à cette largeur (`app/kitchen/unit-elevation.ts`).
  - **Bas** : 1 porte, 2 portes, 3 tiroirs, casseroliers, évier, four.
  - **Hauts** : 1 porte, 2 portes, sur hotte.
  - **Colonnes** : rangement, four, réfrigérateur.
  - **Avec un Plan de cuisine** dans le projet, un clic **range le meuble dans un linéaire du plan**
    (`document/kitchen-plan-add.ts`) : après le meuble du plan sélectionné, ou celui ajouté juste avant, ou celui choisi
    dans le linéaire ouvert ; sinon au bout du premier linéaire où il tient sans en chasser un autre. Un haut va dans
    la rangée haute. La cuisine est refaite en une annulation : fileurs, plan de travail, crédence et plinthe suivent, et
    ce qu'il faut revoir s'affiche. Chaque pose donne la **place libre** restant sur son mur, en bas et en haut, et le
    panneau la tient à jour pour chaque linéaire, comme la liste du Plan de cuisine. Un linéaire en cours de changement
    le reçoit avec le reste, à son OK. Un meuble qui
    ne tient sur aucun linéaire se pose à part, et un message le dit. Le panneau dit où ira le prochain meuble.
  - Sans plan, un clic ajoute le meuble avec ses façades, à droite du caisson sélectionné (sinon du dernier), à la
    première place libre le long du même mur, son fond sur le même plan.
  - Un haut se pose au-dessus du bas choisi. Il est construit comme son voisin : épaisseurs, fond, standard, façades
    et leurs matières.
  - Le meuble arrive sélectionné ; une annulation par meuble (`document/kitchen-catalog.ts`, `app/kitchen/kitchen-units.ts`).
  - **Mes meubles**, en tête du panneau : ses propres caissons, ajoutés à la liste.
    - On en décrit un (nom, sorte bas / haut / colonne, largeur, hauteur, profondeur, socle, façades : une porte,
      deux, des tiroirs ou aucune, étagères).
    - Ou on reprend le caisson sélectionné (« Ajouter « … » à ma liste »), avec ses cotes et ses façades.
    - Un clic le pose dans la cuisine comme les autres, sous son nom ; ✕ le retire de la liste.
    - La liste est gardée dans ce navigateur, pour tous les projets (`app/kitchen/my-units.ts`).
  - **Isoler et aménager un caisson** : un clic droit sur un caisson de cuisine (ou sur sa porte) propose « Isoler et
    aménager ».
    - Le caisson devient un caisson comme ceux du dressing (une Répartition), de mêmes cotes et à la même place, avec
      son fond, ses étagères et ses façades : portes, ou tiroirs dans sa niche. La carcasse et les façades gardent
      leurs matières.
    - La vue ne montre que lui, de face, comme « Isoler » de Fusion. Le clic droit dans une niche ouvre Étagères,
      Cloisons, Hauteur de la niche, Penderie, Tiroirs, Porte sur niches ou Module. « Tout montrer » rend la cuisine.
    - S'il venait d'un linéaire du Plan de cuisine, le linéaire lui garde sa place, en espace libre de sa largeur : la
      cuisine refaite ne le refait plus, mais il suit cette place. Un meuble ajouté avant lui, un voisin élargi, le
      reste du mur envoyé de l'autre côté ou le plan tourné le déplacent avec elle. Cette place élargie ou rétrécie
      (sa largeur dans la calculatrice), sa Répartition prend la nouvelle largeur sur place : son intérieur s'adapte et
      chaque pièce garde sa matière (`document/caisson-follow.ts`).
    - Ses finitions (« Finitions » posées sur lui seul : joues, fileurs, bandeau, plinthe, pieds) le suivent, déplacées,
      tournées, allongées avec lui (`document/caisson-trims.ts`).
    - Un caisson aménagé avant cette version est relié à sa place à la prochaine cuisine refaite, s'il s'y trouve
      encore. Un meuble d'angle ne s'aménage pas ainsi.
    - Un caisson du dressing s'isole aussi, par « Isoler « … » » dans le menu de sa niche
      (`document/cabinet-furnish.ts`, `app/cabinet-furnish.ts`).
  - **Mes caissons** : un caisson aménagé se garde pour tous les projets, avec son intérieur.
    - Clic droit dans une de ses niches → « Garder ce caisson dans Mes caissons… », puis son nom. D'un mur de dressing,
      seule la case cliquée est gardée, ses côtés autour d'elle.
    - Il est gardé : cotes, construction, fond, portes, étagères, cloisons, penderie, tiroirs, matières
      (`document/caisson-spec.ts`). Il rejoint « Mes meubles » (bas, haut ou colonne d'après sa place et sa hauteur),
      marqué « Caisson aménagé ».
    - **En cuisine** : « Ajouter des meubles » d'un linéaire, onglet « Mes meubles », ou « Meubles de cuisine ». Il
      entre dans le linéaire à la largeur choisie, l'aperçu le montre aménagé ; à OK, il est fait à sa place, son
      intérieur adapté à sa largeur, et le linéaire lui garde cette place.
    - **En dressing** : clic droit dans une case → « Poser un de Mes caissons ici… ». Son intérieur va dans cette case
      (et les suivantes s'il en avait plusieurs), à sa largeur, avec sa porte s'il en avait une.
- **Éclairage** (groupe « Pièce ») : des lumières dans la cuisine et le dressing, au choix.
  - **Dedans** : un ruban LED sous le dessus et sous chaque étagère, à 3 cm de la façade (pas sous la planche la plus
    basse).
  - **Dehors** : sous les meubles hauts, un ruban ou des spots (un tous les 60 cm) ; une **corniche** sur les meubles
    qui montent à 1,80 m et plus ; une **plinthe lumineuse** sous les meubles posés sur un socle.
  - **Lumière** : blanc chaud (2700 K), neutre (4000 K) ou froid (6000 K).
  - Pour la sélection (des caissons, un mur du dressing), sinon tous les meubles de la vue. Le panneau dit le
    nombre de rubans, leur longueur en mètres et le nombre de spots.
  - Chaque lumière est un petit corps du calque « Éclairage », qui brille dans la vue. Elle reste hors débit, devis
    et usinage.
  - Dans le **rendu**, chaque ruban est une vraie lumière rectangulaire et chaque spot un projecteur. Elles se voient
    le mieux en « Studio sombre » ou « Intérieur », portes ouvertes pour l'éclairage intérieur.
  - Relancer l'outil **remplace** l'éclairage déjà posé, par exemple après avoir déplacé des meubles
    (`document/lighting.ts`, `app/lighting-tool.ts`).
- **Déplacer un caisson d'un geste** : un caisson sélectionné montre deux poignées dans la barre en bas de la vue, à côté
  de ses cotes.
  - **✥ Déplacer** se tire : le caisson glisse le long de son mur avec ses façades (Maj : librement sur le sol). Il
    suit la souris comme si on l'avait pris par son dessus, et la poignée dit la distance parcourue.
  - Il s'aimante au ras des autres corps : contre le côté d'un voisin, dans l'alignement d'un fond ou d'une façade,
    au bout du plan de travail, contre un mur (Alt : sans aimant ; Échap : annuler).
  - **Il n'entre jamais dans un autre meuble** (`features/box-clear.ts`, `clearOf`) : amené dans un voisin, sous des
    meubles hauts ou à travers un plan de travail, il est posé **à côté, au ras**, du côté d'où il vient ; il ne passe
    au-delà d'un meuble que s'il l'a déjà dépassé de plus de la moitié de sa largeur, et ne va jamais plus loin que sa
    place de départ (serré entre ses voisins et le mur du bout, il y reste). Ce qu'il touchait déjà — la plinthe qui
    passe sous lui, la crédence derrière — ne le gêne pas. Alt le laisse où on le pose.
  - **Coller** : un clic sur ✥ sans tirer, puis un clic sur une face debout ou un coin d'un autre meuble (ou d'un
    mur). Au survol, un fantôme orange montre où il ira.
    - Sur le côté d'un voisin : son côté contre lui, les fonds alignés.
    - Sur un mur ou une façade : son fond contre elle, centré sur le point, aimanté aux voisins.
    - Sur un coin : son coin le plus proche dessus. Échap annule ; la vue tourne toujours en glissant.
  - **↻** le tourne d'un quart de tour sur place.
  - Le document ne change qu'au lâcher ou au clic, une annulation (`app/cabinet-drag.ts`, `app/cabinet-stick.ts`).
- **Pièce** (groupe « Pièce ») : le relevé de la pièce, tel qu'on le mesure.
  - Les murs : chacun par sa longueur et l'angle de chaque coin (90° d'équerre, sinon l'angle relevé : une pièce pas
    d'équerre se relève comme elle est), la hauteur sous plafond et l'épaisseur des murs. Le mur A part de l'origine
    vers +X, la pièce à sa droite (vers −Y, là où se posent les meubles) ; les suivants tournent à droite. Les murs se
    rejoignent d'onglet à l'extérieur ; un relevé qui ne se ferme pas le dit, avec l'écart en mm.
  - Ce qui gêne : fenêtres et portes (percées dans le mur, depuis le début du mur, avec leur allège), prises,
    retombées de plafond (une poutre ou un soffite le long d'un mur : avancée et retombée) et rampants (une sous-pente
    qui descend vers un mur : hauteur au mur et distance jusqu'au plafond).
  Une opération « Pièce » dont chaque mur et chaque obstacle est un corps de la pièce (« Mur A », « Rampant 1
  (mur C) »…), hors liste de débit, devis et fichiers machine, avec l'aperçu en direct ; elle se rouvre pour être
  retouchée. Les Finitions s'ajustent à ses murs (fileurs) et à son plafond (bandeau). Le Contrôle avant fabrication
  signale le meuble qui entre dans un mur, une retombée ou sous un rampant, et celui qui cache une prise. Les
  assistants Cuisine et Dressing posent leurs meubles sur ce relevé (« Murs » dans leur panneau) (`features/room-plan.ts`,
  `features/room.ts`, `app/room-tool.ts`).
- **Finitions** (groupe « Meuble ») : habiller un meuble (les corps sélectionnés, sinon tout le meuble affiché)
  de planches ajustées à sa taille et à la pièce.
  - Joues de finition, contre ses côtés, sur toute la profondeur (portes comprises), du sol au-dessus, avec un
    dépassement en haut si l'on veut.
  - Fileurs en façade, qui comblent le jour jusqu'au mur voisin, de chaque côté, jusqu'à un écart maximal
    (150 mm par défaut). Un mur plus loin est signalé.
  - Bandeau haut en façade : jusqu'au plafond quand il y en a un, sinon de la hauteur choisie.
  - Pieds réglables (Ø30) sous le dessous relevé d'un socle, de la hauteur du socle : près de chaque angle, à
    50 mm des bords, et tous les 800 mm au plus. Ce sont de la quincaillerie (hors liste de débit, comptés au
    devis et dans la notice) ; un meuble posé au sol sur toute sa surface n'en a pas, et l'outil le dit.
  - Plinthe en retrait sous la façade, seulement là où le bas du meuble est libre (sous le socle d'une
    Répartition), de la hauteur libre. Elle s'arrête contre les côtés qui descendent au sol ; un meuble posé au sol
    sur toute sa façade n'en a pas, et l'outil le dit.
  On choisit la face avant (−Y par défaut, comme une Répartition dessinée de face) ; « gauche » et « droite » sont
  vus de devant. Les murs et le plafond sont ceux de la Pièce relevée, de l'Implantation de cuisine ou de l'Assistant Dressing. Une
  opération « Finitions » dont chaque planche est un corps nommé (« Joue gauche », « Fileur droit »…), de la matière
  du meuble, avec l'aperçu en direct ; elle se rouvre pour être retouchée (`features/finish-parts.ts`,
  `app/finish-tool.ts`).
- **Ma bibliothèque** (groupe « Meuble ») : des modules de son compte, à remettre dans n'importe quel projet.
  - Enregistrer : on sélectionne les corps d'un caisson, d'un tiroir ou d'une colonne réglés (ou une de leurs faces),
    on lui donne un nom. Le module garde ces pièces et tout ce dont elles dépendent : un panneau d'une Répartition
    emporte la Répartition entière, une porte sa répartition. Il garde aussi leurs noms, matières, apparences
    importées, les paramètres de leurs formules, et une vignette prise dans la vue.
  - Insérer : un clic recopie le module dans le projet ouvert, sous des identifiants neufs (toutes les références
    suivent), à l'endroit où il était, en une seule annulation. La vue se recadre sur tout le modèle et les pièces
    insérées sont sélectionnées, prêtes pour Déplacer. Un nom déjà pris prend le numéro suivant ; un paramètre que
    le projet a déjà garde sa valeur.
  - **Collé contre une face** : une face d'un meuble cliquée avant « Insérer » (son côté, son devant, son dessus), le
    module se pose contre elle, dehors (à droite d'un côté droit, sur un dessus…), son bas sur le bas de ce meuble et,
    à l'horizontale, son dos contre le même mur que lui (son bord le plus bas des coordonnées quand son dos n'est pas
    connu). Ses caissons et sa Répartition se déplacent en place, ses autres corps par un déplacement ; l'insertion et
    le collage font une seule annulation. Une face de biais ne colle rien : le module reste où il était
    (`document/glue.ts`, `app/library-panel.ts`).
  - Supprimer un module ne change pas les projets où il a été inséré.
  Les modules sont gardés par le serveur, par compte (500 au plus) : API `/api/library/`, `document/library.ts`,
  `app/library-panel.ts`.
- **Onglets du ruban** : au-dessus du ruban, comme dans Fusion, **Conception 3D**, **Dressing** et **Cuisine** montrent chacun les groupes de leur travail ; Modifier, Fabrication et Client sont dans les trois.
- **Modules à glisser** (groupe « Dressing ») : une palette de modules ; on en glisse un dans une niche de la vue, la niche visée s'allume en orange, et il s'y pose à ses cotes usuelles, en une annulation. Une niche **vide** le prend même quand elle fait partie d'un module posé (la niche sous la seule étagère d'une colonne, le chapeau au-dessus d'une penderie) ; seule une niche qui a déjà une tringle ou des tiroirs le refuse.
  **Ses réglages sont au bas du panneau** (`app/dressing/module-options.ts`, les mêmes lignes que l'outil Module) :
  ceux du module cliqué dans la liste (étagères ou « Selon l'espacement », espacement, chapeau, zone et nombre de
  tiroirs, jeux, tringle), qui servent au prochain module glissé ; puis, sitôt le module posé, « Module posé : … » —
  les siens, relus dans le document, avec la hauteur de chaque niche et l'épaisseur des étagères : chaque réglage
  changé refait le module sur place en une annulation (`withModuleChanged`), un Ctrl + Z les ramène, « Retirer ce
  module » libère sa niche. La palette ouverte, un clic sur un module posé dans la vue le reprend.
  Les étapes d'un module ont toujours des identifiants à elles : `uniqueOffsetId` (`document/operations.ts`) donne
  celui qui suit le plus grand en usage, jamais un identifiant libéré par une étape retirée — reprendre « of4 » quand
  « of5 » servait encore donnait à la seconde étape du module l'identifiant d'une autre (des Cloisons voisines), et
  chaque réglage changé ensuite laissait derrière lui des étagères orphelines qui remplissaient des niches entières.
- **Barre contextuelle** : en haut de la vue, seuls les outils utiles à ce qu'on vient de cliquer. Un clic dans une niche propose ses outils, la niche déjà choisie.
- **Contrôle en direct** (groupe « Fabrication ») : un cadre rouge ou ambre autour des pièces à problème pendant la conception, et leur nombre dans la barre d'état.
- **Variantes** (groupe « Client ») : jusqu'à six versions du projet gardées dans le projet, comparées côte à côte avec leur prix, et rouvertes d'un clic.
- **Cotes cliquables** : sans outil en cours, un clic sur une cote de pièce ou sur un total de Répartition ouvre la
  calculatrice à côté d'elle : une valeur ou un calcul, au clavier ou sur son pavé.
- **Plan de dressing** (groupe « Dressing ») : un dressing commence par son **schéma vu de dessus**. On choisit un
  modèle — droit, en L à gauche ou à droite, en U, avec des angles droits ou à **pan coupé**, ou deux linéaires **face à
  face** —, ses cotes, et « Créer le plan » pose une esquisse au sol, zones séparées par leurs côtés. Chaque zone se clique
  ensuite : elle reçoit sa **Répartition** contre son mur, ouverte dans son outil pour régler ses cases, et se rouvre de
  la même façon. Un **angle coupé** est une vraie Répartition, alignée sur le mur A et découpée au pentagone : Étagères,
  Niche, Module et Penderie y marchent, pas les tiroirs ni les portes de Répartition, qui sortiraient par le pan coupé ;
  son côté du bout s'ajoute, et « Porte sur le pan coupé » pose une porte de biais avec ses charnières au devis. « Modifier
  le plan » change les cotes ou le modèle : tout ce qui est fait dessus suit, et ce qu'un autre modèle n'a plus part après
  confirmation. Cliquer l'esquisse « Plan du dressing », dans le navigateur ou la vue, rouvre l'outil sur ce plan
  (`document/plan-layout.ts`, `app/dressing/plan-layout-tool.ts`).
- **Formes du plan** : en plus du droit, des L, des U et du face à face, on trouve le U à un seul pan coupé, le U presque
  fermé (un mur D qui laisse l'entrée), la cloison centrale, le dos à dos, les deux profondeurs sur un même mur et les
  angles arrondis, avec leur porte cintrée, et les **coins en L** (en L à gauche, à droite, ou en U aux deux angles) : le
  meuble d'angle suit les deux murs, un bras le long de chacun, à la profondeur des linéaires, sa façade en équerre ;
  ses étagères sont en L, et « Deux portes sur le coin en L » pose un battant sur chaque face, avec ses charnières
  (`ellFaces`, `document/plan-shapes.ts`). Deux réglages s'ajoutent : un **îlot** à un passage devant le mur A, et un
  **rampant**, plafond en pente qui descend à gauche, à droite ou contre le mur A : panneaux, portes et fonds s'arrêtent
  dessous, et chaque zone reçoit un dessus en pente.
  À chaque angle droit, on choisit le mur qui passe : l'autre s'arrête contre lui, et ce qui est fait dessus suit.
- **Conception guidée** : le prix TTC du devis s'affiche en direct dans la barre d'état, dans le Plan de dressing et dans le Plan de cuisine. « Remplir
  selon les besoins » transforme les mètres de penderie, les paires de chaussures, les tiroirs et les étagères du client en
  modules répartis sur les zones libres, avec un bilan demandé / obtenu. Chaque zone peut recevoir des portes coulissantes,
  de 2 à 6 vantaux. « Mur A dans la pièce » pose le plan sur une Pièce relevée et marque ses ouvertures sur le schéma, et le
  bloc « À vérifier » signale passages étroits, portes et tiroirs bloqués, ouvertures cachées et plafonds bas.
  « Éviter portes, fenêtres et plafonds bas » cale les murs sur ce que la pièce laisse libre, « Dessiner les murs » les pose
  sans Pièce, et le bouton « Penderies escamotables » équipe les tringles trop hautes.
- **Menu d'une porte** : un **clic droit sur une porte** (ou sa poignée) dans la vue ouvre son menu — Ouvrir / fermer la
  porte ; **Ouvrir de l'autre côté** (ses charnières passent à gauche ou à droite) ; Ôter ou mettre les poignées ;
  **Renommer…** (un champ au pointeur, Entrée garde) ; Sélectionner le meuble entier ; **Remplacer par des tiroirs**
  ou Porte vitrée / pleine (porte d'un caisson), Portes plates / à cadre / vitrées (Répartition, porte sur niches) ;
  **Supprimer la porte**. Chaque choix est une
  annulation. Une porte de caisson (`FrontsFeature.side`), une porte de case de Répartition (son sens seul, dans
  `DoorSettings.hinges` ; supprimée, sa case reste ouverte), une porte sur niches, une porte d'angle bâtie en panneau.
  Dans une cuisine du Plan de cuisine, le sens choisi passe au meuble du linéaire (`KitchenRunItem.side`) et reste quand
  la cuisine est refaite (`document/door-edit.ts`, `app/door-menu.ts`). Les deux portes d'un caisson s'ouvrent déjà du
  milieu : leur sens ne change pas, et une seule se retire comme une pièce.
- **Concevoir dans la vue** : clic droit sur une niche pour ses outils, cotes de niche cliquables, étagères et cloisons tirées
  à la souris au pas de 32 mm, touche R pour répéter, « Copier une niche » (aussi en miroir), « Aligner les étagères »,
  « Voir » pour isoler un mur et y travailler, « Mes murs » et « Style du dressing ».
- **Une étagère déplacée avec « Déplacer »** : une seule étagère (ou cloison) d'une Répartition, déplacée le long de son
  axe (vers le haut ou le bas ; de côté pour une cloison), bouge dans sa division, comme par sa poignée : ses deux
  niches se partagent le changement et ce qui les équipe (tiroirs, tringle) suit (`shelfMovedBy`,
  `document/niche-size.ts`). Déplacée de travers, ou avec des copies, elle reste un déplacement du corps.
- **Niche mère** : dans Cloisons, « Couper toute la niche mère » pose une cloison à travers une colonne déjà aménagée. Ses
  étagères et tiroirs restent d'un côté, plus étroits, et l'autre côté devient une niche vide.
  Plusieurs niches choisies l'une au-dessus de l'autre partagent une seule cloison, qui coupe les étagères entre elles, même celles d'un module, faites en plusieurs fois, et des
  niches de largeurs différentes ont leurs cloisons sur une même ligne.
- **Validation du client** : le Lien client peut proposer « J'accepte ce projet » : le nom, la date, la variante et le prix
  restent sur le lien, et un commentaire prévient l'atelier.
- **Remplir** (dans le Plan de dressing, sur une zone libre) : on donne la largeur intérieure voulue des caissons, et
  l'outil propose ce qui tombe juste, côtés comptés : tant de caissons et un **fileur** ou un caisson de la largeur exacte
  du reste, au début ou à la fin du mur, ou des caissons égaux. Le résultat est une Répartition ordinaire ; quand le plan
  change, le reste prend la différence et le fileur suit (`fillChoices` de `document/plan-layout.ts`).
- **Dossier de production** (groupe « Atelier ») : le contrôle du projet d'abord, puis tous les fichiers de l'atelier en
  un seul .zip : liste de débit, calepinage et liste d'achat, fiches, étiquettes, DXF, G-code, notice de montage et, à la
  demande, devis ; le résultat du contrôle est écrit dans `00-lisez-moi.txt` (`app/workshop/production-folder.ts`).
- **Palette de commandes** (⌘K ou Ctrl+K, bouton « Outils ») : on tape quelques lettres, sans se soucier des accents,
  Entrée lance l'outil, même rangé dans un menu ; seuls les outils du mode en cours sont proposés, les derniers utilisés
  en tête (`app/command-palette.ts`).
- **Assistant Dressing** (groupe « Dressing ») : un dressing entier **en nombres**, le long d'un mur (**I**), de deux
  murs en angle (**L**) ou de trois (**U**). On donne la longueur de chaque mur, la **hauteur** (jusqu'au plafond, 250 cm
  proposés), la **profondeur** (60 cm), l'**épaisseur** des panneaux et le **socle** (8 cm), puis le **programme** de
  chaque mur, module par module, de gauche à droite : **penderie longue** (étagère chapeau à 30 cm du haut, tringle
  dessous), **double penderie** (deux tringles l'une sur l'autre), **étagères** (tous les 35 cm environ), **tiroirs et
  étagères** (3 tiroirs dans 72 cm en bas, étagères au-dessus), **penderie et tiroirs** (3 tiroirs en bas, tringle
  au-dessus). Le programme se présente **comme le navigateur** : une carte, un dossier par mur (replié ou déplié d'un
  clic, son nombre de modules, « + » pour en ajouter un), et une ligne par module avec son icône, sa sorte à choisir
  et une corbeille, écrits comme les tableaux de gestion menuiserie. « Proposer un programme selon les longueurs » met
  environ un module par 80 cm. Le panneau donne la
  largeur de chaque module (une penderie est plus large qu'une colonne d'étagères) et prévient quand une tringle dépasse
  120 cm. L'aperçu se fait en direct ; OK met tout dans l'historique en une seule annulation. Chaque mur devient une
  **Répartition** (« Dressing — mur A ») avec ses **Étagères**, **Penderies** et **Tiroirs** : des étapes ordinaires,
  qu'on retouche ensuite niche par niche avec les outils de menuiserie. En L et en U, l'angle appartient au mur A ; les
  murs B (à gauche) et C (à droite) commencent derrière sa profondeur, leurs façades tournées vers la pièce. Les murs
  sont dessinés (option) sur le calque « Pièce », hors débit et devis. Le calcul est dans `document/dressing-plan.ts`,
  le panneau dans `app/dressing/dressing-tool.ts`.
  - **Sur la Pièce relevée** (« Murs ») : longueurs et hauteur viennent du relevé, le dressing est tourné et posé
    contre ses murs. En I, il prend le plus long passage libre du mur entre portes et fenêtres ; en L et en U, les
    murs B et C s'arrêtent 5 cm avant la première porte ou fenêtre (le mur A doit être libre) ; sous une retombée ou
    un rampant, la hauteur du mur concerné descend sous le plafond le plus bas près du mur, et le panneau le dit.
  - **Portes** : aucune, **battantes** (celles de la Répartition, une par case, avec leur équipement « Portes »), ou
    **coulissantes** (environ une par mètre, sur deux voies qui se recouvrent de 3 cm, du socle au rail haut ; les
    deux rails comptent au devis au mètre).
  - **Modules** en plus : **Chaussures** (étagères tous les 20 cm) et **Porte-pantalons coulissant** (étagère
    chapeau, l'accessoire posé à 90 cm), compté au devis.
  - **Hauteurs** : une tringle à plus de 1,90 m est signalée, ou reçoit une **penderie escamotable** (option, au
    devis) ; des étagères au-dessus de 2 m demandent un marchepied, le panneau le dit (`document/dressing-extras.ts`).
- **Orientation des caissons** : un caisson tourne de 90, 180 ou 270° autour de son coin avant gauche (face vers
  +X, vers le fond, vers −X) ; ses façades tournent avec lui.
- **Recouvrement** (groupe « Atelier », comme les liens de Polyboard) : on clique les deux planches d'un angle (un
  côté et un dessus, un fond et une joue) ; celle qui passait devant le chant de l'autre est raccourcie de
  l'épaisseur de l'autre, l'autre rallongée d'autant. Un dessus posé entre les côtés devient un dessus qui les
  couvre. Ce sont des Étirer (et un Déplacer pour un bout bas) dans l'historique, en une annulation ; les usinages
  suivent les planches (`features/overlap-swap.ts`, `app/overlap-tool.ts`).
- **Copier l'aménagement** (groupe « Atelier », le copier-coller d'intérieur de Polyboard) : un clic sur un caisson
  modèle, puis sur les caissons à aménager pareil. Ils prennent son nombre d'étagères et ses façades (une porte,
  deux portes ou des tiroirs, pose, jeu, épaisseur, charnières, poignées, matière), qui s'adaptent à leurs cotes ;
  chacun garde ses dimensions et sa place (`app/dressing/layout-copy-tool.ts`).
- **Remplir une largeur** (outil Caisson, nouveau caisson) : la largeur à remplir et la largeur maximale d'un
  caisson donnent autant de caissons égaux qu'il faut, côte à côte dans le sens de la largeur (tournés avec le
  caisson), en une annulation (l'AutoFill de Mozaik).
- **Cotes de plan d'une Répartition** (`features/partition-dims.ts`, `app/dressing/plan-dims-view.ts`) : pendant Répartition,
  Étagères, Cloisons, Penderie, Tiroirs, Module et l'assistant Dressing (chaque mur le sien), le meuble est coté comme sur un plan, mais en 3D et sans cacher le dessin.
  Autour du meuble, à l'extérieur : la largeur et la hauteur totales, puis les chaînes des niches (mesures libres entre
  panneaux) en bas, à gauche et à droite dès qu'un côté est divisé, en haut seulement si elle dit autre chose que le
  bas ; le socle ; la profondeur
  quand on voit le meuble de biais. À l'intérieur, seule une niche dont une mesure n'est dans aucune chaîne garde sa
  cote, une seule fois. Des portes en vue ont leur largeur et leur hauteur, et cachent les cotes intérieures ; portes
  masquées, ces cotes reviennent. Les cotes suivent le panneau de l'outil avant OK et se placent sur la face tournée
  vers l'œil.
  Le bouton « Cotes des pièces » les masque jusqu'à la fin de l'outil ; allumé hors outil, il les montre aussi, à la
  place des cotes pièce par pièce de la Répartition.
- **Module** (groupe Dressing, `app/dressing/module-tool.ts`, `document/dressing-modules.ts`) : un clic sur une niche d'une
  Répartition, ou plusieurs, et on y pose un module de dressing complet en une seule annulation : penderie longue, double
  penderie, étagères, tiroirs et étagères, penderie et tiroirs, chaussures, porte-pantalons (accessoire au devis). Hauteur
  du chapeau, zone et nombre de tiroirs, espacement et épaisseur des étagères se règlent dans le panneau ; l'aperçu et
  les cotes suivent. L'outil prévient d'une tringle hors de portée (plus de 190 cm) ou trop longue (plus de 120 cm),
  d'une étagère au-dessus de 200 cm ou qui fléchit sous du linge, d'une profondeur trop juste pour des cintres. Un
  réglage se garde sous un nom dans **Mes modules** (dans ce navigateur, d'un projet à l'autre). Ce sont les mêmes
  modules que l'assistant Dressing, et le résultat se retouche niche par niche. Un **clic dans un module déjà posé** le
  rouvre, relu dans ses étapes : nombre d'étagères et de tiroirs, hauteur de chaque niche, jeux des façades, tringle,
  chapeau, zone des tiroirs, épaisseur, type de module ; OK le remplace en une annulation, ses pièces gardant matière et
  apparence, et « Retirer ce module » libère sa niche (`document/module-edit.ts`). Dans l'assistant, le « + » d'un mur
  ouvre la même liste de modules pour choisir celui à ajouter.
- **Grille** (bouton de la colonne Vue, sous « Cotes des pièces ») : affiche ou cache la grille de la vue 3D ; cachée,
  le dessin s'accroche toujours à son pas. Le choix est gardé dans ce navigateur (`app/grid-toggle.ts`).
- **Rayons X** et **Affichage** (colonne Vue, sous « Grille ») : les corps translucides d'un clic ;
  un menu qui cache ou montre chaque famille de corps (façades, carcasse, fonds, étagères, plinthes et socles, murs,
  électroménager, autres), avec « Vue de travail » (façades, murs et électroménager cachés) et « Tout afficher ». La
  vue seulement, retenu par le navigateur (`app/display-toggles.ts`, `document/display-families.ts`).
- **Orbite** (bouton de la colonne Vue, sous « Ajuster » ; l'outil Orbite de Fusion) : tant qu'il est allumé, glisser
  tourne la vue autour du **centre d'orbite**, le point vert ; un clic sur le modèle y met le centre, « Centre au
  milieu » le remet au milieu de la vue. Sous le bouton, dans la colonne, trois petits boutons apparaissent tant
  qu'il est allumé (rien ne couvre la vue) : « Centre au milieu » et le choix de l'orbite :
  - *Orbite contrainte* : le haut du modèle reste en haut, la caméra s'arrête juste avant d'être au-dessus ou
    en dessous (et un modèle penché par l'orbite libre se redresse) ;
  - *Orbite libre* : un anneau au milieu de la vue. Dedans, le modèle tourne dans tous les sens et passe par-dessus ;
    les poignées de gauche et de droite le tournent seulement autour de la verticale de l'écran, celles du haut et du
    bas autour de l'horizontale ; dehors l'anneau, la vue roule autour de l'axe de vue.
  La molette zoome et le clic droit déplace comme d'habitude ; Échap finit l'orbite seule (l'outil ouvert et la
  sélection restent). **Maj + clic milieu** tourne aussi, outil éteint, autour du point du modèle sous la souris.
  Le choix libre / contrainte est retenu (`app/orbit-tool.ts`, calculs dans `viewport/orbit-math.ts`).
- **Cotes des pièces** (bouton de la colonne Vue, sous « Ajuster ») : la largeur et la hauteur de chaque pièce vue de
  face, traits rouges et chiffres verts (#63df0f) sur sa face tournée vers l'œil, comme un plan de Polyboard.
  - Une planche vue par la tranche (un côté, un dessus, une étagère d'une Répartition vus de face) montre sa
    longueur le long de sa tranche : la hauteur d'un côté, la largeur d'une case.
  - L'élément sélectionné (un caisson avec ses façades, une Répartition entière dès qu'une de ses planches est
    choisie) n'a que les siennes, gardées pendant qu'un outil travaille dessus ; sans sélection, toutes les pièces
    en vue.
  - Seules les cotes visibles s'écrivent (une porte cache le caisson derrière), et deux valeurs qui tomberaient
    l'une sur l'autre (un double côté) n'en font qu'une ; elles suivent la vue quand elle tourne et le modèle quand
    il change.
  - Le bouton les cache ; l'état est gardé dans ce navigateur (`features/piece-dims.ts`, `app/piece-dims.ts`).
- **Cotes dans la vue** (les étiquettes de modification de TopSolid) : quand les pièces d'un seul caisson sont
  sélectionnées, son nom, sa largeur, sa hauteur, sa profondeur et son nombre d'étagères s'affichent dans une barre en
  bas de la vue, juste au-dessus de l'historique, avec ses poignées ✥ et ↻ (`app/cabinet-bar.ts`). Un clic en fait
  un champ, Entrée reconstruit le caisson. Une cote liée à un paramètre (« largeur ») change le paramètre, et tout ce
  qui le suit ; une cote faite d'une formule plus longue reste à sa formule (`app/drivers-3d.ts`).
- **Façades** (groupe « Meuble », après le caisson) : habille un caisson d'une porte, de deux portes ou de 1 à 8
  tiroirs de même hauteur, en applique (devant le caisson) ou encastrés (dans l'ouverture), avec le jeu et l'épaisseur
  voulus. Chaque tiroir a son caisson (côtés, avant, arrière, fond) sur coulisses de 12,5 mm, de la longueur du
  commerce (250 à 600 mm) qui tient dans la profondeur. Charnières à boîtier Ø35 × 13 (2 à 4 selon la hauteur de la
  porte) et poignées entraxe 128 mm percées à la demande. L'opération suit les cotes du caisson ; les façades prennent
  sa matière, les tiroirs du contreplaqué bouleau (fonds en HDF), et la quincaillerie s'ajoute au **devis** (prix
  unitaires réglables avec les autres tarifs).
- **Suivre-moi** (groupe « Atelier », comme Follow Me de SketchUp) : un profil fermé balayé le long du chemin (lignes
  et arcs) d'une autre esquisse — plinthe, moulure, corniche ; nouveau corps, union ou soustraction. Le profil se
  dessine dans un plan qui passe par un bout du chemin ; le balayage part de ce bout.
- **Extruder le long d'un chemin** (menu du groupe « Atelier », comme Extrude Along Path de JHS PowerBar) : le même
  balayage, mais le profil fermé se dessine **n'importe où** (à plat sur le sol, par exemple) : il est posé debout au
  début du chemin, perpendiculaire à lui, son haut vers le haut, par son point choisi (coin bas gauche, coin bas
  droit, centre ou origine de l'esquisse). « Tourner le profil » le couche d'un quart de tour, « Retourner » le passe
  de l'autre côté du chemin (à l'extérieur d'un tour de meuble, par exemple). Un chemin fermé (le tour d'un dessus)
  donne une moulure ou une corniche continue, coins d'onglet ; c'est aussi une case du panneau de Suivre-moi
  (`features/sweep.ts`). Comme dans JHS, il marche aussi **sans profil dessiné** (« Profil : Rectangle », le choix
  d'office) : un rectangle largeur × hauteur debout sur le chemin, centré sur lui, à sa gauche ou à sa droite, balayé
  tout du long — un mur, une plinthe, un rebord autour d'un dessus ; « Commencer » part d'un bout ou de l'autre (un
  point rouge le montre dans la vue, la gauche se lit depuis lui).
- **Scinder le corps** (bouton « Scinder le corps », ou dans le panneau Sélection) : coupe un corps
  solide par un plan, avec la fonction de découpe d'OpenCascade (une vraie opération booléenne, jamais
  un effet visuel) :
  - *corps* : un ou plusieurs, cliqués dans la vue (le corps survolé s'éclaire ; un clic l'ajoute, un second le
    retire ; un morceau de l'aperçu vaut le corps dont il vient). Les corps sélectionnés avant d'ouvrir l'outil sont
    pris d'emblée. En mode « Face plane », le premier clic choisit la face de coupe, les suivants les corps.
    Chaque corps est coupé par sa propre scission, avec le même outil. Un corps que le plan ne traverse pas est
    laissé entier (le panneau le dit) ;
  - *outil de coupe* : un **plan de construction** (XY, XZ ou YZ, décalé le long de sa normale : on
    tire la flèche dans la vue ou on tape la valeur ; il passe d'abord par le centre des corps) ou
    le plan d'une **face plane** cliquée dans la vue (de ce corps ou d'un autre) ;
  - *conserver* : les deux parties, ou seulement le côté positif (+) ou négatif (−) ; la normale du
    plan indique le côté +. Un plan oblique est possible avec une face inclinée ;
  - l'**aperçu** est le résultat réel du noyau, avec un plan orange pour situer la coupe ; OK reste
    désactivé tant que la coupe est refusée ;
  - chaque morceau séparé est un corps distinct (« Corps 1 — pièce 1 », « pièce 2 »…), même quand un
    seul plan en donne plusieurs d'un même côté (un U coupé à travers ses bras) ; s'il ne reste qu'un
    solide, c'est le même corps, coupé ;
  - les pièces se renomment, se masquent et se modifient une à une (perçage, congé…) ;
    supprimer la scission rétablit le corps d'origine et retire ce qui dépend de ses pièces ;
  - refus avec un message clair, sans toucher au modèle : plan qui ne traverse pas le corps (ou
    qui l'effleure seulement), face non plane, résultat incohérent (volume des pièces différent de
    celui du corps) ou solide invalide. La scission est une opération de l'historique : annulable,
    rétablissable, enregistrée avec le projet, modifiable depuis la barre « Historique ».
- **Sélection dans le modèle 3D** :
  - un clic sur une arête ou une face la sélectionne ; un nouveau clic la retire, un clic dans le vide
    vide la sélection ;
  - **éléments d'esquisse** : avec les filtres « Points », « Arêtes » et « Faces », un clic choisit aussi un point,
    un trait ou une zone d'une esquisse affichée (en orange), avec ses coordonnées, sa longueur ou son aire
    dans le panneau Sélection ; en « Auto », un clic sur une esquisse la sélectionne en entier ;
  - **plusieurs corps et esquisses** : Ctrl (Cmd sur Mac) ou Maj + clic ajoute ou retire un corps entier ou une
    esquisse entière, dans la vue comme dans l'arbre ; avec le filtre « Corps », un simple clic suffit. L'esquisse
    déjà sélectionnée seule rejoint la sélection. Les esquisses choisies sont en rose, les lignes de l'arbre surlignées ;
  - **supprimer la sélection** : touche **Suppr** (ou « delete » sur Mac) ou bouton « 🗑 Supprimer » du panneau Sélection,
    quelle que soit la sélection, en une seule annulation (Ctrl+Z remet tout) : corps et esquisses entiers ; un corps
    dont seule une face, une arête ou un coin est sélectionné (le corps entier, après confirmation) ; les traits et
    points d'esquisse choisis dans la vue, retirés de leur esquisse avec leurs contraintes (une zone ne se supprime
    pas : ses traits, ou l'esquisse entière). Les questions s'affichent dans la page (Entrée confirme, Échap annule), et
    non dans une boîte du navigateur, que certains navigateurs intégrés bloquent. Supprimer un corps supprime
    l'opération qui l'a créé (son esquisse reste) ; une **pièce** d'un caisson, de façades, de panneaux ou d'une scission
    (le dessus d'un caisson…) est retirée **seule** — l'opération et ses autres pièces restent (`removedBodies` du
    document ; Ctrl+Z la fait revenir) — et les opérations qui dépendent de ce qui est supprimé partent avec (elles sont
    nommées) ;
  - **sélection par fenêtre** (comme Fusion) : Maj + glisser dans la vue, ou bouton « Fenêtre » (pratique au doigt :
    tant qu'il est enfoncé, glisser trace la fenêtre au lieu de tourner la vue). De gauche à droite (cadre bleu), seuls
    les corps et esquisses entièrement dedans sont pris ; de droite à gauche (cadre vert pointillé), tout ce qui est
    touché. La fenêtre ajoute à la sélection ; un clic dans le vide la vide ;
  - **éléments superposés** : un nouveau clic au même endroit sélectionne l'élément suivant sous le curseur
    (arête, puis ligne d'esquisse, puis face, puis zone d'esquisse) ; une esquisse posée sur une face ou liée
    aux coins d'un corps par des coïncidences reste ainsi sélectionnable dans la vue ;
  - le filtre (cinq icônes carrées : un A, une face, une arête, un coin, le corps plein ; leur nom en infobulle) choisit ce qu'un clic sélectionne : « Auto » (arête en priorité,
    sinon face), « Faces », « Arêtes », « Points » (un sommet d'un corps : des points bleus marquent
    ceux qu'on peut cliquer, ses coordonnées s'affichent dans le panneau et la barre d'état) ou « Corps »
    (le corps entier, avec « Combiner » pour plusieurs corps). Le choix est mémorisé ;
  - la cote de chaque arête sélectionnée s'affiche dans la vue (longueur, Ø ou R) ;
  - le panneau « Sélection » donne les mesures et propose les actions : congé ou chanfrein sur les
    arêtes, extrusion ou perçage sur les faces.
- **Extrusion de faces** (pousser-tirer) :
  - sélectionnez une ou plusieurs faces planes, puis Extrusion ;
  - tirez la flèche (ajout de matière) ou poussez-la (creusement), ou cliquez sa valeur pour la saisir ;
  - **depuis une arête** : une seule arête sélectionnée, le bouton « Tirer une face depuis cette arête » (panneau
    Sélection, toujours écrit en entier) ouvre l'extrusion sur
    une des deux faces le long de l'arête — la plus petite d'abord (le bout d'une planche), l'autre au choix dans
    « Face tirée » ; « Tirer : le long de l'arête seulement » (le choix d'office) ne tire que la **bande de la face
    le long de l'arête**, entre les plans perpendiculaires à l'arête par ses deux bouts — comme si un trait coupait la
    face —, « Toute la face » la tire en entier. Si un autre corps est **devant la face** (le côté d'un caisson, un
    mur), « Jusqu'au corps voisin » la tire jusqu'à le toucher ; un clic sur un mur ou un autre corps arrête la face à
    son niveau (`viewport/body-points.ts`, `features/solids.ts`, `features/touch.ts`).
  - **dans une zone isolée** (« Voir angle droit isolé », un caisson ou des éléments isolés) : la face d'une étagère,
    même d'un coin coupé en biais, se tire comme ailleurs. L'étagère **reste en vue pendant l'aperçu** (la vue isolée
    lit le document montré, aperçu compris), et un corps tiré d'une face en « Nouveau corps » reste avec le corps d'où
    il vient (`app/zone-members.ts`). Si le noyau ne peut pas tirer la face, le panneau dit pourquoi et OK attend :
    rien ne disparaît. Une distance **en cours de frappe** reste telle quelle quand un aperçu se termine pendant ce
    temps (le panneau redessiné garde ce qui est tapé et le curseur, `app/panel-tool.ts`, pour tous les outils à
    panneau) : sur un gros projet, le premier aperçu ne remet plus 1 cm à la place des 3 cm qu'on tape.
- **Déplacer ce trait** (comme déplacer une arête dans SketchUp) : une seule arête sélectionnée, le bouton « Déplacer
  ce trait (les faces suivent) » du panneau Sélection la déplace et **les faces du corps qui la bordent s'étirent**
  pour la suivre — le bout d'une planche amené en biais contre le côté d'un caisson, un dessus incliné. Les flèches X,
  Y, Z la tirent, les champs donnent le déplacement, « Bouger » garde certains sens, **un clic sur un coin** (ou un
  trait) d'un corps y amène le bout du trait le plus proche, et **un clic sur une face plane** y colle le trait
  (chaque bout va droit sur elle : le bout d'une planche contre le côté du caisson). Sous la souris, le coin (anneau
  orange), le trait ou la face (teintée) qu'un clic prendrait s'éclaire ; un coin ou un trait caché derrière la face
  n'est pas pris. Le corps est refait exactement (ses coins déplacés, ses
  faces restées planes fusionnées) ; c'est un « Trait déplacé » de l'historique, qui se rouvre
  (`app/edge-move-tool.ts`, `features/modifiers.ts`).

**Références topologiques.** Une arête ou une face choisie est enregistrée par :
- son type (droite, cercle, plan…) ;
- sa direction ;
- sa position relative à la boîte englobante du corps.

Ainsi un congé posé sur les arêtes verticales des coins reste sur ces arêtes quand la plaque
s'élargit, et un perçage sur une face latérale suit cette face si la pièce s'allonge. Si aucune
arête ne correspond plus, l'opération passe en erreur avec le message « … introuvable après
recalcul : sélectionnez-la à nouveau » ; elle ne choisit jamais une autre arête en silence. Quand deux candidates
se ressemblent presque autant (deux trous voisins, deux étagères), c'est le point gardé en millimètres au moment du
choix qui les départage ; si lui non plus ne les sépare pas, l'opération dit que la face ou l'arête est **ambiguë**
plutôt que d'en prendre une au hasard (`geometry/references.ts`, `pick`).
Une face choisie dans la vue n'est gardée après un recalcul que si son corps est resté le même ; une question
posée au noyau sur une face (mesure, contour, référence) porte le numéro du recalcul montré, et le noyau la refuse si
le corps a changé depuis (`viewport/selection-layer.ts`, `geometry/worker.ts`). Une **zone d'esquisse** extrudée est
retenue par les points de son contour : quand une cote change, elle suit ses points au lieu de passer à la zone
voisine où tomberait son ancien point ; si son contour a changé, l'extrusion demande de la rechoisir
(`sketcher/loops.ts` `loopKey`, `regionKeys`).

## Utilisation de l'éditeur

- **Ruban et barre des étapes cachés d'office** : la barre des étapes (Pièce, Plan, Aménagement… Tous les outils) et
  le ruban d'outils ne s'affichent plus en haut ; les outils restent dans les colonnes à gauche et dans « Outils ».
  La case « Ruban et étapes en haut » du menu ⋯ (Réglages) les remet ; le choix est gardé par le navigateur, et ils
  restent montrés si les colonnes d'outils sont fermées (`app/ribbon-toggle.ts`).
- **Le haut du panneau Répartition reste en vue** : son titre (avec ✕), les boutons des murs, « Voir mur … isolé » et
  la face du mur restent en haut quand on fait défiler les réglages dessous.

- **Pas de « OK » ni d'« Annuler »** (dans tout le projet) : chaque outil enregistre son résultat **dès que le
  réglage est valable** et que l'aperçu du noyau est sans erreur, un instant après le dernier geste
  (`app/panel-tool.ts`, `ui/panel-close.ts`). Tant que l'outil reste ouvert, ses réglages suivants **remplacent**
  ce qu'il a enregistré : une seule étape d'historique par utilisation d'outil, que Ctrl + Z reprend (une annulation
  faite entre-temps, ou un autre changement, fait repartir de l'état du moment, sans rien écraser). La **croix ✕**
  en haut de chaque panneau (ou Échap) le ferme en gardant tout ; Entrée enregistre tout de suite. Une opération
  faite se change ensuite par son étape dans l'**Historique** (« Modifier »), ou, pour une Répartition, sur sa face
  et dans son panneau. Ainsi pour les outils de modélisation (Extrusion, Congé, Combiner, Déplacer…), ceux du
  dressing (Répartition, Hauteur de niche, Module, Façades),
  ceux de l'esquisse (Déplacer, Décalage, Réseau), le **linéaire de la cuisine** (chaque changement enregistré un
  demi-instant après, la cuisine refaite) et « Modifier le plan » (cuisine, dressing : chaque réglage appliqué,
  confirmé seulement quand il retirerait des zones déjà faites). **Sauf Étagères, Cloisons, Penderie, Tiroirs et
  Porte sur niches**, qui ont de nouveau **« OK » et « Terminer »** : on clique une ou plusieurs niches, on règle,
  puis « OK » (ou Entrée) les équipe en une étape, l'outil restant ouvert pour d'autres niches ; « Terminer », la
  croix ✕ ou Échap le ferme sans rien ajouter (`sketcher/shelves-tool.ts`, `app/dressing/niche-tool.ts`). Restent aussi des boutons : « Créer le plan », les
  questions de confirmation (supprimer, retirer des zones), et les petites boîtes de saisie (texte d'esquisse,
  import). Plus bas dans ce fichier, « OK » désigne le moment où l'opération est enregistrée : elle l'est
  désormais d'elle-même.

- **Esquisses visibles** : les esquisses restent affichées dans la vue 3D (nettes devant les corps,
  atténuées à travers) ; l'icône œil à côté de chaque esquisse, dans le navigateur, la masque ou la réaffiche.
  Le choix est enregistré avec le document (champ `hidden`) et s'annule comme le reste ; il ne
  recalcule rien. Les lignes de construction et les arêtes projetées ne sont pas dessinées.
- **Tout replier / tout déplier** : le triangle à droite de « CORPS (n) » replie d'un clic tous les assemblages et
  corps du navigateur (▾), puis les déplie tous (▸).
- **Masquer ou supprimer tous les corps** : à côté de ce triangle, l'**œil** masque d'un clic tous les corps
  (les esquisses restent), puis les réaffiche tous ; la **corbeille** supprime tous les corps après
  confirmation (« Supprimer les 40 corps ? »). Chacun ne fait qu'une modification : un seul Ctrl+Z la défait
  (`setHidden` dans `document/operations.ts`).
- **Menu du nom du projet** (en haut à gauche, ▾) : retour à Mes projets, Mise en plan du caisson sélectionné, Mise en
  plan du projet (rubrique « Pour l'atelier », avec le dossier de production et la liste de débit), le devis et le
  lien client (« Pour le client »), la fiche du projet et les paramètres de l'atelier (`/catalogue/`).
- **Navigateur** (à gauche) : les **corps** et les **esquisses** du document. Chaque ligne a un œil pour
  l'afficher ou la masquer (un corps masqué reste dans le document, il n'est pas dessiné ; le choix est
  enregistré et s'annule). Un clic sélectionne ; le bouton « ⋯ » ouvre la fenêtre de l'élément.
  Un corps s'appelle « Corps 1 », « Corps 2 »… dans l'ordre de création, quelles que soient ses
  opérations, et se renomme (le nom suit le corps à travers ses opérations suivantes) ; supprimer un
  corps supprime l'opération qui l'a créé et celles qui en dépendent, après confirmation.
  Les corps forment un **arbre dépliant** (flèche ▸ à gauche) : les corps faits ensemble par une même
  opération (pièces d'une scission, panneaux d'un squelette, pièces d'un caisson, copies d'un réseau ou
  d'une symétrie) sont rangés dans un dossier à leur nom (« Corps 1 » › « pièce 1 », « pièce 2 ») ; chaque
  corps se déplie sur l'historique qui l'a construit (esquisses et opérations, de la plus ancienne à la
  plus récente) : un clic sélectionne l'opération, « ⋯ » ouvre sa fenêtre. Ce qui est déplié est
  retenu par le navigateur web.
- **Historique** (barre du bas) : les opérations dans l'ordre (extrusion, perçage, révolution, congé,
  chanfrein, combinaison, et les décalages, placés où est leur esquisse), chacune par l'**icône de son outil** (le
  nom, le type et l'état sont dans l'info-bulle ; une opération en erreur ou désactivée porte un point de couleur,
  et la désactivée est grisée). Un clic ouvre une fenêtre pour
  **renommer**, **modifier** (rouvre l'outil de l'opération : flèche de l'extrusion, panneau de l'outil,
  esquisse et outil Décalage), **désactiver** ou **supprimer** l'opération. Supprimer un perçage relie
  les perçages suivants au corps précédent. Cette fenêtre s'ouvre dans le panneau de l'élément cliqué : sous la ligne
  dans le Navigateur (à la largeur du panneau), au-dessus de l'opération dans l'Historique. Ses actions sont des
  boutons-icônes, dans le style de la barre d'outils (pièce et crayon : modifier ; pièce et pastille
  « pause » : désactiver, pièce et pastille verte : réactiver ; corbeille rouge : supprimer), le nom en info-bulle.
- **Décalages** : chaque décalage validé est enregistré avec son esquisse (nom, courbes créées,
  courbes décalées, distance, côtés, coins). Dans l'historique, « Modifier » rouvre l'esquisse avec la
  sélection et les réglages restaurés ; valider remplace les courbes du décalage. « Supprimer » retire
  le décalage et les courbes qu'il a créées, jamais l'original.
- **Unité d'affichage** : les **centimètres** par défaut, pour tous les projets ; menu ⋯ › Unités pour choisir mm, cm,
  m ou pouces (le choix est retenu par le navigateur et vaut pour tous les projets). Le modèle reste enregistré en
  millimètres : seuls l'affichage et la saisie changent — cotes, mesures, mètre, liste de débit (et son CSV),
  optimisation de découpe, devis, étiquettes, page client. Restent en millimètres : les paramètres et leurs formules,
  l'épaisseur des chants, les réglages et le programme de la commande numérique (G21).
- **Propriétés** : saisir les cotes dans l'unité d'affichage (virgule acceptée), puis Entrée
  pour recalculer. Chaque rubrique (Nom, Esquisse, Cotes, Contraintes, Sélection, Caisson…) est une **carte
  dépliable** : un clic sur son titre (▶) la plie ou la déplie, et une carte pliée le reste (retenu par le navigateur). Les champs sont compacts (même hauteur que dans les fenêtres des outils) ; le panneau ne
  montre plus le bloc « Mesures » du corps (volume, surface, encombrement) — le Mètre mesure à la demande.
  Les boutons d'action de la sélection (Extruder, Esquisse sur la face, Scinder, Supprimer, Déplacer, Congé,
  Chanfrein, Combiner) portent les mêmes icônes que la barre du haut : l'icône seule quand le panneau est étroit (le
  nom en info-bulle), le nom aussi quand il est large. Le Perçage reste dans la barre (groupe Créer).
- **Panneaux redimensionnables** (grands écrans) : glisser le bord intérieur du navigateur (à gauche) ou des
  propriétés (à droite) pour les élargir ou les réduire ; flèches du clavier sur la poignée, double-clic pour revenir
  à la largeur d'origine. La largeur est retenue d'une session à l'autre.
- **Plaque** : nouveau corps (esquisse rectangle + extrusion).
- **Perçage** : Ø10 traversant au point cliqué sur une face, sinon au centre du corps.
- **Raccourcis** : touche **?** pour la liste complète (3D et esquisse). ⌘Z / ⇧⌘Z annuler/rétablir, ⌘S
  enregistrer, E extrusion, H perçage, F cadrer, Échap désélectionner, Suppr supprimer.
- **Opérations booléennes** : les mêmes mots partout, ceux de Fusion — Nouveau corps, Joindre, Couper, Intersection.
- **Navigation** : clic gauche pour l'orbite, clic droit ou molette-clic pour le panoramique,
  molette pour le zoom. Au doigt : un doigt pour l'orbite, deux doigts pour le zoom et le
  panoramique.
- **Petits écrans** (moins de 1024 px) : le navigateur et les propriétés s'ouvrent en feuilles
  basses.

## Limites connues (incrément 1)

- **Déplacer** : translations seulement (la rotation est l'outil « Tourner »), un corps à la fois ; pour qu'une pièce
  suive une autre, l'Assemblage (faces parallèles aux axes, translations seulement). Les opérations suivantes qui désignent une position absolue (un
  perçage en x, y) la gardent : après un déplacement, elles se placent sur le corps déplacé. En 2D, le
  message d'un déplacement refusé liste l'ensemble des contraintes en conflit détectées par le solveur,
  pas seulement celle qui en est la cause.
- **Scission** : par des plans seulement (plan de construction ou face plane). Le moteur coupe un
  solide par un plan et indique de quel côté chaque morceau se trouve ; il n'y a pas de côté défini
  pour une surface courbe (cylindre, sphère), qui est refusée avec un message. Pour couper selon
  plusieurs plans, enchaîner plusieurs scissions. Les numéros de pièces suivent leur position
  (x, puis y, puis z) : un nom ou un masquage donné à « pièce 2 » suit ce numéro si la scission change.

- **Esquisses** :
  - Pas d'ellipse ni de polygone régulier.
  - Pas de détection des auto-intersections : les profils qui se croisent sont refusés par le noyau.
  - Les DDL sont globaux, il n'y a pas de couleur par entité.
  - Un îlot dans un trou donne un second solide, refusé (une extrusion produit un seul corps).
- **Décalage** : 2D seulement. Le noyau sait décaler une face 3D, mais le résultat est une surface
  (coque sans volume) et le modèle ne gère que des corps solides ; pour déplacer une face, utiliser
  l'extrusion de face.
- **Plans** : les scissions coupent par un plan principal ou une face plane, pas encore par un plan de
  construction incliné. Le perçage suit toujours l'axe −Z depuis le dessus du corps.
- **Références topologiques** : la correspondance est heuristique (type, direction, position
  relative). Une modification qui change fortement la forme (par exemple ajouter des arêtes au
  même endroit relatif) peut demander de resélectionner les arêtes.
- **Congés et chanfreins** : le rayon variable change de façon linéaire d'un bout de l'arête à l'autre (pas de loi
  libre ni de rayons intermédiaires). Le sens d'une arête est celui du noyau : on l'inverse au besoin.
- **Chargement** : le noyau WASM pèse 23 Mo (5 Mo servi en brotli). Le premier chargement prend quelques secondes,
  les suivants viennent du cache du navigateur.
- **PostgreSQL** : testé par la CI ; ajouter `psycopg[binary]` si `POSTGRES_DB` est défini.
- **Export DXF** : une vue à plat par panneau (sa grande face) ; les usinages qui ne débouchent pas sur cette face
  (rainures sur la tranche, perçages de chant) n'y figurent pas.
- **Assemblage** : des liaisons de faces parallèles aux axes, en translation ; pas de liaison qui fasse tourner une
  pièce (charnière, axe) ni de face inclinée.

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
| whitenoise (+ brotli) | 6.12 | MIT |
| anthropic (SDK Python de l'API Claude) | 1.17.0 | MIT |
| qrcode-generator | 2.0.4 | MIT |
| three-gpu-pathtracer (+ three-mesh-bvh, xatlas-web) | 0.0.27 (0.9.16, 0.1.0) | MIT |
| @playwright/test (tests seulement) | 1.56 | Apache-2.0 |

OpenCascade et planegcs sont distribués sous forme de fichiers `.wasm` séparés, non modifiés et
remplaçables (`static/js/assets/*.wasm`), ce qui respecte la LGPL. Conserver leurs notices de
licence lors d'une distribution.
