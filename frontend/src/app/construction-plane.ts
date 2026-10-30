/**
 * « Plan de construction » : choisir où dessiner une esquisse quand ce n'est ni un plan principal ni une face
 * droite — un plan principal décalé et incliné d'un angle autour de l'un de ses axes, ou le plan passant par trois
 * coins de corps cliqués. Le plan est montré dans la vue pendant qu'on le règle ; « Esquisser sur ce plan » crée
 * l'esquisse dessus.
 */
import * as THREE from "three";
import type { DisplayUnit, PlaneFrame, PlaneName } from "../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { frameOf, nearestPlane, planeThrough, tiltedPlane, type Placement, type Vec3 } from "../sketcher/frame";
import { el } from "../ui/dom";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import { floatingPanel } from "./workshop-ui";

const INPUT = "h-8 w-full border border-gray-300 bg-white px-2 text-right text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** Translucent square showing a plane, with its x axis in red, its y axis in green and its normal in blue. */
class PlanePreview {
  private group = new THREE.Group();

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.group);
  }

  show(frame: PlaneFrame | null, size: number): void {
    this.clear();
    if (!frame) return;
    const f = frameOf({ plane: "XY", offset: 0, frame });
    const square = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    square.matrixAutoUpdate = false;
    square.matrix.makeBasis(new THREE.Vector3(...f.u), new THREE.Vector3(...f.v), new THREE.Vector3(...f.normal)).setPosition(new THREE.Vector3(...f.origin));
    square.renderOrder = 30;
    this.group.add(square);
    const o = new THREE.Vector3(...f.origin);
    for (const [dir, color] of [[f.u, 0xef4444], [f.v, 0x22c55e], [f.normal, 0x3b82f6]] as const) {
      const end = o.clone().addScaledVector(new THREE.Vector3(...dir), size * 0.35);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([o, end]), new THREE.LineBasicMaterial({ color, depthTest: false }));
      line.renderOrder = 31;
      this.group.add(line);
    }
  }

  dots(points: Vec3[], size: number): void {
    for (const p of points) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf97316, depthTest: false }));
      dot.position.set(...p);
      dot.renderOrder = 32;
      this.group.add(dot);
    }
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
  }
}

export interface ConstructionPlaneHost {
  unit(): DisplayUnit;
  /** Size of the model (mm), for the size of the preview. */
  modelSize(): number;
  create(placement: Placement): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

let open: (() => void) | null = null;

export function openConstructionPlane(container: HTMLElement, viewport: Viewport, host: ConstructionPlaneHost): void {
  open?.();
  const preview = new PlanePreview(viewport.scene);
  const size = Math.max(100, host.modelSize() * 1.2);
  let mode: "tilt" | "points" = "tilt";
  let base: PlaneName = "XY";
  let offset = 0;
  let angle = 0;
  let around: "u" | "v" = "u";
  const picked: Vec3[] = [];
  const unit = host.unit();

  const frame = (): PlaneFrame | null => (mode === "tilt" ? tiltedPlane(base, offset, angle, around) : picked.length === 3 ? planeThrough(picked[0]!, picked[1]!, picked[2]!) : null);
  const draw = () => {
    preview.show(frame(), size);
    preview.dots(picked, size);
  };

  // Three corners clicked on the bodies (the nearest corner within a few pixels).
  const pointer: PointerHandler = {
    down: () => false,
    move: () => undefined,
    up: (event, isClick) => {
      if (!isClick || mode !== "points") return false;
      const corner = viewport.pickVertex(event);
      if (!corner) {
        host.notify("Cliquez un coin d'un corps.", "info");
        return true;
      }
      if (picked.length === 3) picked.length = 0;
      picked.push(corner.point as Vec3);
      if (picked.length === 3 && !planeThrough(picked[0]!, picked[1]!, picked[2]!)) host.notify("Ces trois points sont alignés : ils ne définissent pas de plan.", "error");
      draw();
      render();
      return true;
    },
  };

  const panel = floatingPanel(container, "Plan de construction", () => {
    preview.dispose();
    if (mode === "points") viewport.setPointerHandler(null);
    open = null;
  });
  open = panel.close;

  const number = (label: string, value: number, suffix: string, set: (v: number) => void) => {
    const input = el("input", { type: "text", inputmode: "decimal", class: INPUT, value: trim(value, 4), "aria-label": label });
    input.addEventListener("input", () => {
      const v = parseNumber(input.value);
      input.setAttribute("aria-invalid", String(v === null));
      if (v === null) return;
      set(v);
      draw();
    });
    return el("label", { class: "grid grid-cols-[5rem_1fr_2rem] items-center gap-1.5" }, label, input, el("span", { class: "text-gray-500" }, suffix));
  };
  const select = <T extends string>(label: string, value: T, choices: [T, string][], set: (v: T) => void) => {
    const s = el("select", { class: INPUT.replace("text-right", ""), "aria-label": label }, ...choices.map(([v, t]) => el("option", { value: v, selected: v === value }, t)));
    s.addEventListener("change", () => {
      set(s.value as T);
      draw();
    });
    return el("label", { class: "grid grid-cols-[5rem_1fr] items-center gap-1.5" }, label, s);
  };

  const render = () => {
    const tabs = (["tilt", "points"] as const).map((m) => {
      const b = el("button", { type: "button", class: `${BUTTON} ${mode === m ? "btn-accent" : ""}`, "aria-pressed": String(mode === m) }, m === "tilt" ? "Décalé, incliné" : "Par 3 points");
      b.addEventListener("click", () => {
        mode = m;
        viewport.setPointerHandler(m === "points" ? pointer : null);
        draw();
        render();
      });
      return b;
    });
    const create = el("button", { type: "button", class: "h-8 w-full btn-accent font-medium disabled:opacity-40" }, "Esquisser sur ce plan");
    create.toggleAttribute("disabled", !frame());
    create.addEventListener("click", () => {
      const f = frame();
      if (!f) return;
      panel.close();
      host.create({ plane: nearestPlane(f.normal), offset: 0, frame: f });
    });
    const body =
      mode === "tilt"
        ? [
            select("Plan de base", base, [["XY", "XY (dessus)"], ["XZ", "XZ (face)"], ["YZ", "YZ (droite)"]], (v) => (base = v)),
            number("Décalage", toDisplay(offset, unit), UNIT_LABELS[unit], (v) => (offset = fromDisplay(v, unit))),
            number("Angle", angle, "°", (v) => (angle = v)),
            select("Autour de", around, [["u", "son axe x (rouge)"], ["v", "son axe y (vert)"]], (v) => (around = v)),
          ]
        : [el("p", { class: "text-gray-600 dark:text-gray-300" }, picked.length < 3 ? `Cliquez trois coins de corps (${picked.length} sur 3).` : "Plan défini. Un nouveau clic recommence.")];
    panel.body.replaceChildren(el("div", { class: "flex gap-1" }, ...tabs), ...body, create, el("p", { class: "text-[11px] text-gray-500" }, "Le carré orange montre le plan ; l'axe rouge sera l'axe x de l'esquisse."));
  };
  draw();
  render();
}
