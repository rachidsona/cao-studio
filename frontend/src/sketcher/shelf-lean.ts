/**
 * « Orientation » des étagères et cloisons d'un corps aménagé (ShelfParams.lean) : droites, selon X, Y ou Z, d'équerre à
 * une face cliquée, ou parallèles à elle — elles vont toujours d'une paroi à l'autre (features/within-walls.ts).
 */
import { el } from "../ui/dom";

type Lean = [number, number, number];
/** How a face clicked turns the shelves: square to it (along its normal), or parallel to it. */
export type LeanFace = "square" | "parallel";
const AXES: Record<string, Lean> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";

/** Which choice a direction is: none (flat), an axis, or a face (square to it or parallel). */
const choiceOf = (lean?: Lean, face?: LeanFace) => (!lean ? "" : (Object.keys(AXES).find((k) => AXES[k]!.every((v, i) => v === lean[i])) ?? face ?? "square"));

interface Host {
  aimFace?(done: (normal: Lean) => void): void;
  /** The normal of the sketch's plane: a face's line in it, for « parallèle ». */
  planeNormal?(): Lean;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

/**
 * The select: `set` gets the direction (none: flat) and the face's way; a face's choice waits for it clicked in the view.
 * `cloisons`: said of cloisons (upright when straight).
 */
export function leanSelect(lean: Lean | undefined, face: LeanFace | undefined, set: (lean?: Lean, face?: LeanFace) => void, host: Host, cloisons = false): HTMLSelectElement {
  const now = choiceOf(lean, face);
  const options: [string, string][] = [
    ["", cloisons ? "Debout" : "À plat"],
    ["x", "Selon X"],
    ["y", "Selon Y"],
    ["z", "Selon Z"],
    ...(host.aimFace ? ([["square", "D'équerre à une face (cliquez-la)"]] as [string, string][]) : []),
    ...(host.aimFace && host.planeNormal ? ([["parallel", "Parallèle à une face (cliquez-la)"]] as [string, string][]) : []),
  ];
  const select = el("select", { class: FIELD, "aria-label": "Orientation" }, ...options.map(([value, label]) => el("option", { value, selected: value === now }, label)));
  select.addEventListener("change", () => {
    const way = select.value;
    if (way !== "square" && way !== "parallel") return set(AXES[way]);
    const many = cloisons ? "cloisons" : "étagères";
    host.notify(way === "square" ? `Cliquez la face à laquelle les ${many} seront d'équerre (${cloisons ? "un dessus en pente" : "un côté en biais"}).` : `Cliquez la face à laquelle les ${many} seront parallèles (${cloisons ? "un côté en biais" : "un dessus en pente"}).`, "info");
    host.aimFace?.((n) => {
      // Parallel: along the face's line in the sketch's plane (square to both normals).
      const p = host.planeNormal?.() ?? [0, 0, 1];
      const along: Lean = [p[1] * n[2] - p[2] * n[1], p[2] * n[0] - p[0] * n[2], p[0] * n[1] - p[1] * n[0]];
      set(way === "square" ? n : along, way);
    });
  });
  return select;
}
