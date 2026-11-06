# CAD Code Review Checklist

Line-by-line checklist for `cad-code-review/SKILL.md`. Group by category.

## Tolerance & floating point
- [ ] No `==` / `!=` on float-derived geometric values.
- [ ] Every tolerance has a unit (mm/in/rad/deg) in name or comment.
- [ ] Tolerances scale-aware (relative to bbox) or justified as absolute.
- [ ] `acos`/`asin` arguments clamped to [−1, 1].
- [ ] Distance comparisons use squared distance vs eps² where a sqrt is avoidable.
- [ ] Angular comparisons via dot-product band, not reconstructed angles, where possible.
- [ ] No order-dependent float sums where the result is a verdict (use stable/exact).

## Units
- [ ] Import logs the assumed unit (esp. STL/OBJ/PLY).
- [ ] Single canonical internal unit; conversions happen once at boundaries.
- [ ] Thresholds compared against same-unit quantities.
- [ ] Bounding-box sanity check after import (catches 25.4× / 1000×).

## Representation correctness
- [ ] Mesh vs B-Rep is explicit; no exact claims from mesh data.
- [ ] Stored normals recomputed, not trusted (STL).
- [ ] Watertight/manifold enforced before volume/inside-outside/boolean.
- [ ] Valid-solid (not open shell) enforced before mass/volume on B-Rep.
- [ ] Tessellation tolerance recorded on B-Rep→mesh.

## Degeneracy & robustness
- [ ] Zero/near-zero-area triangles handled before normal computation.
- [ ] Coincident/duplicate vertices merged before topology checks.
- [ ] Parallel/tangent intersection guards present.
- [ ] Boundary/on-surface behavior defined for classification predicates.
- [ ] Robust/exact predicates used where sign decides topology.

## Performance
- [ ] No all-pairs O(n²) over large geometry without a spatial index.
- [ ] Spatial structure built once, not per query; refit/rebuilt on transform.
- [ ] Large files streamed/chunked, not fully materialized when avoidable.
- [ ] Accelerated path cross-checked against brute force on fixtures.

## Error reporting & API
- [ ] Validators return structured results: verdict + measured value + threshold + locations.
- [ ] Failures include offending entity IDs / coordinates (traceable in a viewer).
- [ ] Exceptions distinguish "invalid input" from "internal error".
- [ ] Tolerances and units are parameters, not buried constants.

## Tests
- [ ] Invalid-geometry fixtures exist (non-manifold, open, degenerate, self-intersecting).
- [ ] Boundary-tolerance cases (just inside / just outside threshold).
- [ ] Golden-file regression for known-good outputs.
- [ ] Performance test on a representative large model.

## Quick severity guide
| Symptom | Severity |
|---|---|
| Wrong engineering number returned | CRITICAL |
| Unenforced watertight/valid precondition | CRITICAL |
| Float `==` deciding a verdict | CRITICAL |
| Missing units on import | WARN→CRIT if compared to thresholds |
| O(n²) not yet a bottleneck | INFO/WARN |
| Bare-boolean validator output | WARN |
