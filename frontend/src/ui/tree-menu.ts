/**
 * Menu of a right click in the navigator (as in Fusion): on a body, a folder, several selected bodies or a sketch —
 * show or hide, put in a folder, rename, delete. A floating list at the pointer; a click beside it, Échap, the wheel
 * turned beside it or another right click closes it. A scroll made by the page itself (the history strip brought to its
 * lit step at each refresh) does not: it closed the menu as soon as it opened. Nor does the window losing the focus
 * in the half-second after the click (the right button's own press).
 */
import { el } from "./dom";

export type TreeMenuItem =
  | { label: string; run: () => void; danger?: boolean; disabled?: boolean }
  | { heading: string }
  | "separator";

let close: (() => void) | null = null;
/** The window losing the focus this soon after the menu opened is the right click's own doing (ms). */
const BLUR_GRACE = 500;

export function closeTreeMenu(): void {
  close?.();
}

export function openTreeMenu(x: number, y: number, items: TreeMenuItem[]): void {
  closeTreeMenu();
  const menu = el("div", { class: "ribbon-menu tree-menu min-w-52 py-1", role: "menu", "data-tree-menu": "" });
  for (const item of items) {
    if (item === "separator") menu.append(el("div", { class: "my-1 border-t border-gray-200 dark:border-gray-700", role: "separator" }));
    else if ("heading" in item) menu.append(el("p", { class: "truncate px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-sky-700 uppercase dark:text-sky-400" }, item.heading));
    else {
      const button = el(
        "button",
        {
          type: "button",
          role: "menuitem",
          class: `flex min-h-7 w-full items-center px-2 text-left text-xs hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800 ${item.danger ? "text-red-600 dark:text-red-400" : ""}`,
          disabled: !!item.disabled,
        },
        item.label,
      );
      button.addEventListener("click", () => {
        closeTreeMenu();
        item.run();
      });
      menu.append(button);
    }
  }
  document.body.append(menu);
  // Inside the window, even near its right or bottom edge.
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - box.height - 4))}px`;
  const outside = (event: Event) => !menu.contains(event.target as Node) && closeTreeMenu();
  const opened = performance.now();
  const blur = () => performance.now() - opened > BLUR_GRACE && closeTreeMenu();
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    closeTreeMenu();
  };
  const timer = setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("wheel", outside, { capture: true, passive: true });
    window.addEventListener("blur", blur);
  });
  window.addEventListener("keydown", key, true);
  close = () => {
    clearTimeout(timer);
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("wheel", outside, true);
    window.removeEventListener("blur", blur);
    window.removeEventListener("keydown", key, true);
    menu.remove();
    close = null;
  };
  (menu.querySelector("button:not(:disabled)") as HTMLElement | null)?.focus({ preventScroll: true });
}
