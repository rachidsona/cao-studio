---
name: planegcs-sketch
description: Travailler sur les esquisses 2D et les contraintes géométriques de poly_3D avec planegcs, le solveur de FreeCAD en WebAssembly. À utiliser pour frontend/src/constraints, frontend/src/sketcher ou frontend/src/document/sketch.ts — ajouter une contrainte ou une cote, esquisse redondante ou conflictuelle, degrés de liberté, glissement d'un point, profil ouvert, arc qui saute, ou résultat différent de ce qui est dessiné.
---

# Esquisses et contraintes dans poly_3D

Le solveur est `@salusoft89/planegcs`. Tout passe par `frontend/src/constraints/solver.ts` : aucun autre module ne doit parler à planegcs. Il tourne sur le fil principal pour l'esquisseur et dans le worker pour les recalculs.

## Où est quoi

| Fichier | Rôle |
|---|---|
| `frontend/src/document/sketch.ts` | Le modèle : points, courbes, `SketchConstraint`, `DimensionConstraint`, `AXIS_X`, `AXIS_Y`, `ORIGIN`. |
| `frontend/src/constraints/solver.ts` | Traduction vers planegcs, résolution, diagnostic : `solveSketch`. |
| `frontend/src/constraints/catalog.ts` | Commandes de contraintes : ce qui s'applique à la sélection et ce qui est créé. |
| `frontend/src/sketcher/edit.ts` | Édition pure de la géométrie. |
| `frontend/src/sketcher/mode.ts` | Le mode esquisse et ses résolutions. |
| `frontend/src/sketcher/sketch-pointer.ts` | Le glissement à la souris. |
| `frontend/src/sketcher/loops.ts` | Boucles fermées du profil, `VERTEX_TOLERANCE`. |

Longueurs en mm, angles de contrainte en degrés dans le modèle et convertis en radians pour planegcs. Le solveur ne connaît que le plan de l'esquisse.

## Comment se déroule `solveSketch`

1. `checkDimensions` refuse une cote positive sous `MIN_DIMENSION` (1e-3 mm), que le solveur ne satisferait qu'en écrasant la figure.
2. Première passe : `runPass(toPrimitives(geometry, drag))`.
3. Deuxième passe sur la géométrie résolue, sauf `diagnose: false` ou conflit. Elle existe parce que planegcs évalue le diagnostic au point de départ, qui n'a de sens qu'une fois les contraintes satisfaites.
4. Résultat : `state` vaut `ok`, `redundant`, `conflicting` ou `failed`, avec `dof`, les listes d'ids et la géométrie.

Priorité de l'état : conflit, puis échec, puis redondance. `dof === 0` signifie entièrement contrainte. Les statuts `Failed` et `SuccessfulSolutionInvalid` valent tous deux `failed`.

Chaque `runPass` crée un `GcsWrapper` et le détruit dans `finally` avec `destroy_gcs_module()`. Ne pas garder un système entre deux résolutions.

## Ajouter une contrainte

1. Ajouter le genre dans `SketchConstraint` (ou `DimensionConstraint` pour une cote), dans `frontend/src/document/sketch.ts`.
2. Ajouter son cas dans `constraintPrimitives`. Une contrainte du modèle peut donner plusieurs contraintes planegcs : suffixer leurs ids avec `PART` (`#`), via `const p = (suffix) => ...`. `sourceId` rend l'id d'origine, et les diagnostics remontent ainsi à ce que l'utilisateur a posé.
3. Pour une cote strictement positive, l'ajouter à `POSITIVE_DIMENSIONS`.
4. Déclarer la commande dans `frontend/src/constraints/catalog.ts` : `applies`, `build`, `accepts`, `pick`.
5. Vérifier la validation du document (`frontend/src/document/validate.ts`) et les annotations de la vue.
6. Tester dans `tests/frontend/solver.test.ts` : un cas résolu avec son `dof`, et un cas conflictuel ou redondant.

Pour une référence au repère, utiliser `ORIGIN`, `AXIS_X` et `AXIS_Y` : `referencePrimitives` les fournit fixes dans toute résolution.

## Pièges connus du projet

- **Un arc porte ses propres règles.** `curvePrimitives` ajoute une primitive `arc_rules`. Un arc dont le centre et les extrémités sont fixes, ou deux arcs de mêmes centre et extrémités, sont surdéterminés par ces règles et non par l'utilisateur : `solveSketch` les retire de `redundant`. Ne pas afficher cette redondance.
- **Courbes projetées.** Un cercle ou un arc projeté garde le rayon du corps par une contrainte interne `#fixr` : ne pas la montrer.
- **Glissement.** Passer `{ drag: { point, x, y }, diagnose: false }`. La cible est `temporary` : elle attire le point sans l'emporter sur les vraies contraintes, et `unique` retire `drag` des diagnostics.
- **Cotes signées.** `distanceX` et `distanceY` sont signées : `-12` n'est pas une erreur. Elles ne vont donc pas dans `POSITIVE_DIMENSIONS`.
- **Angles.** Le signe dépend de l'ordre des deux lignes, tel que planegcs le mesure : voir `frontend/src/sketcher/edit.ts`.
- **Point de départ.** planegcs résout depuis la position actuelle et cherche une solution proche. Une figure qui bascule vient souvent d'un départ trop loin de la cible : changer la cote par étapes ou corriger la position initiale.
- **Écriture en retour.** `fromPrimitives` copie les valeurs résolues et conserve `offsets`, `texts` et `underlay`. Un nouveau champ de `SketchGeometry` doit y être repris, sinon il disparaît à la résolution.

## Du dessin au solide

`extractLoops` cherche les boucles fermées à `VERTEX_TOLERANCE` (1e-6 mm). Un profil ouvert ou ramifié donne `drawing: null` et un `openReason` affiché à l'utilisateur, pas une exception : traiter ce cas comme une information.

Les esquisses de Répartition sont particulières : elles sont regénérées depuis leurs étapes (`sketch.offsets`, `rebuildChain`), pas éditées ligne à ligne. Modifier une étape plutôt que ses lignes : voir `frontend/src/sketcher/partition-history.ts`, et le skill `poly3d-menuiserie`.

## Tester

```ts
import { beforeAll } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";

beforeAll(() => initSolver());
```

Les tests utilisent le vrai module WASM. Arrondir avant de comparer les coordonnées, comme le fait `point()` dans `tests/frontend/solver.test.ts`. Vérifier `state`, `dof` et les listes d'ids, pas seulement les positions.
