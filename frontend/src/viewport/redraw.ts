/**
 * Le rendu à la demande (audit d'architecture du 11/11/2026) : la vue ne redessine que pendant et juste après ce qui la
 * change — un geste de la souris, du doigt ou du clavier, la caméra qui glisse encore, des corps refaits, un outil —
 * au lieu de 60 images par seconde à l'arrêt, qui vidaient la batterie d'un iPad ou d'un portable. La boucle continue :
 * ses écouteurs d'image tournent toujours, seul le dessin attend.
 */
/** At rest, one image every this many ms (4 a second instead of 60). */
export const IDLE_INTERVAL = 250;

export class Redraw {
  private until = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Something changed: drawn for the next `ms` (long enough for the camera's damping and a short animation). */
  invalidate(ms = 2000): void {
    this.until = Math.max(this.until, this.now() + ms);
  }

  /**
   * Whether this frame is to be drawn: while something changes, every frame; at rest, a few times a second still, so
   * that what changes without a gesture (a result arriving from the kernel, a panel's own update) never stays unseen.
   */
  get due(): boolean {
    const now = this.now();
    if (now < this.until || now - this.last >= IDLE_INTERVAL) {
      this.last = now;
      return true;
    }
    return false;
  }

  private last = -Infinity;
}

/** Every gesture on the page wakes the drawing: tools that move things under the pointer draw them at once. */
export function wakeOnInput(target: EventTarget, redraw: Redraw): void {
  for (const type of ["pointerdown", "pointermove", "pointerup", "wheel", "keydown", "keyup", "touchstart", "touchmove"]) {
    target.addEventListener(type, () => redraw.invalidate(), { passive: true, capture: true });
  }
}
