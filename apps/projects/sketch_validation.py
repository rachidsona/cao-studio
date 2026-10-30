"""Validation of parametric sketches (document schema v2).

A v2 sketch holds ``points``, ``curves`` and ``constraints``. This module
checks their shape, the uniqueness of their identifiers and that every
reference names an entity of a plausible category. It does not solve the
constraint system: that is the editor's job.
"""
from __future__ import annotations

import math
from typing import Any

ALLOWED_PLANES = frozenset({"XY", "XZ", "YZ"})
MAX_POINTS = 5000
MAX_CURVES = 5000
MAX_CONSTRAINTS = 10000
MAX_LABEL_LENGTH = 80
MAX_ERRORS_PER_SKETCH = 50

RESERVED_POINTS = frozenset({"origin"})
RESERVED_LINES = frozenset({"axisX", "axisY"})
RESERVED_IDS = RESERVED_POINTS | RESERVED_LINES

# Reference field categories.
POINT, LINE, CURVE, ANY = "point", "line", "curve", "any"

# Curve kind -> reference fields (all point references).
CURVE_POINT_FIELDS: dict[str, tuple[str, ...]] = {
    "line": ("p1", "p2"),
    "circle": ("center",),
    "arc": ("center", "start", "end"),
}

GEOMETRIC_CONSTRAINTS: dict[str, tuple[tuple[str, str], ...]] = {
    "coincident": (("a", ANY), ("b", ANY)),
    "horizontal": (("line", LINE),),
    "vertical": (("line", LINE),),
    "parallel": (("a", ANY), ("b", ANY)),
    "perpendicular": (("a", ANY), ("b", ANY)),
    "tangent": (("a", ANY), ("b", ANY)),
    "equal": (("a", ANY), ("b", ANY)),
    "symmetric": (("a", ANY), ("b", ANY), ("axis", ANY)),
    "concentric": (("a", ANY), ("b", ANY)),
    "fix": (("point", POINT),),
    "pointOnCurve": (("point", POINT), ("curve", CURVE)),
    "midpoint": (("point", POINT), ("line", LINE)),
}

DIMENSION_CONSTRAINTS: dict[str, tuple[tuple[str, str], ...]] = {
    "distance": (("a", ANY), ("b", ANY)),
    "distanceX": (("a", ANY), ("b", ANY)),
    "distanceY": (("a", ANY), ("b", ANY)),
    "pointLineDistance": (("point", POINT), ("line", LINE)),
    "length": (("line", LINE),),
    "angle": (("a", ANY), ("b", ANY)),
    "radius": (("curve", CURVE),),
    "diameter": (("curve", CURVE),),
}

POSITIVE_DIMENSIONS = frozenset(
    {"distance", "length", "radius", "diameter", "pointLineDistance"}
)

_CATEGORY_LABELS = {POINT: "point", LINE: "ligne", CURVE: "courbe", ANY: "élément"}
_CATEGORY_EXPECTED = {
    POINT: "un point",
    LINE: "une ligne",
    CURVE: "une courbe",
    ANY: "un point ou une courbe",
}


class _TooManyErrors(Exception):
    pass


