import copy
import json

import pytest

from apps.projects.documents import default_document
from apps.projects.sketch_validation import (
    MAX_CONSTRAINTS,
    MAX_CURVES,
    MAX_ERRORS_PER_SKETCH,
    MAX_POINTS,
)
from apps.projects.validation import compute_checksum, parse_json_strict, validate_document

REFERENCE_V2 = json.loads("""
{"format":"cao-studio","schemaVersion":2,"units":"cm","parameters":{},
 "features":[
  {"id":"sk1","type":"sketch","name":"Esquisse 1","plane":"XY","offset":0,
   "points":[{"id":"p1","x":-40,"y":-25},{"id":"p2","x":40,"y":-25},{"id":"p3","x":40,"y":25},{"id":"p4","x":-40,"y":25}],
   "curves":[{"id":"l1","kind":"line","p1":"p1","p2":"p2"},{"id":"l2","kind":"line","p1":"p2","p2":"p3"},{"id":"l3","kind":"line","p1":"p3","p2":"p4"},{"id":"l4","kind":"line","p1":"p4","p2":"p1"}],
   "constraints":[{"id":"c1","kind":"horizontal","line":"l1"},{"id":"c2","kind":"horizontal","line":"l3"},{"id":"c3","kind":"vertical","line":"l2"},{"id":"c4","kind":"vertical","line":"l4"},{"id":"c5","kind":"symmetric","a":"p1","b":"p3","axis":"origin"},{"id":"d1","kind":"length","line":"l1","value":80,"label":"Longueur"},{"id":"d2","kind":"length","line":"l2","value":50,"label":"Largeur"}]},
  {"id":"ex1","type":"extrude","name":"Extrusion 1","sketch":"sk1","distance":10,"operation":"new"},
  {"id":"h1","type":"hole","name":"Perçage 1","target":"ex1","x":0,"y":0,"diameter":10,"depth":"through"}
 ]}
""")

LEGACY_V1 = {
    "format": "cao-studio",
    "schemaVersion": 1,
    "units": "mm",
    "parameters": {},
    "features": [
        {
            "id": "sk1", "type": "sketch", "name": "Esquisse 1", "plane": "XY", "offset": 0,
            "entities": [{"id": "r1", "kind": "rectangle", "cx": 0, "cy": 0, "width": 80, "height": 50}],
        },
        {"id": "ex1", "type": "extrude", "name": "Extrusion 1", "sketch": "sk1", "distance": 10, "operation": "new"},
    ],
}


def sketch_of(doc):
    return doc["features"][0]


def errors_for(mutate):
    doc = default_document()
    mutate(sketch_of(doc))
    return validate_document(doc)


# --- default / legacy documents ----------------------------------------------------


def test_default_document_is_exact_v2_reference():
    doc = default_document()
    assert doc == REFERENCE_V2
    assert validate_document(doc) == []
    assert compute_checksum(doc) == compute_checksum(copy.deepcopy(REFERENCE_V2))


def test_default_document_copies_are_deep():
    a = default_document()
    sketch_of(a)["points"][0]["x"] = 999
    sketch_of(a)["constraints"].clear()
    assert default_document() == REFERENCE_V2


def test_v1_legacy_document_still_accepted():
    assert validate_document(copy.deepcopy(LEGACY_V1)) == []


def test_v1_does_not_apply_v2_sketch_rules():
    doc = copy.deepcopy(LEGACY_V1)
    sketch_of(doc)["plane"] = "AB"  # never checked in v1
    assert validate_document(doc) == []


def test_v2_rejects_legacy_entities_sketch():
    doc = copy.deepcopy(LEGACY_V1)
    doc["schemaVersion"] = 2
    errors = validate_document(doc)
    assert any("entities" in e for e in errors)
    assert any("« points » doit être une liste" in e for e in errors)


@pytest.mark.parametrize("version", [0, 3, 99, "2", 2.0, False])
def test_unknown_schema_version_rejected(version):
    doc = default_document()
    doc["schemaVersion"] = version
    errors = validate_document(doc)
    assert errors == ["« schemaVersion » doit être l'entier 1 ou 2."]


