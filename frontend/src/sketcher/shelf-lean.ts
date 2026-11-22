/**
 * « Orientation » des étagères d'un corps aménagé (ShelfParams.lean) : à plat, selon X, Y ou Z, ou d'équerre à une
 * face cliquée — elles vont toujours d'une paroi à l'autre (features/within-walls.ts).
 */
import { el } from "../ui/dom";

type Lean = [number, number, number];
const AXES: Record<string, Lean> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";

/** Which choice a direction is: none (flat), an axis, or a face's normal. */
const choiceOf = (lean?: Lean) => (!lean ? "" : (Object.keys(AXES).find((k) => AXES[k]!.every((v, i) => v === lean[i])) ?? "face"));

/** The select: `set` gets the direction (none: flat); « face » waits for a face clicked in the view. */
export function leanSelect(lean: Lean | undefined, set: (lean?: Lean) => void, host: { aimFace?(done: (normal: Lean) => void): void; notify(message: string, kind?: "info" | "success" | "error"): void }): HTMLSelectElement {
  const now = choiceOf(lean);
  const options: [string, string][] = [["", "À plat"], ["x", "Selon X"], ["y", "Selon Y"], ["z", "Selon Z"], ...(host.aimFace ? [["face", "D'équerre à une face (cliquez-la)"] as [string, string]] : [])];
  const select = el("select", { class: FIELD, "aria-label": "Orientation" }, ...options.map(([value, label]) => el("option", { value, selected: value === now }, label)));
  select.addEventListener("change", () => {
    if (select.value !== "face") return set(AXES[select.value]);
    host.notify("Cliquez la face à laquelle les étagères seront d'équerre (un côté en biais).", "info");
    host.aimFace?.((normal) => set(normal));
  });
  return select;
}
