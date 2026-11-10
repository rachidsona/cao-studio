---
name: secure-application-guardian
description: Garde de sécurité de CAO Studio (Django + TypeScript/Three.js). Impose le code sûr, prévient le Top 10 OWASP, audite l'authentification, les droits et l'API, surveille dépendances et secrets, protège les fichiers envoyés et les lecteurs de fichiers CAO (GLB, DXF, JSON, CSV, images), tient la CI de sécurité (CodeQL, Semgrep, Dependabot, gitleaks, pip-audit) et les tests de non-régression. À utiliser pour tout audit de sécurité ; avant toute pull request ; pour tout changement qui touche les comptes, les droits, une vue ou une API, un gabarit ou du HTML généré (innerHTML), un envoi ou une lecture de fichier, les réglages (config/settings.py, en-têtes, CSP, cookies), les dépendances ou les workflows CI.
---

# Garde de sécurité de CAO Studio

Ce skill fait trois choses :

1. Il fait respecter des règles de code sûr **pendant** le travail.
2. Il audite l'application sur demande ou avant une pull request.
3. Il corrige ce qui peut l'être sans risque.

Les outils automatiques sont dans le dépôt. Ce fichier dit quand et comment s'en servir.

- `.github/workflows/security.yml` : CodeQL, Semgrep, dépendances, secrets, `check --deploy` et tests de sécurité, à chaque pull request.
- `.semgrep/cao-studio.yml` : les règles propres à ce code.
- `.github/codeql/codeql-config.yml` : la configuration de CodeQL.
- `.github/dependabot.yml` : la mise à jour des dépendances.
- `scripts/security/check.sh` : les mêmes contrôles, en local.
- Les tests de non-régression :
  - `tests/backend/test_security_regressions.py` ;
  - `tests/frontend/security-escaping.test.ts` ;
  - `tests/frontend/quote-html.test.ts`.

Les références détaillées sont dans le dossier de ce skill :

- [references/owasp-checklist.md](references/owasp-checklist.md) : le Top 10 OWASP appliqué à ce code, avec les commandes de recherche.
- [references/uploads-and-cad.md](references/uploads-and-cad.md) : les fichiers envoyés et les lecteurs de fichiers CAO.
- [references/report-template.md](references/report-template.md) : le modèle du rapport d'audit.
- [IMPLEMENTATION.md](IMPLEMENTATION.md) : ce qui est installé, comment l'activer sur GitHub, et comment chaque exigence est tenue.

## Règles absolues

1. **Ne jamais ignorer en silence une vulnérabilité critique ou élevée.** Toute alerte Critique ou Élevée doit se terminer par l'un de ces trois résultats :
   - elle est corrigée ;
   - elle est rejetée comme faux positif, avec sa preuve dans le code ;
   - elle est acceptée par l'utilisateur, par écrit, avec une date de revue.

   Un `# nosemgrep`, une alerte CodeQL « dismissed » ou une exception de dépendance doit porter sa raison, et apparaître dans le rapport.
2. **Ne jamais déployer avec une vulnérabilité critique non résolue.** Le workflow `security.yml` échoue sur toute alerte Critique ou Élevée. Ne pas contourner un contrôle rouge (pas de `continue-on-error`, pas de `--no-verify`, pas de saut de job) sans l'accord explicite de l'utilisateur.
3. **Garder le fonctionnement de l'application.** Chaque correction suit cet ordre :
   1. un test qui échoue (la faille est reproduite) ;
   2. la correction ;
   3. tous les tests (`npx tsc --noEmit -p .`, `npx vitest run`, `.venv/bin/pytest -q`, `npm run build`, puis les e2e concernés).

   Ne jamais retirer une fonction pour « fermer » une faille sans l'accord de l'utilisateur.
4. **Un rapport après chaque audit**, d'après [references/report-template.md](references/report-template.md) :
   - il est enregistré dans `docs/securite/audit-securite-AAAA-MM-JJ.md` (dossier local, hors du dépôt) ;
   - il est envoyé à l'utilisateur ;
   - chaque constat y a sa preuve (`fichier:ligne`) et sa gravité.