def test_full_v2_sketch_with_all_kinds_is_valid():
    doc = default_document()
    sk = sketch_of(doc)
    sk["plane"] = "YZ"
    sk["offset"] = -2.5
    sk["points"] += [
        {"id": "pc", "x": 0, "y": 0},
        {"id": "ps", "x": 5, "y": 0},
        {"id": "pe", "x": 0, "y": 5},
    ]
    sk["curves"] += [
        {"id": "ci", "kind": "circle", "center": "origin", "radius": 3.5, "construction": True},
        {"id": "ar", "kind": "arc", "center": "pc", "start": "ps", "end": "pe",
         "radius": 5, "startAngle": 0, "endAngle": 1.5707963},
    ]
    sk["constraints"] += [
        {"id": "k1", "kind": "coincident", "a": "pc", "b": "origin"},
        {"id": "k2", "kind": "parallel", "a": "l1", "b": "axisX"},
        {"id": "k3", "kind": "perpendicular", "a": "l2", "b": "axisX"},
        {"id": "k4", "kind": "tangent", "a": "ar", "b": "l1"},
        {"id": "k5", "kind": "equal", "a": "l1", "b": "l3"},
        {"id": "k6", "kind": "concentric", "a": "ci", "b": "ar"},
        {"id": "k7", "kind": "fix", "point": "ps", "x": 5, "y": 0},
        {"id": "k8", "kind": "pointOnCurve", "point": "pe", "curve": "ci"},
        {"id": "k9", "kind": "midpoint", "point": "pc", "line": "axisY"},
        {"id": "m1", "kind": "distance", "a": "p1", "b": "p2", "value": 80, "driving": True},
        {"id": "m2", "kind": "distanceX", "a": "p1", "b": "origin", "value": -40},
        {"id": "m3", "kind": "distanceY", "a": "p1", "b": "origin", "value": 0},
        {"id": "m4", "kind": "pointLineDistance", "point": "pc", "line": "l1", "value": 25},
        {"id": "m5", "kind": "angle", "a": "l1", "b": "l2", "value": -90, "label": "α"},
        {"id": "m6", "kind": "radius", "curve": "ar", "value": 5, "driving": False},
        {"id": "m7", "kind": "diameter", "curve": "ci", "value": 7},
    ]
    assert validate_document(doc) == []


# --- references -------------------------------------------------------------------


def test_missing_point_reference():
    errors = errors_for(lambda sk: sk["curves"][0].update(p2="p9"))
    assert errors == ["Opération 1 (sk1) : point « p9 » introuvable."]


def test_missing_line_and_free_references():
    def mutate(sk):
        sk["constraints"][0]["line"] = "l9"
        sk["constraints"][4]["axis"] = "zz"
    errors = errors_for(mutate)
    assert errors == [
        "Opération 1 (sk1) : ligne « l9 » introuvable.",
        "Opération 1 (sk1) : élément « zz » introuvable.",
    ]


def test_constraint_cannot_reference_a_constraint():
    errors = errors_for(lambda sk: sk["constraints"][4].update(axis="c1"))
    assert errors == ["Opération 1 (sk1) : élément « c1 » introuvable."]


@pytest.mark.parametrize("mutation, field", [
    (lambda sk: sk["curves"][0].update(p1="l2"), "p1"),        # curve used as point
    (lambda sk: sk["curves"][0].update(p1="axisX"), "p1"),     # axis used as point
    (lambda sk: sk["constraints"][0].update(line="p1"), "line"),  # point used as line
    (lambda sk: sk["constraints"][0].update(line="origin"), "line"),
])
def test_reference_of_wrong_category(mutation, field):
    errors = errors_for(mutation)
    assert len(errors) == 1
    assert f"« {field} » doit désigner" in errors[0]


def test_line_field_rejects_circle():
    def mutate(sk):
        sk["curves"].append({"id": "ci", "kind": "circle", "center": "origin", "radius": 4})
        sk["constraints"][0]["line"] = "ci"
    errors = errors_for(mutate)
    assert errors == [
        "Opération 1 (sk1) : contrainte « c1 » : « line » doit désigner une ligne "
        "; « ci » ne convient pas."
    ]


def test_reference_must_be_string():
    errors = errors_for(lambda sk: sk["curves"][0].pop("p1"))
    assert errors == [
        "Opération 1 (sk1) : courbe « l1 » : « p1 » doit être un identifiant (chaîne non vide)."
    ]


# --- identifiers ---------------------------------------------------------------------


