/**
 * Bouton « Apparence » (Atelier) : ouvre la bibliothèque d'apparences à droite. Un clic sur une vignette la donne aux
 * corps sélectionnés (dans le navigateur ou la vue, un groupe d'un clic sur son titre) — ou, au choix, aux seules faces
 * choisies dans la vue ; une vignette glissée sur la vue la donne au corps lâché dessous (surligné pendant le glisser) ou,
 * si ce corps est sélectionné, à toute la sélection ; à la seule face dessous avec Alt.
 * Chaque changement est une modification du document (Annuler la reprend) ; la vue passe aux apparences.
 */
import { AppearancePanel, DRAG_TYPE, droppedAppearance } from "../appearance/appearance-panel";
import { bodyAppearance, faceAppearances, setBodyAppearance } from "../appearance/assign";
import { addCustomAppearance, removeCustomAppearance } from "../appearance/custom";
import { faceMarks, setFaceAppearance, type FaceMark } from "../appearance/face-looks";
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
  // The view shows appearances ("Rendu des matières" on).
  const showAppearances = () => {
    const toggle = root.querySelector<HTMLButtonElement>('[data-workshop="render"]');
    if (toggle?.getAttribute("aria-pressed") === "false") toggle.click();
  };
  /** Faces picked in the view take the motif alone (else their whole bodies). */
  let onlyFaces = false;
  const markOf = (bodyId: string, faceIndex: number): FaceMark | undefined => {
    const mesh = viewport.bodyMesh(bodyId);
    return mesh ? faceMarks(mesh)[faceIndex] : undefined;
  };
  const apply = (bodyIds: string[], appearanceId: string | null, color?: string) => {
    const { bodies, faces } = editor.picked.selection;
    if (onlyFaces && faces.length) {
      // Bodies picked whole take it whole; the faces picked alone, only them.
      const picks = faces.flatMap((f) => {
        const mark = markOf(f.bodyId, f.faceIndex);
        return mark ? [{ bodyId: f.bodyId, mark }] : [];
      });
      const whole = bodies.length ? setBodyAppearance(editor.doc, bodies, appearanceId, color) : editor.doc;
      void editor.change(setFaceAppearance(whole, picks, appearanceId, color));
    } else void editor.change(setBodyAppearance(editor.doc, bodyIds, appearanceId, color));
    showAppearances();
  };
  /** What a swatch dropped on this body goes to: all the selection when the body is in it, else this body. */
  const droppedOn = (body: string) => {
    const picked = targets();
    return picked.includes(body) ? picked : [body];
  };
  /** An imported image: added to the project and given to the selected bodies, in one step. */
  const importImage = (name: string, image: string, tile: [number, number], bodyIds: string[]) => {
    const added = addCustomAppearance(editor.doc, name, image, tile);
    void editor.change(bodyIds.length ? setBodyAppearance(added.doc, bodyIds, added.id) : added.doc);
    editor.notify(bodyIds.length ? `Motif « ${name} » importé et appliqué.` : `Motif « ${name} » importé : cliquez-le pour l'appliquer aux corps sélectionnés.`, "success");
    if (bodyIds.length) showAppearances();
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
        const counts = new Map<string, { appearance: Appearance; color?: string; count: number; faces?: number }>();
        for (const id of viewport.displayedBodies) {
          const found = look(id);
          if (!found) continue;
          const key = `${found.appearance.id}|${found.color ?? ""}`;
          const entry = counts.get(key) ?? { appearance: found.appearance, color: found.color, count: 0 };
          entry.count++;
          counts.set(key, entry);
        }
        // The faces with a motif of their own count too.
        for (const id of viewport.displayedBodies) {
          for (const { look: face } of faceAppearances(editor.doc, id, viewport.bodyMesh(id)?.metrics.bbox)) {
            const key = `${face.appearance.id}|${face.color ?? ""}`;
            const entry = counts.get(key) ?? { appearance: face.appearance, color: face.color, count: 0, faces: 0 };
            entry.faces = (entry.faces ?? 0) + 1;
            counts.set(key, entry);
          }
        }
        return [...counts.values()];
      },
      faces: () => ({ count: editor.picked.selection.faces.length, only: onlyFaces, set: (only) => (onlyFaces = only) }),
      targetColor: () => {
        const first = targets()[0];
        return first ? look(first)?.color : undefined;
      },
      apply,
      importImage,
      removeImage: (id) => void editor.change(removeCustomAppearance(editor.doc, id)),
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
    viewport.setHoverHighlight(body ? { bodies: droppedOn(body) } : null);
  });
  container.addEventListener("dragleave", () => viewport.setHoverHighlight(null));
  container.addEventListener("drop", (event) => {
    const dropped = droppedAppearance(event);
    if (!dropped) return;
    event.preventDefault();
    viewport.setHoverHighlight(null);
    // With Alt, only the face under the pointer takes it.
    const face = event.altKey ? viewport.pickFace(event as unknown as PointerEvent) : null;
    const mark = face ? markOf(face.bodyId, face.faceIndex) : undefined;
    if (face && mark) {
      void editor.change(setFaceAppearance(editor.doc, [{ bodyId: face.bodyId, mark }], dropped.id, dropped.color));
      return showAppearances();
    }
    const body = bodyUnder(event);
    // Dropped beside the bodies: the selection takes it, if there is one.
    const bodies = body ? droppedOn(body) : targets();
    if (bodies.length) {
      void editor.change(setBodyAppearance(editor.doc, bodies, dropped.id, dropped.color));
      showAppearances();
    } else editor.notify("Lâchez l'apparence sur un corps.", "info");
  });

  editor.afterRender(() => {
    panel?.draw();
  });
}
