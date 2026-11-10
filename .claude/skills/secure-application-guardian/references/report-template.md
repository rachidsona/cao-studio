# Modèle du rapport d'audit

Enregistrer le rapport dans `docs/securite/audit-securite-AAAA-MM-JJ.md`. Ce dossier est local et n'entre pas dans le dépôt. Envoyer ensuite le rapport à l'utilisateur. Écrire en français et donner une preuve `fichier:ligne` pour chaque constat.

```markdown
# Audit de sécurité — CAO Studio

- **Date :** AAAA-MM-JJ
- **Version du code :** commit `xxxxxxx`, branche `…`
- **Périmètre :** complet / depuis le commit `…` (fichiers : …)
- **Rapport précédent :** `docs/securite/audit-securite-….md`
- **Outils :** CodeQL (CI), Semgrep (règles du dépôt + OWASP), npm audit, pip-audit, gitleaks, `check --deploy`, tests de sécurité — dire lesquels n'ont pas tourné et pourquoi.
- **Fichiers source modifiés pendant l'audit :** aucun / liste, avec le commit.

## Synthèse

| # | Gravité | Constat | Où | État |
|---|---|---|---|---|
| 1 | Élevée | … | `fichier:ligne` | Nouveau / Corrigé (commit) / Ouvert / Accepté (par …, revue le …) |

Une phrase sur l'enchaînement des constats s'il y en a un (ex. : inscription libre + données communes + XSS).

## 1. Titre — Gravité

**Catégorie :** OWASP A0x, CWE-…

**Chemin dans le code :**

1. Entrée de l'attaquant (`fichier:ligne`) ;
2. chaque étape ;
3. effet.

**Exploitation :**

- qui peut le faire (anonyme / tout compte / propriétaire) ;
- conditions ;
- charge d'exemple (sans charge destructrice).

**Impact :** les comptes, les données ou l'argent touchés.

**Remédiation :**

- le changement précis ;
- le test de non-régression à ajouter ;
- « accord requis » si cela touche une configuration critique.

## Suivi des constats précédents

| # | Constat | État au rapport précédent | État maintenant |
|---|---|---|---|

## Points contrôlés sans problème

La liste courte de ce qui a été vérifié et tient, avec la preuve.

## Alertes d'outils écartées

| Outil | Règle | Où | Raison (faux positif, avec preuve) |
|---|---|---|---|

## Limites

Ce qui n'a pas été couvert : infrastructure, test d'intrusion, binaires tiers, outils non lancés.

## Ordre de correction conseillé

1. …
```
