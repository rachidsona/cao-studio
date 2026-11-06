# B-Rep Reference — Hierarchy, Risks, Boolean Failures

Reference for `brep-topology-review/SKILL.md`.

## Topology entities
| Entity | Definition | Validity note |
|---|---|---|
| Vertex | 0D point | must lie on every edge it bounds (within tol) |
| Edge | 1D curve segment between vertices | curve must be non-degenerate; length > tol |
| Coedge / half-edge | edge use within a loop, carries direction | orientation must be consistent around loop |
| Loop | closed ring of coedges bounding a face | orientation is kernel- and surface-parameterization-relative; outer loop consistent with outward face normal in parameter space; inner loops run opposite — verify against the specific kernel convention |
| Face | bounded region of a surface | loops lie on surface; surface non-degenerate |
| Shell | connected set of faces | closed ⇒ candidate solid; open ⇒ sheet |
| Solid | volume bounded by closed shells | each shell watertight + outward oriented |

## Geometry vs topology mismatch (the core defect class)
The topology says "edge E is shared by faces F1 and F2." The geometry says F1's surface and F2's surface are 0.02 mm apart along E. If 0.02 mm > kernel tolerance, the model is invalid even though the graph is perfect. Most "dirty STEP" problems are this: gaps, overlaps, and micro-discrepancies between exact surfaces that topology claims coincide.

## Surface continuity (G0/G1/G2)
| Level | Meaning | Symptom if expected but absent |
|---|---|---|
| G0 (positional) | surfaces meet | visible gap/crack |
| G1 (tangent) | tangent planes match | shading/lighting crease, tool-path kink |
| G2 (curvature) | curvature matches | reflection-line discontinuity (class-A surfacing) |
Continuity is a *design* requirement; a model can be valid (G0) yet fail a class-A surface review (needs G2).

## Trimming curves
A trimmed face stores: the underlying (untrimmed) surface, plus 3D edge curves and their 2D pcurves (parameter-space curves) defining the trim. Defect: 3D edge and 2D pcurve disagree → the face boundary is ambiguous → meshing/booleans misbehave. Always check pcurve↔edge consistency on imported trimmed surfaces.

## STEP / IGES risk notes
| Risk | STEP | IGES |
|---|---|---|
| Units | header length unit; usually mm, sometimes wrong | global section flag; often ignored |
| Sewing required | yes — faces may import unstitched (open shell) | yes — IGES is notoriously fragmented |
| Tolerance metadata | AP242 carries semantic PMI (GD&T annotations, datums, tolerance callouts) | minimal |
| Feature history | AP242 supports PMI and semantic data exchange; native construction history (parametric feature tree) is not reliably transferred — expect tessellated or NURBS geometry, not a live parametric model | none |
| Common failure | open shells, micro-gaps | free-floating surfaces, duplicate/curve-only entities |
After import, always: read/check transfer → check units → validate raw shape → sew/heal with documented tolerance → validate as solid. For OpenCascade/pythonOCC specifics, see `opencascade-pythonocc-reference.md`.

## Boolean-failure decision tree
```
Boolean failed/incorrect?
├─ Is each input body individually valid? ─ NO ─> fix inputs first (booleans don't repair)
│                                          
├─ Coplanar overlapping faces between bodies? ─ YES ─> coplanar handling / perturb / robust algo
├─ Tangent or near-tangent contact? ─ YES ─> degenerate intersection curve; offset sub-tolerance if acceptable
├─ Different tolerances on the two bodies? ─ YES ─> heal both to common tolerance
├─ Micro-edges/sliver faces present? ─ YES ─> remove/heal before boolean
└─ Else ─> try alternate kernel boolean (e.g. OCC BOPAlgo fuzzy value) or exact polyhedral kernel (CGAL)
```

## "Fuzzy" booleans
OpenCascade `BRepAlgoAPI_*` accepts a fuzzy value (a tolerance band) that can absorb small gaps and rescue otherwise-failing booleans. Use deliberately and document the value — too large a fuzzy value merges features you meant to keep.

## Library notes
- **OpenCascade:** `BRepCheck_Analyzer` (validity), `ShapeFix_*` (healing), `BRepAlgoAPI_Fuse/Cut/Common` (booleans, with `SetFuzzyValue`), `ShapeAnalysis_Shell`.
- **Parasolid / ACIS:** commercial kernels with their own checker/healer (PK_BODY_check, api_check_entity).
- **CGAL:** exact predicates, PMP mesh checks, AABB trees, and Nef polyhedron booleans for polyhedral/mesh workflows (operates on meshes/polyhedra, not exact NURBS B-Rep). See `../computational-geometry/cgal-reference.md`.
