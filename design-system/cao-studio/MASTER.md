# CAO Studio — système de design (référence)

Source de vérité de l'apparence de CAO Studio. Une page qui s'en écarte a son fichier dans `pages/<page>.md`, qui l'emporte
sur celui-ci ; sans ce fichier, ce document s'applique seul. Les valeurs vivent dans le code : `frontend/src/styles/app.css`
(jetons `@theme`, composants) et `frontend/src/styles/palettes.css` (palettes). Ce document dit **quoi utiliser et quand**.

## 1. Caractère

- **Outil professionnel dense**, à la manière de Fusion ou de Shapr3D : style suisse et minimal, l'espace est donné à la vue 3D.
- **Éditeur carré** : tous les rayons de Tailwind (`rounded-sm` … `rounded-4xl`) valent 0. Seuls les cercles (`rounded-full`) restent ronds.
- **Pages d'accueil plus douces** (accueil, fiches) : elles prennent les rayons nommés du § 4.
- Animation **sobre** : un retour visuel, jamais de décor.
- **Deux styles** (classe sur `<html>`, menu « ⋯ » → Style, `localStorage` « style ») : **Classique**, décrit ici, et
  **Élégant** (`styles/style-elegant.css`, classe `style-elegant`) — coins arrondis (contrôles 8 px, cartes 14 px), surfaces
  unies sans dégradé ni halo, filets dans l'encre à 10 %, ombres douces, boutons principaux d'un seul ton, titres `h1`
  et `h2` en Playfair Display, cartes de l'éditeur espacées de 12 px. Un style ne change que formes, matières et
  typographie : les couleurs restent celles de la palette, les tailles et les cibles celles de ce document. Un composant
  nouveau doit rester juste dans les deux styles.

## 2. Couleurs — toujours par jeton, jamais d'hexadécimal dans un composant

**Jetons sémantiques** : ils nomment le rôle d'une couleur, et leur valeur suit le thème et la palette. On les préfère
aux gris pour tout nouveau composant.

| Jeton (utilitaire) | Variable | Clair | Sombre |
|---|---|---|---|
| `bg-surface-page` | `--surface-page` | gris 100 | nuit de la palette |
| `bg-surface-panel` | `--surface-panel` | blanc | nuit claire |
| `bg-surface-raised` | `--surface-raised` | blanc | nuit des tableaux |
| `border-line` | `--line` | gris 200 | accent à 18 % |
| `border-line-strong` | `--line-strong` | gris 300 | accent à 35 % |
| `text-ink` | `--ink-strong` | gris 900 | encre de la palette |
| `text-ink-muted` | `--ink-soft` | gris 500 | encre atténuée |
| `outline-focus` | `--focus-ring` | accent | accent |

| Rôle | Utiliser | Notes |
|---|---|---|
| Fonds, bordures, textes | `gray-50 … gray-950` | Ils suivent le thème : les gris de Tailwind en clair, la palette choisie en sombre (`palettes.css`). |
| Accent (sélection, focus, liens, onglet actif) | `sky-50 … sky-950` | Il dérive de `--brand` de la palette. |
| Bouton principal (Enregistrer, Créer, OK) | `.btn-accent` / `.tool-btn-primary` | Dégradé de la palette, lettres blanches. **Un seul par écran.** |
| Cotes des pièces, nom des icônes, points accrochés | `text-dimension`, `border-dimension` | L'orange `#f8500a`. En Three.js, la même valeur (`0xf8500a`). |
| Icônes de la barre | `--ic-accent` (bleu, ce qui compte), `--ic-action` (orange, ce qui agit), `--ic-w1…w6` (volumes blancs) | |
| Vue 3D | `--viewport-gradient`, `--viewport-bg`, `--viewport-grid` | Bleu profond, identique dans les deux thèmes. |
| Esquisse | `--sketch-dim` (cote pilotante), `--sketch-ref` (référence), `--sketch-preview` (aperçu) | |
| Danger | `red-*`, avec un texte ou une icône | Jamais la couleur seule. |
| Succès | `emerald-*`, avec ✓ ou un texte | |

**Palettes** (classe sur `<html>`, choisie dans le menu « ⋯ ») : Atelier (par défaut), navy, ocean, crimson, amber, braise,
charbon, mocha, terre, violet, foret, laiton, indigo, sable (mocha et sable sont claires). Le thème clair l'emporte sur
les palettes. Une palette nouvelle garde 4,5:1 pour l'encre et l'accent sur ses fonds, et pour le blanc sur ses boutons.

