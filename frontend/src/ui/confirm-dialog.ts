/**
 * A question asked in the page (Annuler / a confirm button), instead of the
 * browser's window.confirm: some embedded browsers block that one, which then
 * answers "no" at once without showing anything. Entrée confirms, Échap or a
 * click beside the box cancels; the editor's shortcuts are kept out meanwhile.
 */
import { el } from "./dom";

export function askConfirm(message: string, confirmLabel = "Continuer"): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = el("button", { type: "button", class: "h-9 border border-gray-300 px-3 text-sm font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Annuler");
    const ok = el("button", { type: "button", class: "h-9 bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700" }, confirmLabel);
    const box = el(
      "div",
      { class: "w-full max-w-sm space-y-3 border border-gray-200 bg-white p-4 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100", role: "alertdialog", "aria-modal": "true", "aria-label": message },
      el("p", { class: "text-sm" }, message),
      el("div", { class: "flex justify-end gap-2" }, cancel, ok),
    );
    const overlay = el("div", { class: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" }, box);
    const done = (answer: boolean) => {
      window.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(answer);
    };
    const onKey = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        done(event.key === "Enter");
      }
    };
    cancel.addEventListener("click", () => done(false));
    ok.addEventListener("click", () => done(true));
    overlay.addEventListener("click", (event) => event.target === overlay && done(false));
    window.addEventListener("keydown", onKey, true);
    document.body.append(overlay);
    ok.focus();
  });
}
