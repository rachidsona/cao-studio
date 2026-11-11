import copy
import hashlib
import json

import pytest

from apps.projects.documents import default_document
from apps.projects.validation import (
    MAX_DOCUMENT_BYTES,
    DocumentParseError,
    canonical_json,
    compute_checksum,
    parse_json_strict,
    validate_document,
)


def test_default_document_is_valid_and_matches_reference():
    doc = default_document()
    assert validate_document(doc) == []
    assert doc["format"] == "cao-studio"
    assert doc["schemaVersion"] == 2
    assert doc["units"] == "cm"
    assert [f["id"] for f in doc["features"]] == ["sk1", "ex1", "h1"]
    sketch = doc["features"][0]
    assert "entities" not in sketch
    assert sketch["points"][0] == {"id": "p1", "x": -40, "y": -25}
    assert sketch["curves"][0] == {"id": "l1", "kind": "line", "p1": "p1", "p2": "p2"}
    assert sketch["constraints"][-1] == {
        "id": "d2", "kind": "length", "line": "l2", "value": 50, "label": "Largeur",
    }
    assert doc["features"][2]["name"] == "Perçage 1"
    assert doc["features"][2]["depth"] == "through"


def test_default_document_returns_independent_copies():
    a = default_document()
    a["features"].clear()
    assert len(default_document()["features"]) == 3


@pytest.mark.parametrize("units", ["mm", "cm", "m", "in"])
def test_all_units_accepted(units):
    doc = default_document()
    doc["units"] = units
    assert validate_document(doc) == []


def test_not_a_dict():
    assert validate_document([1, 2]) == ["Le document doit être un objet JSON."]


def test_wrong_format():
    doc = default_document()
    doc["format"] = "autre"
    errors = validate_document(doc)
    assert len(errors) == 1 and "format" in errors[0]


@pytest.mark.parametrize("value", [0, 3, -1, "1", "2", 1.0, 2.0, True, None])
def test_wrong_schema_version(value):
    doc = default_document()
    doc["schemaVersion"] = value
    assert any("schemaVersion" in e for e in validate_document(doc))


def test_wrong_units():
    doc = default_document()
    doc["units"] = "ft"
    assert any("units" in e for e in validate_document(doc))


def test_missing_features():
    doc = default_document()
    del doc["features"]
    assert any("features" in e for e in validate_document(doc))


def test_features_must_be_list_of_dicts_with_id_and_type():
    doc = default_document()
    doc["features"] = [{"id": "a"}, "x", {"type": "sketch"}, {"id": 3, "type": "sketch"}]
    errors = validate_document(doc)
    assert any("features[0].type" in e for e in errors)
    assert any("features[1]" in e for e in errors)
    assert any("features[2].id" in e for e in errors)
    assert any("features[3].id" in e for e in errors)


def test_duplicate_feature_ids():
    doc = default_document()
    doc["features"][1]["id"] = "sk1"
    errors = validate_document(doc)
    assert len(errors) == 1 and "double" in errors[0]


def test_parameters_must_be_dict():
    doc = default_document()
    doc["parameters"] = []
    assert any("parameters" in e for e in validate_document(doc))


def test_parameters_optional():
    doc = default_document()
    del doc["parameters"]
    assert validate_document(doc) == []


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_numbers_rejected(value):
    doc = default_document()
    doc["parameters"] = {"p": value}
    assert any("NaN" in e for e in validate_document(doc))


@pytest.mark.parametrize("text", ['{"a": NaN}', '{"a": Infinity}', '{"a": -Infinity}', '{"a": 1e999}'])
def test_strict_parser_rejects_nan_and_infinity(text):
    with pytest.raises(DocumentParseError):
        parse_json_strict(text)


def test_strict_parser_rejects_invalid_utf8_and_syntax():
    with pytest.raises(DocumentParseError):
        parse_json_strict(b"\xff\xfe{}")
    with pytest.raises(DocumentParseError):
        parse_json_strict("{not json")


def test_strict_parser_keeps_floats():
    assert parse_json_strict('{"w": 80.25}') == {"w": 80.25}


def test_too_large_document():
    doc = default_document()
    doc["parameters"] = {"blob": "x" * (MAX_DOCUMENT_BYTES + 1)}
    errors = validate_document(doc)
    assert any("taille maximale" in e for e in errors)


def test_too_deep_document():
    doc = default_document()
    nested: dict = {}
    cursor = nested
    for _ in range(100):
        cursor["n"] = {}
        cursor = cursor["n"]
    doc["parameters"] = nested
    assert any("imbriqué" in e for e in validate_document(doc))


def test_checksum_is_sha256_of_canonical_json():
    doc = default_document()
    expected = hashlib.sha256(
        json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    assert compute_checksum(doc) == expected
    assert len(expected) == 64


def test_checksum_independent_of_key_order():
    doc = default_document()
    reordered = dict(reversed(list(copy.deepcopy(doc).items())))
    assert compute_checksum(doc) == compute_checksum(reordered)
    assert canonical_json(doc) == canonical_json(reordered)


def _with_variants(*variants):
    doc = default_document()
    doc["variants"] = list(variants)
    return doc


def _variant(**fields):
    snapshot = default_document()
    return {"id": "v1", "name": "Chêne", "total": 1250.5, "parts": 12, "image": "data:image/jpeg;base64,/9j/4AAQ", "doc": snapshot, **fields}


def test_variants_kept_by_the_editor_are_valid():
    assert validate_document(_with_variants(_variant(), _variant(id="v2", name="Noyer", total=None, image=""))) == []


@pytest.mark.parametrize(
    ("variants", "expected"),
    [
        ("pas une liste", "« variants » doit être une liste"),
        ([_variant() for _ in range(7)], "Pas plus de 6 variantes"),
        ([_variant(image="https://exemple.net/pixel.png")], "data URL"),
        ([_variant(image="data:image/svg+xml;base64,PHN2Zz4=")], "data URL"),
        ([_variant(total="beaucoup")], "total"),
        ([_variant(name=3)], "« name »"),
        ([_variant(doc="rien")], "doc doit être un document"),
        ([_variant(doc={**default_document(), "features": "aucune"})], "variants[0].doc : « features » doit être une liste"),
        ([_variant(doc={**default_document(), "format": "autre"})], "variants[0].doc : « format »"),
        ([_variant(doc={**default_document(), "variants": []})], "ne peut pas contenir d'autres variantes"),
    ],
)
def test_variants_saved_by_hand_are_checked_on_the_server(variants, expected):
    """Audit of 10/11/2026, M4: a picture from elsewhere, a variant that would not open, variants without end."""
    errors = validate_document(_with_variants(*variants) if isinstance(variants, list) else {**default_document(), "variants": variants})
    assert any(expected in message for message in errors), errors


def test_saving_a_project_with_a_variant_from_elsewhere_is_refused(client_logged, project, api):
    url = f"/api/projects/{project.id}/"
    bad = api.put(client_logged, url, {"document": _with_variants(_variant(image="https://exemple.net/pixel.png")), "base_version": 1})
    assert bad.status_code == 400 and "data URL" in bad.content.decode("utf-8")
    good = api.put(client_logged, url, {"document": _with_variants(_variant()), "base_version": 1})
    assert good.status_code == 200, good.content