@pytest.mark.parametrize("reserved", ["origin", "axisX", "axisY"])
def test_reserved_id_cannot_be_used_as_entity_id(reserved):
    errors = errors_for(lambda sk: sk["points"].append({"id": reserved, "x": 1, "y": 1}))
    assert errors == [f"Opération 1 (sk1) : l'identifiant « {reserved} » est réservé."]


def test_duplicate_id_inside_sketch_across_lists():
    def mutate(sk):
        sk["constraints"][0]["id"] = "l1"  # clashes with a curve id
        sk["points"].append({"id": "p1", "x": 0, "y": 0})
    errors = errors_for(mutate)
    assert "Opération 1 (sk1) : l'identifiant « p1 » est en double." in errors
    assert "Opération 1 (sk1) : l'identifiant « l1 » est en double." in errors


def test_same_entity_ids_allowed_in_different_sketches():
    doc = default_document()
    second = copy.deepcopy(sketch_of(doc))
    second["id"] = "sk2"
    doc["features"].append(second)
    assert validate_document(doc) == []


def test_item_must_be_object_with_id():
    def mutate(sk):
        sk["points"].append("p5")
        sk["curves"].append({"kind": "line", "p1": "p1", "p2": "p2"})
    errors = errors_for(mutate)
    assert "Opération 1 (sk1) : points[4] doit être un objet." in errors
    assert "Opération 1 (sk1) : curves[4].id doit être une chaîne non vide." in errors


# --- values ----------------------------------------------------------------------------


@pytest.mark.parametrize("value", [0, -80, "80", None, True])
def test_length_dimension_value_must_be_positive(value):
    errors = errors_for(lambda sk: sk["constraints"][5].update(value=value))
    assert errors == [
        "Opération 1 (sk1) : contrainte « d1 » : « value » doit être "
        "un nombre fini strictement positif."
    ]


@pytest.mark.parametrize("kind, refs", [
    ("distance", {"a": "p1", "b": "p2"}),
    ("pointLineDistance", {"point": "p3", "line": "l1"}),
    ("radius", {"curve": "l1"}),
    ("diameter", {"curve": "l1"}),
])
def test_positive_dimensions_reject_zero(kind, refs):
    errors = errors_for(lambda sk: sk["constraints"].append({"id": "x1", "kind": kind, "value": 0, **refs}))
    assert len(errors) == 1 and "strictement positif" in errors[0]


@pytest.mark.parametrize("kind", ["distanceX", "distanceY", "angle"])
def test_signed_dimensions_accept_zero_and_negative(kind):
    def mutate(sk):
        sk["constraints"].append({"id": "x1", "kind": kind, "a": "p1", "b": "p2", "value": 0})
        sk["constraints"].append({"id": "x2", "kind": kind, "a": "l1", "b": "l2", "value": -12.5})
    assert errors_for(mutate) == []
    errors = errors_for(lambda sk: sk["constraints"].append({"id": "x1", "kind": kind, "a": "p1", "b": "p2"}))
    assert errors == [f"Opération 1 (sk1) : contrainte « x1 » : « value » doit être un nombre fini."]


def test_dimension_label_and_driving():
    def mutate(sk):
        sk["constraints"][5]["label"] = "x" * 81
        sk["constraints"][6]["driving"] = "oui"
    errors = errors_for(mutate)
    assert len(errors) == 2
    assert "« label »" in errors[0] and "80 caractères" in errors[0]
    assert "« driving » doit être un booléen" in errors[1]
    assert errors_for(lambda sk: sk["constraints"][5].update(label="x" * 80)) == []


@pytest.mark.parametrize("radius", [0, -1, None, "3"])
def test_circle_radius_must_be_positive(radius):
    errors = errors_for(lambda sk: sk["curves"].append(
        {"id": "ci", "kind": "circle", "center": "origin", "radius": radius}
    ))
    assert errors == [
        "Opération 1 (sk1) : courbe « ci » : « radius » doit être un nombre fini strictement positif."
    ]


def test_arc_requires_points_radius_and_angles():
    errors = errors_for(lambda sk: sk["curves"].append(
        {"id": "ar", "kind": "arc", "center": "origin", "start": "p1", "end": "nope", "radius": 0}
    ))
    assert "Opération 1 (sk1) : point « nope » introuvable." in errors
    assert any("« radius »" in e for e in errors)
    assert any("« startAngle »" in e for e in errors)
    assert any("« endAngle »" in e for e in errors)


