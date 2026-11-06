---
name: cad-3d-ui-review
description: Review and design 3D CAD viewer and validation-UI features — Three.js-style viewers, issue overlays, red/green validation highlights, section cuts, measurement annotations, exploded views, model trees, assembly hierarchy, report export, and traceability from a reported issue back to its geometry location. Use whenever building or reviewing a web/desktop 3D inspection or validation UI. Use this skill for 3D viewer work, highlighting failing geometry, section views, or validation UI tasks.
---

# CAD 3D UI Review

A validation UI's job is *traceability*: every reported issue must be clickable straight to the exact geometry that caused it, and visual state must never be mistaken for a verdict. This skill reviews/designs viewer features with that discipline. See `viewer-ux-checklist.md` for the full checklist and Three.js-specific notes.

## When to use this skill

- Building a 3D inspection/validation viewer (web Three.js or desktop).
- Reviewing how validation results are surfaced visually.
- Designing section cuts, measurements, overlays, exploded views, or report export.

## The traceability principle

The deterministic validator owns the verdict (see cad-validator-designer). The UI's job is to make that verdict *findable and reviewable*, not to compute or imply it. So:
- Every issue in the list links to entity ID(s) and a camera framing of the location.
- Color (red/green) reflects the validator's verdict, never the viewer's guess.
- Visual appearance is never presented as validation ("it looks closed" ≠ watertight).

## Step-by-step workflow

1. **Map issues to geometry.** Each finding carries entity IDs / coordinates (from the validator). The UI resolves those to selectable, highlightable, frame-able geometry.
2. **Design selection + highlight.** Click a list item → isolate/highlight the entity, frame the camera, show the measured value. Bidirectional: click geometry → show its findings.
3. **Color semantics.** Red = fail, green = pass, amber = indeterminate/warning (e.g., within measurement uncertainty). Keep a legend; don't overload colors.
4. **Section + measurement tools.** Section cut with the plane shown and section profile metrics; measurement annotations that state units and that mesh measurements carry tessellation error.
5. **Assembly navigation.** Model tree mirrors the assembly hierarchy; exploded view for occluded internals; isolate/hide.
6. **Report export.** Export findings (with locations, measured values, units, params, screenshots) to a structured report — same data the validator produced, now shareable.
7. **Performance.** Large models need LOD/instancing/culling (route to cad-performance-optimizer) so the UI stays responsive.

## Common mistakes to catch

- **Issue list with no link to geometry** → users can't find the problem (the cardinal sin).
- **Color implies a verdict the validator didn't make** (UI heuristic coloring).
- **No units on measurements**, or mesh measurements shown as exact.
- **Section plane not visualized** or its profile metrics not reported.
- **Picking by screen proximity** instead of true ray-cast against geometry (wrong entity selected).
- **Whole model re-rendered per highlight** instead of updating material/selection (perf).
- **Exploded/section state leaking into the report** as if it were the real geometry.
- **Inaccessible color-only signaling** (red/green indistinguishable for color-blind users — add icons/labels).

## Output format

For a UI design/review:
```
Feature: <viewer feature>
Traceability: issue -> entity IDs -> highlight + camera frame? <Y/N>
Color semantics: <pass/fail/indeterminate mapping + legend>
Measurement: <units shown? mesh-error caveat?>
Section/explode: <plane shown? profile metrics? state isolated from report?>
Selection: <true raycast pick? bidirectional list<->geometry?>
Perf: <LOD/instancing/culling for large models?>
Accessibility: <non-color cues?>
Findings: [severity] <issue> -> <fix>
```

## Examples

**Example 1 — review a Three.js validation overlay**
Check: do failing faces highlight via the validator's entity IDs (not a recomputed guess)? Does clicking a finding `raycaster.intersectObjects` the right mesh and `camera` frame it? Are normals/section consistent with the engineering result? Is color the verdict's color? Flag any client-side "looks thin → mark red" heuristic — that's the validator's job.

**Example 2 — section analysis view**
Design: user places a clipping plane (Three.js `clippingPlanes`); show the plane, the cross-section profile, and section metrics (area, min wall in section) from a deterministic section validator. State units. Keep the section a *view*; the exported report references the real solid plus the section parameters, not the clipped render as geometry.

## CAD-specific rules

- Every issue must be one click from its geometry, with camera framing and the measured value.
- Color reflects the validator's verdict only; the UI never invents pass/fail.
- Visual appearance is never validation; never imply otherwise in copy or color.
- Measurements show units; mesh measurements show the tessellation caveat.
- Section/exploded states are views, isolated from the reported geometry.
- Pick via true raycast against geometry, not screen-space proximity.

## Limitations / what this skill does NOT do

- It reviews the UI's faithfulness to validation results; it doesn't compute the validation (that's cad-validator-designer).
- Rendering-engine internals and shader work are out of scope beyond correctness/perf hooks.
- It can't fix a validator that emits no locations — traceability requires located findings upstream.

See `viewer-ux-checklist.md` for the full checklist and Three.js API notes.
