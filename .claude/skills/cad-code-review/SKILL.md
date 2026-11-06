---
name: cad-code-review
description: Review CAD/geometry/CAE/CAM source code for domain-specific defects that generic code review misses. Use whenever reviewing code that computes geometry, validates parts, loads CAD files, or implements engineering checks. Catches float-equality bugs, hardcoded/missing tolerances, missing units, mesh/B-Rep confusion, unsafe geometry assumptions, missing invalid-geometry tests, O(n²) performance risks, and poor error reporting. Use this skill for any geometry, validator, mesh, or CAD code review request.
---

# CAD Code Review

Standard linters and reviewers don't know that `if (volume == expected)` is a bug, that a tolerance literal needs units, or that an STL has no scale. This skill is a CAD-aware review pass. Use `review-checklist.md` as the line-by-line checklist.

## When to use this skill

- Reviewing a pull request or file that does geometry math, validation, or CAD I/O.
- Auditing an inherited geometry codebase for latent robustness bugs.
- Before merging a new validator or import pipeline.

## Step-by-step workflow

1. **Classify the code.** Geometry algorithm? Validator? File I/O? Each has its own failure profile.
2. **Scan for the seven deadly CAD bugs** (below), in priority order.
3. **Check units and tolerance discipline** on every numeric comparison and threshold.
4. **Check representation assumptions** — does it assume watertight? manifold? exact? Are those preconditions enforced or just hoped for?
5. **Check error reporting** — does a failure produce locations/context, or a bare boolean/exception?
6. **Check test coverage** for invalid/degenerate geometry, not just the happy path.
7. **Produce findings** with severity, file:line, why it's wrong in CAD terms, and a concrete fix.

## The seven deadly CAD bugs (priority order)

1. **Float equality / bare tolerance** — `==` on geometry values, or `< 1e-6` with no unit and no scale relation.
2. **Missing units** — thresholds compared against unitless or wrong-unit data; no unit logged at import.
3. **Mesh/B-Rep confusion** — exact computation on a mesh, or topology assumptions on triangle soup.
4. **Unenforced preconditions** — volume/inside-outside on a possibly-non-watertight mesh; boolean on unvalidated bodies.
5. **Degenerate-input blindness** — no handling for zero-area triangles, coincident points, parallel/tangent cases.
6. **O(n²) on large geometry** — nested all-pairs loops with no spatial index for big meshes/assemblies.
7. **Opaque error reporting** — pass/fail with no offending entity, coordinate, or measured value → un-debuggable.

## Common mistakes to catch

- Tolerance constants hardcoded and reused across unit scales.
- `acos` / `asin` without clamping the argument to [−1, 1] (NaN on float drift).
- Normals computed from possibly-degenerate triangles.
- Trusting stored normals (STL facet normals) instead of recomputing.
- Inside/outside or volume without a watertight precondition.
- Silent unit assumptions on STL/OBJ import.
- AABB overlap reported as "interference" (false positives for rotated parts).
- Validators that return `True/False` instead of `{verdict, measured_value, threshold, locations}`.

## Output format

```
CAD Code Review — <file/PR>
[severity] file:line — <bug class>
  Why (CAD): <domain reason it's wrong>
  Fix: <concrete change, unit/tolerance-aware>
…
Summary: <N critical, N warn> ; Preconditions enforced? <Y/N> ; Test gaps: <…>
```
Severity: CRITICAL (wrong engineering result), WARN (fragile/edge-case), INFO (style/perf-not-yet-hot).

## Examples

**Before (flagged):**
```python
def is_flat(face_normals):
    ref = face_normals[0]
    return all(n == ref for n in face_normals)   # float == on vectors
```
**Findings:** CRITICAL float equality on normals; no tolerance; no unit/angle band; degenerate-normal risk.
**After:**
```python
def is_flat(face_normals, ang_tol_deg=0.5):
    cos_tol = math.cos(math.radians(ang_tol_deg))
    ref = normalize(face_normals[0])
    return all(abs(dot(normalize(n), ref)) >= cos_tol for n in face_normals)
```
Plus: guard zero-length normals; document that ang_tol is an angular tolerance, not a length.

**Before (flagged):**
```python
volume = mesh_volume(tris)            # no watertight check
assert volume == target_volume        # float ==
```
**After:** enforce `assert mesh.is_watertight and mesh.is_winding_consistent` before computing; compare with `almost_equal(volume, target, eps_rel=1e-4)` and report the measured value and the tessellation-error caveat.

## CAD-specific rules

- Flag every `==` on a float-derived geometric quantity.
- Every tolerance literal must have a unit and, ideally, a scale relation — flag bare magic numbers.
- Demand enforced preconditions (watertight/manifold/valid-solid) before dependent computations.
- Require validators to return structured, located, measured results — not bare booleans.
- Flag all-pairs loops over large geometry lacking a spatial index.

## Limitations / what this skill does NOT do

- It reviews code; it does not execute the geometry to confirm a bug at runtime (pair with cad-debugging-assistant / cad-test-generator).
- It can't infer units that aren't in the code or data — it flags their absence.
- It assumes you can see the code; for black-box kernels it reviews only the calling code.

See `review-checklist.md` for the full per-category checklist.
