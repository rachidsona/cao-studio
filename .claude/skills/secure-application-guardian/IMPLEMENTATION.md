# Mise en œuvre de la garde de sécurité

Ce document explique ce que le skill `secure-application-guardian` a ajouté au dépôt, comment l'activer sur GitHub, comment s'en servir en local, et comment chaque exigence est tenue.

## Fichiers

| Fichier | Rôle |
|---|---|
| `.claude/skills/secure-application-guardian/SKILL.md` | Les règles que Claude applique en écrivant le code, la conduite d'un audit, ce qui se corrige seul ou demande un accord, et le suivi des constats |
| `.claude/skills/secure-application-guardian/references/owasp-checklist.md` | Le Top 10 OWASP 2021 appliqué à ce code : où regarder, commandes, ce qui doit être vrai |
| `.claude/skills/secure-application-guardian/references/uploads-and-cad.md` | Les fichiers envoyés (GLB, logo, vignettes) et lus (DXF, JSON, CSV, images), avec leurs règles |
| `.claude/skills/secure-application-guardian/references/report-template.md` | Le modèle du rapport d'audit |
| `.github/workflows/security.yml` | La CI de sécurité : CodeQL, Semgrep, dépendances, secrets, réglages de production, tests, barrière |
| `.github/codeql/codeql-config.yml` | CodeQL : requêtes `security-extended` sur `apps/`, `config/`, `frontend/src/` et `templates/` |
| `.semgrep/cao-studio.yml` | Les règles Semgrep propres au projet (CSRF, `mark_safe`, SQL brut, corps JSON, `eval`, `innerHTML`, `|safe`, limites de débit, `DEBUG`) |
| `.github/dependabot.yml` | Mises à jour hebdomadaires (npm, pip, GitHub Actions), regroupées pour les versions mineures et les correctifs |
| `scripts/security/check.sh` | Les contrôles en local ; il n'installe et ne télécharge rien |
| `tests/backend/test_security_regressions.py` | Tests de non-régression côté serveur (droits, CSRF, entrées, envois, en-têtes, réglages de production) |
| `tests/frontend/security-escaping.test.ts` | Tests de non-régression côté navigateur (échappement du devis, de la liste de débit, des étiquettes, de l'en-tête) |

## Activer sur GitHub (à faire par le propriétaire du dépôt)

Le dépôt n'a pas encore de remote GitHub configuré ici. Une fois poussé :

1. **Settings → Code security** : activer
   - le « Dependency graph » ;
   - les « Dependabot alerts » ;
   - les « Dependabot security updates » ;
   - le « Secret scanning » et la « Push protection » (gratuits pour un dépôt public ; GitHub Advanced Security sinon).
2. **Code scanning** : rien à faire. Le workflow envoie les résultats de CodeQL et de Semgrep (SARIF). Pour un dépôt privé, il faut GitHub Advanced Security ; sans lui, les étapes d'envoi échouent. Dans ce cas, retirer `upload-sarif` et garder la barrière Semgrep.
3. **Settings → Branches → règle de protection de `main`** :
   - exiger le contrôle **« Barrière de sécurité »** et les jobs de `ci.yml` avant la fusion ;
   - exiger une branche à jour ;
   - interdire le contournement aux administrateurs.

   C'est ce qui empêche de fusionner, donc de déployer, avec une vulnérabilité critique ouverte.
4. **gitleaks** : rien à régler pour un compte personnel. Pour un dépôt d'organisation, `gitleaks-action` demande une licence gratuite (`GITLEAKS_LICENSE` dans les secrets du dépôt). Sur `push`, gitleaks ne lit que les commits poussés : après le premier push, lancer le workflow à la main (« Run workflow », `workflow_dispatch`) pour lire tout l'historique.
4 bis. **Épinglage** : les actions sont épinglées par SHA de commit (version en commentaire), les images par digest (`semgrep/semgrep:1.184.0@sha256:…`, `postgres:17.11@sha256:…`), pip-audit et psycopg par version. Dependabot (écosystème `github-actions`) propose les mises à jour des actions ; les images et les outils se mettent à jour à la main, en relisant leurs notes de version.
5. **Premier passage** : les rulesets `p/owasp-top-ten`, `p/django` et `p/typescript` de Semgrep, et CodeQL, n'ont jamais tourné sur ce code. Le premier rouge est à trier avec le skill :
   - corriger ce qui est réel ;
   - marquer les faux positifs avec leur raison (`# nosemgrep: <règle> — raison`, ou « Dismiss » avec commentaire dans Code scanning) ;
   - tout reporter dans le rapport d'audit.

## En local

```bash
sh scripts/security/check.sh
```

Le script lance :

- les tests de sécurité (serveur et navigateur) ;
- `manage.py check --deploy` avec des réglages de production ;
- `npm audit --audit-level=high` ;
- `pip-audit`, `semgrep` et `gitleaks` s'ils sont installés. Sinon, il dit qu'il ne les a pas lancés.

Pour les installer, en dehors du projet :

```bash
brew install semgrep gitleaks
```

```bash
pipx install pip-audit
```

Demander un audit à Claude : « fais un audit de sécurité ». Le skill se charge, suit sa procédure, enregistre le rapport dans `docs/securite/` et l'envoie.

## Comment chaque exigence est tenue

| Exigence | Où |
|---|---|
| 1. Code sûr | `SKILL.md`, « Règles de code sûr » (serveur et navigateur), appliquées par Claude en écrivant ; Semgrep en CI |
| 2. Top 10 OWASP | `references/owasp-checklist.md` ; CodeQL `security-extended` ; Semgrep `p/owasp-top-ten` + règles du dépôt |
| 3. En-têtes et CSP | En-têtes en place et testés (`test_security_headers_are_sent`, `test_production_settings_are_hardened`, `check --deploy` en CI). La CSP est écrite et prête dans `owasp-checklist.md` (A05). Elle n'est **pas** appliquée : c'est une configuration critique, à faire avec l'accord de l'utilisateur, d'abord en mode « report-only » |
| 4. Authentification, droits, API | `owasp-checklist.md` (A01, A07) ; tests d'isolation par propriétaire, d'API fermée sans compte, de CSRF, de catalogue réservé au personnel |
| 5. Dépendances et secrets | `npm audit`, `pip-audit` et gitleaks dans `security.yml` ; Dependabot ; secret scanning GitHub |
| 6. Envois et lecteurs de fichiers CAO | `references/uploads-and-cad.md` (inventaire, manques, règles) ; tests GLB (type par les octets, taille) et JSON hostile |
| 7. Tests automatiques en CI/CD | `security.yml`, sur `pull_request`, `push` vers `main`/`master`, chaque lundi et à la demande |
| 8. Tests de non-régression | `test_security_regressions.py`, `security-escaping.test.ts`, `quote-html.test.ts`, et les tests de droits du catalogue |
| 9. Corrections automatiques sûres | `SKILL.md`, « Corrections automatiques » : les critères et des exemples. Appliqué dès la mise en place : le repère des pièces est maintenant échappé dans la liste de débit et le calepinage (défense en profondeur) |
| 10. Accord avant les configurations critiques | `SKILL.md`, « Configurations critiques » : la liste des fichiers et réglages, et la procédure (montrer le diff, attendre le oui) |
| Ne jamais ignorer en silence | `SKILL.md`, règle 1 : chaque alerte Critique ou Élevée se termine corrigée, rejetée avec preuve, ou acceptée par écrit |
| Ne jamais déployer avec une faille critique | Job « Barrière de sécurité », exigé par la protection de branche (point 3 ci-dessus) |
| Garder le fonctionnement | `SKILL.md`, règle 3 : test rouge, correction, puis toute la suite |
| Un rapport après chaque audit | `SKILL.md`, règle 4 ; `references/report-template.md` ; `docs/securite/` |
| Contrôles à chaque PR | `security.yml` sur `pull_request` |

## Ce qui reste ouvert (audit du 10 novembre 2026)

Le tableau de suivi est à la fin de `SKILL.md`. Trois des constats ouverts demandent l'accord de l'utilisateur, parce qu'ils touchent `config/settings.py` ou ajoutent une dépendance :

- n° 3 : limite de connexion ;
- n° 6 : `DEBUG` faux par défaut ;
- n° 7 : CSP.

Deux se corrigent sans risque :

- n° 8 : journaux ;
- n° 10 : octets du logo.
