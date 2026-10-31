/**
 * « Image de référence » de l'esquisse : une photo ou un croquis posé sous l'esquisse, pour décalquer un meuble à
 * refaire ou un mur photographié. On l'importe (réduite à 1600 px, gardée avec le projet), on règle sa largeur (la
 * hauteur suit), son coin et son opacité ; « Caler avec deux points » : deux clics sur l'image, puis leur distance
 * réelle, et l'image est mise à l'échelle autour du premier point. Chaque réglage est une annulation.
 */
import { imageFileToDataUrl } from "../appearance/custom";
import type { SketchUnderlay } from "../document/sketch";
import type { SketchMode } from "../sketcher/mode";
import { el } from "../ui/dom";
import { openModal } from "./workshop-ui";

type Notify = (message: string, kind?: "info" | "success" | "error") => void;
const INPUT = "h-8 w-28 border border-gray-300 bg-white px-2 text-right text-sm dark:border-gray-600 dark:bg-gray-900";

/** The image scaled by `k` around the point p (its corner and size follow). */
export function scaleUnderlay(u: SketchUnderlay, p: [number, number], k: number): SketchUnderlay {
  return { ...u, x: p[0] + (u.x - p[0]) * k, y: p[1] + (u.y - p[1]) * k, width: u.width * k, height: u.height * k };
}

const set = (mode: SketchMode, underlay: SketchUnderlay | undefined, message: string) => mode.apply({ ...mode.geometry, underlay }, message);

/** Asks for an image of the computer; its size in pixels gives its proportions. */
function pickImage(mode: SketchMode, notify: Notify, then: () => void): void {
  const input = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const image = await imageFileToDataUrl(file, 1600);
      const probe = new Image();
      probe.src = image;
      await probe.decode();
      const width = mode.geometry.underlay?.width ?? 1000;
      const height = (width * probe.naturalHeight) / Math.max(probe.naturalWidth, 1);
      set(mode, { image, x: mode.geometry.underlay?.x ?? 0, y: mode.geometry.underlay?.y ?? 0, width, height, opacity: mode.geometry.underlay?.opacity ?? 0.5 }, `Image « ${file.name} » posée sous l'esquisse.`);
      mode.ensureVisible(true);
      then();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  });
  input.click();
}

/** Two clicks on the image (in the sketch), then the real distance between them. */
function calibrate(mode: SketchMode, notify: Notify): void {
  const canvas = mode.viewport.renderer.domElement;
  const picked: [number, number][] = [];
  notify("Cliquez deux points de l'image dont vous connaissez la distance (Échap pour arrêter).", "info");
  const stop = () => {
    canvas.removeEventListener("pointerdown", swallow, true);
    canvas.removeEventListener("pointerup", click, true);
    window.removeEventListener("keydown", key, true);
  };
  const swallow = (event: PointerEvent) => event.stopImmediatePropagation();
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    stop();
  };
  const click = (event: PointerEvent) => {
    event.stopImmediatePropagation();
    const p = mode.toSketch(event);
    if (!p) return;
    picked.push([p[0], p[1]]);
    if (picked.length < 2) return notify("Cliquez le second point.", "info");
    stop();
    const [a, b] = picked as [[number, number], [number, number]];
    const measured = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (measured < 1e-6) return notify("Les deux points sont au même endroit.", "error");
    const real = el("input", { type: "number", min: "0", step: "any", value: String(Math.round(measured)), class: INPUT, "aria-label": "Distance réelle" });
    const apply = () => {
      const d = Number(real.value);
      if (!(d > 0) || !mode.geometry.underlay) return;
      close();
      set(mode, scaleUnderlay(mode.geometry.underlay, a, d / measured), `Image de référence à l'échelle : ${Math.round(d)} mm entre les deux points.`);
    };
    const close = openModal("Caler l'image", el("label", { class: "flex items-center gap-3 text-sm" }, `Distance réelle entre les deux points (mesurée ${Math.round(measured)} mm sur l'image) :`, real, "mm"), [
      { label: "Mettre à l'échelle", run: apply },
      { label: "Annuler", run: () => close() },
    ]);
    real.focus();
    real.select();
  };
  canvas.addEventListener("pointerdown", swallow, true);
  canvas.addEventListener("pointerup", click, true);
  window.addEventListener("keydown", key, true);
}

export function openUnderlay(mode: SketchMode, notify: Notify): void {
  const u = mode.geometry.underlay;
  if (!u) return pickImage(mode, notify, () => openUnderlay(mode, notify));
  const field = (label: string, value: number, change: (v: number) => SketchUnderlay | null) => {
    const input = el("input", { type: "number", step: "any", value: String(Number(value.toFixed(1))), class: INPUT, "aria-label": label });
    input.addEventListener("change", () => {
      const next = change(Number(input.value));
      if (next) set(mode, next, `Image de référence : ${label.toLowerCase()} changée.`);
    });
    return el("label", { class: "flex items-center justify-between gap-3" }, el("span", {}, label), input);
  };
  const content = el(
    "div",
    { class: "space-y-2 text-sm" },
    el("img", { src: u.image, alt: "", class: "max-h-32 border border-gray-200 object-contain dark:border-gray-700" }),
    field("Largeur (mm)", u.width, (v) => (v > 0 ? { ...u, width: v, height: (u.height * v) / u.width } : null)),
    field("Coin X (mm)", u.x, (v) => ({ ...u, x: v })),
    field("Coin Y (mm)", u.y, (v) => ({ ...u, y: v })),
    field("Opacité (%)", u.opacity * 100, (v) => (v >= 0 && v <= 100 ? { ...u, opacity: v / 100 } : null)),
    el("p", { class: "text-xs text-gray-500" }, "« Caler avec deux points » : cliquez deux points de l'image dont vous connaissez la distance (deux angles d'un meuble, une cote du croquis), puis donnez-la."),
  );
  const close = openModal("Image de référence", content, [
    { label: "Caler avec deux points", run: () => (close(), calibrate(mode, notify)) },
    { label: "Changer d'image", run: () => (close(), pickImage(mode, notify, () => {})) },
    { label: "Retirer l'image", run: () => (close(), set(mode, undefined, "Image de référence retirée.")) },
    { label: "Fermer", run: () => close() },
  ]);
}
