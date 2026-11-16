/**
 * "Sélection++" (as Curic Select++ in SketchUp): an overlay of the selection
 * that reaches a level inside an assembly directly. Hovering a body shows its
 * levels next to the pointer — the assembly (all the parts of a cabinet, of
 * panels, of a mirror…), the part, the face — and the current one in green in
 * the view. Ctrl goes one level deeper (then back to the top); a click selects
 * the current level, Maj + clic adds it. Works with the filters "Auto" and
 * "Corps"; mouse and pen only (a finger has no hover). A button of the
 * Sélection group turns it on or off (remembered per browser). Over a sketch,
 * the levels are the sketch and the line or area under the pointer.
 */
import { bodyLabel, bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, PART_SEPARATOR, type CadDocument } from "../document/types";
import { el } from "../ui/dom";
import { TYPE_LABELS } from "../ui/feature-meta";
import type { FacePick, SketchPick, Viewport } from "../viewport/viewport";
import { formatArea, formatLength } from "../measurements/units";

const KEY = "cao-studio:select-plus";

export interface SelectionLevel {
  kind: "group" | "body" | "face" | "sketch" | "item";
  label: string;
  /** What a click selects: whole bodies, one face, whole sketches, or one line or area of a sketch. */
  target: { bodies: string[] } | { face: FacePick } | { sketches: string[] } | { item: SketchPick };
}

/** The levels over a sketch: the sketch, then the line (or else the area) under the pointer. */
export function sketchLevels(doc: CadDocument, sketchId: string, item: SketchPick | null, unit: Parameters<typeof formatLength>[1]): SelectionLevel[] {
  const sketch = findFeature(doc, sketchId);
  const levels: SelectionLevel[] = [{ kind: "sketch", label: `Esquisse « ${sketch?.name ?? sketchId} »`, target: { sketches: [sketchId] } }];
  if (item && item.sketchId === sketchId) {
    const label = item.kind === "curve" ? `Trait — ${formatLength(item.measure ?? 0, unit)}` : `Zone — ${formatArea(item.measure ?? 0, unit)}`;
    levels.push({ kind: "item", label, target: { item } });
  }
  return levels;
}

/**
 * The levels under a face: the assembly its body belongs to (when the body is a part of a multi-body
 * operation still made of several displayed parts), the body, the face.
 */
export function selectionLevels(doc: CadDocument, displayed: string[], face: FacePick): SelectionLevel[] {
  const levels: SelectionLevel[] = [];
  const origin = bodyOrigin(doc, face.bodyId);
  if (origin.includes(PART_SEPARATOR)) {
    const owner = featureOfBody(origin);
    const parts = displayed.filter((id) => {
      const o = bodyOrigin(doc, id);
      return o.includes(PART_SEPARATOR) && featureOfBody(o) === owner;
    });
    const feature = findFeature(doc, owner);
    if (feature && parts.length > 1) levels.push({ kind: "group", label: `${TYPE_LABELS[feature.type]} « ${feature.name} » — ${parts.length} pièces`, target: { bodies: parts } });
  }
  levels.push({ kind: "body", label: bodyLabel(doc, face.bodyId), target: { bodies: [face.bodyId] } });
  levels.push({ kind: "face", label: `Face ${face.faceIndex + 1}`, target: { face } });
  return levels;
}

