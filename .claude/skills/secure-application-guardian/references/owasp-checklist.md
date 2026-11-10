# Top 10 OWASP (2021) appliqué à CAO Studio

Pour chaque catégorie, ce document donne :

- **où regarder** ;
- **la commande** qui trouve les endroits à relire ;
- **ce qui doit être vrai**.

Les commandes se lancent à la racine du dépôt.

## A01 — Contrôle d'accès défaillant

**Où :**

- `apps/projects/api.py` (`_get_owned_project`), `sharing.py`, `workshop.py`, `library.py`, `production.py`, `views.py` ;
- `apps/catalog/views.py`, `apps/catalog/api.py`.

**Commandes :**

```bash
grep -rn -E "objects\.(get|filter|all)\(" apps --include='*.py' | grep -v migrations | grep -v "owner=request.user"
grep -rn -E "^def |^    def " apps/*/views.py apps/*/api.py apps/projects/{sharing,workshop,library,production,assistant,monitoring}.py
grep -rn -E "@api_view|@login_required|@staff_only|is_staff" apps --include='*.py'
```

**Ce qui doit être vrai :**

- Chaque vue a `@api_view`, `@login_required` ou est une page publique par jeton de la liste fermée (`/s/<token>/…`, `/healthz`, `/accounts/…`, `/guide/`).
- Chaque requête sur `Project`, `ProjectVersion`, `ShareLink`, `Comment`, `LibraryModule`, `Offcut`, `BatchItem` ou `PartProgress` part d'un objet déjà filtré par `owner=request.user`.
- Un objet d'un autre compte répond 404.
- Le catalogue, les tarifs et le profil ne s'écrivent que si `request.user.is_staff`.
- Les pages publiques par jeton ne lisent que des liens non révoqués (`_live_link`). Elles ne renvoient ni les jetons ni les titres des autres liens (`_public`).
- Les identifiants dans les URL sont des UUID ou des entiers liés au propriétaire. Aucune énumération ne doit donner un objet d'un autre compte.

**Tests :**

- `test_security_regressions.py::test_other_accounts_projects_are_not_found` ;
- `test_security_regressions.py::test_shared_catalogue_is_written_by_the_staff_only`.

## A02 — Défaillances cryptographiques

**Où :** `config/settings.py` (lignes `SECRET_KEY`, `SESSION_*`, `CSRF_*`, `SECURE_*`) et `apps/projects/models.py` (`_share_token`).

**Ce qui doit être vrai :**

- Hors debug :
  - la clé secrète est obligatoire (`ImproperlyConfigured` sinon) ;
  - les cookies sont `Secure` ;
  - HSTS est réglé à 1 an ou plus ;
  - la redirection HTTPS est active.
- Les jetons publics viennent de `secrets.token_urlsafe(≥ 16)`.
- Les mots de passe passent par les hacheurs de Django, et jamais par MD5 hors des tests.
- L'empreinte SHA-256 des versions sert à l'intégrité, pas à l'authentification.

**Test :** `test_security_regressions.py::test_production_settings_are_hardened`.

## A03 — Injection (SQL, commandes, XSS, journaux)

**Commandes :**

```bash
# SQL, commandes, désérialisation
grep -rn -E "\.raw\(|\.extra\(|RawSQL|cursor\(|subprocess|os\.system|pickle|yaml\.load|eval\(|exec\(" apps config --include='*.py' | grep -v migrations
# XSS côté serveur
grep -rn -E "\|safe|autoescape off|mark_safe|format_html" templates apps --include='*.html' --include='*.py'
# XSS côté navigateur : chaque ligne trouvée doit n'insérer que des nombres ou des valeurs passées par escapeHtml
grep -rn -E "innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write|new Function|[^.a-zA-Z]eval\(" frontend/src --include='*.ts' | grep -v '\.test\.'
```

**Ce qui doit être vrai :**

- L'ORM seulement.
- `json_script` pour passer des données au JavaScript.
- Dans le navigateur, chaque `${...}` d'un gabarit HTML est un nombre ou passe par `escapeHtml(...)`. Les données du **catalogue** (nom, unité, description de matière ou de quincaillerie), du **profil d'atelier**, des **commentaires** et des **noms** (projets, pièces, modèles) sont toujours échappées.
- Les textes du client journalisés sont nettoyés de `\r` et `\n`.

**Tests :**

