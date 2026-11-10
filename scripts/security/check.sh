#!/bin/sh
# Contrôles de sécurité de CAO Studio en local (skill secure-application-guardian), les mêmes que la CI (security.yml)
# quand les outils sont là : tests de sécurité, check --deploy, npm audit, et pip-audit / semgrep / gitleaks s'ils
# sont installés. Rien n'est installé ni téléchargé ici. Code de sortie non nul si un contrôle lancé échoue.
#   sh scripts/security/check.sh
cd "$(dirname "$0")/../.." || exit 2
PYTHON="${PYTHON:-.venv/bin/python}"
[ -x "$PYTHON" ] || PYTHON=python3
failed=""
skipped=""

step() {
  name="$1"
  shift
  echo ""
  echo "== $name"
  if "$@"; then echo "-> ok"; else echo "-> ÉCHEC"; failed="$failed\n  - $name"; fi
}

missing() {
  echo ""
  echo "== $1 : non lancé ($2)"
  skipped="$skipped\n  - $1 : $2"
}

step "Tests de sécurité (serveur)" "$PYTHON" -m pytest -q tests/backend/test_security_regressions.py tests/backend/test_catalog_pages.py tests/backend/test_sharing.py tests/backend/test_validation.py
step "Tests de sécurité (navigateur)" npx vitest run tests/frontend/security-escaping.test.ts tests/frontend/quote-html.test.ts
step "Réglages de production (check --deploy)" env DJANGO_DEBUG=0 DJANGO_SECRET_KEY="local-check-deploy-$(date +%s)-une-cle-longue-propre-au-controle" DJANGO_ALLOWED_HOSTS=example.com "$PYTHON" manage.py check --deploy --fail-level WARNING
step "Dépendances npm (npm audit, élevée et critique)" npm audit --audit-level=high

if command -v pip-audit >/dev/null 2>&1; then
  step "Dépendances Python (pip-audit)" pip-audit -r requirements.txt --desc
else
  missing "Dépendances Python (pip-audit)" "pip install pip-audit, dans un environnement à part"
fi
if command -v semgrep >/dev/null 2>&1; then
  step "Semgrep (règles du dépôt, gravité ERROR)" semgrep scan --metrics=off --config .semgrep/ --severity ERROR --error
else
  missing "Semgrep" "pip install semgrep, ou brew install semgrep"
fi
if command -v gitleaks >/dev/null 2>&1; then
  step "Secrets (gitleaks, tout l'historique)" gitleaks git --no-banner --redact .
else
  missing "Secrets (gitleaks)" "brew install gitleaks"
fi

echo ""
[ -n "$skipped" ] && printf "Non lancés (la CI les lance) :%b\n" "$skipped"
if [ -n "$failed" ]; then
  printf "En échec :%b\n" "$failed"
  exit 1
fi
echo "Tous les contrôles lancés passent."
