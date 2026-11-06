# OpenCascade / pythonOCC Reference

Use this reference when a B-Rep task involves OpenCascade Technology (OCCT) or
pythonOCC. It is intentionally API-specific; avoid replacing these calls with
invented helpers unless the user already has project-local wrappers.

API names here are stable since pythonOCC 7.4 and verified against OCCT 7.x/8.x.
The core classes (`STEPControl_Reader`, `BRepCheck_Analyzer`, `BRepBuilderAPI_Sewing`,
`ShapeFix_Shape`, `BRepAlgoAPI_Cut`, `BRepGProp`) have not changed signatures across
that range. Always verify against your installed version before pasting into production;
latest stable builds (pythonOCC 7.7+, OCCT 7.7/7.8) are the recommended target.

## Core Rule

OpenCascade can diagnose and sometimes repair B-Reps, but it does not make an
engineering result true by default. The safe workflow is:

1. Import/read.
2. Record units and kernel tolerance.
3. Check load/transfer status.
4. Validate the raw shape.
5. Sew/heal only with a documented tolerance.
6. Validate the healed shape.
7. Only then compute volume, mass, booleans, meshing, or measurements.

Never run volume or booleans on a shape just because it displays correctly.

## STEP Import Validation

Key classes:

- `STEPControl_Reader`
- `IFSelect_RetDone`
- `BRepCheck_Analyzer`

pythonOCC sketch:

```python
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.STEPControl import STEPControl_Reader
from OCC.Core.BRepCheck import BRepCheck_Analyzer


def read_step_shape(path):
    reader = STEPControl_Reader()
    status = reader.ReadFile(str(path))
    if status != IFSelect_RetDone:
        raise RuntimeError(f"STEP read failed: status={status}")

    # Useful diagnostics when debugging dirty import.
    reader.PrintCheckLoad(False, 0)

    ok = reader.TransferRoot(1)
    if not ok:
        raise RuntimeError("STEP root transfer produced no shape")

    shape = reader.Shape(1)  # or OneShape() when combining transferred roots
    analyzer = BRepCheck_Analyzer(shape, True)
    return shape, analyzer.IsValid()
```

Notes:

- `STEPControl_Reader.FileUnits(...)` can report length/angle/solid-angle unit
  names found in the file; use it when unit mistakes are suspected.
- `STEPControl_Reader.SetSystemLengthUnit(...)` controls the length unit used by
  transfer after a model is loaded. Document any conversion choice.
- `ReadFile` success only means the STEP model loaded. It does not prove the
  resulting OCCT shape is a valid closed solid.
- `TransferRoot(1)` handles the first root. For assemblies or multi-root files,
  inspect `NbRootsForTransfer()` / transfer roots deliberately and report counts.

## BRepCheck

Use `BRepCheck_Analyzer(shape, GeomControls)` for validity.

```python
from OCC.Core.BRepCheck import BRepCheck_Analyzer

checker = BRepCheck_Analyzer(shape, True)
checker.SetExactMethod(True)      # slower, more exact edge-on-surface checks
checker.SetParallel(True)

if not checker.IsValid():
    raise ValueError("shape is invalid; inspect subshape results before measuring")
```

Guidance:

- `GeomControls=True` checks geometric conditions in addition to topology.
- `SetExactMethod(True)` is slower but more reliable for curve-on-surface checks.
- Use `checker.Result(subshape)` when reporting located defects. A bare `False`
  is not enough for a CAD review.

## Sewing

Use `BRepBuilderAPI_Sewing` when imported faces are near each other but not
topologically stitched.

```python
from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_Sewing


def sew_shape(shape, sew_tol_mm):
    sewing = BRepBuilderAPI_Sewing(sew_tol_mm)
    sewing.Add(shape)
    sewing.Perform()

    return {
        "shape": sewing.SewedShape(),
        "free_edges": sewing.NbFreeEdges(),
        "multiple_edges": sewing.NbMultipleEdges(),
        "contiguous_edges": sewing.NbContigousEdges(),
        "degenerated_shapes": sewing.NbDegeneratedShapes(),
        "tolerance_mm": sew_tol_mm,
    }
```

Guidance:

- Treat sewing tolerance as a modeling tolerance, not a manufacturing tolerance.
- Record `NbFreeEdges()` and `NbMultipleEdges()` before trusting the result.
- `SewedShape()` may be a face, shell, solid, or compound. Check the resulting
  shape type before computing volume.
- A larger sewing tolerance can erase intended small features. Do not silently
  increase it until the model becomes valid.

## Healing

Useful classes:

- `ShapeFix_Shape`
- `ShapeFix_Shell`
- `ShapeFix_Solid`

General shape fix:

```python
from OCC.Core.ShapeFix import ShapeFix_Shape


def heal_shape(shape, precision_mm, min_tol_mm, max_tol_mm):
    fixer = ShapeFix_Shape(shape)
    fixer.SetPrecision(precision_mm)
    fixer.SetMinTolerance(min_tol_mm)
    fixer.SetMaxTolerance(max_tol_mm)
    fixer.Perform()
    return fixer.Shape()
```

Shell orientation:

```python
from OCC.Core.ShapeFix import ShapeFix_Shell

shell_fix = ShapeFix_Shell(shell)
shell_fix.Perform()
fixed_shell = shell_fix.Shell()
```

Solid from shell:

