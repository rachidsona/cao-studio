/**
 * Le choix d'un angle de cuisine, dans l'éditeur de linéaire (app/kitchen-run-editor.ts) : pour chaque bout du linéaire
 * dans un angle, les solutions d'un cuisiniste (document/kitchen-corners.ts) — angle mort, meuble d'angle à étagère,
 * LeMans, meuble en L 90 × 90 —, chacune dessinée vue de dessus avec ce qu'elle apporte. Le choix vaut pour l'angle,
 * donc pour les deux linéaires qui s'y rencontrent, et s'applique avec le reste à OK.
 */
import { CORNER_KINDS, WALL_CORNER_KINDS, cornerLimits, cornerSketch, type CornerChange } from "../../document/kitchen-corners";
import { cornerDoor, cornerKind, jointOf, kitchenJoints, lArm, wallArm, wallCornerDoor, wallCornerKind, type CornerKind, type Joint, type KitchenRun, type WallCornerKind } from "../../document/kitchen-plan-shapes";
import type { DisplayUnit, KitchenFloorPlan } from "../../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";

const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";

/** « Mur B » → « mur B ». */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

/** A size of a corner, typed in the display unit within its limits; applied on Enter or leaving the field. */
function sizeField(label: string, key: string, value: number, [lo, hi]: [number, number], unit: DisplayUnit, set: (mm: number) => void, refresh: () => void): HTMLElement {
  const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(value, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})`, "data-corner-size": key });
  const apply = () => {
    const parsed = parseNumber(input.value);
    const mm = parsed === null ? NaN : Math.round(fromDisplay(parsed, unit) * 10) / 10;
    const ok = mm >= lo && mm <= hi;
    input.setAttribute("aria-invalid", String(!ok));
    input.title = ok ? "" : `De ${formatLength(lo, unit)} à ${formatLength(hi, unit)}.`;
    if (ok && mm !== value) set(mm);
  };
  input.addEventListener("change", apply);
  input.addEventListener("blur", refresh);
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      apply();
      input.blur();
    }
  });
  return el("label", { class: "grid grid-cols-[1fr_6rem] items-center gap-1.5" }, `${label} (${UNIT_LABELS[unit]})`, input);
}

/**
 * The corners of the run and their choice, low and up in the wall row, with their sizes; null when it has none. A change
 * goes to `change`; `refresh` draws again once a field is left.
 */
export function cornerChoice(plan: KitchenFloorPlan, run: KitchenRun, unit: DisplayUnit, change: (joint: Joint, c: CornerChange) => void, refresh: () => void, titled = true): HTMLElement | null {
  const sides = (["left", "right"] as const).filter((side) => run[side] !== "free");
  if (!sides.length) return null;
  const joints = kitchenJoints(plan);
  const length = (mm: number) => formatLength(mm, unit);
  const limits = cornerLimits(plan);
  return el(
    "section",
    { class: "space-y-1.5", "aria-label": "Angles du linéaire" },
    titled ? el("h3", { class: "font-semibold text-gray-700 dark:text-gray-200" }, sides.length > 1 ? "Les angles" : "L'angle") : null,
    ...sides.map((side) => {
      const joint = jointOf(run, side);
      const info = joints.find((j) => j.joint === joint);
      const chosen = cornerKind(plan, joint);
      const high = wallCornerKind(plan, joint);
      const other = info?.walls.find((w) => w !== run.label) ?? "";
      const where = chosen === "l" ? `Un caisson de ${length(lArm(plan, joint))} sur chaque mur.` : chosen === "dead" ? "" : run[side] === "pass" ? `Le meuble d'angle est côté ${lower(run.label)}, qui va jusqu'au mur ; côté ${lower(other)}, un fileur.` : `Le meuble d'angle est côté ${lower(other)}, qui va jusqu'au mur ; côté ${lower(run.label)}, un fileur.`;
      const set = (c: CornerChange) => change(joint, c);
      // Its size: the door of a blind corner unit, the side of an L.
      const lowSize = chosen === "unit" || chosen === "lemans" ? sizeField("Porte du meuble d'angle", "door", cornerDoor(plan, joint), limits.door, unit, (mm) => set({ door: mm }), refresh) : chosen === "l" ? sizeField("Côté du L, depuis le mur", "arm", lArm(plan, joint), limits.arm, unit, (mm) => set({ arm: mm }), refresh) : null;
      const highSize = high === "unit" ? sizeField("Porte du haut d'angle", "wallDoor", wallCornerDoor(plan, joint), limits.wallDoor, unit, (mm) => set({ wallDoor: mm }), refresh) : high === "l" ? sizeField("Côté du L haut, depuis le mur", "wallArm", wallArm(plan, joint), limits.wallArm, unit, (mm) => set({ wallArm: mm }), refresh) : null;
      return el(
        "div",
        { class: "space-y-1 border border-gray-200 p-1.5 dark:border-gray-700", "data-corner-choice": joint },
        el("p", { class: "font-medium" }, `${run.label} et ${lower(other)}`),
        el("p", { class: "text-[11px] font-semibold text-gray-600 dark:text-gray-300" }, "En bas"),
        el(
          "div",
          { class: "grid gap-1", role: "radiogroup", "aria-label": `${info?.label ?? "Angle"} : que mettre en bas ?` },
          ...(Object.keys(CORNER_KINDS) as CornerKind[]).map((kind) => {
            const on = kind === chosen;
            const button = el("button", { type: "button", role: "radio", "aria-checked": String(on), "data-corner-kind": kind, title: CORNER_KINDS[kind].summary, class: `flex items-start gap-1.5 border p-1 text-left ${on ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"}` });
            button.innerHTML = cornerSketch(kind);
            button.append(el("span", { class: "min-w-0" }, el("span", { class: "block text-[11px] font-medium leading-tight" }, CORNER_KINDS[kind].label), el("span", { class: "block text-[10px] leading-tight text-gray-500 dark:text-gray-400" }, CORNER_KINDS[kind].summary)));
            button.addEventListener("click", () => set({ kind }));
            return button;
          }),
        ),
        lowSize,
        where ? el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, where) : null,
        run.wall
          ? el(
              "div",
              { class: "space-y-1 pt-1" },
              el("p", { class: "text-[11px] font-semibold text-gray-600 dark:text-gray-300" }, "En haut"),
              el(
                "div",
                { class: "grid grid-cols-3 gap-1", role: "radiogroup", "aria-label": `${info?.label ?? "Angle"} : que mettre en haut ?` },
                ...(Object.keys(WALL_CORNER_KINDS) as WallCornerKind[]).map((kind) => {
                  const on = kind === high;
                  const button = el("button", { type: "button", role: "radio", "aria-checked": String(on), "data-wall-corner-kind": kind, title: WALL_CORNER_KINDS[kind].summary, class: `border px-1 py-1 text-center text-[11px] leading-tight ${on ? "border-sky-500 bg-sky-50 font-medium dark:bg-sky-950" : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"}` }, WALL_CORNER_KINDS[kind].label);
                  button.addEventListener("click", () => set({ wall: kind }));
                  return button;
                }),
              ),
              highSize,
              high !== "none" ? el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, WALL_CORNER_KINDS[high].summary) : null,
            )
          : null,
      );
    }),
  );
}
