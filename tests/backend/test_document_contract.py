"""Un seul contrat de document des deux côtés (audit d'architecture du 11/11/2026) : les documents de
tests/fixtures/documents sont acceptés par le serveur, et l'éditeur les ouvre (tests/frontend/document-contract.test.ts)."""
import json
from pathlib import Path

import pytest

from apps.projects.validation import validate_document

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "documents"


def test_there_are_shared_documents():
    assert list(FIXTURES.glob("*.json"))


@pytest.mark.parametrize("path", sorted(FIXTURES.glob("*.json")), ids=lambda p: p.name)
def test_the_server_accepts_the_shared_documents(path):
    assert validate_document(json.loads(path.read_text("utf-8"))) == []
