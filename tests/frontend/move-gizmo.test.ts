/** Manipulateur de déplacement : quelle poignée touche un rayon (boule, tuile, flèche), et le glisser libre. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MoveGizmo, type GizmoHandle } from "../../frontend/src/viewport/move-gizmo";
import type { Viewport } from "../../frontend/src/viewport/viewport";

/** A viewport reduced to what the gizmo uses: a scene, a camera looking at the origin, and rays through world points. */
function fakeViewport(eye: [number, number, number] = [600, -800, 500]) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
  camera.up.set(0, 0, 1);
  camera.position.set(...eye);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  /** The next ray goes from the eye through this world point. */
  let aim = new THREE.Vector3();
  const through = (p: THREE.Vector3Like) => {
    aim = new THREE.Vector3(p.x, p.y, p.z);
    raycaster.set(camera.position, aim.clone().sub(camera.position).normalize());
  };
  const viewport = {
    scene,
    camera,
    onEachFrame: () => () => {},
    worldPerPixel: () => 1, // the gizmo is 50 mm
    intersect: (_event: unknown, objects: THREE.Object3D[]) => raycaster.intersectObjects(objects, true),
    rayFromEvent: () => ({ origin: [camera.position.x, camera.position.y, camera.position.z] as [number, number, number], direction: raycaster.ray.direction.toArray() as [number, number, number] }),
  } as unknown as Viewport;
  return { viewport, through, scene };
}

const event = {} as PointerEvent;

const pick = (gizmo: MoveGizmo, through: (p: THREE.Vector3Like) => void, p: [number, number, number]): GizmoHandle | null => {
  through({ x: p[0], y: p[1], z: p[2] });
  return gizmo.handleAt(event);
};

