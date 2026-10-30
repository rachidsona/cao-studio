/**
 * Panneaux latéraux redimensionnables (grands écrans) : une poignée sur le bord intérieur du navigateur et des
 * propriétés se glisse pour les élargir ou les réduire ; les flèches du clavier font de même, un double-clic rend la
 * largeur d'origine. La largeur est gardée dans le navigateur (cao.panel-width.*).
 */

interface PanelSpec {
  ref: string;
  key: string;
  /** Edge of the panel that faces the view. */
  edge: "left" | "right";
  min: number;
  max: number;
}

const PANELS: PanelSpec[] = [
  { ref: "panel-tree", key: "cao.panel-width.tree", edge: "right", min: 180, max: 520 },
  { ref: "panel-properties", key: "cao.panel-width.properties", edge: "left", min: 220, max: 640 },
];

const STEP = 16;

function readWidth(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeWidth(key: string, width: number | null): void {
  try {
    if (width === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(Math.round(width)));
  } catch {
    /* private mode: the width only lasts for this page */
  }
}

export const clampWidth = (width: number, min: number, max: number): number => Math.min(max, Math.max(min, width));

function bindPanel(panel: HTMLElement, spec: PanelSpec): void {
  const wide = window.matchMedia("(min-width: 1024px)");
  const apply = (width: number | null) => {
    // On narrow screens the panels are sheets rising from the bottom: they keep their own width.
    panel.style.width = width !== null && wide.matches ? `${clampWidth(width, spec.min, spec.max)}px` : "";
    handle.setAttribute("aria-valuenow", String(Math.round(panel.getBoundingClientRect().width)));
  };
  const handle = document.createElement("div");
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", spec.edge === "right" ? "Largeur du navigateur" : "Largeur des propriétés");
  handle.setAttribute("aria-valuemin", String(spec.min));
  handle.setAttribute("aria-valuemax", String(spec.max));
  handle.tabIndex = 0;
  handle.title = "Glisser pour élargir ou réduire (double-clic : largeur d'origine)";
  handle.dataset.panelResize = spec.edge;
  handle.className =
    `absolute inset-y-0 ${spec.edge === "right" ? "right-0" : "left-0"} z-20 hidden w-1.5 cursor-col-resize ` +
    "hover:bg-sky-400/60 focus-visible:bg-sky-500 focus-visible:outline-none data-[dragging=true]:bg-sky-500 lg:block";
  panel.classList.add("lg:relative");
  panel.append(handle);

  const set = (width: number | null) => {
    const value = width === null ? null : clampWidth(width, spec.min, spec.max);
    writeWidth(spec.key, value);
    apply(value);
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.dataset.dragging = "true";
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    const sign = spec.edge === "right" ? 1 : -1;
    const move = (e: PointerEvent) => set(startWidth + sign * (e.clientX - startX));
    const stop = () => {
      delete handle.dataset.dragging;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  });
  handle.addEventListener("dblclick", () => set(null));
  handle.addEventListener("keydown", (event) => {
    const grow = spec.edge === "right" ? "ArrowRight" : "ArrowLeft";
    const shrink = spec.edge === "right" ? "ArrowLeft" : "ArrowRight";
    if (event.key !== grow && event.key !== shrink) return;
    event.preventDefault();
    set(panel.getBoundingClientRect().width + (event.key === grow ? STEP : -STEP));
  });
  wide.addEventListener("change", () => apply(readWidth(spec.key)));
  apply(readWidth(spec.key));
}

export function bindPanelResize(root: HTMLElement): void {
  for (const spec of PANELS) {
    const panel = root.querySelector<HTMLElement>(`[data-ref="${spec.ref}"]`);
    if (panel) bindPanel(panel, spec);
  }
}
