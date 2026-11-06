# Test Patterns & Fixture Recipes

Reference for `cad-test-generator/SKILL.md`.

## Fixture generators (reproducible, tiny)
Build valid primitives, then corrupt deliberately. Example with Trimesh:
```python
import trimesh, numpy as np

def unit_cube_mesh(size_mm=1.0):
    return trimesh.creation.box(extents=(size_mm,)*3)

def plate_of_thickness(t_mm, w_mm=10.0):
    return trimesh.creation.box(extents=(w_mm, w_mm, t_mm))

# --- corruptions ---
def make_open(mesh):                 # remove a face -> open shell / hole
    m = mesh.copy(); m.update_faces(np.arange(1, len(m.faces))); return m

def make_nonmanifold(mesh):          # duplicate a face along one edge -> >2 faces/edge
    m = mesh.copy(); m.faces = np.vstack([m.faces, m.faces[0]]); return m

def add_degenerate_triangle(mesh):   # zero-area triangle (collinear)
    v = len(mesh.vertices)
    m = mesh.copy()
    m.vertices = np.vstack([m.vertices, [[0,0,0],[1,0,0],[2,0,0]]])
    m.faces = np.vstack([m.faces, [v, v+1, v+2]])
    return m

def add_duplicate_vertices(mesh, eps=1e-9):  # coincident-but-distinct
    m = mesh.copy()
    m.vertices = np.vstack([m.vertices, m.vertices[0] + eps])
    return m
```
For B-Rep, generate with OpenCascade primitives (`BRepPrimAPI_MakeBox`, `MakeCylinder`) or CadQuery fixtures exported to STEP, then validate with FreeCAD/OpenCascade. Corrupt by controlled kernel operations, not by editing STEP text, or keep a small library of known-dirty STEP files documented by defect. See `../cad-file-interop/cadquery-freecad-workflows.md`.

## Boundary trio pattern
For threshold `T` with tolerance `tol`, always test:
- `T - k·tol` (clearly fails)
- `T` (exactly at — and the test must encode whether the boundary is inclusive)
- `T + k·tol` (clearly passes)
Pick `k ≥ 2` so float noise doesn't blur the "clearly" cases.

## Assertion patterns
| Quantity | Don't | Do |
|---|---|---|
| scalar | `assert v == x` | `assert abs(v-x) <= max(eps_abs, eps_rel*abs(x))` |
| point | `assert p == q` | `assert np.allclose(p, q, atol=eps)` |
| vector dir | `assert n == ref` | `assert abs(dot(unit(n),unit(ref))) >= cos(tol)` |
| verdict | `assert ok` | `assert r.verdict=="pass" and r.measured==pytest.approx(x, abs=tol)` |
| count | exact (counts are integers) | `assert r.nonmanifold_edges == 0` |

## Golden-file pattern
```python
import json, pathlib
GOLDEN = pathlib.Path(__file__).parent / "golden" / "bracket_report.json"

def test_validation_report_regression():
    report = run_validation("fixtures/bracket.step", units="mm", tol_mm=0.01)
    got = report.to_dict()
    want = json.loads(GOLDEN.read_text())
    assert got["units"] == want["units"]
    assert got["tolerance_mm"] == want["tolerance_mm"]
    assert got["counts"] == want["counts"]               # integers: exact
    # numeric fields: tolerance compare, not exact
    assert got["min_wall_mm"] == pytest.approx(want["min_wall_mm"], abs=want["tolerance_mm"])
```
Record `units`, `tolerance_mm`, and the tessellation tolerance inside the golden so a drift is interpretable. Regenerate goldens deliberately, never silently.

## Performance test pattern
```python
import time
def test_interference_under_budget(large_assembly):
    t0 = time.perf_counter()
    run_interference(large_assembly)            # must use a BVH internally
    assert time.perf_counter() - t0 < 5.0       # budget; fails if someone reintroduces O(n^2)
```
Pair with a parameterized size sweep to assert near-linear (not quadratic) growth if feasible.

## Invalid-geometry coverage matrix (aim to cover each)
| Defect | Fixture | Expected behavior |
|---|---|---|
| Open shell | `make_open(cube)` | precondition error / "not watertight" |
| Non-manifold | `make_nonmanifold(cube)` | detected, reported with edge |
| Degenerate tri | `add_degenerate_triangle(cube)` | skipped/flagged, no NaN normal |
| Duplicate verts | `add_duplicate_vertices(cube)` | merged; topology correct after |
| Self-intersection | two overlapping boxes fused as mesh | detected pre-boolean |
| Wrong units | cube scaled ×25.4 | bbox sanity check flags it |
