---
name: poly3d-menuiserie
description: Règles métier de menuiserie de poly_3D pour les caissons, dressings, cuisines, portes, tiroirs, chants, liste de débit, calepinage, système 32 mm, assemblage et contrôles de fabrication. À utiliser pour toute fonction qui crée ou calcule des panneaux, pour une Répartition, des niches, étagères ou cloisons, un module de dressing, une cote de coupe ou une règle de quincaillerie, et avant de coder une valeur de métier.
---

# Menuiserie de panneaux dans poly_3D

Avant d'écrire une valeur de métier, la chercher dans le code ci-dessous : elle existe souvent déjà. Ne pas recopier une constante, l'importer. Les valeurs citées ici sont des repères ; le code fait foi.

## Principes

- **Un panneau, un corps.** Le travail se fait sur des planches réelles, à leur épaisseur, pas sur des blocs.
- **Calcul pur séparé du noyau.** Les règles vivent dans `frontend/src/document` et dans les `*-parts.ts` de `frontend/src/features`. Elles se testent sans WASM.
- **Langue.** Les noms visibles sont en français, avec le vocabulaire de l'atelier : côté, dessus, dessous, fond, étagère, cloison, façade, chant, socle, niche, case.
- **Repère.** Longueurs en mm, Z vers le haut. L'interface affiche l'unité du projet.
- **Une action, une annulation.** Une opération appliquée au document n'ajoute qu'une entrée dans l'historique.

## Où trouver chaque règle

| Sujet | Fichier | Exemples |
|---|---|---|
| Matières, panneaux bruts, chants | `frontend/src/document/materials.ts` | `MATERIALS`, `EDGE_BANDS`, `sheet`, `oversize` |
| Standards de construction | `frontend/src/document/standards.ts` | `STANDARDS`, `bandTrimOf` |
| Caisson | `frontend/src/features/cabinet-parts.ts` | `cabinetParts`, `cabinetProblem` |
| Façades, charnières | `frontend/src/features/fronts-parts.ts` | `hingeCount`, `hingeHeights`, `frontsParts` |
| Perçages, assemblages | `frontend/src/features/joinery.ts` | `DRILLING_32`, `CONFIRMAT`, `DOWELS`, `MINIFIX` |
| Règles d'assemblage | `frontend/src/features/assembly-rules.ts` | `ASSEMBLY_RULE`, `junctions` |
| Quincaillerie | `frontend/src/document/hardware-rules.ts` | `HINGE_LOAD`, `hingesNeeded` |
| Flèche des étagères | `frontend/src/features/shelf-sag.ts` | `STIFFNESS`, `LOADS` |
| Liste de débit | `frontend/src/document/cut-list.ts` | `cutList`, `CutRow` |
| Calepinage | `frontend/src/document/nesting.ts` | `layoutSheets` |
| Modules de dressing | `frontend/src/document/dressing-modules.ts` | `MODULES`, `ROD`, `LONGEST_ROD` |
| Contrôle du dressing | `frontend/src/document/dressing-check.ts` | passage, portes bloquées |
| Contrôle d'implantation | `frontend/src/document/layout-check.ts` | hotte, évier, tringle |
| Contrôle de fabrication | `frontend/src/document/fabrication-check.ts` | `Problem`, `overlapProblems` |

## Repères de construction

- **Système 32** : trous Ø5 tous les 32 mm, à 37 mm du bord, 12 mm de profondeur (`DRILLING_32`).
- **Assemblage** : confirmats tous les 128 mm, tourillons Ø8 tous les 96 mm, 50 mm de marge. Sous 8 mm d'épaisseur, un panneau mince (fond) n'est pas assemblé ainsi.
- **Charnières** : 2 sous 900 mm de hauteur de porte, 3 sous 1600 mm, 4 au-delà ; plus si le poids l'exige (4,5 kg par charnière, repère courant). À 100 mm des extrémités, décalées par pas de 32 mm si l'embase tombe sur une étagère.
- **Façades** : en applique, elles couvrent le chant avant du caisson ; encastrées, elles entrent dans le caisson. Le jeu va de 2 à 3 mm selon le standard (`frontGap`).
- **Fond** : `applied` est vissé et réduit la profondeur de la carcasse ; `inset` ne réduit que les panneaux devant lui.
- **Massif** : scié avec une surcote (`oversize`), puis raboté. Le **débit brut** diffère alors de la **cote de coupe**.
- **Tasseaux** : vendus en barres, ils ne vont pas au calepinage des panneaux (`barLength`).

## Chants et cotes de coupe

- L1 et L2 sont les grands côtés, l1 et l2 les petits.
- **Cote finie** : celle du meuble. **Cote de coupe** : la finie moins les chants.
- Un chant d'épaisseur au moins égale à `bandTrimOf(doc)` se déduit de la coupe. Un plus fin se perd à l'affleurage et ne se déduit pas.
- Les réglages de corps passent par `setBodyInfo` et se relisent par `bodyInfo`, jamais directement dans `doc.bodyInfo[id]` : un corps partage les informations de son origine.

## Répartition, niches, étagères, cloisons

- Une **Répartition** est une esquisse de face divisée en cases, avec des côtés simples, doubles ou absents : `frontend/src/sketcher/partition.ts`.
- Une **niche** est désignée par un chemin : la case, puis la niche de chaque division. Voir `leafNiches` et `pathKey` dans `frontend/src/sketcher/partition-history.ts`.
- L'historique est gardé dans `sketch.offsets` et rejoué par `rebuildChain`. Modifier une étape, jamais ses lignes. Quand une division change l'ordre, les équipements suivent par `repath`.
- Les niches égales se partagent l'espace libre, épaisseurs retirées. Une hauteur donnée est tenue, les autres partagent le reste.
- `syncPartitionDoors` compare les clés présentes : garder `joined: []` plutôt que de retirer la clé.
- Les portes viennent de `partitionDoors`, et `joined` fusionne des cases voisines.

## Dressing

Valeurs par défaut dans `DRESSING` : hauteur 2500, profondeur 600, épaisseur 18, socle 80. Repères de `frontend/src/document/dressing-modules.ts` : tringle Ø25 posée 60 mm sous le haut, portée maximale 1200 mm, chapeau 300 mm. Le passage entre deux rangées ne descend pas sous 600 mm (`NARROW`), et la tringle se place entre 170 et 190 cm du sol.

## Prévenir, pas seulement corriger

Une nouvelle règle de métier devient un `Problem` : `error` si le travail serait gâché, `warning` s'il faut regarder. Le message est en français, avec les corps concernés pour qu'on puisse les sélectionner. Le contrôle doit tomber avant la découpe.

Une valeur de résistance reste un repère : ne pas présenter un calcul comme une certification. Pour les charges, la fiche du fabricant fait foi (`frontend/src/document/hardware-rules.ts`).

## Avant de finir

- Le nouvel outil de ruban a sa fiche d'aide, sinon `tests/frontend/help-content.test.ts` échoue, et son bouton est dans `DEFAULT_HIDDEN`.
- Le calcul pur a ses tests Vitest, l'interaction son test Playwright.
- Les fichiers restent sous 500 lignes.
- Pour la géométrie, voir `replicad-occt`. Pour les esquisses, voir `planegcs-sketch`.
