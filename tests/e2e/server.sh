#!/bin/sh
# Django server of the end-to-end tests: a fresh database of its own, the built editor (npm run build first).
set -e
PORT="$1"
PYTHON="${PYTHON:-.venv/bin/python}"
[ -x "$PYTHON" ] || PYTHON=python
mkdir -p .e2e
rm -f .e2e/db.sqlite3
export DJANGO_SQLITE_PATH=.e2e/db.sqlite3
# Each test makes its own account on /accounts/signup/, closed by default (config/settings.py, SIGNUP_OPEN).
export DJANGO_SIGNUP_OPEN=1
"$PYTHON" manage.py migrate --noinput >/dev/null
exec "$PYTHON" manage.py runserver "127.0.0.1:$PORT" --noreload