5. **Des contrôles à chaque pull request** : le workflow `security.yml` tourne sur `pull_request` et sur `push`. Avant d'ouvrir une PR, lancer `sh scripts/security/check.sh`.
6. **L'accord de l'utilisateur avant de toucher une configuration de sécurité critique** (liste ci-dessous). On montre le changement prévu (diff), on attend un « oui » clair, puis on applique.

## Configurations critiques : accord obligatoire avant modification

- `config/settings.py`, pour tout ce qui touche :
  - `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CSRF_*`, `SESSION_*`, `SECURE_*` ;
  - la CSP, `X_FRAME_OPTIONS` ;
  - `MIDDLEWARE`, `AUTH_PASSWORD_VALIDATORS`, `PASSWORD_HASHERS`, `CACHES` ;
  - `DATA_UPLOAD_MAX_MEMORY_SIZE`, `LOGGING`.
- L'authentification et les droits :
  - `apps/accounts/` (connexion, inscription) ;
  - `apps/projects/http.py` (`api_view`, `read_json_body`, `csrf_failure`) ;
  - le décorateur `staff_only` et le contrôle `is_staff` dans `apps/catalog/`.
- Les limites et quotas : `MAX_BODY_BYTES`, `MAX_MODEL_BYTES`, `RATE_LIMIT`, `MAX_DEPTH`.
- La chaîne de sécurité elle-même :
  - `.github/workflows/security.yml`, `.github/workflows/ci.yml` ;
  - `.semgrep/`, `.github/codeql/`, `.github/dependabot.yml`, `scripts/security/` ;
  - les tests `test_security_regressions.py` et `security-escaping.test.ts` (on ajoute un test sans accord, mais on n'en affaiblit ni n'en retire aucun).
- Les secrets et l'hébergement : `.env`, les variables d'environnement, les clés (`ANTHROPIC_API_KEY`, `DJANGO_SECRET_KEY`), la mise à jour majeure d'une dépendance de sécurité (Django, whitenoise).

## Corrections automatiques : ce qui peut se faire sans demander

Une correction est **sûre** si elle remplit toutes ces conditions :

- la faille est confirmée dans le code ;
- elle ne touche aucun fichier de la liste ci-dessus ;
- elle ne change pas le comportement attendu par un utilisateur légitime ;
- elle tient en peu de lignes.

On l'applique avec son test de non-régression, puis on la signale dans le rapport. Exemples :

- échapper une valeur insérée en HTML : `escapeHtml(...)` ou `el(...)`, `textContent` ;
- ajouter `owner=request.user` à une requête qui l'a oublié ;
- passer un corps JSON par `read_json_body` ;
- valider un champ (type, longueur, liste fermée) déjà attendu par l'interface ;
- vérifier les octets magiques d'un fichier envoyé ;
- plafonner la taille d'un fichier lu par le navigateur (DXF, CSV, JSON) ;
- mettre à jour une dépendance en version de correctif (patch) quand un avis de sécurité la vise et que les tests passent.

Tout le reste se **propose** sans s'appliquer : changement de modèle de droits, nouvelle limite visible par l'utilisateur, migration de données, nouvelle dépendance, changement de comportement.

## Règles de code sûr (à appliquer en écrivant)

### Serveur (Django, `apps/`)

- **Chaque vue d'API** passe par `@api_view((...))` (`apps/projects/http.py`). Ce décorateur donne :
  - les méthodes permises, avec un 405 JSON sinon ;
  - le 401 si le visiteur n'est pas connecté ;
  - la conversion des `ApiError` en réponse JSON.

  Chaque page HTML a `@login_required`, sauf les pages publiques par jeton (`/s/<token>/`).
