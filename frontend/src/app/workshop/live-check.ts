/**
 * Le contrôle en direct : pendant la conception, les pièces à problème sont entourées dans la vue (rouge : erreur,
 * ambre : à regarder) et leur nombre s'affiche dans la barre d'état ; un clic ouvre le Contrôle avant fabrication, qui
 * va plus loin (perçages, ouverture des portes, flèche, stabilité). Le bouton l'éteint ; c'est gardé dans ce navigateur.
 */
import * as THREE from "three";
import type { Problem } from "../../document/fabrication-check";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { quickProblems } from "./fabrication-check";

const KEY = "cao.live-check";
/** Long enough for a series of changes to count as one. */
const WAIT = 900;
const COLORS = { error: 0xdc2626, warning: 0xf59e0b };
/** A few frames are enough to see where to look. */
const MAX_FRAMES = 40;
const EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

export function bindLiveCheck(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLElement>('[data-workshop="live-check"]');
  const status = root.querySelector<HTMLElement>("[data-live-problems]");
  const group = new THREE.Group();
  group.renderOrder = 45;
  viewport.scene.add(group);
  const materials = { error: new THREE.LineBasicMaterial({ color: COLORS.error, depthTest: false }), warning: new THREE.LineBasicMaterial({ color: COLORS.warning, depthTest: false }) };
  let on = true;
  try {
    on = localStorage.getItem(KEY) !== "0";
  } catch {
    // No storage: on.
  }

  const show = (problems: Problem[]) => {
    group.clear();
    const worst = new Map<string, Problem["severity"]>();
    for (const p of problems) for (const id of p.bodies) if (p.severity === "error" || !worst.has(id)) worst.set(id, p.severity);
    const seen = new Set(viewport.bodyMeshes().filter((m) => m.visible).map((m) => m.userData.bodyId as string));
    for (const [id, severity] of [...worst].filter(([id]) => seen.has(id)).sort((a, b) => Number(b[1] === "error") - Number(a[1] === "error")).slice(0, MAX_FRAMES)) {
      const box = viewport.bodyMesh(id)?.metrics.bbox;
      if (!box) continue;
      const [low, high] = box;
      const frame = new THREE.LineSegments(EDGES, materials[severity]);
      frame.position.set((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2);
      frame.scale.set(high[0] - low[0] + 2, high[1] - low[1] + 2, high[2] - low[2] + 2);
      frame.renderOrder = 45;
      frame.userData.bodyId = id;
      group.add(frame);
    }
    if (!status) return;
    status.hidden = problems.length === 0;
    status.textContent = `⚠ ${problems.length} à vérifier`;
    status.title = `${problems.slice(0, 3).map((p) => p.message).join("\n")}\nCliquez pour ouvrir le contrôle.`;
  };
  // A piece no longer in view — a wall that hides the room (app/wall-cutaway.ts), what is not isolated
  // (app/zone-view.ts) —: its frame goes too.
  viewport.onEachFrame(() => {
    for (const frame of group.children) frame.visible = viewport.bodyInView(frame.userData.bodyId as string);
  });
  // The material comes last in a design: a board without one is not a problem yet.
  const update = () => show(on ? quickProblems(viewport, editor.doc).filter((p) => p.kind !== "material") : []);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const set = viewport.setBodies.bind(viewport);
  viewport.setBodies = (bodies) => {
    set(bodies);
    clearTimeout(timer);
    timer = setTimeout(update, WAIT);
  };
  button?.addEventListener("click", () => {
    on = !on;
    button.setAttribute("aria-pressed", String(on));
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
    update();
  });
  button?.setAttribute("aria-pressed", String(on));
  status?.addEventListener("click", () => root.querySelector<HTMLElement>('[data-workshop="check"]')?.click());
}
