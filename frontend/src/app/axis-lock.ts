/**
 * La direction gardée d'un déplacement (Déplacer, Coïncidence) : Ctrl le garde horizontal (rien le long de Z, la
 * hauteur ne change pas), ⌘ vertical (rien que le long de Z). Appuyée seule puis relâchée, la touche l'allume ou
 * l'éteint ; maintenue pendant un clic ou un glissé, elle vaut pour lui (et reste après un clic).
 */
import type { Vec3 } from "../document/types";

export type AxisLockMode = "free" | "level" | "vertical";

export const AXIS_LOCK_OPTIONS: [string, string][] = [
  ["free", "Libre"],
  ["level", "Horizontale (Ctrl)"],
  ["vertical", "Verticale (⌘)"],
];

/** The move kept horizontal (no Z) or vertical (only Z). */
export function lockMove(v: Vec3, mode: AxisLockMode): Vec3 {
  if (mode === "level") return [v[0], v[1], 0];
  if (mode === "vertical") return [0, 0, v[2]];
  return v;
}

/** The point `to` reached from `from` with the direction kept: at the height of `from`, or straight above or under it. */
export function lockPoint(from: Vec3, to: Vec3, mode: AxisLockMode): Vec3 {
  const d = lockMove([to[0] - from[0], to[1] - from[1], to[2] - from[2]], mode);
  return [from[0] + d[0], from[1] + d[1], from[2] + d[2]];
}

type Keys = { ctrlKey: boolean; metaKey: boolean };

export class AxisLock {
  mode: AxisLockMode = "free";
  /** The key pressed alone (not for Ctrl+Z, ⌘+C…): its release turns its direction on or off. */
  private alone: AxisLockMode | null = null;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly changed: () => void,
  ) {
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("contextmenu", this.noMenu);
  }

  /** The direction for this pointer event: a key held wins over the one set. */
  of(event?: Keys): AxisLockMode {
    if (event?.metaKey) return "vertical";
    if (event?.ctrlKey) return "level";
    return this.mode;
  }

  /** A click with a key held sets its direction (the key's release does not turn it off again). */
  take(event: Keys): void {
    if (!event.ctrlKey && !event.metaKey) return;
    this.mode = this.of(event);
    this.alone = null;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("contextmenu", this.noMenu);
  }

  private readonly onKey = (event: KeyboardEvent) => {
    if (!event.repeat) this.alone = event.key === "Control" ? "level" : event.key === "Meta" ? "vertical" : null;
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    const mode = event.key === "Control" ? "level" : event.key === "Meta" ? "vertical" : null;
    if (!mode || this.alone !== mode) return;
    this.alone = null;
    this.mode = this.mode === mode ? "free" : mode;
    this.changed();
  };

  private readonly onBlur = () => {
    this.alone = null;
  };

  /** A Ctrl-click (a right click on a Mac) opens no menu here. */
  private readonly noMenu = (event: MouseEvent) => {
    if (event.ctrlKey) event.preventDefault();
  };
}
