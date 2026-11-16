/** Small DOM helpers shared by the editor UI (no framework). */

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === "class") node.className = String(value);
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function ref<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  const node = root.querySelector<T>(`[data-ref="${name}"]`);
  if (!node) throw new Error(`Élément d'interface manquant : ${name}`);
  return node;
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ToastKind = "info" | "success" | "error";

const TOAST_STYLES: Record<ToastKind, string> = {
  info: "border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100",
  success: "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-100",
  error: "border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

export function toast(region: HTMLElement, message: string, kind: ToastKind = "info", timeoutMs = 4000): void {
  const node = el(
    "div",
    { class: `pointer-events-none max-w-full whitespace-pre-line border px-2 py-1 text-2xs leading-snug shadow-sm ${TOAST_STYLES[kind]}`, role: kind === "error" ? "alert" : "status", "data-toast": "" },
    message,
  );
  region.append(node);
  setTimeout(() => node.remove(), timeoutMs);
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "projet"
  );
}
