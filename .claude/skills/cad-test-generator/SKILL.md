---
name: cad-test-generator
description: Generate tests for CAD/geometry/validation code — unit, regression, golden-file, boundary-tolerance, invalid-geometry, and performance tests, plus the geometry fixtures they need. Use whenever the user wants test coverage for a geometry function, validator, mesh/B-Rep pipeline, or CAD importer, or asks for fixtures/regression tests for geometry edge cases. Use this skill when writing or generating tests for geometry, validator, or mesh code, or when creating geometry fixtures.
---

# CAD Test Generator

CAD code fails on the inputs textbook tests never cover: the degenerate triangle, the just-out-of-tolerance gap, the non-manifold edge. This skill generates tests that target those, plus the fixtures to drive them. See `test-patterns.md` for fixture recipes and assertion patterns.

## When to use this skill

- Adding coverage to a geometry algorithm or validator.
- Building a regression suite around a CAD importer or mesh pipeline.
- Creating reusable geometry fixtures (valid and intentionally broken).

## The six test categories (generate all that apply)

1. **Unit** — single function, known input → known output, with explicit tolerance in the assertion.
2. **Boundary-tolerance** — inputs placed just inside, exactly on, and just outside the threshold. This is where validators silently flip.
3. **Invalid/degenerate geometry** — non-manifold, open shell, zero-area triangle, coincident vertices, self-intersection. Assert the code *detects/handles*, not crashes.
4. **Golden-file regression** — run on a fixed model, snapshot the structured output, diff future runs. Pin tolerance/units in the golden.
5. **Performance** — representative large model under a time/memory budget; guards against accidental O(n²).
6. **Visual-report** — render the issue overlay and assert it points at the right entity (ties to cad-3d-ui-review traceability).

## Step-by-step workflow

1. **Identify the contract** of the code under test: inputs, representation, units, tolerance, output shape.
2. **Generate fixtures** programmatically where possible (parametric cube, sphere, then deliberately corrupt them) so they're reproducible and small. Keep a known-good and a known-broken variant.
3. **For each threshold, build the boundary trio** (below, at, above) using the *actual* tolerance value.
4. **Assert with tolerance**, never exact float equality; for vectors compare component-wise within eps.
5. **Pin units and tolerances** in every test so a future tolerance change surfaces as a failing test, not a silent behavior change.
6. **Name tests by the case they cover** (`test_volume_rejects_open_shell`, not `test_volume_2`).

## Common mistakes to catch (in generated tests)

- Exact float equality in assertions → flaky tests. Use tolerance.
- Only happy-path fixtures → degenerate bugs ship.
- Boundary tests that don't use the real threshold value.
- Golden files with no units/tolerance recorded → meaningless when they drift.
- Fixtures committed as huge binaries instead of generated in-code or tiny.
- Performance tests with no budget assertion (they just run, never fail).

## Output format

Generate runnable test code in the user's framework (pytest, GoogleTest, etc.), plus a fixtures module. Structure:
```
fixtures.py / fixtures.cpp   # parametric valid + corrupted geometry generators
test_<unit>.py               # unit + boundary trio, tolerance-explicit
test_<invalid>.py            # degenerate/invalid detection
test_<regression>.py         # golden-file compare
test_<perf>.py               # large model under budget
```

## Examples

**Boundary trio for a wall-thickness validator (min = 1.0 mm, tol = 0.01 mm):**
```python
import pytest
from fixtures import plate_of_thickness   # generates a box of given thickness (mm)

MIN_MM, TOL_MM = 1.0, 0.01

@pytest.mark.parametrize("t_mm,expected", [
    (MIN_MM - 2*TOL_MM, "fail"),   # clearly below
    (MIN_MM,            "pass"),   # exactly at min (define inclusivity!)
    (MIN_MM + 2*TOL_MM, "pass"),   # clearly above
])
def test_wall_thickness_boundary(t_mm, expected):
    r = check_wall_thickness(plate_of_thickness(t_mm), min_mm=MIN_MM, tol_mm=TOL_MM)
    assert r.verdict == expected
    assert abs(r.measured_min_mm - t_mm) <= TOL_MM   # tolerance, not ==
```

**Invalid-geometry fixture test:**
```python
def test_volume_rejects_open_shell():
    mesh = unit_cube_mesh(); mesh.remove_one_face()   # now open
    with pytest.raises(PreconditionError):            # must refuse, not return garbage
        compute_volume(mesh)
```

## CAD-specific rules

- Every assertion carries an explicit tolerance and unit.
- Always include the boundary trio (below/at/above) for each threshold; define inclusivity at the boundary.
- Always include at least one invalid-geometry fixture per validator.
- Golden files record units + tolerance + the tessellation tolerance used.
- Prefer generated, tiny, reproducible fixtures over committed binaries.

## Limitations / what this skill does NOT do

- Generated tests verify the code's contract; they don't prove the *engineering* threshold is correct (that's a spec decision).
- It can't create a meaningful golden file without a trusted reference output to snapshot.
- Self-intersection/perf fixtures for huge models may need real data the generator can't synthesize faithfully.
- For B-Rep fixture generation (pythonOCC primitives, CadQuery → STEP), see `test-patterns.md` and `../cad-file-interop/cadquery-freecad-workflows.md`.

## Runnable examples note

The CI-verified runnable suites (`examples/runnable/python/mesh_validation/` and
`examples/runnable/python/brep_topology/`) use **pure Python** fixtures — no Trimesh,
no CGAL, no OpenCASCADE required. This makes the CI dependency-free by design.

The fixture recipes in `test-patterns.md` show **Trimesh-based** patterns that reflect
what you would actually write in a real project with Trimesh installed. These two
approaches produce the same test coverage; they use different APIs. When following
`test-patterns.md` in a Trimesh project, install Trimesh (`pip install trimesh`) and
use `trimesh.creation.box(...)` and `mesh.is_watertight`, `mesh.is_winding_consistent`,
`mesh.volume`, etc. When you need a zero-dependency CI environment, use the pure-Python
style shown in `examples/runnable/`.

See `test-patterns.md` for fixture generators and per-category assertion patterns.
