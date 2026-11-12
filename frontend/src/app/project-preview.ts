/**
 * L'aperçu du projet pour sa carte de la page d'accueil (apps/projects/thumbnails.py) : après un enregistrement — une
 * fois par minute au plus — et à la première ouverture d'un projet qui n'en a pas, la vue isométrique cadrée sur le
 * meuble, sans les murs de la pièce, les esquisses ni la grille, est envoyée au serveur en petit JPEG. La vue de
 * l'utilisateur n'est pas touchée : l'image est dessinée puis la vue redessinée dans la même tâche, rien ne clignote.
 */
import * as THREE from "three";
import { bodyInfo } from "../document/materials";
import type { CadDocument } from "../document/types";
import type { Viewport } from "../viewport/viewport";

/** The card's picture (px): wide, as the card's band. */
export const PREVIEW_SIZE = { width: 480, height: 240 } as const;
/** At most one picture sent in this time (ms). */
const EVERY = 60_000;
/** The iso direction of the view (camera-rig.ts), from the furniture towards the eye. */
const ISO = new THREE.Vector3(1, -1, 0.8).normalize();

/**
 * The model drawn from the iso direction, framed on the bodies `keep` keeps, as a JPEG data URL; "" when there is
 * nothing to draw.
 */
export function capturePreview(viewport: Viewport, keep: (bodyId: string) => boolean): string {
  const { renderer, scene } = viewport;
  const hidden: THREE.Object3D[] = [];
  const box = new THREE.Box3();
  for (const object of scene.children) {
    if (object instanceof THREE.Light) continue;
    const bodyId = object.userData.bodyId as string | undefined;
    if (bodyId !== undefined && keep(bodyId) && object.visible) {
      if (object instanceof THREE.Mesh) box.expandByObject(object);
      continue;
    }
    if (object.visible) hidden.push(object);
  }
  if (box.isEmpty()) return "";
  const source = renderer.domElement;
  const aspect = source.width / Math.max(source.height, 1);
  const camera = new THREE.PerspectiveCamera(30, aspect, 1, 1e7);
  camera.up.set(0, 0, 1);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  // Far enough for the sphere to fill the picture's height (the crop below keeps its middle).
  const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  camera.position.copy(sphere.center).addScaledVector(ISO, distance);
  camera.lookAt(sphere.center);
  camera.near = Math.max(distance / 1000, 0.1);
  camera.far = distance * 4;
  camera.updateProjectionMatrix();
  for (const object of hidden) object.visible = false;
  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_SIZE.width;
  canvas.height = PREVIEW_SIZE.height;
  const g = canvas.getContext("2d");
  try {
    renderer.render(scene, camera);
    if (!g) return "";
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    // The middle of the view at the card's proportions.
    const want = PREVIEW_SIZE.width / PREVIEW_SIZE.height;
    const [w, h] = aspect > want ? [source.height * want, source.height] : [source.width, source.width / want];
    g.drawImage(source, (source.width - w) / 2, (source.height - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
  } finally {
    for (const object of hidden) object.visible = true;
    // The user's view again, in the same task: the picture's frame is never shown.
    renderer.render(scene, viewport.camera);
    viewport.invalidate();
  }
  return canvas.toDataURL("image/jpeg", 0.82);
}

/** Sends the picture of the model to the server, at most once a minute; `now` takes the next at once. */
export function bindProjectPreview(viewport: Viewport, doc: () => CadDocument, apiUrl: string): { saved(): void; now(): void } {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = () => {
    timer = undefined;
    last = Date.now();
    const current = doc();
    const thumbnail = capturePreview(viewport, (id) => !bodyInfo(current, id).room);
    if (!thumbnail) return;
    const csrf = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
    void fetch(`${apiUrl}thumbnail/`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRFToken": decodeURIComponent(csrf) },
      body: JSON.stringify({ thumbnail }),
    }).catch(() => undefined);
  };
  return {
    saved() {
      if (timer !== undefined) return;
      timer = setTimeout(send, Math.max(1500, last + EVERY - Date.now()));
    },
    now() {
      clearTimeout(timer);
      timer = setTimeout(send, 0);
    },
  };
}
