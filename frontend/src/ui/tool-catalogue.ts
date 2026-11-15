/**
 * Tous les outils qu'on peut mettre dans une barre (les sept colonnes, la colonne Sélection et vue, Mes outils) : ceux
 * du ruban du modèle, puis ceux de la colonne Sélection et vue, chacun une fois, avec son nom et son groupe. Les copies
 * d'outils posées dans les barres (data-tool-proxy) et les boutons des barres elles-mêmes (data-bar-control) n'en sont pas.
 */
import { keyOf } from "./ribbon-layout";
import type { Tool } from "./tool-columns-picker";

/** The view tools beside the viewport have no ribbon key: their first data attribute names them. */
export function toolKey(button: HTMLElement): string | null {
  const key = keyOf(button);
  if (key) return key;
  const attribute = [...button.attributes].find((a) => a.name.startsWith("data-") && a.name !== "data-ref");
  return attribute ? `${attribute.name}:${attribute.value}` : null;
}

/** Every tool one may put in a column: the model's ribbon, then the selection and view column; each once. */
export function catalogue(root: HTMLElement): Tool[] {
  const seen = new Set<string>();
  const buttons = [
    ...root.querySelectorAll<HTMLElement>('[data-ribbon="model"] .ribbon-row > button'),
    ...[...root.querySelectorAll<HTMLElement>("[data-side-tools] button")].filter((b) => !b.closest("[data-orbit-options], [data-tool-proxy], [data-bar-control]")),
  ];
  return buttons.flatMap((button) => {
    const key = toolKey(button);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    const label = button.getAttribute("aria-label") ?? button.dataset.tip ?? button.title.split(" : ")[0] ?? key;
    const group = button.closest(".ribbon-group")?.getAttribute("aria-label") ?? "Sélection et vue";
    return [{ key, label, group, button }];
  });
}
