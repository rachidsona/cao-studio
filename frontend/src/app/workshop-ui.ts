/**
 * Shared by the workshop tools (cut list, sheet layout, drawings, materials,
 * parameters, scenes): a floating panel docked in the view, a large window,
 * printing a page (to paper or PDF) and saving a text file. Printing goes
 * through a hidden frame: embedded browsers often block new windows.
 */
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";

/** A small tool window, in the right panel (over the view on narrow screens); `close` removes it. */
export function floatingPanel(container: HTMLElement, title: string, onClose: () => void, wide = false): { body: HTMLElement; close: () => void } {
  const body = el("div", { class: "space-y-2" });
  const shut = el("button", { type: "button", class: "size-7 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800", "aria-label": `Fermer ${title}` }, "✕");
  const panel = el(
    "div",
    { class: `absolute top-2 left-2 z-30 max-h-[85%] ${wide ? "w-80" : "w-64"} space-y-2 overflow-y-auto border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95`, role: "dialog", "aria-label": title },
    el("div", { class: "flex items-center justify-between" }, el("h2", { class: "panel-title" }, title), shut),
    body,
  );
  panel.addEventListener("pointerdown", (event) => event.stopPropagation());
  placePanel(container, panel);
  const close = () => {
    panel.remove();
    onClose();
  };
  shut.addEventListener("click", close);
  return { body, close };
}

/** A large window over the page, with buttons at the bottom; Échap or ✕ closes it. */
export function openModal(title: string, content: HTMLElement, buttons: { label: string; run: () => void }[] = []): () => void {
  const shut = el("button", { type: "button", class: "size-8 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800", "aria-label": "Fermer" }, "✕");
  const actions = buttons.map(({ label, run }) => {
    const b = el("button", { type: "button", class: "h-9 border border-gray-300 px-3 text-sm font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, label);
    b.addEventListener("click", run);
    return b;
  });
  const box = el(
    "div",
    { class: "flex max-h-full w-full max-w-5xl flex-col gap-3 border border-gray-200 bg-white p-4 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100", role: "dialog", "aria-modal": "true", "aria-label": title },
    el("div", { class: "flex items-center justify-between" }, el("h2", { class: "text-base font-semibold" }, title), shut),
    el("div", { class: "min-h-0 flex-1 overflow-auto" }, content),
    actions.length ? el("div", { class: "flex flex-wrap justify-end gap-2" }, ...actions) : null,
  );
  const overlay = el("div", { class: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" }, box);
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    close();
  };
  const close = () => {
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
  };
  shut.addEventListener("click", close);
  window.addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  return close;
}

let letterhead = "";

/** The workshop's letterhead (document/catalog.ts), put at the top of every printed document that has no layout of its own. */
export function setLetterhead(html: string): void {
  letterhead = html;
}

/** A printable document: printed at once, or kept as a file of the production folder. */
export interface PrintPage {
  title: string;
  html: string;
  css?: string;
}

/** The whole page of a document; `header`: the letterhead first. */
export function pageHtml({ title, html, css = "" }: PrintPage, header = true): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>
    body{font:11px system-ui,sans-serif;margin:12mm;color:#111} h1{font-size:16px} table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #999;padding:3px 5px;text-align:left} th{background:#eee} svg{max-width:100%;page-break-inside:avoid}
    .sheet{page-break-after:always}${css}</style></head><body>${header ? letterhead : ""}${html}</body></html>`;
}

/** Prints a page made of `html` (to paper, or "Enregistrer en PDF" in the print dialog); `header`: the letterhead first. */
export function printHtml(title: string, html: string, extraCss = "", header = true): void {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(frame);
  const page = frame.contentDocument;
  if (!page || !frame.contentWindow) return frame.remove();
  page.open();
  page.write(pageHtml({ title, html, css: extraCss }, header));
  page.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 200);
}

/** Saves a text file (CSV, SVG…) through the browser's download. */
export function downloadText(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = el("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Text safe inside HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