- `tests/frontend/quote-html.test.ts` ;
- `tests/frontend/security-escaping.test.ts` ;
- `test_security_regressions.py::test_share_page_escapes_the_title`.

## A04 — Conception non sécurisée

**Ce qui doit être vrai :**

- Toute ressource qu'un compte peut créer a un plafond :
  - nombre : bibliothèque 500, chutes 2000, production 100, variantes 8, commentaires 300 par lien ;
  - taille : corps 6 Mo, document 5 Mo, GLB 20 Mo, vignette 200 ko, logo 200 ko.
- **Plafonds encore manquants :** projets, versions et liens par compte (constat 4 de l'audit du 10 novembre 2026).
- Les limites de débit sont atomiques et sur un cache partagé (constat 5).
- Une nouvelle fonction publique (sans compte) a sa limite de débit et son plafond dès le départ.

## A05 — Mauvaise configuration de sécurité

**Commandes :**

```bash
DJANGO_DEBUG=0 DJANGO_SECRET_KEY=ci-$(date +%s)-une-cle-assez-longue-pour-le-controle-de-deploiement DJANGO_ALLOWED_HOSTS=example.com .venv/bin/python manage.py check --deploy
grep -n -E "DEBUG|ALLOWED_HOSTS|SECURE_|SESSION_|CSRF_|X_FRAME|CSP" config/settings.py
```

**Ce qui doit être vrai :**

- `check --deploy` est sans avertissement, hormis ceux acceptés et notés dans le rapport.
- Les en-têtes sont présents : `X-Frame-Options: DENY` (`SAMEORIGIN` pour l'éditeur seulement), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy`.
- **À faire, avec accord :**
  - une CSP (`SECURE_CSP` de Django 6) : `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'`. Commencer en mode `SECURE_CSP_REPORT_ONLY`, relever ce qui casse dans l'éditeur (WebAssembly, workers, styles en ligne), puis appliquer.
  - `DEBUG` faux par défaut (constat 6).

**Test :** `test_security_regressions.py::test_security_headers_are_sent`.

## A06 — Composants vulnérables et obsolètes

**Commandes :**

```bash
npm audit --audit-level=high
pip-audit -r requirements.txt   # pip install pip-audit, dans un environnement à part
```

**Ce qui doit être vrai :**

- Aucun avis élevé ou critique ouvert.
- Les versions sont épinglées (`==` pour Python ; `package-lock.json` suivi).
- Dependabot ouvre les mises à jour chaque semaine, et la CI de sécurité les teste.

## A07 — Identification et authentification

**Où :** `apps/accounts/`, `config/settings.py` (`AUTH_PASSWORD_VALIDATORS`, `LOGIN_*`).

**Ce qui doit être vrai :**

- Les validateurs de mot de passe sont actifs.
- La connexion se fait par `LoginView` (`next` validé).
- La déconnexion se fait en POST.
- **À faire, avec accord :** limiter les tentatives (django-axes ou une limite sur cache partagé), freiner l'inscription, et prévoir la double authentification pour `/admin/` (constat 3).

## A08 — Intégrité des logiciels et des données

**Ce qui doit être vrai :**

- Les GitHub Actions sont mises à jour par Dependabot (écosystème `github-actions`) ; on peut aussi les épingler par SHA.
- `npm ci` utilise le lockfile.
- Pas de script téléchargé puis exécuté dans la CI.
- Les documents importés (JSON de projet) passent par `validate_document` côté serveur à l'enregistrement.

## A09 — Journalisation et surveillance

**Où :** `apps/projects/monitoring.py`, `LOGGING` dans `config/settings.py`.

**Ce qui doit être vrai :**

- Les erreurs 500 vont aux journaux (et aux `ADMINS` s'ils sont réglés).
- Les erreurs du navigateur passent par `/api/client-errors/`, avec des longueurs bornées.
- Aucun secret ni document complet dans les journaux.
- Les refus de droits (403/404 répétés) et les échecs de connexion devraient être journalisés pour être surveillés (à proposer).

## A10 — Falsification de requêtes côté serveur (SSRF)

**Commande :**

```bash
grep -rn -E "requests\.|urllib|httpx|urlopen|fetch\(" apps --include='*.py'
```

**Ce qui doit être vrai :** le serveur n'appelle que l'API Anthropic (adresse fixe dans le SDK). Une future fonction qui lit une URL fournie par un utilisateur exige une liste d'hôtes permis et le refus des adresses privées et locales.