def test_point_coordinates_must_be_finite_numbers():
    def mutate(sk):
        sk["points"][0]["x"] = "0"
        del sk["points"][1]["y"]
        sk["points"][2]["x"] = 10 ** 400  # overflows a float
    errors = errors_for(mutate)
    assert errors == [
        "Opération 1 (sk1) : point « p1 » : « x » doit être un nombre fini.",
        "Opération 1 (sk1) : point « p2 » : « y » doit être un nombre fini.",
        "Opération 1 (sk1) : point « p3 » : « x » doit être un nombre fini.",
    ]


def test_fix_requires_finite_coordinates():
    errors = errors_for(lambda sk: sk["constraints"].append({"id": "f1", "kind": "fix", "point": "p1", "x": 1}))
    assert errors == ["Opération 1 (sk1) : contrainte « f1 » : « y » doit être un nombre fini."]


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_nan_free_check_still_works_in_v2_sketch(value):
    errors = errors_for(lambda sk: sk["points"][0].update(x=value))
    assert errors == ["Les valeurs NaN et Infinity ne sont pas autorisées."]


def test_strict_parser_rejects_nan_in_v2_document():
    raw = json.dumps(default_document()).replace('"x": -40', '"x": NaN', 1)
    assert "NaN" in raw
    with pytest.raises(ValueError):
        parse_json_strict(raw)


def test_unknown_constraint_kind():
    errors = errors_for(lambda sk: sk["constraints"].append({"id": "z1", "kind": "colinear", "a": "l1", "b": "l3"}))
    assert errors == ["Opération 1 (sk1) : contrainte « z1 » : type « colinear » inconnu."]


def test_unknown_curve_kind():
    errors = errors_for(lambda sk: sk["curves"].append({"id": "sp", "kind": "spline", "points": ["p1", "p2"]}))
    assert errors == [
        "Opération 1 (sk1) : courbe « sp » : type « spline » inconnu (attendu : line, circle, arc)."
    ]


def test_construction_flag_must_be_bool():
    errors = errors_for(lambda sk: sk["curves"][0].update(construction=1))
    assert errors == ["Opération 1 (sk1) : courbe « l1 » : « construction » doit être un booléen."]


# --- sketch envelope ------------------------------------------------------------------------


@pytest.mark.parametrize("plane", ["xy", "XYZ", None, 1])
def test_plane_must_be_known(plane):
    errors = errors_for(lambda sk: sk.update(plane=plane))
    assert errors == ["Opération 1 (sk1) : « plane » doit être l'une des valeurs : XY, XZ, YZ."]


@pytest.mark.parametrize("offset", ["0", None, True])
def test_offset_must_be_finite_number(offset):
    errors = errors_for(lambda sk: sk.update(offset=offset))
    assert errors == ["Opération 1 (sk1) : « offset » doit être un nombre fini."]


@pytest.mark.parametrize("name", ["points", "curves", "constraints"])
def test_lists_are_required(name):
    errors = errors_for(lambda sk: sk.pop(name))
    assert errors == [f"Opération 1 (sk1) : « {name} » doit être une liste."]


@pytest.mark.parametrize("name, limit", [("points", MAX_POINTS), ("curves", MAX_CURVES), ("constraints", MAX_CONSTRAINTS)])
def test_list_size_limits(name, limit):
    errors = errors_for(lambda sk: sk.update({name: [{}] * (limit + 1)}))
    assert errors == [f"Opération 1 (sk1) : « {name} » contient trop d'éléments (max {limit})."]


def test_errors_are_capped_per_sketch():
    errors = errors_for(lambda sk: sk.update(points=[{"id": f"q{i}"} for i in range(200)]))
    assert len(errors) == MAX_ERRORS_PER_SKETCH + 1
    assert errors[-1] == "Opération 1 (sk1) : trop d'erreurs, liste tronquée."


def test_feature_position_is_one_based_and_other_types_untouched():
    doc = default_document()
    doc["features"].insert(0, {"id": "x0", "type": "chamfer", "anything": [1, 2]})
    sketch = doc["features"][1]
    sketch["curves"][0]["p2"] = "p9"
    assert validate_document(doc) == ["Opération 2 (sk1) : point « p9 » introuvable."]
