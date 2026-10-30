/**
 * Bouton « Apparence » (Atelier) : ouvre la bibliothèque d'apparences à droite. Un clic sur une vignette la donne aux
 * corps sélectionnés ; une vignette glissée sur la vue la donne au corps lâché dessous (surligné pendant le glisser).
 * Chaque changement est une modification du document (Annuler la reprend) ; la vue passe aux apparences.
 */
import { AppearancePanel, DRAG_TYPE, droppedAppearance } from "../appearance/appearance-panel";
import { bodyAppearance, setBodyAppearance } from "../appearance/assign";
import type { Appearance } from "../appearance/library";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

export function bindAppearance(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="appearance"]');
  let panel: AppearancePanel | null = null;

  const look = (id: string) => bodyAppearance(editor.doc, id, viewport.bodyMesh(id)?.metrics.bbox);
  const targets = () => {
    const { bodies, faces } = editor.picked.selection;
    return [...new Set([...bodies, ...faces.map((f) => f.bodyId)])];
  };
  const apply = (bodyIds: string[], appearanceId: string | null, color?: string) => {
    void editor.change(setBodyAppearance(editor.doc, bodyIds, appearanceId, color));
    // The view shows appearances ("Rendu des matières" on).
    const toggle = root.querySelector<HTMLButtonElement>('[data-workshop="render"]');
    if (toggle?.getAttribute("aria-pressed") === "false") toggle.click();
  };

  const close = () => {
    panel?.dispose();
    panel = null;
    button?.setAttribute("aria-pressed", "false");
  };
  const open = () => {
    if (panel) return close();
    panel = new AppearancePanel(container, {
      targets,
      used: () => {
        const counts = new Map<string, { appearance: Appearance; color?: string; count: number }>();
        for (const id of viewport.displayedBodies) {
          const found = look(id);
          if (!found) continue;
          const key = `${found.appearance.id}|${found.color ?? ""}`;
          const entry = counts.get(key) ?? { appearance: found.appearance, color: found.color, count: 0 };
          entry.count++;
          counts.set(key, entry);
        }
        return [...counts.values()];
      },
      targetColor: () => {
        const first = targets()[0];
        return first ? look(first)?.color : undefined;
      },
      apply,
      notify: (message) => editor.notify(message, "info"),
      close,
    });
    button?.setAttribute("aria-pressed", "true");
  };
  button?.addEventListener("click", open);

  // A swatch dragged onto the view: the body under the pointer is outlined, and takes the appearance on drop.
  const bodyUnder = (event: DragEvent) => viewport.pickFace(event as unknown as PointerEvent)?.bodyId ?? null;
  container.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const body = bodyUnder(event);
    viewport.setHoverHighlight(body ? { bodies: [body] } : null);
  });
  container.addEventListener("dragleave", () => viewport.setHoverHighlight(null));
  container.addEventListener("drop", (event) => {
    const dropped = droppedAppearance(event);
    if (!dropped) return;
    event.preventDefault();
    viewport.setHoverHighlight(null);
    const body = bodyUnder(event);
    if (body) apply([body], dropped.id, dropped.color);
    else editor.notify("Lâchez l'apparence sur un corps.", "info");
  });

  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    panel?.draw();
  };
}
