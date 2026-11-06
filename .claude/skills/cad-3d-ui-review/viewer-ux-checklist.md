# Viewer UX Checklist & Three.js Notes

Reference for `cad-3d-ui-review/SKILL.md`.

## Traceability checklist (the non-negotiables)
- [ ] Every finding stores entity IDs and/or coordinates from the validator.
- [ ] Clicking a finding selects + highlights that geometry and frames the camera on it.
- [ ] Clicking geometry surfaces its associated findings (bidirectional).
- [ ] The measured value + threshold + units are shown next to the highlight.
- [ ] "Next/previous issue" navigation steps through findings with auto-framing.

## Color & status semantics
- [ ] Red = fail, green = pass, amber = indeterminate/warning (e.g. within measurement uncertainty).
- [ ] Color comes from the validator verdict, never a UI-side heuristic.
- [ ] A legend is always visible.
- [ ] Non-color cues (icons, labels, hatch) accompany color for accessibility.
- [ ] Selection highlight is visually distinct from verdict color (don't overload).

## Measurement & section
- [ ] Measurements display units; mesh-derived measurements show the tessellation caveat.
- [ ] Section/clipping plane is itself visualized (position + normal).
- [ ] Section profile metrics (area, min wall in section) come from a deterministic section validator.
- [ ] Exploded and section states are clearly "views" — never exported as if they were the real geometry.

## Selection & picking
- [ ] Picking uses true ray-cast against geometry, not screen-space nearest.
- [ ] Picking resolves to the correct topological entity (face/edge/vertex) where relevant.
- [ ] Hidden/occluded geometry reachable via model tree or isolate, not just clicking.

## Assembly navigation
- [ ] Model tree mirrors the real assembly hierarchy.
- [ ] Isolate / hide / show-only / explode available.
- [ ] Per-part and per-issue visibility states are consistent.

## Report export
- [ ] Export carries the same structured data the validator produced (verdict, measured, threshold, units, params, locations).
- [ ] Screenshots are labeled with the camera framing + the issue id.
- [ ] The report references real geometry + section/explode parameters, not the rendered view as truth.

## Performance (route to cad-performance-optimizer)
- [ ] LOD / instancing for large assemblies.
- [ ] Frustum + occlusion culling.
- [ ] Highlight updates a material/selection layer, not a full re-render.
- [ ] Streaming/lazy load for big models so first paint is fast.

## Three.js API notes (accurate shapes)
- **Picking:** `const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(ndc, camera); const hits = raycaster.intersectObjects(objects, true);` — `hits[0].object`, `hits[0].faceIndex`, `hits[0].point`.
- **Section/clipping:** `renderer.localClippingEnabled = true;` and `material.clippingPlanes = [ new THREE.Plane(normal, constant) ];` Visualize the plane with `THREE.PlaneHelper`.
- **Highlight:** swap/emissive a material, or use a selective outline pass (postprocessing `OutlinePass`). Avoid rebuilding geometry per selection.
- **Camera framing:** compute the entity's `THREE.Box3`, then position the camera along a view vector at a distance derived from the box size and camera fov.
- **Instancing:** `THREE.InstancedMesh` for repeated fasteners/parts in large assemblies.
- **Coordinate caution:** Three.js is right-handed, Y-up by default; CAD data is often Z-up/mm — apply a consistent root transform (a wrong axis swap is a reflection → winding/normal flip; see geometry-math).

## Anti-patterns
- Heuristic client-side coloring ("looks thin → red") — that's the validator's job.
- Issue list that doesn't link anywhere.
- Measurements with no units / mesh measurements shown as exact.
- Section render exported as the part geometry.
- Re-render whole scene on every hover/selection.
