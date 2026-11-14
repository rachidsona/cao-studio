/**
 * Le ruban d'outils et la barre des étapes (cuisine, dressing) en haut de l'écran, chacun par sa case du menu ⋯ :
 * « Ruban d'outils en haut » et « Barre des étapes ». Cachés d'office (les outils restent dans les colonnes à gauche
 * et dans « Outils » ; montrés si ces colonnes sont fermées). La barre des étapes cachée, le ruban montre tous les
 * outils de l'onglet (app/workflow-steps.ts). Chaque choix est gardé par le navigateur ; la barre des étapes jamais
 * choisie suit le ruban (comme quand une seule case les menait).
 */
const RIBBON = "cao.ribbon-shown";
const STEPS = "cao.steps-shown";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

function bindBox(root: HTMLElement, ref: string, key: string, attribute: "ribbon" | "stepsBar", initial: () => boolean): void {
  const box = root.querySelector<HTMLInputElement>(`[data-ref="${ref}"]`);
  let shown = initial();
  const apply = () => {
    root.dataset[attribute] = shown ? "on" : "off";
    if (box) box.checked = shown;
    // The ribbon lays its groups out again at its width (ui/ribbon-layout.ts); the steps say whether it shows all.
    window.dispatchEvent(new Event("resize"));
    document.dispatchEvent(new CustomEvent("cad:top-bars"));
  };
  box?.addEventListener("change", () => {
    shown = box.checked;
    try {
      localStorage.setItem(key, shown ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
    apply();
  });
  apply();
}

export function bindRibbonToggle(root: HTMLElement): void {
  // Never chosen: hidden, unless the columns of tools are off too (there would be no tool left in sight).
  const ribbon = () => {
    const chosen = read(RIBBON);
    return chosen === null ? read("cao.tool-columns-off") === "1" : chosen === "1";
  };
  bindBox(root, "ribbon-shown", RIBBON, "ribbon", ribbon);
  bindBox(root, "steps-shown", STEPS, "stepsBar", () => {
    const chosen = read(STEPS);
    return chosen === null ? ribbon() : chosen === "1";
  });
}
