/**
 * Une barre d'outils flottante qu'on déplace où l'on veut sur la vue (comme les barres de SketchUp) : on la saisit par
 * sa poignée ⠿, elle reste dans la vue, et sa place est retenue par le navigateur. Un double-clic sur la poignée la
 * remet à sa place d'origine ; le bouton ⇄ / ⇅ la met à l'horizontale ou à la verticale.
 */

export interface Placement {
  /** Distance (px) from the left and top of the view; null: the original place. */
  x: number | null;
  y: number | null;
  horizontal: boolean;
}

const DEFAULT: Placement = { x: null, y: null, horizontal: false };

export function readPlacement(key: string): Placement {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<Placement> | null;
    if (!raw || typeof raw !== "object") return { ...DEFAULT };
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
    return { x: num(raw.x), y: num(raw.y), horizontal: raw.horizontal === true };
  } catch {
    return { ...DEFAULT };
  }
}

function writePlacement(key: string, placement: Placement): void {
  try {
    localStorage.setItem(key, JSON.stringify(placement));
  } catch {
    // Not remembered: only this visit.
  }
}

/** Keeps a box of `size` inside an area of `area`, at `wanted` (px from the top-left corner). */
export function clampInside(wanted: [number, number], size: [number, number], area: [number, number]): [number, number] {
  return [Math.max(0, Math.min(wanted[0], area[0] - size[0])), Math.max(0, Math.min(wanted[1], area[1] - size[1]))];
}

/**
 * Makes `bar` (absolutely placed in `host`) movable by `grip`, remembered under `key`; `orient` is called when the bar
 * turns horizontal or vertical (the bar lays out its content).
 */
export function makeMovable(host: HTMLElement, bar: HTMLElement, grip: HTMLElement, key: string, orient: (horizontal: boolean) => void): { toggleOrientation(): void } {
  let placement = readPlacement(key);

  const apply = () => {
    orient(placement.horizontal);
    if (placement.x === null || placement.y === null) {
      bar.style.left = bar.style.top = "";
      return;
    }
    const [x, y] = clampInside([placement.x, placement.y], [bar.offsetWidth, bar.offsetHeight], [host.clientWidth, host.clientHeight]);
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
  };

  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    grip.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, left: bar.offsetLeft, top: bar.offsetTop };
    bar.dataset.moving = "true";
    const move = (e: PointerEvent) => {
      placement = { ...placement, x: start.left + e.clientX - start.x, y: start.top + e.clientY - start.y };
      apply();
    };
    const stop = () => {
      delete bar.dataset.moving;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", stop);
      grip.removeEventListener("pointercancel", stop);
      // Keep the place it was shown at (inside the view).
      if (placement.x !== null) placement = { ...placement, x: bar.offsetLeft, y: bar.offsetTop };
      writePlacement(key, placement);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
  });
  grip.addEventListener("dblclick", () => {
    placement = { ...DEFAULT, horizontal: placement.horizontal };
    writePlacement(key, placement);
    apply();
  });
  // The view (panels, window) or the bar (tools added) changes size: the bar stays inside the view.
  const watch = new ResizeObserver(apply);
  watch.observe(host);
  watch.observe(bar);
  apply();
  return {
    toggleOrientation: () => {
      placement = { ...placement, horizontal: !placement.horizontal };
      writePlacement(key, placement);
      apply();
    },
  };
}
