/**
 * A list that scrolls without a scrollbar: a small arrow at its bottom when more is below (and at its top when more is
 * above). A click on it scrolls by most of a page; the wheel, the trackpad and a finger still scroll as usual.
 */
import { el } from "./dom";

const ARROW =
  "absolute left-1/2 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-sky-500/40 bg-white/90 text-[11px] " +
  "text-sky-700 shadow-md hover:bg-sky-50 dark:bg-gray-900/90 dark:text-sky-300 dark:hover:bg-gray-800 data-[hidden=true]:hidden";

export function bindScrollArrows(scroller: HTMLElement): void {
  const box = scroller.parentElement;
  if (!box) return;
  const arrow = (where: "up" | "down") => {
    const button = el("button", { type: "button", class: `${ARROW} ${where === "up" ? "top-1" : "bottom-1"}`, "aria-label": where === "up" ? "Voir le haut de la liste" : "Voir la suite de la liste", "data-hidden": "true" }, where === "up" ? "▲" : "▼");
    button.addEventListener("click", () => scroller.scrollBy({ top: (where === "up" ? -1 : 1) * scroller.clientHeight * 0.8, behavior: "smooth" }));
    box.append(button);
    return button;
  };
  const up = arrow("up");
  const down = arrow("down");
  const update = () => {
    up.dataset.hidden = String(scroller.scrollTop <= 2);
    down.dataset.hidden = String(scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2);
  };
  scroller.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(scroller);
  // The list is drawn again on every change of the model: its height follows.
  new MutationObserver(() => requestAnimationFrame(update)).observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  update();
}
