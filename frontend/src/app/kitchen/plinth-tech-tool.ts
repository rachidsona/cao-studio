/**
 * « Plinthe technique » (groupe Cuisine) : des grilles d'aération devant le réfrigérateur et les fours encastrés, et
 * des tiroirs de plinthe sous les meubles bas qui s'y prêtent (features/plinth-tech.ts). La fenêtre coche l'un et
 * l'autre ; « Appliquer » refait la plinthe technique de la cuisine en une étape (Ctrl + Z la retire). Ses pièces
 * prennent la matière de la plinthe.
 */
import { bodyInfo, setBodyInfo } from "../../document/materials";
import { withPlinthTech, type PlinthTechSettings } from "../../features/plinth-tech";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";
import { openModal } from "../workshop/workshop-ui";

export function openPlinthTech(editor: Editor): void {
  const made = editor.doc.features.find((f) => f.type === "trim" && f.plinthTech);
  const s: PlinthTechSettings = made?.type === "trim" && made.plinthTech ? { vents: made.plinthTech.vents, drawers: made.plinthTech.drawers } : { vents: true, drawers: false };
  const box = (label: string, key: "vents" | "drawers", hint: string) => {
    const input = el("input", { type: "checkbox", checked: s[key], "aria-label": label });
    input.addEventListener("change", () => (s[key] = input.checked));
    return el("label", { class: "flex items-start gap-2" }, input, el("span", {}, el("span", { class: "font-medium" }, label), el("br", {}), el("span", { class: "text-xs text-gray-500" }, hint)));
  };
  const content = el(
    "div",
    { class: "space-y-3 text-sm", "data-plinth-tech": "" },
    box("Grilles d'aération", "vents", "Devant chaque réfrigérateur et chaque four encastrés, dans la plinthe."),
    box("Tiroirs de plinthe", "drawers", "Sous les meubles bas de 40 cm et plus, ni sous l'évier ni sous un appareil : la plinthe est refaite en morceaux entre eux."),
    el("p", { class: "text-xs text-gray-500" }, "Si la cuisine est refaite (Plan de cuisine), appliquez de nouveau la plinthe technique."),
  );
  const apply = () => {
    const { doc, notes, made: id, plinthOf } = withPlinthTech(editor.doc, s);
    // Each board of the plinth's material.
    let next = doc;
    for (const [body, plinth] of plinthOf) {
      const material = bodyInfo(doc, plinth).material;
      if (material) next = setBodyInfo(next, [body], { material });
    }
    void editor.change(next);
    editor.notify(id ? notes.join(" ") : s.vents || s.drawers ? notes.join(" ") : "Plinthe technique retirée : les plinthes sont rendues.", id ? "success" : "info");
    close();
  };
  const close = openModal("Plinthe technique", content, [
    { label: "Appliquer", run: apply },
    { label: "Fermer", run: () => close() },
  ]);
}

export function bindPlinthTech(root: HTMLElement, editor: Editor): void {
  for (const b of root.querySelectorAll('[data-workshop="plinth-tech"]')) b.addEventListener("click", () => openPlinthTech(editor));
}
