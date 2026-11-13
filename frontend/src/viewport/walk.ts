/**
 * La visite à pied, en calcul pur : où sont les yeux du visiteur (x, y, à leur hauteur au-dessus du sol), où il
 * regarde (cap et inclinaison), et comment il se déplace — vers l'avant, l'arrière ou de côté, à la vitesse de la
 * marche (plus vite avec Maj) — sans traverser un mur ni un meuble : son corps est un cercle de 25 cm au sol, qui glisse
 * le long d'un obstacle plutôt que de s'y arrêter net. Les obstacles sont les boîtes des corps qui montent assez haut
 * pour gêner (ni une plinthe basse, ni un plafond au-dessus de la tête). Le repère est celui du modèle : Z vers le haut,
 * en millimètres.
 */
export type Box = [[number, number, number], [number, number, number]];

export interface Walker {
  /** Where the visitor stands on the floor (x, y). */
  x: number;
  y: number;
  /** Height of the eyes above the floor, and the floor's height (mm). */
  eye: number;
  floor: number;
  /** Heading on the floor (radians, 0: towards +Y, counterclockwise seen from above) and pitch (radians, up > 0). */
  yaw: number;
  pitch: number;
}

/** The usual eyes (1.60 m), the lowest and highest one may set (a child, a wheelchair; a tall visitor). */
export const EYE = { usual: 1600, low: 900, high: 2000 };
/** Walking speed (mm/s), and when running. */
export const SPEED = { walk: 1400, run: 3200 };
/** The visitor's body: a circle of this radius on the floor (mm). */
export const BODY = 250;
/** What is under this height stays under the feet (a plinth, a rug, a step): no obstacle (mm). */
const STEP = 200;
const PITCH = (85 * Math.PI) / 180;

/** Where the eyes look, as a direction of the world. */
export function lookDirection(w: Pick<Walker, "yaw" | "pitch">): [number, number, number] {
  const c = Math.cos(w.pitch);
  return [-Math.sin(w.yaw) * c, Math.cos(w.yaw) * c, Math.sin(w.pitch)];
}

/** The eyes in the world. */
export const eyePoint = (w: Walker): [number, number, number] => [w.x, w.y, w.floor + w.eye];

/** The head turned by `dx`, `dy` pixels dragged (`rate`: radians per pixel); the pitch stays short of straight up or down. */
export function turned(w: Walker, dx: number, dy: number, rate = 0.004): Walker {
  return { ...w, yaw: w.yaw - dx * rate, pitch: Math.max(-PITCH, Math.min(PITCH, w.pitch - dy * rate)) };
}

/** The eyes raised or lowered, within what a visitor may have. */
export const atHeight = (w: Walker, eye: number): Walker => ({ ...w, eye: Math.max(EYE.low, Math.min(EYE.high, eye)) });

/** The boxes in the way of a visitor of this height standing on this floor: those that reach between the step and the head. */
export function obstacles(boxes: readonly Box[], floor: number, eye: number): Box[] {
  return boxes.filter(([lo, hi]) => hi[2] > floor + STEP && lo[2] < floor + eye + 100);
}

/** Whether the body standing at (x, y) is inside a box (its circle overlapping it). */
function blocked(x: number, y: number, boxes: readonly Box[]): boolean {
  return boxes.some(([lo, hi]) => {
    const dx = Math.max(lo[0] - x, 0, x - hi[0]);
    const dy = Math.max(lo[1] - y, 0, y - hi[1]);
    return dx * dx + dy * dy < BODY * BODY;
  });
}

export interface WalkInput {
  /** -1 back, 0, 1 forward; -1 left, 0, 1 right (a joystick gives anything between). */
  forward: number;
  side: number;
  run: boolean;
}

/**
 * The visitor after `dt` seconds of walking: along its heading (on the floor, whatever the pitch), stopped by the
 * obstacles — each axis on its own, so that it slides along a wall met at an angle. A body already inside a box (it was
 * put there) may walk out of it.
 */
export function walked(w: Walker, input: WalkInput, dt: number, boxes: readonly Box[]): Walker {
  const length = Math.hypot(input.forward, input.side);
  if (length < 1e-6 || dt <= 0) return w;
  const scale = Math.min(1, length) / length;
  const [f, s] = [input.forward * scale, input.side * scale];
  const step = (input.run ? SPEED.run : SPEED.walk) * Math.min(dt, 0.1);
  // Forward: the heading on the floor; right: a quarter turn clockwise from it.
  const [fx, fy] = [-Math.sin(w.yaw), Math.cos(w.yaw)];
  const [rx, ry] = [fy, -fx];
  const dx = (fx * f + rx * s) * step;
  const dy = (fy * f + ry * s) * step;
  const inside = blocked(w.x, w.y, boxes);
  const free = (x: number, y: number) => inside || !blocked(x, y, boxes);
  let { x, y } = w;
  if (free(x + dx, y)) x += dx;
  if (free(x, y + dy)) y += dy;
  return x === w.x && y === w.y ? w : { ...w, x, y };
}

/**
 * Where the visit starts: in a room (its walls), in its middle; otherwise 2.5 m in front of the furniture (it faces −Y),
 * looking at it. `room`: the box of the walls; `model`: the box of the rest.
 */
export function startWalker(model: Box | null, room: Box | null): Walker {
  if (room) {
    const [lo, hi] = room;
    return { x: (lo[0] + hi[0]) / 2, y: (lo[1] + hi[1]) / 2, eye: EYE.usual, floor: lo[2], yaw: 0, pitch: 0 };
  }
  if (!model) return { x: 0, y: -2500, eye: EYE.usual, floor: 0, yaw: 0, pitch: 0 };
  const [lo, hi] = model;
  return { x: (lo[0] + hi[0]) / 2, y: lo[1] - 2500, eye: EYE.usual, floor: Math.min(0, lo[2]), yaw: 0, pitch: 0 };
}

/** The visitor put at a point of the floor clicked, unless something stands there. */
export function placedAt(w: Walker, x: number, y: number, boxes: readonly Box[]): Walker | null {
  return blocked(x, y, boxes) ? null : { ...w, x, y };
}
