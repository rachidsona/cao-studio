---
name: geometry-math
description: Apply and debug the linear algebra behind CAD — vectors, matrices, homogeneous transforms, coordinate systems, quaternions, normals, plane equations, parametric curves, curvature, numerical tolerance, float comparison, unit conversion, and transformation chains. Use whenever placement/assembly math is wrong, normals point the wrong way, transforms compose incorrectly, units are mismatched, or a quaternion/matrix conversion misbehaves. Use this skill when a part is in the wrong place, orientation, or scale.
---

# Geometry Math for CAD

Most "the part ended up in the wrong place" bugs are transform-chain errors: wrong multiplication order, mixing row/column conventions, forgetting a parent frame, or applying a transform in the wrong coordinate system. This skill gives the precise math and the debugging method. See `vector-matrix-reference.md` for formulas and `tolerance-reference.md` for comparison/units discipline.

## When to use this skill

- Assembly placement, instancing, or coordinate-frame math is producing wrong position/orientation/scale.
- Normals are inverted or inconsistent after a transform.
- Quaternion ↔ matrix ↔ Euler conversions disagree.
- Unit conversion or float comparison is suspected.
- You need the correct formula for a plane, normal, curvature, or parametric point.

## Step-by-step workflow

1. **Write the frame graph.** List every coordinate frame (world, assembly, sub-assembly, part, feature) and the transform between each pair, with direction. Most bugs are visible here.
2. **Fix conventions explicitly.** Column-vector vs row-vector? Right-handed? Pre- vs post-multiplication? Degrees vs radians? Active (move the object) vs passive (change the frame)? State all of them.
3. **Compose in the correct order.** For column vectors, `p_world = M_world←part · p_part`, and chains compose right-to-left: `M_world←part = M_world←asm · M_asm←part`. Getting this backward is the #1 bug.
4. **Transform normals correctly.** Normals transform by the inverse-transpose of the upper-left 3×3, NOT by the matrix itself, whenever there's non-uniform scale or shear. Renormalize after.
5. **Handle units.** Convert at boundaries, once, and record the factor. Never validate mm thresholds against an inch-scaled model.
6. **Verify numerically.** Plug in a known point (e.g., the part origin) and confirm it lands where expected. Check determinant ≈ +1 for a pure rotation; det < 0 means a reflection (mirror) sneaked in and will flip normals.

## Common mistakes to catch

- **Wrong multiplication order** in a transform chain (left-to-right vs right-to-left for the convention in use).
- **Row/column mismatch:** importing a row-major matrix into a column-vector pipeline transposes the rotation silently.
- **Transforming normals with the model matrix** under non-uniform scale → normals no longer perpendicular. Use inverse-transpose.
- **Negative determinant** from an accidental mirror → inside-out geometry, flipped winding.
- **Quaternion not normalized** before converting to a matrix → scale/shear creeps in.
- **Degrees/radians mix** in trig calls.
- **Unit factor applied twice** or not at all (the 25.4 / 1000 classic).
- **Euler-angle gimbal/order assumptions** (XYZ vs ZYX) producing the wrong orientation.

## Output format

For a transform problem:
```
Frames: <list> ; Convention: <col/row, handedness, pre/post-mult, deg/rad, active/passive>
Frame graph: <A←B chains>
Correct composition: <expression>
Normal handling: <inverse-transpose? renormalize?>
Units: <source -> target, factor>
Numeric check: <known point -> expected vs actual>; det(R)=<value>
```

## Examples

**Example 1 — assembly placement off**
Input: "Sub-part appears rotated but translated wrong in world."
Diagnosis path: build frame graph world←asm←part. If translation is wrong but rotation right, suspect order: with column vectors, `M = M_world←asm · M_asm←part` (right-to-left). Applying translation before rotation (or composing left-to-right) moves the part in the wrong frame. Verify by mapping part origin (0,0,0,1): should equal the part's intended world position; if not, the composition order is inverted.

**Example 2 — normals wrong after scaling**
Input: "After non-uniform scale, lighting/normals look inverted on some faces."
Fix: normals must be transformed by `(M3x3)^-T`, then renormalized. Also check det(M3x3): if negative (a mirror), winding order flips and face orientation must be reversed too.

## CAD-specific rules

- Always state handedness, row/column, and pre/post-mult before composing.
- Normals: inverse-transpose under non-uniform scale/shear; renormalize.
- Pure rotation ⇒ orthonormal with det = +1; det = −1 means a reflection.
- Normalize quaternions before matrix conversion.
- Convert units once, at boundaries, and log the factor.

## Limitations / what this skill does NOT do

- It won't fix an upstream exporter that emits a wrong matrix — it helps you detect it.
- It covers the standard rigid/affine math, not full NURBS evaluation internals (see computational-geometry for intersection, and a kernel for surface eval).
- Curvature notes here are introductory; production curvature analysis needs the surface's exact derivatives.

See `vector-matrix-reference.md` and `tolerance-reference.md` for formulas and tolerance rules.
