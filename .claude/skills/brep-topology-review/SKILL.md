---
name: brep-topology-review
description: Review B-Rep (boundary representation) solids and surfaces for topological and geometric validity. Use whenever the task involves exact CAD solids, STEP/IGES/Parasolid/ACIS data, faces/edges/loops/shells/solids, surface continuity, trimming curves, open shells, invalid solids, or boolean operation failures. Use this skill for questions about boolean failures, invalid solids, non-manifold B-Rep geometry, or STEP/IGES import validity.
---

# B-Rep Topology Review

B-Rep validity is two problems at once: the **topology** (connectivity) and the **geometry** (the underlying surfaces/curves) must both be sound, and they must agree with each other. This skill separates those concerns and targets the specific defects that cause invalid solids and boolean failures. See `brep-reference.md` for the topology hierarchy and a boolean-failure decision tree. For OpenCascade/pythonOCC work, read `opencascade-pythonocc-reference.md` before naming APIs. For CadQuery/FreeCAD STEP workflow details, use `../cad-file-interop/cadquery-freecad-workflows.md`.

## When to use this skill

- Validating a STEP/IGES/Parasolid/ACIS import before downstream use.
- Diagnosing a failed or wrong boolean (union/subtract/intersect).
- Investigating "invalid solid", open shells, or non-manifold B-Rep reports from a kernel.

## The topology hierarchy (what must hold)

```
Vertex ⊂ Edge ⊂ Loop ⊂ Face ⊂ Shell ⊂ Solid
```
Validity requirements:
- Each **edge** is bounded by vertices that lie on its curve (within tolerance).
- Each **face** is bounded by loops whose edges lie on the face's surface. Loop orientation is defined relative to the face's surface parameterization and the kernel convention — not as global screen-space CCW/CW. In most kernels (OpenCascade, Parasolid), the outer loop is oriented so that the face interior lies to the left when traversing the loop in parameter space with the face normal pointing outward; inner loops (holes) run in the opposite sense. Always verify orientation against the specific kernel's convention and the face's underlying surface parameterization.
- Each **edge in a closed solid** is shared by exactly two faces with consistent orientation (manifold).
- Each **shell** of a solid is closed (watertight) and consistently oriented (normals outward).
- **Geometry agrees with topology:** the surfaces/curves actually meet where the topology says they do, within kernel tolerance.

## Step-by-step workflow

1. **Separate topology from geometry.** Is the connectivity graph well-formed? Do the referenced surfaces/curves exist and are non-degenerate? Check both.
2. **Check edge sharing.** Count faces per edge: 1 = open shell (boundary), ≥3 = non-manifold.
3. **Check tolerance consistency.** Edges/vertices must lie on their parent curves/surfaces within the kernel tolerance. Sliver gaps between faces that "should" share an edge are the classic STEP import defect.
4. **Check orientation.** Face normals outward; loop orientations correct; shell closed.
5. **Check geometry health.** Self-intersecting surfaces, near-tangent faces, micro-edges (shorter than tolerance), tiny faces.
6. **For boolean failures,** classify the cause (coplanar overlap, tangency, tolerance mismatch between the two bodies, near-degenerate intersection curve) — see the decision tree.

## Common mistakes to catch

- **Treating a shell as a solid.** An open shell has boundary edges and encloses no volume; volume/mass queries on it are meaningless.
- **Sliver faces / micro-edges** below kernel tolerance left in the model → boolean instability, meshing failure.
- **Tolerance mismatch between two bodies** in a boolean (each modeled at different precision) → intersection curve can't be resolved.
- **Assuming STEP import = valid solid.** STEP carries geometry; importers must heal/sew, and may produce open shells silently.
- **Trimming curve inconsistency:** the 2D parameter-space curve and 3D edge disagree → face boundary wrong.
- **Coplanar/tangent faces** in booleans — the #1 boolean failure trigger.
- **Mixing the kernel's modeling tolerance with manufacturing tolerance.**

## Output format

```
B-Rep Validity Report
Kernel tolerance: __   Units: __
Topology: vertices=__ edges=__ faces=__ shells=__ solids=__
[CRIT] Open shells / boundary edges: N  (entity ids: …)
[CRIT] Non-manifold edges (≥3 faces): N
[CRIT] Geometry/topology mismatch (gap > tol): N (where: …)
[WARN] Micro-edges (< tol): N
[WARN] Sliver/tiny faces: N
[WARN] Self-intersecting surfaces: N
Solid status: [valid solid | open shell | invalid]
Boolean readiness: [Y/N] + blocking issues
```

## Examples

**Example 1 — boolean subtract fails**
Input: "A − B fails in the kernel." Diagnosis path: (1) validate A and B individually first — a boolean can't fix an already-invalid body; (2) check for coplanar overlapping faces between A and B (most common); (3) compare the two bodies' tolerances; (4) look for near-tangent contact producing a degenerate intersection curve. Remedy options: heal tolerances to a common value, perturb one body by a sub-tolerance offset where geometrically acceptable, or switch to a more robust boolean algorithm. State that the AI proposes; the kernel verifies.

**Example 2 — STEP import "looks fine" but volume is zero**
Likely cause: import produced an open shell (faces not sewn), so there's no closed solid and volume = 0 or undefined. Check boundary edges; run the kernel's sew/heal with an appropriate tolerance; re-validate as a closed solid.

## CAD-specific rules

- Validate each body before any boolean; booleans don't repair invalid input.
- Distinguish open shell from closed solid before any volume/mass query.
- Geometry must agree with topology within the *kernel* tolerance, tracked separately from manufacturing tolerance.
- Micro-edges and sliver faces below tolerance are defects — flag them.
- The AI diagnoses and proposes; the geometry kernel issues the validity verdict.

## Limitations / what this skill does NOT do

- It cannot itself heal a B-Rep — it identifies what a kernel (OpenCascade `ShapeFix`, Parasolid, ACIS) must repair.
- Without the actual kernel tolerance and entity IDs, location reporting is approximate.
- It reasons about validity, not about whether the *design* is correct (that's DFM/GD&T territory).

See `brep-reference.md` for the hierarchy details, STEP/IGES risk notes, and the boolean-failure decision tree.
See `opencascade-pythonocc-reference.md` for OpenCascade/pythonOCC-specific import, sewing, healing, BRepCheck, boolean, and tolerance guidance.
