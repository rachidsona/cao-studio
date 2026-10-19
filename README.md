# CAO Studio

Application web de conception mécanique paramétrique : Django (comptes, projets, versions)
+ éditeur 3D TypeScript (Three.js) + noyau B-rep exact OpenCascade (WASM, via replicad)
exécuté dans un Web Worker.

**État : incrément 1.** Le noyau, l'historique paramétrique, l'enregistrement et l'éditeur
fonctionnent sur la pièce de référence. Les esquisses interactives et les contraintes ne sont
pas encore implémentées.

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
npm test                  # Vitest : noyau OpenCascade réel, historique, documents
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
| `frontend/src/history/` | Recalcul incrémental (cache par clé de dépendances), annuler/rétablir |
| `frontend/src/viewport/` | Scène Three.js en Z vers le haut, grille adaptative, gizmo, vues, sélection de faces |
| `frontend/src/ui/`, `app/` | Arbre, propriétés, session (enregistrement automatique, récupération) |
| `frontend/src/io/` | Export STEP/STL, import/export du format natif `.cao.json` |
| `frontend/src/persistence/` | API Django (CSRF, conflits de version), copie locale de secours |

Principes :

- Le document stocke l'historique paramétrique, jamais de maillage. Toutes les longueurs sont
  en mm ; `units` ne sert qu'à l'affichage (mm, cm, m, pouce).
- La géométrie est calculée dans le navigateur. Django ne reçoit que des documents complets :
  enregistrement automatique 4 s après une modification, manuel avec ⌘S, et envoi
  `keepalive` à la fermeture de la page.
- Chaque enregistrement crée une version. Un `base_version` périmé renvoie 409 et la copie
  locale est conservée.
- Une opération en échec est signalée dans l'arbre, ses dépendantes sont marquées
  « bloquées », et le dernier corps valide reste affiché.

## Utilisation de l'éditeur

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

- **Esquisses** : pas d'esquisse interactive ni de solveur de contraintes. Une esquisse ne
  contient que des rectangles ou cercles fusionnés, édités numériquement. Le solveur prévu est
  planegcs (LGPL), en phase 4.
- **Plans** : seul le plan XY est exposé dans l'interface. Le perçage suit toujours l'axe −Z
  depuis le dessus du corps.
- **Références** : les opérations référencent des coordonnées, pas des faces. Le nommage
  topologique persistant reste à concevoir avant d'ajouter congés et chanfreins sur arêtes.
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
| tailwindcss | 4.3 | MIT |
| vite / vitest / typescript | 8.3 / 5.0 / 7.0 | MIT / MIT / Apache-2.0 |

OpenCascade est distribué sous forme d'un fichier `.wasm` séparé, non modifié et remplaçable
(`static/js/assets/replicad_single-*.wasm`), ce qui respecte la LGPL. Conserver la notice de
licence d'OCCT lors d'une distribution.
