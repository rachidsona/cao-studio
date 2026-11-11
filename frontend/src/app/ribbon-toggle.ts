/**
 * La barre des étapes et le ruban d'outils en haut de l'écran : cachés d'office (les outils restent dans les colonnes
 * à gauche et dans « Outils » ; montrés si ces colonnes sont fermées), remis par la case « Ruban et étapes en haut » du menu ⋯. Le choix est gardé par le
 * navigateur.
 */
const KEY = "cao.ribbon-shown";

export function bindRibbonToggle(root: HTMLElement): void {
  const box = root.querySelector<HTMLInputElement>('[data-ref="ribbon-shown"]');
  let shown = false;
  try {
    // Never chosen: hidden, unless the columns of tools are off too (there would be no tool left in sight).
    const chosen = localStorage.getItem(KEY);
    shown = chosen === null ? localStorage.getItem("cao.tool-columns-off") === "1" : chosen === "1";
  } catch {
    // No storage: hidden.
  }
  const apply = () => {
    root.dataset.ribbon = shown ? "on" : "off";
    if (box) box.checked = shown;
    // The ribbon lays its groups out again at its width (ui/ribbon-layout.ts).
    window.dispatchEvent(new Event("resize"));
  };
  box?.addEventListener("change", () => {
    shown = box.checked;
    try {
      localStorage.setItem(KEY, shown ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
    apply();
  });
  apply();
}
