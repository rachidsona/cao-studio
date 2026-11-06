/**
 * « Notice de montage » de l'Atelier : un panneau qui montre le meuble étape par étape dans la vue (les étapes passées
 * en place, celle du moment écartée du meuble, les suivantes cachées), une vue éclatée réglable, et la notice
 * imprimée — une page par étape avec son image prise dans la vue, ses pièces et sa quincaillerie. Vue seulement :
 * le document ne change pas, et tout revient en place à la fermeture. Les étapes : document/assembly-steps.ts.
 */
import { Vector3 } from "three";
import { assemblySteps, explodeDirection, unionBox, type AssemblyStep, type Box } from "../document/assembly-steps";
import { bodyInfo } from "../document/materials";
import { bodyLabel } from "../document/operations";
import type { Vec3 } from "../document/types";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { escapeHtml, floatingPanel, printHtml, type PrintPage } from "./workshop-ui";

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** How far the pieces of the step shown move out, in sizes of the furniture. */
const STEP_OUT = 0.35;

/** The assembly notice of the furniture as it is, for the production folder. */
export type AssemblyNotice = () => PrintPage | null;

export function bindAssembly(root: HTMLElement, viewport: Viewport, editor: Editor): AssemblyNotice {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="assembly"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  /** -1: the whole furniture (exploded by `explode`); else the step shown. */
  let step = -1;
  let explode = 0;

  const bodies = () => viewport.displayedBodies.filter((id) => !bodyInfo(editor.doc, id).room);
  const boxOf = (id: string): Box | null => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]], [...b[1]]] : null;
  };

  /** Shows the furniture at step `at` (or whole, exploded by `spread`). */
  const show = (steps: AssemblyStep[], at: number, spread: number) => {
    const ids = bodies();
    const boxes = new Map(ids.flatMap((id) => (boxOf(id) ? [[id, boxOf(id)!] as const] : [])));
    if (!boxes.size) return;
    const model = unionBox([...boxes.values()]);
    const size = Math.max(...[0, 1, 2].map((i) => model[1][i]! - model[0][i]!));
    const eye = viewport.camera.getWorldDirection(new Vector3()).negate();
    const toEye: Vec3 = [eye.x, eye.y, eye.z];
    const stepOfBody = new Map(steps.flatMap((s, i) => s.bodies.map((id) => [id, i] as const)));
    for (const id of ids) {
      const box = boxes.get(id);
      const k = stepOfBody.get(id) ?? steps.length;
      const out = at < 0 ? spread * 0.5 : k === at ? STEP_OUT : 0;
      viewport.setBodyVisible(id, at < 0 || k <= at);
      if (!box || out === 0) {
        viewport.setBodyPose(id, null);
        continue;
      }
      const d = explodeDirection(box, model, toEye);
      viewport.setBodyPose(id, { rotation: IDENTITY, translation: [d[0] * out * size, d[1] * out * size, d[2] * out * size] });
    }
  };

  const restore = () => {
    for (const id of viewport.displayedBodies) {
      viewport.setBodyVisible(id, true);
      viewport.setBodyPose(id, null);
    }
  };

  /** The parts of a step, the identical names counted: "Côté ×2". */
  const partsText = (s: AssemblyStep) => {
    const counts = new Map<string, number>();
    for (const id of s.bodies) {
      const name = bodyLabel(editor.doc, id).replace(/\s+\d+$/, "");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
  };
  const hardwareText = (s: AssemblyStep) => s.hardware.map((h) => `${h.name} : ${h.quantity}${h.unit ? ` ${h.unit}` : ""}`);

  const notice = (steps: AssemblyStep[]): PrintPage => {
    const capture = () => {
      viewport.renderer.render(viewport.scene, viewport.camera);
      return viewport.renderer.domElement.toDataURL("image/png");
    };
    show(steps, -1, 0);
    const assembled = capture();
    show(steps, -1, 0.6);
    const exploded = capture();
    const pages = steps.map((s, i) => {
      show(steps, i, 0);
      const image = capture();
      const list = (title: string, items: string[]) => (items.length ? `<h3>${title}</h3><ul>${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : "");
      return `<section class="sheet"><h2><span>${i + 1}</span>${escapeHtml(s.title)}</h2><div class="row"><img src="${image}" alt=""><aside>${list("Pièces", partsText(s))}${list("Quincaillerie", hardwareText(s))}</aside></div></section>`;
    });
    show(steps, step, explode);
    const project = document.title.split("·")[0]?.trim() ?? "";
    const all = steps.flatMap(hardwareText);
    const cover = `<section class="sheet"><h1>Notice de montage — ${escapeHtml(project)}</h1><div class="row"><img src="${assembled}" alt=""><img src="${exploded}" alt=""></div>
      <p>${steps.length} étapes · ${steps.reduce((n, s) => n + s.bodies.length, 0)} pièces</p>${all.length ? `<h3>Toute la quincaillerie</h3><ul>${all.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}</section>`;
    return {
      title: "Notice de montage",
      html: cover + pages.join(""),
      css: `@page{size:A4 landscape;margin:10mm}body{margin:0}.sheet{page-break-after:always}h1{font-size:18px}h2{font-size:16px;display:flex;gap:4mm;align-items:center}
       h2 span{display:inline-flex;width:10mm;height:10mm;border-radius:50%;background:#111;color:#fff;align-items:center;justify-content:center}
       .row{display:flex;gap:6mm;align-items:flex-start}.row img{flex:1;min-width:0;max-height:150mm;object-fit:contain;border:0.3mm solid #ddd}
       aside{width:70mm;flex:none}h3{font-size:12px;margin:2mm 0 1mm}ul{margin:0;padding-left:5mm}li{font-size:11px}`,
    };
  };
  const print = (steps: AssemblyStep[]) => {
    const page = notice(steps);
    printHtml(page.title, page.html, page.css);
  };

  const render = () => {
    if (!panel) return;
    const steps = assemblySteps(editor.doc, bodies());
    if (step >= steps.length) step = steps.length - 1;
    show(steps, step, explode);
    const stepButton = (label: string, i: number) => {
      const b = el("button", { type: "button", "aria-pressed": String(step === i), class: "block w-full border border-gray-200 px-2 py-1 text-left hover:bg-gray-100 aria-pressed:border-sky-500 aria-pressed:bg-sky-50 dark:border-gray-700 dark:hover:bg-gray-800 dark:aria-pressed:bg-sky-950" }, label);
      b.addEventListener("click", () => ((step = i), render()));
      return b;
    };
    const slider = el("input", { type: "range", min: "0", max: "100", value: String(Math.round(explode * 100)), class: "w-full", "aria-label": "Éclaté" });
    slider.addEventListener("input", () => {
      explode = Number(slider.value) / 100;
      step = -1;
      show(steps, -1, explode);
      // The whole furniture is shown: its button lit (the panel is not redrawn under the slider being dragged).
      panel?.body.querySelectorAll("[aria-pressed]").forEach((b, i) => b.setAttribute("aria-pressed", String(i === 0)));
    });
    const nav = (label: string, to: number) => {
      const b = el("button", { type: "button", class: "h-7 flex-1 border border-gray-300 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800" }, label);
      b.disabled = to < -1 || to >= steps.length;
      b.addEventListener("click", () => ((step = to), render()));
      return b;
    };
    const printButton = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Imprimer la notice");
    printButton.addEventListener("click", () => print(steps));
    const current = steps[step];
    panel.body.replaceChildren(
      el("label", { class: "block space-y-1" }, el("span", {}, "Vue éclatée"), slider),
      stepButton("Le meuble monté", -1),
      ...steps.map((s, i) => stepButton(`${i + 1}. ${s.title} (${s.bodies.length})`, i)),
      el("div", { class: "flex gap-1" }, nav("‹ Étape précédente", step - 1), nav("Étape suivante ›", step + 1)),
      current
        ? el("div", { class: "space-y-1 border-t border-gray-200 pt-2 dark:border-gray-700" }, el("p", { class: "font-medium" }, partsText(current).join(", ")), ...hardwareText(current).map((t) => el("p", { class: "text-gray-600 dark:text-gray-300" }, t)))
        : el("p", { class: "text-gray-500" }, "Choisissez une étape : les pièces déjà montées restent en place, celles de l'étape s'écartent du meuble, les suivantes sont cachées."),
      printButton,
    );
  };

  const start = () => {
    if (panel) return panel.close();
    step = -1;
    explode = 0;
    panel = floatingPanel(container, "Notice de montage", () => {
      panel = null;
      restore();
      button?.setAttribute("aria-pressed", "false");
    }, true);
    button?.setAttribute("aria-pressed", "true");
    render();
  };
  button?.addEventListener("click", start);
  // A regeneration puts the bodies back in place: the panel shows its step again.
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    if (panel) render();
  };
  return () => {
    const steps = assemblySteps(editor.doc, bodies());
    if (!steps.length) return null;
    const page = notice(steps);
    if (!panel) restore();
    return page;
  };
}
