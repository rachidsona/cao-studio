/**
 * La « Direction » d'une face tirée (Extrusion de faces, Magie extrusion) : perpendiculaire à elle, selon X, Y ou Z, ou
 * comme une autre face — la perpendiculaire d'une face cliquée (le bout d'une étagère d'à côté, pour aller dans son
 * alignement). Tournée du côté de la face tirée (document/extend-reach.ts `wayOf`) ; le noyau tire alors la face dans
 * ce sens (`direction` de l'extrusion).
 */
import { wayOf } from "../document/extend-reach";
import type { Vec3 } from "../document/types";
import { el } from "../ui/dom";
import type { ToolContext } from "./panel-tool";

export type Way = "normal" | "x" | "y" | "z" | "face";

export const WAYS: [Way, string][] = [
  ["normal", "Perpendiculaire à la face"],
  ["x", "Selon X"],
  ["y", "Selon Y"],
  ["z", "Selon Z"],
  ["face", "Comme une autre face (cliquez-la)"],
];
const AXES: Record<"x" | "y" | "z", Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** Kept for the session. */
let last: Way = "normal";

export class WayChoice {
  way: Way;
  /** « Comme une autre face »: the perpendicular of the face clicked. */
  face: Vec3 | null;
  /** Waiting for that face to be clicked. */
  aiming: boolean;

  /** `given`: the way an extrusion being changed already has. */
  constructor(given?: Vec3) {
    this.way = given ? "face" : last;
    this.face = given ?? null;
    this.aiming = this.way === "face" && !this.face;
  }

  set(way: Way): void {
    this.way = last = way;
    this.aiming = way === "face";
  }

  /** A face clicked while aiming: its perpendicular is the way. False: not aiming (the click is the tool's). */
  take(normal: Vec3): boolean {
    if (!this.aiming) return false;
    [this.face, this.aiming] = [normal.map((v) => Number(v.toFixed(6))) as Vec3, false];
    return true;
  }

  /** The way for a face of normal `n`, turned to its side; undefined: square to it; a string: it runs along the face. */
  for(n: Vec3): Vec3 | undefined | string {
    const d = this.way === "normal" ? undefined : this.way === "face" ? (this.face ?? undefined) : AXES[this.way];
    return d ? wayOf({ normal: n }, d) : undefined;
  }

  /** What an extrusion of a face of normal `n` takes of it: its `direction`, or nothing (square to the face). */
  on(n: Vec3): { direction?: Vec3 } {
    const d = this.for(n);
    return typeof d === "object" ? { direction: d } : {};
  }

  /** While aiming, the face clicked read and taken (`done` then). */
  pick(ctx: Pick<ToolContext, "viewport" | "geometry" | "notify">, event: PointerEvent, done: () => void): void {
    const hit = ctx.viewport.pickFace(event);
    if (hit) void ctx.geometry.describe(hit.bodyId, [], hit.faceIndex).then(({ face }) => (face?.type === "PLANE" && this.take(face.normal) ? done() : ctx.notify("Cliquez une face plane.", "info")));
  }

  /** The « Direction » row of a panel, with what to click while aiming. */
  row(changed: () => void): HTMLElement {
    const list = el("select", { class: "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Direction", "data-extrude-way": "" }, ...WAYS.map(([v, t]) => el("option", { value: v, selected: v === this.way }, t)));
    list.addEventListener("change", () => (this.set(list.value as Way), changed()));
    const hint = this.hint();
    return el("div", { class: "space-y-1" }, el("label", { class: "grid grid-cols-[7rem_1fr] items-center gap-1.5" }, "Direction", list), hint ? el("p", { class: "text-gray-600 dark:text-gray-300" }, hint) : null);
  }

  /** What the panel says of it, or null. */
  hint(): string | null {
    return this.aiming ? "Cliquez la face qui donne la direction : la face tirée ira perpendiculairement à elle." : null;
  }
}