describe("manipulateur de déplacement", () => {
  const setup = (eye?: [number, number, number]) => {
    const { viewport, through } = fakeViewport(eye);
    const gizmo = new MoveGizmo(viewport);
    gizmo.place([0, 0, 0], { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
    return { gizmo, through };
  };

  it("donne la boule centrale au rayon qui passe par l'origine, même sur le départ des flèches", () => {
    const { gizmo, through } = setup();
    expect(pick(gizmo, through, [0, 0, 0])).toEqual({ kind: "free" });
  });

  it("donne chaque flèche à un rayon qui passe par sa tête, au-delà des tuiles", () => {
    // 50 mm of gizmo: an arrow’s head is at 0.86 of that along its axis, past the tiles (which end at 0.45).
    const x = setup([0, -1000, 300]);
    expect(pick(x.gizmo, x.through, [43, 0, 0])).toEqual({ kind: "axis", axis: 0 });
    const y = setup([-1000, 0, 300]);
    expect(pick(y.gizmo, y.through, [0, 43, 0])).toEqual({ kind: "axis", axis: 1 });
    const z = setup([0, -1000, 300]);
    expect(pick(z.gizmo, z.through, [0, 0, 43])).toEqual({ kind: "axis", axis: 2 });
  });

  it("donne chaque tuile de plan à un rayon qui passe par son centre, vu de face", () => {
    // The tiles sit at 0.36 of the gizmo on the two axes of their plane; seen straight on, nothing overlaps them.
    const top = setup([0, 0, 1000]);
    expect(pick(top.gizmo, top.through, [18, 18, 0])).toEqual({ kind: "plane", normal: 2 });
    const front = setup([0, -1000, 0]);
    expect(pick(front.gizmo, front.through, [18, 0, 18])).toEqual({ kind: "plane", normal: 1 });
    const side = setup([1000, 0, 0]);
    expect(pick(side.gizmo, side.through, [0, 18, 18])).toEqual({ kind: "plane", normal: 0 });
  });

  it("ne touche rien loin du manipulateur", () => {
    const { gizmo, through } = setup();
    expect(pick(gizmo, through, [400, 300, 200])).toBeNull();
  });

  it("déplace la boule dans le plan de l'écran (les trois coordonnées peuvent changer)", () => {
    const { gizmo, through } = setup();
    through({ x: 0, y: 0, z: 0 });
    expect(gizmo.dragStart(event)).toBe(true);
    expect(gizmo.dragging).toEqual({ kind: "free" });
    through({ x: 30, y: 10, z: 40 });
    const delta = gizmo.dragMove(event)!;
    // Inside the plane facing the eye: no movement along the line of sight.
    const eye = new THREE.Vector3(600, -800, 500).normalize();
    expect(new THREE.Vector3(...delta).dot(eye)).toBeCloseTo(0, 6);
    expect(Math.hypot(...delta)).toBeGreaterThan(10);
    expect(gizmo.dragEnd()).toBe(true);
  });

  it("déplace une flèche le long de son seul axe", () => {
    const { gizmo, through } = setup();
    through({ x: 42, y: 0, z: 0 });
    expect(gizmo.dragStart(event)).toBe(true);
    through({ x: 70, y: 14, z: 7 });
    const [dx, dy, dz] = gizmo.dragMove(event)!;
    expect(dx).not.toBe(0);
    expect(dy).toBeCloseTo(0, 9);
    expect(dz).toBeCloseTo(0, 9);
  });
});

describe("manipulateur dans une esquisse (plan)", () => {
  const setup = () => {
    const { viewport, through } = fakeViewport([0, 0, 1000]);
    const gizmo = new MoveGizmo(viewport, { planar: true });
    gizmo.place([0, 0, 0], { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
    return { gizmo, through };
  };

  it("n'a que les deux flèches du plan et la boule, sans tuiles ni flèche de la normale", () => {
    const { gizmo, through } = setup();
    expect(pick(gizmo, through, [43, 0, 0])).toEqual({ kind: "axis", axis: 0 });
    expect(pick(gizmo, through, [0, 43, 0])).toEqual({ kind: "axis", axis: 1 });
    expect(pick(gizmo, through, [0, 0, 0])).toEqual({ kind: "free" });
    // Where a tile would be in 3D (0.36 of the gizmo on both axes): nothing here.
    expect(pick(gizmo, through, [18, 18, 0])).toBeNull();
  });

  it("déplace la boule dans le plan de l'esquisse, jamais le long de sa normale", () => {
    const { gizmo, through } = setup();
    through({ x: 0, y: 0, z: 0 });
    expect(gizmo.dragStart(event)).toBe(true);
    through({ x: 40, y: -25, z: 0 });
    const [dx, dy, dz] = gizmo.dragMove(event)!;
    expect(dx).toBeCloseTo(40, 6);
    expect(dy).toBeCloseTo(-25, 6);
    expect(dz).toBeCloseTo(0, 6);
  });
});

describe("manipulateur : flèches de rotation", () => {
  const setup = (eye: [number, number, number] = [600, -800, 500]) => {
    const { viewport, through } = fakeViewport(eye);
    const gizmo = new MoveGizmo(viewport, { rotate: true });
    gizmo.place([0, 0, 0], { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
    return { gizmo, through };
  };

  it("donne l'arc de chaque axe à un rayon qui passe par son milieu (vu de face)", () => {
    // The arc of the Z axis lies in the XY plane at 0.66 of the gizmo, half way between X and Y (45°): top view.
    const top = setup([0, 0, 1000]);
    const r = 0.66 * 50;
    expect(pick(top.gizmo, top.through, [r * Math.SQRT1_2, r * Math.SQRT1_2, 0])).toEqual({ kind: "rotate", axis: 2 });
    // The arc of the X axis lies in the YZ plane: seen from the side (along X).
    const side = setup([1000, 0, 0]);
    expect(pick(side.gizmo, side.through, [0, r * Math.SQRT1_2, r * Math.SQRT1_2])).toEqual({ kind: "rotate", axis: 0 });
  });

  it("mesure l'angle tourné autour de l'axe, dans le sens direct, en continu au-delà d'un demi-tour", () => {
    const { gizmo, through } = setup([0, 0, 1000]);
    const r = 0.66 * 50;
    through({ x: r * Math.SQRT1_2, y: r * Math.SQRT1_2, z: 0 });
    expect(gizmo.dragStart(event)).toBe(true);
    expect(gizmo.dragging).toEqual({ kind: "rotate", axis: 2 });
    // A quarter turn counter-clockwise (seen from +Z): from 45° to 135°.
    through({ x: -r * Math.SQRT1_2, y: r * Math.SQRT1_2, z: 0 });
    expect(gizmo.dragAngle(event)).toBeCloseTo(Math.PI / 2, 6);
    // Past a half turn it goes on instead of wrapping to the other sign.
    through({ x: -r, y: -0.001, z: 0 });
    expect(gizmo.dragAngle(event)).toBeGreaterThan(Math.PI / 2);
    // 270° from the 45° start is 225° turned (1.25 π), not −135°.
    through({ x: 0.001, y: -r, z: 0 });
    expect(gizmo.dragAngle(event)).toBeCloseTo(Math.PI * 1.25, 1);
    // A clockwise turn is negative.
    gizmo.dragEnd();
    through({ x: r * Math.SQRT1_2, y: r * Math.SQRT1_2, z: 0 });
    gizmo.dragStart(event);
    through({ x: r * Math.SQRT1_2, y: -r * Math.SQRT1_2, z: 0 });
    expect(gizmo.dragAngle(event)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it("ne donne pas les arcs quand ils sont cachés (repère local) ni dans un outil qui ne fait que déplacer", () => {
    const { gizmo, through } = setup([0, 0, 1000]);
    gizmo.showRotation(false);
    const r = 0.66 * 50;
    expect(pick(gizmo, through, [r * Math.SQRT1_2, r * Math.SQRT1_2, 0])).toBeNull();
    const { viewport, through: t2 } = fakeViewport([0, 0, 1000]);
    const mover = new MoveGizmo(viewport);
    mover.place([0, 0, 0], { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
    expect(pick(mover, t2, [r * Math.SQRT1_2, r * Math.SQRT1_2, 0])).not.toEqual({ kind: "rotate", axis: 2 });
  });
});
