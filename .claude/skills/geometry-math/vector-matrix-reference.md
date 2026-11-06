# Vector & Matrix Reference for CAD

Concise, correct formulas. Column-vector / right-handed convention unless noted.

## Vectors
- Vector a = (ax, ay, az). Length |a| = √(ax²+ay²+az²).
- Unit vector â = a / |a| (guard |a| > eps before dividing).

## Dot product
- a · b = ax·bx + ay·by + az·bz = |a||b|cosθ.
- Uses: angle between vectors (θ = acos((a·b)/(|a||b|)) — clamp argument to [−1,1]); projection of a onto b̂ = (a·b̂) b̂; sign tells which side of a plane.

## Cross product
- a × b = (ay·bz − az·by, az·bx − ax·bz, ax·by − ay·bx).
- |a × b| = |a||b|sinθ = area of parallelogram. Direction by right-hand rule.
- Face normal of triangle (p0,p1,p2): n = (p1−p0) × (p2−p0); winding order (CCW) determines outward direction. Normalize for a unit normal; guard against degenerate (|n| < eps ⇒ degenerate triangle).

## Plane equation
- Point-normal form: n · (x − p0) = 0, i.e. n·x = d with d = n·p0.
- Signed distance from point q to plane (unit n): s = n·q − d. Sign = side; |s| = distance.

## Matrix transforms (3×3 rotation / scale)
- Rotation matrices are orthonormal: R Rᵀ = I, det(R) = +1.
- Apply to column vector: v' = R v.
- Compose: applying R1 then R2 ⇒ v' = R2 (R1 v) = (R2 R1) v. Order matters; right-to-left for column vectors.

## Homogeneous coordinates (4×4)
- Point (x,y,z,1); direction/vector (x,y,z,0) — the 0 means translation does not affect directions (correct for normals' translation part, though scale/shear still need inverse-transpose).
- Affine transform:
  ```
  M = [ R  t ]   (R = 3×3 linear part, t = 3×1 translation)
      [ 0  1 ]
  ```
- p_world = M_world←part · p_part. Chain: M_world←part = M_world←asm · M_asm←part (right-to-left).
- Inverse of rigid transform: R⁻¹ = Rᵀ, so M⁻¹ = [ Rᵀ  −Rᵀt ; 0 1 ].

## Transforming normals
- Under general affine M with linear part A (3×3): n' = (A⁻¹)ᵀ n, then renormalize.
- For pure rotation A = R, (R⁻¹)ᵀ = R, so normals use the same R (no special handling). The inverse-transpose only differs under non-uniform scale/shear.

## Quaternions
- Unit quaternion q = (w, x, y, z), w = cos(θ/2), (x,y,z) = sin(θ/2)·axis. Must be normalized.
- Compose rotations by quaternion multiplication (q2 * q1 applies q1 then q2). Avoids gimbal lock; interpolate with slerp.
- Convert to matrix (normalized q):
  ```
  R = [ 1−2(y²+z²)   2(xy−wz)    2(xz+wy)  ]
      [ 2(xy+wz)     1−2(x²+z²)  2(yz−wx)  ]
      [ 2(xz−wy)     2(yz+wx)    1−2(x²+y²)]
  ```

## Coordinate systems
- Right-handed: x × y = z. Most CAD kernels (and OpenGL/Three.js) are right-handed; DirectX is left-handed — converting between them flips one axis (a reflection ⇒ winding/normal flip).
- Active vs passive transforms: active moves the object in a fixed frame; passive re-expresses the same point in a new frame. They are inverses of each other — pick one and be consistent.

## Parametric curves (brief)
- Point on curve: C(u), u ∈ [u0, u1]. Tangent: C'(u). Unit tangent T = C'/|C'|.
- Bézier (cubic): C(u) = Σ Bᵢ(u) Pᵢ with Bernstein basis Bᵢ.
- NURBS generalize with knots and weights; evaluate with a kernel, don't hand-roll for production.

## Curvature (brief)
- Plane curve curvature κ = |C' × C''| / |C'|³. Radius of curvature = 1/κ.
- Surface principal curvatures κ1, κ2; mean H = (κ1+κ2)/2, Gaussian K = κ1·κ2. Needs exact second derivatives — use the surface's analytic form or a kernel.