- **Chaque lecture de données d'un utilisateur filtre par propriétaire** : `Project.objects.get(pk=..., owner=request.user)` (`_get_owned_project`), et de même pour `LibraryModule`, `Offcut` et `BatchItem`. Un objet d'un autre compte répond **404**, jamais 403 : on ne révèle pas qu'il existe.
- **Les données communes à tous les comptes** (catalogue, tarifs, profil d'atelier) ne s'écrivent que par le personnel : `staff_only`, `is_staff`, 403 JSON dans l'API. Toute nouvelle donnée commune suit la même règle.
- **Corps JSON** : toujours `read_json_body(request)`, jamais `json.loads(request.body)`. Il apporte :
  - la limite de 6 Mo ;
  - le refus de `NaN` et `Infinity` ;
  - le refus d'un corps qui n'est pas un objet JSON.

  Un document de projet passe en plus par `validate_document`, qui limite l'imbrication et la taille.
- **Valider chaque champ** : son type exact (`type(x) is int`, sans `bool`), sa longueur (`max_length` du modèle), une liste fermée pour les choix, et des bornes finies pour les nombres (`math.isfinite`).
- **SQL** : l'ORM uniquement. Pas de `raw()`, `extra()`, `RawSQL` ni `cursor.execute` avec des données de l'utilisateur.
- **Gabarits** : l'échappement automatique de Django. Les données passées au JavaScript passent par `|json_script`. Pas de `mark_safe`, `|safe` ou `{% autoescape off %}` sur une donnée qui vient d'un utilisateur ou de la base. Le seul `|safe` admis est celui des `help_text` écrits dans le code (`templates/registration/_field.html`).
- **CSRF** : jamais de `csrf_exempt`. Une page publique qui poste du JSON pose le cookie avec `@ensure_csrf_cookie`.
- **Limites de débit** : utiliser `cache.add` puis `cache.incr` (atomique), sur un cache partagé en production, avec l'adresse cliente vue derrière le proxy. Ne pas écrire un nouveau `cache.get` suivi de `cache.set`.
- **Journaux** : ne jamais journaliser un mot de passe, un jeton, une clé ni un document complet. Retirer `\r` et `\n` d'un texte venu du client avant de le journaliser.
- **Secrets** : lus dans l'environnement (`os.environ`), jamais écrits dans le code ni dans un fichier suivi. `.env`, `db.sqlite3` et `.e2e/` restent ignorés par git.
- **Appels sortants** (API Claude) : la clé reste sur le serveur. La réponse est contrainte par un schéma, puis revalidée par l'éditeur avant d'être appliquée. Les limites (débit, taille du contexte) s'appliquent par compte.

### Navigateur (`frontend/src/`)

- **Construire le DOM avec `el(...)` ou `textContent`.** `innerHTML` n'est permis que pour du HTML ou du SVG produit par le code, où **chaque** valeur insérée est un nombre ou passe par `escapeHtml(...)`. Cela vaut aussi pour une valeur qui paraît sûre (nom de matière, unité, libellé) :
  - **les données du catalogue sont écrites par d'autres comptes** ;
  - les noms des documents viennent de fichiers importés.

  La faille de l'unité de quincaillerie du devis (corrigée dans le commit 3ca5fe0) en est l'exemple.
- **Impression** (`printHtml`, `document.write` dans un cadre de même origine) : même règle que pour `innerHTML`.
- **Jamais** `eval`, `new Function`, `setTimeout("chaîne")`, ni un `href` ou un `src` construit depuis une donnée sans en vérifier le schéma. Une image ne peut être qu'une data URL `data:image/(png|jpeg|webp);base64,` ou une URL de même origine.
- **Requêtes vers l'API** : `credentials: "same-origin"` et l'en-tête `X-CSRFToken` lu dans le cookie. Pas de jeton dans une URL.
- **Fichiers lus dans le navigateur** (DXF, JSON, CSV, images) : voir [references/uploads-and-cad.md](references/uploads-and-cad.md). Il faut plafonner la taille et le nombre d'entités, valider ce qui est lu, et ne jamais exécuter ce que contient le fichier.
- **`localStorage`** : seulement des préférences de cet utilisateur, jamais un secret. On le relit comme une donnée non sûre (`try`/`catch`, validation du type).

## Faire un audit

1. **Périmètre** : lister ce qui a changé depuis le dernier rapport (`git log --oneline <dernier-commit-audité>..HEAD`, `git diff --stat`). Un audit complet couvre tout `apps/`, `config/`, `templates/`, `frontend/src/` et la CI.
2. **Outils** : lancer `sh scripts/security/check.sh`. Il fait :
   - les tests de sécurité ;
   - `manage.py check --deploy` ;
   - `npm audit` ;
   - `pip-audit`, `semgrep` et `gitleaks` s'ils sont installés.

   Il dit ce qu'il n'a pas pu lancer. Sur GitHub, lire aussi les alertes « Code scanning », « Dependabot » et « Secret scanning » du dépôt.
3. **Lecture du code**, catégorie par catégorie, avec [references/owasp-checklist.md](references/owasp-checklist.md). Chaque catégorie a ses commandes de recherche et ses points à vérifier.
4. **Vérifier chaque constat** dans le code avant de l'écrire. Il faut :
   - le chemin complet de l'entrée de l'attaquant jusqu'à l'effet, avec `fichier:ligne` à chaque étape ;
   - les conditions de l'exploitation ;
   - l'impact.

   Une alerte d'outil non confirmée est un « faux positif » (dire pourquoi) ou une « piste » (dire ce qui manque).
5. **Gravité** : Critique / Élevée / Moyenne / Faible / Info. La gravité vient de l'exploitabilité (qui peut le faire : visiteur anonyme, tout compte, propriétaire) et de l'impact (autres comptes touchés, données des clients, argent, disponibilité). L'inscription est libre : « tout compte » veut donc dire « n'importe qui ».
6. **Corriger** ce qui est sûr (voir plus haut) ; **proposer** le reste. Pour une configuration critique : montrer le diff et attendre l'accord.
7. **Rapport** : `docs/securite/audit-securite-AAAA-MM-JJ.md`, puis l'envoyer à l'utilisateur. Le rapport précédent sert de base : dire ce qui est corrigé, ce qui reste ouvert et ce qui est nouveau.

## Avant une pull request

- `sh scripts/security/check.sh` passe, ou ce qui manque est dit.
- Chaque faille corrigée a son test dans `tests/backend/test_security_regressions.py` ou `tests/frontend/security-escaping.test.ts`.
- Aucun nouveau `innerHTML`, `|safe`, `csrf_exempt`, `raw(` ni `eval` sans justification. Semgrep les signale.
- Aucun secret dans le diff. gitleaks le vérifie dans la CI.
- Une dépendance ajoutée est justifiée, épinglée (`requirements.txt` en `==`, `package-lock.json` à jour), et sans avis de sécurité connu.

## Gravités et barrière de la CI

| Gravité | Exemples ici | Barrière |
|---|---|---|
| Critique | Exécution de code sur le serveur ; accès aux projets d'un autre compte sans compte ; fuite de `SECRET_KEY` ou d'une clé API | La CI échoue ; aucun déploiement ; correction immédiate |
| Élevée | XSS stockée entre comptes ; écriture dans les données d'un autre compte ; contournement du CSRF | La CI échoue ; correction avant la fusion |
| Moyenne | Pas de limite de connexion ; pas de quota de stockage ; `DEBUG` vrai par défaut | Dans le rapport, avec un plan ; ne bloque pas seule |
| Faible / Info | Fausses lignes dans les journaux ; durcissement (CSP) ; XSS limitée à soi-même | Dans le rapport |

## Suivi des constats

Rapports : `docs/securite/audit-securite-2026-11-10.md` (premier), puis `audit-securite-2026-11-10-2.md` (audit initial par quatre spécialistes, numéros H, M, L). Garder ce tableau à jour à chaque audit.

| # | Constat | État |
|---|---|---|
| 1 | XSS stockée par l'unité de quincaillerie (devis) | Corrigé (3ca5fe0), `tests/frontend/quote-html.test.ts` |
| 2 | Catalogue, tarifs et profil modifiables par tout compte | Corrigé (aad2bce) : personnel seulement (`rachidsonaa`) |
| H1 | Injection de commandes G-code par un nom de pièce ou de matière | Corrigé (lot 1) : `gcodeComment` |
| H2 | Mémoire épuisée par les messages de validation | Corrigé (lot 1) : 100 messages de 300 caractères au plus |
| M1 | XSS par un projet importé dans la bande du linéaire (ancien n° 11) | Corrigé (lot 1) : échappement + `validate-kitchen.ts` |
| M2 | XSS dans la mise en plan par un projet importé | Corrigé (lot 1) : `esc` des `data-id`, taille numérique, annotations validées |
| M3 | Pollution de prototype par les formules | Corrigé (lot 1) : `drivablePath`, `Object.hasOwn` |
| M4 | Variantes jamais validées | Corrigé côté éditeur (lot 1) ; côté serveur : accord requis |
| M5 | Injection de formules dans les CSV | Corrigé (lot 1) : `csvText` |
| M6 | Django 6.1.2 (CVE-2026-108147) | Corrigé : Django 6.1.3 (accord du 10/11/2026) ; suivre les annonces de sécurité de Django, que pip-audit ne voyait pas encore |
| M7 | GLB des liens : mémoire, disque, débit (et ancien n° 4, quotas) | Ouvert : accord requis |
| M8 | Inscription libre, données commerciales lisibles | Ouvert : accord requis |
| M9 | CI à durcir (épinglage SHA, permissions de gitleaks, CodeQL v4) | Ouvert : accord requis |
| M10 | Outils d'agents non épinglés | Ouvert : accord requis (configuration de l'utilisateur) |
| L1 | Titre d'impression non échappé | Corrigé (lot 1) |
| L2 | Couleur de matière non validée | Corrigé dans l'éditeur (lot 1) ; validateur serveur : à faire avec une migration |
| L3 | DXF : bombe ELLIPSE, NaN | Corrigé (lot 1) : 20 Mo, un tour, 200 000 traits, valeurs finies |
| L4 | GLB public qui charge ailleurs | Corrigé (lot 1) : `apps/projects/glb.py` + `setURLModifier` |
| L5 | Entiers géants | Corrigé (lot 1) : 10^15 au plus |
| L6 | Worker sans délai | Ouvert : accord requis |
| L7 | Nom de connexion sur les pages client | Ouvert : accord requis |
| L8 | Événements de sécurité non journalisés | Ouvert : accord requis (`settings.py`) |
| L9 | Erreurs 500 sur entrées invalides | Corrigé (lot 1) |
| L10 | Ni changement de mot de passe, ni suppression, ni export | Ouvert : accord requis |
| L11 | Google Fonts sur la page client | Ouvert : avec la CSP |
| L12 | sqlparse 0.6.0 | Ouvert : avec M6 |
| L13–L14 | Permissions et artefacts de `ci.yml` ; verrouillage pip, `.venv` dérivé | Ouvert : accord requis |
| L15 | Dossiers d'agents non ignorés | Corrigé (lot 1) : `.gitignore` |
| 3 | Pas de limite de tentatives de connexion | Ouvert : accord requis |
| 5 | Limites de débit non atomiques | Ouvert : accord requis (`CACHES`) |
| 6 | `DEBUG` vrai par défaut | Ouvert : accord requis |
| 7 | Pas de CSP | Ouvert : accord requis (CSP prête dans le rapport) |
| 8 | Fausses lignes dans les journaux | Corrigé (lot 1) |
| 9 | Acceptation d'un lien non atomique | Corrigé (lot 1) ; ouverture à tout porteur : choix de fonctionnement |
| 10 | Type du logo lu dans l'en-tête déclaré | Corrigé (lot 1) : octets magiques |
