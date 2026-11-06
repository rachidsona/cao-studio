# Tolerance & Units Reference (geometry-math)

Companion to `geometry-math/SKILL.md`. For GD&T/manufacturing tolerance see the `tolerance-gdt-review` skill — this file is about *numerical* tolerance in math code.

## Float comparison
```python
def almost_equal(a, b, eps_abs=1e-9, eps_rel=1e-7):
    # absolute guard for values near zero, relative for large magnitudes
    return abs(a - b) <= max(eps_abs, eps_rel * max(abs(a), abs(b)))
```
- Pure absolute eps breaks for large coordinates; pure relative eps breaks near zero. Use both.
- For points, compare squared distance against eps² to avoid a sqrt and a sign issue:
  `dist2(p, q) <= eps*eps`.

## Choosing eps by scale
| Model unit | Typical bbox | Suggested geometric eps |
|---|---|---|
| micron parts | ~10²–10³ µm | 1e-4 µm (relative ~1e-7) |
| mm parts | ~1–10³ mm | 1e-6 mm |
| meter assemblies | ~1–10² m | 1e-9 m |
Prefer `eps = max(floor, 1e-9 * bbox_diagonal)` so it tracks the model.

## Angle tolerance
- Compare directions by dot product, not by reconstructing angles, when possible: parallel if `|a·b| > 1 − eps_ang` (unit vectors); perpendicular if `|a·b| < eps_ang`.
- Convert a tolerance in degrees to a dot-product band: cos(θ_tol). E.g. 0.5° ⇒ cos(0.5°) ≈ 0.99996.

## Unit conversion factors (length)
| From → To | Multiply by |
|---|---|
| inch → mm | 25.4 |
| mm → inch | 1/25.4 ≈ 0.03937 |
| m → mm | 1000 |
| mm → m | 0.001 |
| foot → mm | 304.8 |
| mil (0.001 in) → mm | 0.0254 |

- A 25.4× or 1000× size surprise almost always means a unit bug, not a geometry bug — check this first.
- Convert once, at the import/export boundary; store the canonical unit; log the factor.

## Accumulation and determinism
- Long sums of float coordinates accumulate error; use Kahan summation or sort-by-magnitude for sensitive reductions.
- For results that decide topology/verdicts, prefer integer or exact arithmetic on the decisive comparison; keep float only for reporting.

## Common pitfalls
- Comparing distances with `==`.
- One eps reused across microns and meters in the same codebase.
- `acos` fed a value slightly > 1 (float drift) → NaN; clamp to [−1, 1].
- Mixing degrees and radians.
- Squaring eps but comparing against unsquared distance (or vice versa).
