/**
 * Loading screen of the editor (markup in templates/editor/editor.html): the steps of the start-up and a bar
 * that follows the download of the 3D kernel, then fades out; an error stays shown with what went wrong.
 */
import { formatBytes } from "./format-bytes";

export class LoadingScreen {
  private readonly bar: HTMLElement | null;
  private readonly step: HTMLElement | null;
  private readonly error: HTMLElement | null;

  constructor(private readonly root: HTMLElement | null) {
    this.bar = root?.querySelector<HTMLElement>('[data-ref="loading-bar"]') ?? null;
    this.step = root?.querySelector<HTMLElement>('[data-ref="loading-step"]') ?? null;
    this.error = root?.querySelector<HTMLElement>('[data-ref="loading-error"]') ?? null;
  }

  /** `fraction` from 0 to 1 of the whole start-up. */
  show(text: string, fraction?: number): void {
    if (this.step) this.step.textContent = text;
    if (this.bar && fraction !== undefined) this.bar.style.width = `${Math.round(Math.min(1, Math.max(0.03, fraction)) * 100)}%`;
  }

  /** The kernel download: most of the start-up (up to 85 % of the bar). */
  download(loaded: number, total: number): void {
    this.show(`Téléchargement du noyau 3D : ${formatBytes(loaded)} sur ${formatBytes(total)}`, 0.05 + 0.8 * (total ? loaded / total : 0));
  }

  done(): void {
    if (!this.root) return;
    this.show("Prêt", 1);
    this.root.classList.add("opacity-0", "pointer-events-none", "transition-opacity", "duration-300");
    window.setTimeout(() => this.root?.remove(), 350);
  }

  fail(message: string): void {
    if (this.error) {
      this.error.textContent = `${message} Rechargez la page ; si le problème revient, il a été signalé.`;
      this.error.classList.remove("hidden");
    }
    this.bar?.classList.replace("bg-sky-600", "bg-red-600");
  }
}
