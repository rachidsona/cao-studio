"""Strict parsing, canonicalisation and validation of CAO Studio documents.

A document is the JSON description of a parametric part. It is shared with the
TypeScript editor. This module enforces the envelope (format, schema version,
units, feature list shape) for every schema version. Schema v2 additionally
validates parametric sketches (see ``sketch_validation``); other feature
fields are left to the frontend.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

from .sketch_validation import sketch_errors

DOCUMENT_FORMAT = "cao-studio"
SCHEMA_VERSION = 2  # current version, written by default_document()
LEGACY_SCHEMA_VERSION = 1
SUPPORTED_SCHEMA_VERSIONS = (LEGACY_SCHEMA_VERSION, SCHEMA_VERSION)
ALLOWED_UNITS = frozenset({"mm", "cm", "m", "in"})
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024  # canonical UTF-8 size
MAX_DEPTH = 64  # nesting depth of dicts/lists


class DocumentParseError(ValueError):
    """Raised when a payload is not strict JSON (NaN, Infinity, invalid UTF-8…)."""


def _reject_constant(name: str) -> Any:
    raise DocumentParseError(f"Valeur numérique non autorisée : {name}.")


def _parse_finite_float(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise DocumentParseError(f"Nombre hors limites : {text[:32]}.")
    return value


def parse_json_strict(raw: bytes | str) -> Any:
    """Parse JSON, rejecting NaN/Infinity and overflowing numbers like 1e999."""
    if isinstance(raw, bytes):
        try:
            raw = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise DocumentParseError("Le contenu n'est pas encodé en UTF-8.") from exc
    try:
        return json.loads(
            raw, parse_constant=_reject_constant, parse_float=_parse_finite_float
        )
    except DocumentParseError:
        raise
    except RecursionError as exc:
        raise DocumentParseError("JSON trop profondément imbriqué.") from exc
    except ValueError as exc:  # JSONDecodeError and int-conversion limits
        raise DocumentParseError(f"JSON invalide : {exc}") from exc


def canonical_json(doc: Any) -> str:
    """Canonical serialisation used for checksums and size accounting."""
    return json.dumps(
        doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


def compute_checksum(doc: Any) -> str:
    return hashlib.sha256(canonical_json(doc).encode("utf-8")).hexdigest()


def _structure_errors(doc: Any) -> list[str]:
    """Iteratively check depth, key types and number finiteness."""
    stack: list[tuple[Any, int]] = [(doc, 1)]
    while stack:
        node, depth = stack.pop()
        if depth > MAX_DEPTH:
            return [f"Le document est trop profondément imbriqué (max {MAX_DEPTH})."]
        if isinstance(node, dict):
            for key, value in node.items():
                if not isinstance(key, str):
                    return ["Toutes les clés d'objet doivent être des chaînes."]
                stack.append((value, depth + 1))
        elif isinstance(node, list):
            stack.extend((value, depth + 1) for value in node)
        elif isinstance(node, float):
            if not math.isfinite(node):
                return ["Les valeurs NaN et Infinity ne sont pas autorisées."]
        elif node is None or isinstance(node, (str, int, bool)):
            continue
        else:
            return [f"Type de valeur non sérialisable en JSON : {type(node).__name__}."]
    return []


def _features_errors(features: Any) -> list[str]:
    if not isinstance(features, list):
        return ["« features » doit être une liste."]
    errors: list[str] = []
    seen: set[str] = set()
    for index, feature in enumerate(features):
        where = f"features[{index}]"
        if not isinstance(feature, dict):
            errors.append(f"{where} doit être un objet.")
            continue
        feature_id = feature.get("id")
        if not isinstance(feature_id, str) or not feature_id:
            errors.append(f"{where}.id doit être une chaîne non vide.")
        elif feature_id in seen:
            errors.append(f"{where}.id « {feature_id} » est en double.")
        else:
            seen.add(feature_id)
        feature_type = feature.get("type")
        if not isinstance(feature_type, str) or not feature_type:
            errors.append(f"{where}.type doit être une chaîne non vide.")
    return errors


def _v2_feature_errors(features: list) -> list[str]:
    """Schema v2 specific checks; only sketches are validated in depth."""
    errors: list[str] = []
    for index, feature in enumerate(features):
        if isinstance(feature, dict) and feature.get("type") == "sketch":
            errors.extend(sketch_errors(index, feature))
    return errors


def validate_document(doc: Any) -> list[str]:
    """Return a list of French error messages; an empty list means valid."""
    if not isinstance(doc, dict):
        return ["Le document doit être un objet JSON."]

    structural = _structure_errors(doc)
    if structural:
        return structural

    errors: list[str] = []
    if doc.get("format") != DOCUMENT_FORMAT:
        errors.append(f"« format » doit valoir « {DOCUMENT_FORMAT} ».")

    schema_version = doc.get("schemaVersion")
    if type(schema_version) is not int or schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        allowed = " ou ".join(str(v) for v in SUPPORTED_SCHEMA_VERSIONS)
        errors.append(f"« schemaVersion » doit être l'entier {allowed}.")
        schema_version = None

    if doc.get("units") not in ALLOWED_UNITS:
        allowed = ", ".join(sorted(ALLOWED_UNITS))
        errors.append(f"« units » doit être l'une des valeurs : {allowed}.")

    if "features" not in doc:
        errors.append("« features » est obligatoire.")
    else:
        errors.extend(_features_errors(doc["features"]))
        if schema_version == SCHEMA_VERSION and isinstance(doc["features"], list):
            errors.extend(_v2_feature_errors(doc["features"]))

    if "parameters" in doc and not isinstance(doc["parameters"], dict):
        errors.append("« parameters » doit être un objet.")

    try:
        size = len(canonical_json(doc).encode("utf-8"))
    except (ValueError, TypeError, RecursionError):
        errors.append("Le document n'est pas sérialisable en JSON strict.")
    else:
        if size > MAX_DOCUMENT_BYTES:
            errors.append(
                f"Le document dépasse la taille maximale de "
                f"{MAX_DOCUMENT_BYTES // (1024 * 1024)} Mo."
            )
    return errors