```python
from OCC.Core.ShapeFix import ShapeFix_Solid

solid_fix = ShapeFix_Solid()
solid = solid_fix.SolidFromShell(fixed_shell)
```

Guidance:

- `ShapeFix_Shape.SetPrecision`, `SetMinTolerance`, and `SetMaxTolerance` define
  the tolerance envelope for fixing. Report those values.
- `ShapeFix_Shell` fixes face orientation in shells; do not use it as proof that
  gaps were sewn or that the result is a valid solid.
- `ShapeFix_Solid.CreateOpenSolidMode()` exists, but creating solids from open
  shells is usually wrong for validation workflows. Keep it off unless the user
  explicitly needs sheet-like/open-solid behavior and documents the limitation.

## Boolean Readiness And Booleans

Before `BRepAlgoAPI_Cut`, `BRepAlgoAPI_Fuse`, or `BRepAlgoAPI_Common`:

1. Run `BRepCheck_Analyzer` on each input.
2. Check shape types: solids vs shells vs compounds.
3. Check tolerances for each body and align them deliberately.
4. Look for coplanar overlap, tangency, micro-edges, sliver faces, and self-interference.

pythonOCC sketch:

```python
from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCC.Core.BRepCheck import BRepCheck_Analyzer


def checked_cut(argument, tool, fuzzy_mm=0.0):
    for name, shape in (("argument", argument), ("tool", tool)):
        if not BRepCheck_Analyzer(shape, True).IsValid():
            raise ValueError(f"{name} is invalid before boolean")

    op = BRepAlgoAPI_Cut(argument, tool)
    if fuzzy_mm:
        op.SetFuzzyValue(fuzzy_mm)
    op.SetRunParallel(True)
    op.Build()

    if op.HasErrors():
        raise RuntimeError("boolean failed; inspect op.GetReport()/DumpErrors")

    result = op.Shape()
    if not BRepCheck_Analyzer(result, True).IsValid():
        raise ValueError("boolean result is invalid")
    return result
```

Guidance:

- `SetFuzzyValue` adds tolerance to the operation; it can rescue tiny gaps but
  can also merge features that should remain distinct.
- Use `HasErrors()`, `HasWarnings()`, `GetReport()`, `DumpErrors()`, and
  `DumpWarnings()` for diagnostics.
- `SimplifyResult()` can unify same-domain edges/faces after the operation, but
  validate the result again and account for topology changes in downstream IDs.

## Volume / Mass Gate

Use `BRepGProp.VolumeProperties` only after validity gates pass.

```python
from OCC.Core.BRepGProp import brepgprop
from OCC.Core.GProp import GProp_GProps


def volume_mm3_strict(solid):
    if not BRepCheck_Analyzer(solid, True).IsValid():
        raise ValueError("volume requires valid solid")
    props = GProp_GProps()
    brepgprop.VolumeProperties(solid, props)
    return props.Mass()
```

Guidance:

- `BRepGProp` property functions do not replace validity checks.
- `GProp_GProps.Mass()` is volume for unit density in volume-property context.
- Report units as the cube of the transferred system length unit.

## Common Failure Patterns

| Symptom | Likely cause | OpenCascade checks |
|---|---|---|
| STEP imports but volume is zero | open shell / unsewn faces | `BRepCheck_Analyzer`, `BRepBuilderAPI_Sewing.NbFreeEdges()` |
| Boolean cut fails | invalid input, coplanar overlap, tangency, micro-edges | validate both inputs; inspect `HasErrors()` report |
| Shape displays fine but checker fails | topology/geometry mismatch, pcurve mismatch, wire issue | `BRepCheck_Analyzer(shape, True)` with exact method |
| Healing "fixes" shape but measurements drift | tolerance too large | record `SetPrecision`, `SetMinTolerance`, `SetMaxTolerance`, sewing/fuzzy values |
| Assembly imports with wrong size | unit conversion mistake | `STEPControl_Reader.FileUnits`, bbox sanity check |

## Source Links

- OCCT `STEPControl_Reader`: https://dev.opencascade.org/doc/refman/html/class_s_t_e_p_control___reader.html
- OCCT `BRepCheck_Analyzer`: https://dev.opencascade.org/doc/refman/html/class_b_rep_check___analyzer.html
- OCCT `BRepBuilderAPI_Sewing`: https://dev.opencascade.org/doc/refman/html/class_b_rep_builder_a_p_i___sewing.html
- OCCT `ShapeFix_Shape`: https://dev.opencascade.org/doc/refman/html/class_shape_fix___shape.html
- OCCT `ShapeFix_Shell`: https://dev.opencascade.org/doc/refman/html/class_shape_fix___shell.html
- OCCT `ShapeFix_Solid`: https://dev.opencascade.org/doc/refman/html/class_shape_fix___solid.html
- OCCT `BRepAlgoAPI_Cut`: https://dev.opencascade.org/doc/refman/html/class_b_rep_algo_a_p_i___cut.html
- OCCT `BRepGProp`: https://dev.opencascade.org/doc/refman/html/class_b_rep_g_prop.html
- pythonOCC `OCC.Core.BRepGProp`: https://pythonocc-documentation.readthedocs.io/en/review-gen-apidoc-rtd/apidoc/OCC.Core.BRepGProp.html
- pythonOCC API docs: https://pythonocc-documentation.readthedocs.io/en/review-gen-apidoc-rtd/apidoc/OCC.Core.html
