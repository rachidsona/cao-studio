/**
 * "Mouvements" (open a door, pull a drawer): the chosen body slides along an
 * axis or turns about a hinge line, with a slider or an animation, and the
 * panel says which bodies it runs into. View only: nothing is changed in the
 * model. Click a body in the view (or start with one selected) to choose it.
 * The maths are in features/motion.ts.
 */
import { bodyLabel } from "../document/operations";
import type { Axis, Vec3 } from "../document/types";
import { collisions, motionRange, pivotCorners, poseOf, type Box, type Motion } from "../features/motion";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { AXIS_OPTIONS } from "./curic-common";
import { floatingPanel } from "./workshop/workshop-ui";

const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

export function bindMotion(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="motion"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let handler: PointerHandler | null = null;
  let body: string | null = null;
  let kind: Motion["kind"] = "slide";
  let axis: Axis = 1;
  let pivotIndex = 0;
  let amount = 0;
  let playing: number | undefined;

  const boxOf = (id: string): Box | null => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  };

  const motion = (box: Box): Motion =>
    kind === "slide" ? { kind, axis, distance: amount } : { kind, axis, pivot: (pivotCorners(box, axis)[pivotIndex] ?? pivotCorners(box, axis)[0]!).pivot, angle: amount };

  const pose = (): string[] => {
    if (!body) return [];
    const box = boxOf(body);
    if (!box) return [];
    const m = motion(box);
    viewport.setBodyPose(body, poseOf(m));
    const others = viewport.displayedBodies.filter((id) => id !== body).flatMap((id) => {
      const b = boxOf(id);
      return b ? [{ id, box: b }] : [];
    });
    return collisions(box, m, others);
  };

  const stopPlaying = () => {
    window.clearInterval(playing);
    playing = undefined;
  };

  const release = () => {
    stopPlaying();
    if (body) viewport.setBodyPose(body, null);
  };

  const choose = (id: string | null) => {
    release();
    body = id;
    amount = 0;
    if (id) {
      const box = boxOf(id);
      // A board wider than deep, in front: a door (hinge about Z); otherwise a drawer pulled along Y.
      const [w, d, h] = box ? [0, 1, 2].map((i) => (box[1][i] as number) - (box[0][i] as number)) : [1, 1, 1];
      kind = (d as number) < Math.min(w as number, h as number) / 4 ? "hinge" : "slide";
      axis = kind === "hinge" ? 2 : 1;
      pivotIndex = 0;
    }
    render();
  };

  const render = (): void => {
    if (!panel) return;
    const hit = pose();
    const box = body ? boxOf(body) : null;
    if (!body || !box) {
      panel.body.replaceChildren(el("p", { class: "text-gray-600 dark:text-gray-300" }, "Cliquez la porte ou le tiroir dans la vue."));
      return;
    }
    const range = motionRange(kind, box, axis);
    const kindSelect = el("select", { class: SELECT, "aria-label": "Type de mouvement" }, el("option", { value: "slide", selected: kind === "slide" }, "Tiroir (glisse)"), el("option", { value: "hinge", selected: kind === "hinge" }, "Porte (charnière)"));
    kindSelect.addEventListener("change", () => {
      release();
      kind = kindSelect.value as Motion["kind"];
      axis = kind === "hinge" ? 2 : 1;
      amount = 0;
      render();
    });
    const axisSelect = el("select", { class: SELECT, "aria-label": "Axe" }, ...AXIS_OPTIONS.map(([v, t]) => el("option", { value: v, selected: Number(v) === axis }, t)));
    axisSelect.addEventListener("change", () => {
      axis = Number(axisSelect.value) as Axis;
      pivotIndex = 0;
      amount = 0;
      render();
    });
    const pivots = kind === "hinge" ? el("select", { class: SELECT, "aria-label": "Charnière" }, ...pivotCorners(box, axis).map((c, i) => el("option", { value: String(i), selected: i === pivotIndex }, `Charnière : ${c.name}`))) : null;
    pivots?.addEventListener("change", () => {
      pivotIndex = Number(pivots.value);
      render();
    });
    const slider = el("input", { type: "range", min: String(range.min), max: String(range.max), step: kind === "hinge" ? "1" : "5", value: String(amount), class: "w-full accent-orange-500", "aria-label": "Ouverture" });
    const shown = el("span", { class: "font-mono tabular-nums" }, kind === "hinge" ? `${amount}°` : formatLength(amount, editor.unit));
    slider.addEventListener("input", () => {
      amount = Number(slider.value);
      shown.textContent = kind === "hinge" ? `${amount}°` : formatLength(amount, editor.unit);
      showCollisions(pose());
    });
    const play = el("button", { type: "button", class: BUTTON }, "▶ Jouer");
    play.addEventListener("click", () => {
      stopPlaying();
      const start = performance.now();
      const duration = 2400;
      playing = window.setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / duration);
        amount = Math.round(range.max * Math.sin(Math.PI * t));
        slider.value = String(amount);
        shown.textContent = kind === "hinge" ? `${amount}°` : formatLength(amount, editor.unit);
        showCollisions(pose());
        if (t >= 1) {
          stopPlaying();
          amount = 0;
          showCollisions(pose());
        }
      }, 40);
    });
    const reset = el("button", { type: "button", class: BUTTON }, "Remettre");
    reset.addEventListener("click", () => {
      stopPlaying();
      amount = 0;
      render();
    });
    const result = el("p", { role: "status" });
    const showCollisions = (ids: string[]) => {
      const names = ids.map((id) => bodyLabel(editor.doc, id));
      result.className = names.length ? " bg-red-50 px-2 py-1.5 text-red-800 dark:bg-red-950 dark:text-red-200" : " bg-emerald-50 px-2 py-1.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
      result.textContent = names.length ? `Collision avec : ${names.join(", ")}` : "Aucune collision.";
    };
    showCollisions(hit);
    const rows: (HTMLElement | null)[] = [
      el("p", { class: "font-medium" }, bodyLabel(editor.doc, body)),
      kindSelect,
      axisSelect,
      pivots,
      el("div", { class: "flex items-center justify-between" }, el("span", {}, "Ouverture"), shown),
      slider,
      el("div", { class: "flex gap-1" }, play, reset),
      result,
      el("p", { class: "text-2xs text-gray-500" }, "Contrôle sur les boîtes englobantes (exact pour des planches). La vue seulement : le modèle ne change pas."),
    ];
    panel.body.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  };

  const stop = (): void => {
    release();
    if (handler) viewport.setPointerHandler(null);
    handler = null;
    window.removeEventListener("keydown", onKey, true);
    body = null;
    panel?.close();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    stop();
  };

  const clicker: PointerHandler = {
    down: () => false,
    move: () => {},
    up: (event, isClick) => {
      if (!isClick) return false;
      const target = viewport.hoverTargetForTool(event);
      if (target?.kind === "body") choose(target.id);
      return true;
    },
  };

  button?.addEventListener("click", () => {
    if (panel) return stop();
    panel = floatingPanel(container, "Mouvements", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
      if (handler) stop();
    });
    button.setAttribute("aria-pressed", "true");
    handler = clicker;
    viewport.setPointerHandler(clicker);
    window.addEventListener("keydown", onKey, true);
    const selected = editor.picked.selection.bodies[0] ?? editor.picked.selection.faces[0]?.bodyId ?? null;
    choose(selected);
  });

  // A regeneration builds the meshes again: the pose is put back on the new ones.
  editor.afterRender(() => {
    if (panel && body) {
      if (viewport.bodyMesh(body)) render();
      else choose(null);
    }
  });
}