def is_finite_number(value: Any) -> bool:
    """True for int/float (not bool) values representable as a finite float."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:  # int too large for a float
        return False


class _SketchChecker:
    def __init__(self, prefix: str) -> None:
        self.prefix = prefix
        self.errors: list[str] = []
        self.points: set[str] = set()
        self.curves: dict[str, str | None] = {}  # id -> kind (None if invalid)
        self.seen_ids: set[str] = set()

    # -- helpers ---------------------------------------------------------------

    def error(self, message: str) -> None:
        if len(self.errors) >= MAX_ERRORS_PER_SKETCH:
            self.errors.append(f"{self.prefix}trop d'erreurs, liste tronquée.")
            raise _TooManyErrors
        self.errors.append(f"{self.prefix}{message}")

    def register_id(self, item: Any, where: str) -> str | None:
        """Validate ``item`` is an object with a fresh, non-reserved id."""
        if not isinstance(item, dict):
            self.error(f"{where} doit être un objet.")
            return None
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id:
            self.error(f"{where}.id doit être une chaîne non vide.")
            return None
        if item_id in RESERVED_IDS:
            self.error(f"l'identifiant « {item_id} » est réservé.")
            return None
        if item_id in self.seen_ids:
            self.error(f"l'identifiant « {item_id} » est en double.")
            return None
        self.seen_ids.add(item_id)
        return item_id

    def check_number(self, owner: str, item: dict, field: str, *, positive: bool = False) -> None:
        value = item.get(field)
        if not is_finite_number(value) or (positive and value <= 0):
            qualifier = "un nombre fini strictement positif" if positive else "un nombre fini"
            self.error(f"{owner} : « {field} » doit être {qualifier}.")

    def check_reference(self, owner: str, item: dict, field: str, category: str) -> None:
        ref = item.get(field)
        if not isinstance(ref, str) or not ref:
            self.error(f"{owner} : « {field} » doit être un identifiant (chaîne non vide).")
            return
        is_point = ref in self.points or ref in RESERVED_POINTS
        is_line = ref in RESERVED_LINES or self.curves.get(ref) == "line"
        is_curve = ref in self.curves or ref in RESERVED_LINES
        if not (is_point or is_curve):
            self.error(f"{_CATEGORY_LABELS[category]} « {ref} » introuvable.")
            return
        ok = {
            POINT: is_point,
            LINE: is_line,
            CURVE: is_curve,
            ANY: True,
        }[category]
        if not ok:
            self.error(
                f"{owner} : « {field} » doit désigner {_CATEGORY_EXPECTED[category]} "
                f"; « {ref} » ne convient pas."
            )

    # -- passes --------------------------------------------------------------

    def register_all(self, points: list, curves: list, constraints: list) -> tuple[list, list, list]:
        """First pass: collect ids. Returns the (index, id, item) of valid items."""
        valid_points, valid_curves, valid_constraints = [], [], []
        for index, item in enumerate(points):
            item_id = self.register_id(item, f"points[{index}]")
            if item_id is not None:
                self.points.add(item_id)
                valid_points.append((item_id, item))
        for index, item in enumerate(curves):
            item_id = self.register_id(item, f"curves[{index}]")
            if item_id is not None:
                kind = item.get("kind")
                self.curves[item_id] = kind if kind in CURVE_POINT_FIELDS else None
                valid_curves.append((item_id, item))
        for index, item in enumerate(constraints):
            item_id = self.register_id(item, f"constraints[{index}]")
            if item_id is not None:
                valid_constraints.append((item_id, item))
        return valid_points, valid_curves, valid_constraints

    def check_point(self, point_id: str, point: dict) -> None:
        owner = f"point « {point_id} »"
        self.check_number(owner, point, "x")
        self.check_number(owner, point, "y")

    def check_curve(self, curve_id: str, curve: dict) -> None:
        owner = f"courbe « {curve_id} »"
        kind = curve.get("kind")
        if kind not in CURVE_POINT_FIELDS:
            allowed = ", ".join(CURVE_POINT_FIELDS)
            self.error(f"{owner} : type « {kind} » inconnu (attendu : {allowed}).")
            return
        if "construction" in curve and not isinstance(curve["construction"], bool):
            self.error(f"{owner} : « construction » doit être un booléen.")
        for field in CURVE_POINT_FIELDS[kind]:
            self.check_reference(owner, curve, field, POINT)
        if kind in ("circle", "arc"):
            self.check_number(owner, curve, "radius", positive=True)
        if kind == "arc":
            self.check_number(owner, curve, "startAngle")
            self.check_number(owner, curve, "endAngle")

    def check_constraint(self, constraint_id: str, constraint: dict) -> None:
        owner = f"contrainte « {constraint_id} »"
        kind = constraint.get("kind")
        if not isinstance(kind, str) or not kind:
            self.error(f"{owner} : « kind » doit être une chaîne non vide.")
            return
        if kind in GEOMETRIC_CONSTRAINTS:
            fields = GEOMETRIC_CONSTRAINTS[kind]
        elif kind in DIMENSION_CONSTRAINTS:
            fields = DIMENSION_CONSTRAINTS[kind]
        else:
            self.error(f"{owner} : type « {kind} » inconnu.")
            return
        for field, category in fields:
            self.check_reference(owner, constraint, field, category)
        if kind == "fix":
            self.check_number(owner, constraint, "x")
            self.check_number(owner, constraint, "y")
        if kind in DIMENSION_CONSTRAINTS:
            self.check_number(owner, constraint, "value", positive=kind in POSITIVE_DIMENSIONS)
            label = constraint.get("label")
            if "label" in constraint and (
                not isinstance(label, str) or len(label) > MAX_LABEL_LENGTH
            ):
                self.error(
                    f"{owner} : « label » doit être une chaîne de "
                    f"{MAX_LABEL_LENGTH} caractères au plus."
                )
            if "driving" in constraint and not isinstance(constraint["driving"], bool):
                self.error(f"{owner} : « driving » doit être un booléen.")

    def run(self, sketch: dict) -> None:
        if sketch.get("plane") not in ALLOWED_PLANES:
            allowed = ", ".join(sorted(ALLOWED_PLANES))
            self.error(f"« plane » doit être l'une des valeurs : {allowed}.")
        if not is_finite_number(sketch.get("offset")):
            self.error("« offset » doit être un nombre fini.")
        if "frame" in sketch:
            frame = sketch["frame"]

            def vec3(value: Any) -> bool:
                return isinstance(value, list) and len(value) == 3 and all(is_finite_number(v) for v in value)

            if not (
                isinstance(frame, dict)
                and vec3(frame.get("origin"))
                and vec3(frame.get("xDir"))
                and vec3(frame.get("normal"))
                and any(abs(v) > 1e-9 for v in frame["xDir"])
                and any(abs(v) > 1e-9 for v in frame["normal"])
            ):
                self.error("« frame » doit donner origin, xDir et normal (trois nombres, directions non nulles).")
        if "texts" in sketch:
            texts = sketch["texts"]
            if not (
                isinstance(texts, list)
                and len(texts) <= 200
                and all(
                    isinstance(t, dict)
                    and isinstance(t.get("id"), str)
                    and isinstance(t.get("text"), str)
                    and len(t["text"]) <= 500
                    and is_finite_number(t.get("x"))
                    and is_finite_number(t.get("y"))
                    and is_finite_number(t.get("height"))
                    and t["height"] > 0
                    and ("angle" not in t or is_finite_number(t["angle"]))
                    for t in texts
                )
            ):
                self.error("« texts » doit être une liste de textes (id, text, x, y, height > 0, angle facultatif).")
        if "entities" in sketch:
            self.error(
                "« entities » n'est pas accepté en schéma 2 "
                "(utiliser points, curves et constraints)."
            )

        lists: dict[str, list] = {}
        limits = {"points": MAX_POINTS, "curves": MAX_CURVES, "constraints": MAX_CONSTRAINTS}
        for name, limit in limits.items():
            value = sketch.get(name)
            if not isinstance(value, list):
                self.error(f"« {name} » doit être une liste.")
            elif len(value) > limit:
                self.error(f"« {name} » contient trop d'éléments (max {limit}).")
            else:
                lists[name] = value
        if len(lists) != len(limits):
            return

        points, curves, constraints = self.register_all(
            lists["points"], lists["curves"], lists["constraints"]
        )
        for point_id, point in points:
            self.check_point(point_id, point)
        for curve_id, curve in curves:
            self.check_curve(curve_id, curve)
        for constraint_id, constraint in constraints:
            self.check_constraint(constraint_id, constraint)


def feature_prefix(index: int, feature: dict) -> str:
    feature_id = feature.get("id")
    if isinstance(feature_id, str) and feature_id:
        return f"Opération {index + 1} ({feature_id}) : "
    return f"Opération {index + 1} : "


def sketch_errors(index: int, sketch: dict) -> list[str]:
    """Return French error messages for the v2 sketch at position ``index``."""
    checker = _SketchChecker(feature_prefix(index, sketch))
    try:
        checker.run(sketch)
    except _TooManyErrors:
        pass
    return checker.errors
