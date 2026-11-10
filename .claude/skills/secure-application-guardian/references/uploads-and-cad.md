# Fichiers envoyés et lecteurs de fichiers CAO

CAO Studio reçoit des fichiers par deux chemins :

- des **envois au serveur** (modèles GLB des liens clients, logo, vignettes en data URL) ;
- des **lectures dans le navigateur** (DXF, JSON de projet, CSV de liste de débit, images de motif ou de calque).

Le noyau géométrique (OpenCascade/replicad, planegcs) tourne en WebAssembly dans le navigateur. Le serveur ne lit jamais de STEP, d'IGES ni de DXF.

## Inventaire

| Entrée | Code | Contrôles en place | Manques |
|---|---|---|---|
| GLB d'un lien client (`model`, `variant_<i>`) | `apps/projects/sharing.py:_read_glb` | taille ≤ 20 Mo, octets magiques `glTF`, 8 variantes au plus, propriétaire seul | nombre de liens par compte ; stockage en base (`BinaryField`) |
| Logo de l'atelier | `apps/catalog/forms.py:CompanyProfileForm` | taille ≤ 200 ko, type déclaré PNG ou JPEG, personnel seul | octets magiques non vérifiés (constat 10) |
| Vignette de la bibliothèque | `apps/projects/library.py:_clean_thumbnail` | préfixe `data:image/(jpeg\|png);base64,`, ≤ 200 ko | — |
| Document de projet (JSON) | `apps/projects/validation.py` | UTF-8, `NaN`/`Infinity` refusés, imbrication ≤ 64, ≤ 5 Mo, schéma des esquisses | — |
| Import JSON dans l'éditeur | `frontend/src/app/editor.ts` (`import-file`) | relu par le schéma du document, puis validé par le serveur à l'enregistrement | taille du fichier non plafonnée avant lecture |
| DXF (esquisse) | `frontend/src/io/dxf-import.ts`, `app/sketch-import.ts` | lecture texte, entités connues seulement | ni taille ni nombre d'entités plafonnés : un gros fichier fige l'onglet |
| CSV de liste de débit | `frontend/src/app/workshop/workshop.ts` | lecture texte | taille non plafonnée ; injection de formules à l'export CSV (voir plus bas) |
| Images (motif, calque) | `appearance-panel.ts`, `sketch-underlay.ts` | types `image/png,jpeg,webp` dans le sélecteur | taille non plafonnée |

## Règles pour tout nouvel envoi au serveur

1. **Taille plafonnée** avant la lecture complète. Vérifier `upload.size`, puis s'appuyer sur `DATA_UPLOAD_MAX_MEMORY_SIZE` comme garde-fou.
2. **Type vérifié par les octets**, jamais par le nom ni par le `Content-Type` :
   - GLB : `glTF` ;
   - PNG : `\x89PNG\r\n\x1a\n` ;
   - JPEG : `\xff\xd8\xff` ;
   - PDF : `%PDF-`.
3. **Pas d'écriture sur le disque à un chemin choisi par le client.** Si un jour on stocke des fichiers : nom généré par le serveur (UUID), hors de `STATIC_ROOT`, servi avec `Content-Disposition: attachment` ou un type sûr, et `X-Content-Type-Options: nosniff`.
4. **Pas de SVG ni de HTML envoyés puis servis inline** depuis l'origine de l'application (risque de XSS). Un SVG doit être converti en image matricielle ou nettoyé.
5. **Propriétaire et quota** : l'objet appartient au compte qui l'envoie, avec un plafond de nombre et de taille totale par compte.
6. **Lecture par une bibliothèque native** (si un jour le serveur lit du STEP, du DXF ou un maillage) :
   - dans un processus à part, avec une limite de temps et de mémoire (`resource.setrlimit`, `timeout`) ;
   - sans réseau ;
   - avec une bibliothèque à jour suivie par Dependabot ;
   - en refusant les fichiers chiffrés ou compressés en cascade (bombes ZIP).

## Règles pour tout nouveau lecteur dans le navigateur

1. **Plafonner** la taille du fichier (`file.size`) avant `file.text()` ou `arrayBuffer()`, et le nombre d'entités lues. Pour le DXF, il est proposé 20 Mo et 200 000 entités ; une alerte claire s'affiche au-delà.
2. **Lire dans un worker** ce qui peut être long (DXF lourd, maillage), pour ne pas figer l'éditeur.
3. **Valider chaque valeur** : nombres finis (`Number.isFinite`), coordonnées bornées (±10⁷ mm), textes tronqués, et références vers des objets qui existent.
4. **Ne rien exécuter** de ce que contient le fichier : pas d'`eval`, et pas d'URL externe chargée depuis un fichier (une texture d'un glTF ou d'un DXF qui pointe vers le réseau).
5. **Échapper** à l'affichage tout texte lu : nom de calque, de bloc ou de pièce.

## Export CSV

Une cellule qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est interprétée comme une formule par un tableur (injection CSV). Les noms de pièces et de matières viennent de l'utilisateur ou du catalogue commun. Les exports (`quoteCsv`, liste de débit) doivent donc préfixer ces cellules d'une apostrophe. C'est à vérifier à chaque audit :

```bash
grep -rn -E "Csv\(|toCsv|downloadText\(.*csv" frontend/src --include='*.ts' | grep -v '\.test\.'
```
