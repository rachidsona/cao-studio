/**
 * « Corps » dans l'Affichage de l'esquisse : les corps montrés derrière l'esquisse (en transparence), ou cachés — les
 * esquisses seules à l'écran, et rien d'un corps à viser. Le choix est retenu par le navigateur, pour les esquisses
 * suivantes ; en quittant l'esquisse, les corps reviennent toujours.
 */
import type { Viewport } from "../viewport/viewport";

const KEY = "cao.sketch-bodies";

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== "hidden";
  } catch {
    return true;
  }
}

export function bindSketchBodies(root: HTMLElement, viewport: Viewport): void {
  let shown = stored();
  const sync = () => {
    viewport.setSketchAlone(!shown);
    for (const button of root.querySelectorAll<HTMLElement>("[data-sketch-bodies]")) button.setAttribute("aria-pressed", String(shown));
  };
  root.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("[data-sketch-bodies]")) return;
    shown = !shown;
    try {
      localStorage.setItem(KEY, shown ? "shown" : "hidden");
    } catch {
      // Not remembered: back at the next visit.
    }
    sync();
  });
  sync();
}
