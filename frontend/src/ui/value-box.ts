/**
 * The value box at the bottom of the view (as SketchUp's "Measurements" box): what the tool would do with the
 * pointer where it is (a length, two distances…), read live, and what is being typed on the keyboard — numbers go
 * there directly, without clicking a field; Entrée applies them. The tool decides what the values mean.
 */
import { el } from "./dom";

export class ValueBox {
  private readonly root: HTMLElement;
  private readonly label = el("span", { class: "whitespace-nowrap text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" });
  private readonly value = el("span", { class: "whitespace-nowrap font-mono tabular-nums" });
  private readonly typed = el("span", { class: "hidden whitespace-nowrap bg-sky-100 px-1 font-mono text-sky-900 dark:bg-sky-900 dark:text-sky-100" });
  private readonly hint = el("span", { class: "hidden truncate text-[11px] text-gray-500 lg:inline" });

  constructor(container: HTMLElement) {
    this.root = el(
      "div",
      {
        class:
          "pointer-events-none absolute bottom-2 left-1/2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 border border-gray-300 bg-white/95 px-3 py-1.5 text-sm shadow-lg backdrop-blur dark:border-gray-600 dark:bg-gray-900/95",
        role: "status",
        "aria-live": "polite",
        "aria-label": "Mesures",
      },
      this.label,
      this.value,
      this.typed,
      this.hint,
    );
    container.append(this.root);
  }

  /** What the values are (« Longueur ; angle »), their live reading, and a short hint. */
  show(label: string, value: string, hint = ""): void {
    this.label.textContent = label;
    this.value.textContent = value;
    this.hint.textContent = hint;
  }

  /** The text being typed (null: nothing typed, the live reading shows). */
  setTyped(text: string | null): void {
    const typing = text !== null;
    this.typed.textContent = typing ? `${text}▏` : "";
    this.typed.classList.toggle("hidden", !typing);
    this.value.classList.toggle("opacity-40", typing);
  }

  dispose(): void {
    this.root.remove();
  }
}
