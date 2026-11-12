/**
 * Le mode Rendu dans l'éditeur : le bouton « Rendu » (Atelier) l'ouvre ; la barre du rendu remplace alors les
 * outils de modélisation (comme l'espace Rendu de Fusion), le panneau de réglages s'ouvre à droite, et Échap ou
 * « Quitter le rendu » ramène à l'édition. La scène du rendu suit les régénérations et les matières choisies.
 * Seule la bibliothèque de lancer de rayons est chargée à la première ouverture : un module de l'application chargé à
 * part importerait editor.js sous une autre adresse (sans « ?v= ») et l'exécuterait une seconde fois.
 */
import { bodyAppearance, faceAppearances } from "../appearance/assign";
import { FINISHED_CATEGORIES } from "../appearance/three-materials";
import { formatLength } from "../measurements/units";
import { RenderMode, type RenderProgress } from "../render/render-mode";
import { RenderPanel } from "../render/render-panel";
import type { BodyLook } from "../render/render-scene";
import { loadSettings } from "../render/settings";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

export function bindRenderWorkspace(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const look = (id: string): BodyLook => bodyAppearance(editor.previewDoc ?? editor.doc, id, viewport.bodyMesh(id)?.metrics.bbox);
  const faces = (id: string) => faceAppearances(editor.previewDoc ?? editor.doc, id, viewport.bodyMesh(id)?.metrics.bbox);
  const status = root.querySelector<HTMLElement>("[data-render-status]");
  const pause = root.querySelector<HTMLButtonElement>('[data-render="pause"]');
  let mode: RenderMode | null = null;
  let panel: RenderPanel | null = null;
  let loading = false;
  let lastStatus = "";

  const showProgress = (progress: RenderProgress) => {
    panel?.showProgress(progress);
    const text = progress.capture ? `Image : ${progress.samples} / ${progress.target}` : `${progress.samples} / ${progress.target} échantillons`;
    if (status && text !== lastStatus) status.textContent = lastStatus = text;
  };

  const exit = () => {
    if (!mode?.active) return;
    mode.exit();
    panel?.dispose();
    panel = null;
    delete root.dataset.render;
  };

  const enter = async () => {
    if (mode?.active) return exit();
    if (loading) return;
    if (root.dataset.mode === "sketch") return editor.notify("Terminez l'esquisse avant d'ouvrir le rendu.", "info");
    if (!viewport.displayedBodies.length) return editor.notify("Aucun corps à rendre : créez ou affichez un corps.", "info");
    loading = true;
    try {
      const library = await import("three-gpu-pathtracer");
      const active = (mode ??= new RenderMode(library, viewport, look, loadSettings(), faces));
      active.onProgress = showProgress;
      try {
        active.enter();
      } catch (error) {
        active.exit();
        editor.notify(`Le rendu n'a pas pu démarrer sur cet appareil (${error instanceof Error ? error.message : String(error)}).`, "error");
        return;
      }
      root.dataset.render = "on";
      pause?.setAttribute("aria-pressed", "false");
      panel = new RenderPanel(container, active, {
        materials: () => {
          const used = new Map(viewport.displayedBodies.map((id) => look(id)?.appearance).filter((a) => a && FINISHED_CATEGORIES.has(a.category)).map((a) => [a!.id, a!.name]));
          return [...used].map(([id, name]) => ({ id, name }));
        },
        length: (mm) => formatLength(mm, editor.unit),
        notify: (message, kind = "info") => editor.notify(message, kind),
        exit,
      });
    } catch (error) {
      editor.notify(`Le rendu n'a pas pu être chargé (${error instanceof Error ? error.message : String(error)}).`, "error");
    } finally {
      loading = false;
    }
  };

  root.querySelector('[data-action="render-mode"]')?.addEventListener("click", () => void enter());
  root.querySelector('[data-render="exit"]')?.addEventListener("click", exit);
  root.querySelector('[data-render="capture"]')?.addEventListener("click", () => void panel?.renderImage());
  root.querySelector('[data-render="restart"]')?.addEventListener("click", () => mode?.restart());
  pause?.addEventListener("click", () => {
    if (!mode) return;
    mode.paused = !mode.paused;
    pause.setAttribute("aria-pressed", String(mode.paused));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !mode?.active || event.defaultPrevented) return;
    if ((event.target as HTMLElement | null)?.closest?.("input, select, textarea, [role=dialog]")) return;
    if (mode.focusPicking) mode.focusPicking = false;
    else exit();
  });

  editor.afterRender(() => {
    if (mode?.active) mode.markDirty();
  });
}