**Contraste** : un texte courant vaut au moins `gray-500` sur fond clair, soit 4,5:1. `gray-400` est réservé aux icônes
décoratives et aux états « caché / éteint », qui ont toujours un autre signe (barré, œil fermé).

## 3. Typographie

- **Police** : Inter (400, 500, 600, 700), avec la police du système en secours. **Chiffres** : `font-mono`, toujours en
  chiffres de même largeur (`tabular-nums` est appliqué d'office à `.font-mono` et `[data-price]`).

| Jeton | Taille | Pour |
|---|---|---|
| `text-3xs` | 10 px | Légendes du ruban en capitales espacées, pastilles des cotes. Jamais pour une phrase. |
| `text-2xs` | 11 px | Aides sous un champ, compteurs, étiquettes de panneau. |
| `text-xs` | 12 px | Texte des panneaux et des menus. |
| `text-sm` | 14 px | Boutons, champs, lignes de liste. |
| `text-base` | 16 px | Champs sur téléphone (évite le zoom d'iOS), titres de carte. |
| `text-lg` … `text-2xl` | 18–24 px | Titres de page. |

- **Pas de taille en pixels écrite à la main** (`text-[11px]`) : utiliser les jetons. Rien sous 10 px.
- **Graisses** : 700 pour le nom de page, 600 pour les titres et légendes, 500 pour les boutons, 400 pour le texte.
- **Titre de panneau** : `.panel-title` (12 px, capitales espacées, en accent).
- **Légende de groupe du ruban** : `.ribbon-caption`.

## 4. Formes et profondeur

**Rayons nommés** (pages hors éditeur seulement) :

| Jeton | Valeur | Pour |
|---|---|---|
| `rounded-tag` | 6 px | Étiquette posée sur une image |
| `rounded-chip` | 8 px | Petit bouton, case à cocher sur une carte |
| `rounded-control` | 10 px | Champ, bouton de formulaire |
| `rounded-card` | 14 px | Carte, état vide |
| `rounded-pill` | 999 px | Filtres (dossiers) |

**Ombres** : `shadow-sm` pour une carte au repos, `shadow-md` pour une carte survolée, `shadow-lg` pour un menu déroulant,
`shadow-xl` pour une fenêtre d'outil, `shadow-2xl` pour un dialogue modal. En sombre, les cartes de l'éditeur prennent le
dégradé de la palette et le halo de l'accent (`.cad-card`).

**Couches (z-index)** :

| Valeur | Couche |
|---|---|
| 10 | Au-dessus de son conteneur (case sur une carte, flèches de défilement) |
| 20 | Barres et menus posés sur la vue |
| 30 | Bandeaux et repères au-dessus de la vue |
| 40 | Panneaux latéraux, feuilles du téléphone |
| 50 | Menus déroulants, dialogues |
| 60 | Notifications (toasts) |
| 70 | Bulle du nom d'une icône (toujours au-dessus) |

## 5. Espacement et densité

- Rythme de **4 px** (échelle de Tailwind) : `gap-0.5` dans le ruban, `gap-1` et `gap-2` dans les panneaux, `p-4` pour une carte, `py-8` pour une page.
- **Cibles** : 44 × 44 px pour les boutons de la barre et des pages (`min-h-11 min-w-11`). Dans les colonnes d'outils denses, 36 px (`min-h-9`) ; jamais moins de 24 px.
- **Densité tactile** : au doigt (`pointer: coarse`, tablette ou téléphone), un bloc de `app.css` porte à **44 px** les
  contrôles compacts : la colonne de sélection et de vue, Mes outils, les colonnes d'outils, les lignes des menus de
  groupe, les lignes et boutons du Navigateur et de la colonne Projets, l'historique. Les champs passent à 44 px de haut
  et à 16 px de texte, pour qu'iOS ne zoome pas. À la souris, rien ne change. La vue 3D a déjà ses tolérances au doigt :
  rayon de prise, flèches et poignées agrandies.
- **Largeur des pages** : `max-w-6xl`, avec une gouttière `px-4`.

## 6. Mise en page adaptative

| Largeur | Disposition |
|---|---|
| < 640 px (`sm`) | Téléphone : les liens de l'en-tête passent dans le menu ☰ ; les panneaux de l'éditeur sont des feuilles qui montent du bas. |
| ≥ 768 px (`md`) | Les libellés des boutons apparaissent à côté des icônes. |
| ≥ 1024 px (`lg`) | Éditeur en cartes : ruban, Navigateur, colonnes d'outils, vue et Propriétés, séparés sur un fond gris. |

Pas de défilement horizontal de la page. Sur téléphone, un champ est en `text-base`.

## 7. Interaction

- **Focus clavier** : un anneau de 2 px dans l'accent, sur tout contrôle (règle globale de `app.css`). Ne jamais l'enlever sans le remplacer.
- **Curseur** : la main sur tout ce qui se clique. La vue 3D a son propre curseur en croix (`--cad-cursor`).
- **Survol** : changement de fond (`hover:bg-gray-100` / `dark:hover:bg-gray-800`) ; le bouton principal monte d'un pixel.
- **Désactivé** : `disabled:opacity-40`, `cursor-not-allowed`, et l'attribut `disabled`.
- **Bouton enfoncé** (outil actif, filtre) : `aria-pressed="true"` ; le style suit l'attribut.
- **Nouvel outil** : un point orange (`data-new`) jusqu'au premier usage.
- **Animation** : 150–200 ms, courbe `--ease-out-soft`, uniquement sur `transform` et `opacity`. « Réduire les animations » du système les coupe toutes.
- **Messages** : en toast (`aria-live="polite"`), sans voler le focus. Une erreur dit sa cause et quoi faire.
- **Suppression** : toujours une confirmation, et Annuler (⌘Z) dans l'éditeur.

## 8. Icônes

- **Icônes vectorielles** : les volumes blancs de la barre (`scripts/icons3d.py`, `_icons.html`) et des traits de 1,5 à 2 px ailleurs.
- **En-tête de l'éditeur** : `templates/editor/_hicon.html` (`{% include "editor/_hicon.html" with name="undo" %}`) —
  retour, recherche, annuler, rétablir, enregistrer, aide, plus, chevron. Une famille : grille de 24, trait de 1,8,
  bouts ronds, couleur du texte. Une nouvelle icône d'en-tête s'y ajoute plutôt qu'en caractère (↶ ⤓ ⌕…).
  Sous 640 px, « Mise en plan » et « Aide » quittent l'en-tête (ils restent dans le menu du projet et le menu ⋯) pour
  laisser lire le nom du projet.
- **Chevrons** (déplier, replier) : dessinés (`chevronIcon` de `ui/icons.ts`, le même trait que `_hicon.html`), tournés
  d'un quart de tour quand c'est ouvert ; jamais ▸ ▾ en caractère. Dans le Navigateur, leur cible fait 24 px.
- **Titre de section du Navigateur** : sur une ligne, le nombre à part en `font-mono text-3xs` (« CORPS 7 »), jamais
  entre parenthèses ; au doigt, ses boutons se touchent pour lui laisser la place.
- **Cartes des Propriétés** (`section` de `ui/fields.ts`) : le chevron dessiné (`foldChevron`), le nom en
  `.panel-title` et, s'il y a lieu, ce qu'il contient en petites lettres grises (« SÉLECTION 1 corps ») — on écrit le
  titre « Sélection (1 corps) », la carte le sépare. Une ligne : le nom en gris (`gray-600`), la valeur en encre.
- **Pas d'emoji comme icône** d'interface. Les signes typographiques (✕ ✓ ★ ▸ ⋯) restent permis, dans la couleur du texte.
- Une icône seule a un `aria-label` ; une icône à côté d'un texte a `aria-hidden="true"`.

## 9. Contrôle avant livraison

- [ ] Couleurs par jeton (gris, accent, `dimension`), aucune valeur hexadécimale dans un composant.
- [ ] Tailles de texte par jeton, rien sous 10 px.
- [ ] Focus visible au clavier, cibles d'au moins 44 px (36 px dans les colonnes denses).
- [ ] Vérifié en clair et en sombre (au moins deux palettes), à 375, 768, 1024 et 1440 px.
- [ ] « Réduire les animations » respecté.
- [ ] Le nouveau bouton a sa fiche d'aide, son point orange et sa place dans `DEFAULT_HIDDEN`.