export function bindSelectPlus(root: HTMLElement, viewport: Viewport, host: { doc(): CadDocument; unit(): Parameters<typeof formatLength>[1] }): void {
  const canvas = viewport.renderer.domElement;
  const container = canvas.parentElement as HTMLElement;
  const card = el("div", {
    class:
      "pointer-events-none absolute z-20 hidden max-w-72 space-y-0.5 border border-emerald-400 bg-white/95 px-2 py-1.5 text-2xs leading-snug text-gray-800 shadow-lg " +
      "dark:border-emerald-600 dark:bg-gray-900/95 dark:text-gray-100",
    role: "status",
  });
  container.append(card);
  let enabled = true;
  try {
    enabled = localStorage.getItem(KEY) !== "off";
  } catch {
    // Private mode: on by default.
  }
  let levels: SelectionLevel[] = [];
  /** Kind of level wanted: kept when moving to another body (the parts of a cabinet one after the other). */
  let wanted: SelectionLevel["kind"] = "group";
  let lastEvent: PointerEvent | null = null;
  let frame = 0;

  const active = () => enabled && (viewport.selectionFilter === "auto" || viewport.selectionFilter === "body");
  const current = () => levels.find((l) => l.kind === wanted) ?? levels[0];

  const hide = () => {
    // Only what this overlay showed is removed: a tool may be highlighting something of its own.
    const showing = !card.classList.contains("hidden");
    levels = [];
    card.classList.add("hidden");
    if (showing) viewport.setHoverHighlight(null);
  };

  const draw = (event: PointerEvent) => {
    const chosen = current();
    if (!chosen) return hide();
    card.replaceChildren(
      ...levels.map((level, i) =>
        el(
          "div",
          { class: `truncate px-1 ${level === chosen ? "bg-emerald-500 font-semibold text-white" : ""}`, style: `margin-left: ${i * 0.6}rem` },
          `${i === 0 ? "" : "└ "}${level.label}`,
        ),
      ),
      el("div", { class: "pt-0.5 text-3xs text-gray-500 dark:text-gray-400" }, "Ctrl : niveau suivant · clic : sélectionner · Maj + clic : ajouter"),
    );
    card.classList.remove("hidden");
    viewport.setHoverHighlight("bodies" in chosen.target || "face" in chosen.target ? chosen.target : null);
    const box = container.getBoundingClientRect();
    card.style.left = `${Math.max(4, Math.min(event.clientX - box.left + 18, box.width - card.offsetWidth - 4))}px`;
    card.style.top = `${Math.max(4, Math.min(event.clientY - box.top + 18, box.height - card.offsetHeight - 4))}px`;
  };

  const levelsAt = (event: PointerEvent): SelectionLevel[] => {
    // In "Auto", an edge under the pointer keeps its usual click (fillets, chamfers).
    if (!active() || event.buttons !== 0 || (viewport.selectionFilter === "auto" && viewport.pickEdge(event))) return [];
    const target = viewport.hoverTarget(event);
    if (target?.kind === "sketch") return sketchLevels(host.doc(), target.id, viewport.pickSketchItem(event, "curve") ?? viewport.pickSketchItem(event, "region"), host.unit());
    return target?.kind === "body" ? selectionLevels(host.doc(), viewport.displayedBodies, target.face) : [];
  };

  const update = (event: PointerEvent) => {
    frame = 0;
    // Its levels replace the pre-selection of the view while it is on.
    viewport.preselectSuspended = active();
    lastEvent = event;
    levels = levelsAt(event);
    if (levels.length === 0) return hide();
    draw(event);
  };

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => update(event));
  });
  canvas.addEventListener("pointerleave", () => {
    lastEvent = null;
    hide();
  });

  // Ctrl, pressed and released alone, goes one level deeper (after the face, back to the top).
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Control" || event.repeat || levels.length === 0 || !lastEvent) return;
    const index = levels.findIndex((l) => l === current());
    wanted = (levels[(index + 1) % levels.length] as SelectionLevel).kind;
    draw(lastEvent);
  });

  viewport.clickOverride = (event) => {
    if (event.pointerType === "touch" || !active()) return false;
    const here = levelsAt(event);
    const chosen = here.find((l) => l.kind === wanted) ?? here[0];
    if (!chosen) return false;
    viewport.selectLevel(chosen.target, event.shiftKey);
    return true;
  };

  const button = root.querySelector<HTMLButtonElement>("[data-select-plus]");
  // Without its button it is always on: an earlier « off » could not be undone otherwise.
  if (!button) enabled = true;
  const show = () => button?.setAttribute("aria-pressed", String(enabled));
  button?.addEventListener("click", () => {
    enabled = !enabled;
    if (!enabled) hide();
    show();
    try {
      localStorage.setItem(KEY, enabled ? "on" : "off");
    } catch {
      // Not remembered.
    }
  });
  show();
}
