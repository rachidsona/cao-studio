/** « Étiquettes » : on règle ce qu'elles disent, l'aperçu suit, puis on imprime. Le modèle reste pour les prochaines fois. */
import { LABEL_FIELDS, LABEL_FORMATS, labelCss, labelHtml, loadLabelTemplate, movedField, saveLabelTemplate, type LabelField, type LabelTemplate } from "../document/label-template";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { labelData, labelsPage } from "./workshop-cnc";
import { escapeHtml, openModal, printHtml } from "./workshop-ui";

const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const SMALL = "size-7 border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

export function openLabelEditor(viewport: Viewport, editor: Editor): void {
  const parts = labelData(viewport, editor);
  const sample = parts[0];
  if (!sample) return editor.notify("Aucune pièce à étiqueter.", "info");
  let template: LabelTemplate = loadLabelTemplate();
  const preview = el("div", { class: "overflow-hidden", "data-label-preview": "" });
  const shadow = preview.attachShadow({ mode: "open" });
  const list = el("div", { class: "space-y-1" });
  const set = (patch: Partial<LabelTemplate>) => {
    template = { ...template, ...patch };
    saveLabelTemplate(template);
    draw();
  };
  const draw = () => {
    noLogo.hidden = !template.logo;
    const css = labelCss(template).replace("@page{size:A4;margin:0}body{margin:0}", "");
    shadow.innerHTML = `<style>${css}</style>${labelHtml(template, sample, escapeHtml)}`;
    const on = template.fields.map((f) => LABEL_FIELDS.find(([key]) => key === f)).filter((f): f is [LabelField, string] => !!f);
    const off = LABEL_FIELDS.filter(([key]) => !template.fields.includes(key));
    list.replaceChildren(...[...on, ...off].map(([key, label]) => {
      const shown = template.fields.includes(key);
      const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: shown, "aria-label": label });
      box.addEventListener("change", () => set({ fields: box.checked ? [...template.fields, key] : template.fields.filter((f) => f !== key) }));
      const up = el("button", { type: "button", class: SMALL, "aria-label": `Monter ${label}`, disabled: !shown }, "↑");
      up.addEventListener("click", () => set({ fields: movedField(template.fields, key, -1) }));
      const down = el("button", { type: "button", class: SMALL, "aria-label": `Descendre ${label}`, disabled: !shown }, "↓");
      down.addEventListener("click", () => set({ fields: movedField(template.fields, key, 1) }));
      return el("div", { class: "flex items-center gap-1.5 text-xs" }, box, el("span", { class: "min-w-0 flex-1" }, label), up, down);
    }));
  };
  const format = el("select", { class: SELECT, "aria-label": "Format" }, ...Object.entries(LABEL_FORMATS).map(([key, f]) => el("option", { value: key, selected: key === template.format }, f.label)));
  format.addEventListener("change", () => set({ format: format.value as LabelTemplate["format"] }));
  const qr = el("select", { class: SELECT, "aria-label": "QR code" }, ...([["left", "QR code à gauche"], ["right", "QR code à droite"], ["none", "Sans QR code"]] as const).map(([value, label]) => el("option", { value, selected: value === template.qr }, label)));
  qr.addEventListener("change", () => set({ qr: qr.value as LabelTemplate["qr"] }));
  const logo = el("input", { type: "file", accept: "image/png,image/jpeg", class: "text-xs", "aria-label": "Logo" });
  logo.addEventListener("change", () => {
    const file = logo.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ logo: String(reader.result) });
    reader.readAsDataURL(file);
  });
  const noLogo = el("button", { type: "button", class: "h-8 border border-gray-300 px-2 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Retirer le logo");
  noLogo.addEventListener("click", () => {
    const { logo: _old, ...rest } = template;
    template = rest;
    saveLabelTemplate(template);
    draw();
  });
  draw();
  const content = el(
    "div",
    { class: "grid gap-4 text-sm md:grid-cols-[1fr_auto]" },
    el("div", { class: "space-y-2" }, el("h3", { class: "text-xs font-semibold tracking-wide text-gray-500 uppercase" }, "Ce qu'elle dit"), list, format, qr, el("label", { class: "block space-y-1 text-xs" }, el("span", { class: "block" }, "Logo"), logo), noLogo),
    el("div", { class: "space-y-1" }, el("h3", { class: "text-xs font-semibold tracking-wide text-gray-500 uppercase" }, `Aperçu (${parts.length} étiquettes)`), preview),
  );
  const close = openModal("Étiquettes", content, [
    { label: "Imprimer", run: () => {
      const page = labelsPage(viewport, editor);
      if (page) printHtml(page.title, page.html, page.css);
      close();
    } },
  ]);
}
