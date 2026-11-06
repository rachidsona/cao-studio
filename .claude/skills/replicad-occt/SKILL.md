---
name: replicad-occt
description: Écrire, déboguer et tester la géométrie B-Rep de poly_3D avec replicad et OpenCascade en WebAssembly. À utiliser pour tout travail sur frontend/src/geometry, frontend/src/features ou frontend/src/history — nouvelle feature, extrusion, fuse/cut/intersect, solide invalide, booléen qui échoue, corps qui disparaît, fuite mémoire WASM, regénération lente, repères d'arêtes perdus, ou tout appel direct à `oc.*`.
---

# replicad et OpenCascade dans poly_3D

poly_3D construit ses solides avec `replicad` au-dessus de `replicad-opencascadejs`, dans un Web Worker. Cette fiche dit comment le code du projet s'en sert ; elle ne remplace pas la documentation de replicad.

## Où passe la géométrie

| Fichier | Rôle |
|---|---|
| `frontend/src/geometry/kernel.ts` | Adaptateur du noyau, sans DOM ni Django. Il tourne dans le worker et dans les tests Node. |
| `frontend/src/geometry/worker.ts` | Possède le noyau et l'historique. Ne laisser aucun calcul B-Rep sur le fil principal. |
| `frontend/src/geometry/protocol.ts` | Messages entre l'éditeur et le worker. Un objet OCCT ne traverse jamais cette frontière : seulement des tableaux et des nombres. |
| `frontend/src/features/builders.ts` | `buildFeature` choisit le constructeur de chaque feature. |
| `frontend/src/features/common.ts` | Contrôles d'entrée et booléens partagés. |
| `frontend/src/features/outputs.ts` | Sorties des features et leur libération. |
| `frontend/src/history/recompute.ts` | Regénération incrémentale avec cache par feature. |
| `frontend/src/geometry/references.ts` | Repères persistants d'arêtes et de faces. |

Repère : Z vers le haut, longueurs en mm. Une esquisse de face est sur le plan `XZ`.

## Règle d'or : qui libère quoi

Les objets WASM échappent au ramasse-miettes pour les solides : une `Shape3D` oubliée fait grossir la mémoire sans bruit. Chaque `FeatureOutput` possède ses objets et doit être libérée une seule fois, par `disposeOutput`.

- **Un solide reçu par `lookup` appartient au cache.** Ne jamais le libérer. Il peut resservir au prochain recalcul et à l'annulation.
- **Une transformation consomme sa forme.** Pour déplacer une entrée, cloner d'abord, comme `buildMove` dans `frontend/src/features/move.ts` :
  ```ts
  return { kind: "solid", shape: (target.clone() as Shape3D).translate(translate) as Shape3D };
  ```
- **`cut`, `fuse` et `intersect` renvoient une nouvelle forme.** L'opérande et l'outil restent à libérer si on les possède. Modèle : `applyOperation` dans `frontend/src/features/common.ts`, qui libère l'outil dans `finally`.
- **Dans une boucle de booléens,** ne libérer que les résultats intermédiaires, jamais l'entrée du cache : voir le drapeau `owned` dans `frontend/src/features/solids.ts`.
- **`shape.boundingBox` et les objets `new oc.*` se libèrent dans `finally`.** Modèle : `bodyMetrics` et `isShapeValid` dans `frontend/src/geometry/kernel.ts`.
- **Quand un constructeur de plusieurs pièces échoue,** libérer ce qui est déjà construit avant de relancer l'erreur : voir `buildPanels` dans `frontend/src/features/panels.ts`.
- **Les `Drawing` 2D ne se libèrent pas** : replicad les récupère seul (commentaire de `disposeOutput`).
- Une fonction qui « prend possession » d'une forme le dit dans son commentaire, comme `solidsResult` et `underCeiling`.

## Écrire une feature

1. Contrôler les entrées avant le noyau avec `requirePositive`, `requireProfile` et `requireSolid`. `MIN_LENGTH` vaut 1e-3 mm.
2. Lever `GeometryError` avec un message en français : c'est ce que voit l'utilisateur. Toute autre exception devient « Échec du noyau géométrique ».
3. Valider le résultat. Pour un corps unique : `requireSingleValidSolid(shape, contexte)`. S'il peut se séparer : `solidsResult(shape, nom)`, qui crée des corps `<feature>#<n>` numérotés par position pour que les références survivent.
4. Renvoyer un `SolidOutput` ou un `SolidsOutput`, puis ajouter le cas dans `buildFeature`.
5. Pour une pièce de menuiserie, séparer les boîtes pures du noyau : `frontend/src/features/cabinet-parts.ts` calcule, `frontend/src/features/cabinet.ts` construit. Le calcul pur se teste sans WASM et sert aussi à nommer les corps.

