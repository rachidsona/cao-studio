/**
 * Les deux accrochages de l'esquisse (boutons « Accrochage à la géométrie » et « Accrochage intelligent ») appliqués
 * aux corps, pour Déplacer, Coïncidence et Mesurer : l'état des boutons, le point pris sur une face (aligné sur les
 * coins des corps quand l'accrochage intelligent est actif) et les boîtes des corps qu'un glissé aligne.
 */
import type { Vec3 } from "../document/types";
import { alignPoint, type Box, type Guide } from "../features/smart-align";
import { SNAP_CHANGE, sketchPrefs, toggleSnap } from "../sketcher/sketch-prefs";
import { faceSnaps } from "../viewport/face-snaps";
import type { Viewport } from "../viewport/viewport";

/** How near (px on the screen) an alignment is taken. */
const ALIGN_PX = 8;

export const bodySnap = {
  /** Corners, edges and points of the bodies and sketches are caught. */
  get geometry(): boolean {
    return sketchPrefs.geometrySnap;
  },
  /** Alignments with the corners of the bodies (and the faces of the bodies, while dragging). */
  get smart(): boolean {
    return sketchPrefs.smartSnap;
  },
  tolerance(viewport: Viewport): number {
    return ALIGN_PX * viewport.worldPerPixel();
  },
};

/**
 * The point of the face under the pointer: in line with a corner of the bodies (or an anchor: a point clicked
 * before) when the smart snapping finds one, else the very point pointed at — or nothing when `alignedOnly`.
 */
export function facePoint(viewport: Viewport, event: PointerEvent, options: { anchors?: readonly Vec3[]; alignedOnly?: boolean; skip?: (bodyId: string) => boolean } = {}): { point: Vec3; bodyId: string; guides: Guide[] } | null {
  const pick = viewport.pickFace(event);
  if (!pick || options.skip?.(pick.bodyId)) return null;
  const p: Vec3 = [pick.point.x, pick.point.y, pick.point.z];
  if (bodySnap.smart) {
    const mesh = viewport.bodyMesh(pick.bodyId);
    const normal = mesh ? (faceSnaps(mesh, pick.faceIndex)?.normal ?? null) : null;
    const aligned = alignPoint(p, normal, [...viewport.bodyVertices(), ...(options.anchors ?? [])], bodySnap.tolerance(viewport));
    if (aligned.guides.length) return { point: aligned.pos, bodyId: pick.bodyId, guides: aligned.guides };
  }
  return options.alignedOnly ? null : { point: p, bodyId: pick.bodyId, guides: [] };
}

/** The box of a displayed body. */
export function bodyBox(viewport: Viewport, id: string): Box | null {
  const bbox = viewport.bodyMesh(id)?.metrics.bbox;
  return bbox ? [[...bbox[0]], [...bbox[1]]] : null;
}

/** The boxes of the displayed bodies but those skipped (what is moved, its preview, its copies). */
export function otherBoxes(viewport: Viewport, skip: (id: string) => boolean): Box[] {
  return viewport.displayedBodies.filter((id) => !skip(id)).map((id) => bodyBox(viewport, id)).filter((b): b is Box => b !== null);
}

/** The two buttons of the model (next to Déplacer and Coïncidence): the same choices as those of the sketch. */
export function bindSnapButtons(root: HTMLElement, notify: (message: string) => void): void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-snap]")];
  const refresh = () => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.snap === "geometry" ? bodySnap.geometry : bodySnap.smart));
  };
  for (const b of buttons) b.addEventListener("click", () => notify(toggleSnap(b.dataset.snap === "geometry" ? "geometrySnap" : "smartSnap")));
  window.addEventListener(SNAP_CHANGE, refresh);
  refresh();
}
