/**
 * Portés de poly_3D : « Rayons X » dans la colonne Vue (les corps translucides, pour voir l'intérieur d'un meuble sans
 * rien cacher) et, dans la barre Modifier, le menu « Affichage » — une case par famille de corps (façades, carcasse, fonds, étagères, plinthes,
 * pièce, électroménager, autres : document/display-families.ts), « Vue de travail » qui dégage l'intérieur d'un
 * clic (façades, murs et électroménager cachés) et « Tout afficher ». La vue seulement : le document, la liste de
 * débit et le devis n'en changent pas ; les choix sont gardés dans ce navigateur.
 */
import { FAMILIES, visibleByFamily, WORK_VIEW_HIDDEN, type Family } from "../document/display-families";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

const XRAY_KEY = "cao.xray";
const FAMILIES_KEY = "cao.display-hidden";

function readHidden(): Set<Family> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FAMILIES_KEY) ?? "[]");
    if (Array.isArray(parsed)) return new Set(parsed.filter((f): f is Family => FAMILIES.some((k) => k.id === f)));
  } catch {
    // Unreadable: everything shown.
  }
  return new Set();
}

export function bindDisplayToggles(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  // ---- X-ray ----
  const xray = root.querySelector<HTMLButtonElement>("[data-xray]");
  const setXray = (on: boolean) => {
    viewport.setXray(on);
    xray?.setAttribute("aria-pressed", String(on));
    try {
      localStorage.setItem(XRAY_KEY, on ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
  };
  let xrayOn = false;
  try {
    xrayOn = localStorage.getItem(XRAY_KEY) === "1";
  } catch {
    // No storage: solid.
  }
  setXray(xrayOn);
  xray?.addEventListener("click", () => setXray(xray.getAttribute("aria-pressed") !== "true"));

  // ---- families ----
  const menu = root.querySelector<HTMLButtonElement>("[data-display-menu]");
  const options = root.querySelector<HTMLElement>("[data-display-options]");
  const hidden = readHidden();
  const apply = () => {
    const visible = visibleByFamily(editor.doc, viewport.displayedBodies, hidden);
    for (const [id, on] of visible) viewport.setBodyVisible(id, on);
    menu?.setAttribute("aria-pressed", String(hidden.size > 0));
    for (const box of options?.querySelectorAll<HTMLInputElement>("[data-display-family]") ?? []) box.checked = !hidden.has(box.dataset.displayFamily as Family);
    try {
      localStorage.setItem(FAMILIES_KEY, JSON.stringify([...hidden]));
    } catch {
      // Kept for this page only.
    }
  };
  for (const box of options?.querySelectorAll<HTMLInputElement>("[data-display-family]") ?? []) {
    box.addEventListener("change", () => {
      const family = box.dataset.displayFamily as Family;
      if (box.checked) hidden.delete(family);
      else hidden.add(family);
      apply();
    });
  }
  options?.querySelector("[data-display-work]")?.addEventListener("click", () => {
    hidden.clear();
    for (const f of WORK_VIEW_HIDDEN) hidden.add(f);
    apply();
  });
  options?.querySelector("[data-display-all]")?.addEventListener("click", () => {
    hidden.clear();
    apply();
  });
  const close = () => {
    options?.classList.add("hidden");
    menu?.setAttribute("aria-expanded", "false");
  };
  menu?.addEventListener("click", () => {
    const open = options?.classList.toggle("hidden") === false;
    menu.setAttribute("aria-expanded", String(open));
    if (!open || !options) return;
    // Under the button, or under its group when the button is put away in the group's menu.
    const anchor = (menu.offsetWidth ? menu : menu.closest<HTMLElement>(".ribbon-group") ?? menu).getBoundingClientRect();
    options.style.left = `${Math.min(anchor.left, innerWidth - options.offsetWidth - 8)}px`;
    options.style.top = `${anchor.bottom + 4}px`;
  });
  // It floats over the view: a press anywhere else puts it away.
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (!options?.contains(target) && !menu?.contains(target)) close();
  });
  // Applied again whenever the bodies are drawn again (a recompute replaces them, shown).
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    if (hidden.size) apply();
  };
  apply();
}