Le cache ne compte que les paramètres géométriques : `featureKey` ignore `name`, `hidden` et `offsets`. Un nouveau champ de présentation doit y être ajouté, sinon il relance le noyau.

## Déboguer

Trier d'abord le symptôme :

| Symptôme | Premier geste |
|---|---|
| Statut `error` sur une feature | Lire le message de `GeometryError`. Les dépendantes passent `blocked`, les derniers corps valides restent affichés. |
| « Échec du noyau géométrique » | Une exception non prévue : reproduire dans un test avec `setupKernel`. |
| Résultat séparé en plusieurs solides | Regarder `solids.length`. Une coupe traversante donne légitimement plusieurs corps : préférer `solidsResult`. |
| « aucun solide » | Les opérandes ne se recouvrent pas : comparer leurs `boundingBox`. |
| « le solide obtenu est invalide » | Chercher des faces confondues ou presque tangentes, ou un trop petit décalage. Décaler un opérande franchement. |
| Résultat valide mais faux | Vérifier avec des nombres avant de regarder l'image : `bodyMetrics` (volume, aire, boîte, nombre de faces). |
| Fillet ou perçage sur la mauvaise arête | Le repère ne correspond plus : voir `MAX_RELATIVE_DISTANCE` et `MAX_DIRECTION_ERROR`. Demander une nouvelle sélection plutôt que d'en choisir une autre. |
| Mémoire qui monte à chaque recalcul | Chercher une `Shape3D` créée sans propriétaire, ou un clone jamais libéré. |

Ne jamais stocker un indice d'arête ou de face : OCCT les renumérote à chaque reconstruction. Passer par `frontend/src/geometry/references.ts`.

Deux panneaux qui se touchent sans se recouvrir sont le cas normal d'un meuble. Pour ajouter de la matière, garder des pièces séparées ; un `fuse` de faces coplanaires est un cas limite pour le noyau.

## Appels directs à `oc`

Rester sur l'API de replicad quand elle suffit. Pour un appel direct, passer par `getOC()` et libérer dans `finally`. Le code a aujourd'hui `BRepCheck_Analyzer` et `BRepOffsetAPI_MakeOffset`.

Pièges de l'interface Embind, relevés par le projet brepjs sur la même famille de noyaux ; à confirmer sur le module installé avant de s'y fier :

- Un enum sort sous forme d'objet, pas de nombre : `Number(valeur?.value ?? valeur)`, ou comparer à `oc.<Enum>.<MEMBRE>`.
- Les surcharges de constructeurs portent un suffixe : `_1`, `_2`. « X_2 is not a constructor » indique le mauvais suffixe.
- Une vue sur le tas WASM devient invalide au prochain appel qui agrandit la mémoire : copier tout de suite. Le worker le fait avec `Float32Array.from(mesh.vertices)`.
- Le noyau embarqué est mono-thread (`replicad_single`) : le parallélisme OCCT n'apporte rien.

Reproduire un bug soupçonné du noyau en TypeScript contre le WASM installé avant de conclure qu'il vient d'OCCT.

## Tester

Les tests géométriques utilisent le vrai noyau dans Vitest, sous Node :

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);
```

- Assertions avec `toBeCloseTo`, jamais d'égalité exacte sur un flottant.
- Vérifier volume, boîte et nombre de solides, puis `isShapeValid`.
- Couvrir aussi le cas qui échoue : le message français attendu, et aucune fuite sur le chemin d'erreur.
- Modèle complet avec `Recomputer` : `tests/frontend/separate-solids.test.ts`.
- `npx tsc --noEmit -p .` puis `npx vitest run`. Après une modification du front, `npm run build` et lire sa sortie : un échec de type laisse le bundle périmé.

Skills voisins : `brep-topology-review` pour la validité, `cad-code-review` pour la relecture, `cad-test-generator` pour les jeux d'essai. Leurs exemples sont en Python : les adapter à Vitest.

---

Les pièges Embind s'inspirent des fiches `wasm-interop` et `debugging-geometry` de [brepjs](https://github.com/andymai/brepjs) (Apache-2.0).
