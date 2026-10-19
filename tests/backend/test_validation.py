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
    assert doc["schemaVersion"] == 1
    assert doc["units"] == "mm"
    assert [f["id"] for f in doc["features"]] == ["sk1", "ex1", "h1"]
    assert doc["features"][0]["entities"][0] == {
        "id": "r1", "kind": "rectangle", "cx": 0, "cy": 0, "width": 80, "height": 50,
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


@pytest.mark.parametrize("value", [2, "1", 1.0, True, None])
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
