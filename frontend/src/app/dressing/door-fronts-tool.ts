/**
 * Les façades d'une Répartition dans la vue. « Façades » : un clic sur une case lui pose sa porte, recliquer la retire,
 * le meuble entier s'équipe d'un bouton ; une case qui porte un module reçoit sa porte comme une autre. « Façades
 * communes » : un clic sur une case, un clic sur une autre, et une seule porte les couvre ; recliquer ces mêmes cases
 * rend leurs portes. Le jeu, l'épaisseur, le style, les poignées et le sens d'ouverture se règlent pour toute la
 * Répartition. Le bouton Façades du ruban reste celui des caissons quand un caisson est choisi ou qu'il n'y a qu'eux.
 */
import { caseHasDoor, casesJoined, doorSettings, withAllDoors, withCaseDoor, withCasesJoined, withDoorSettings, withDoorSwing, withoutDoors, type DoorSwing } from "../../document/door-fronts";
import { bodyOrigin, findFeature } from "../../document/operations";
import type { DoorSettings } from "../../document/sketch";
import { GLASS_FRAME, GLASS_KINDS, PROFILE_FINISHES, styleChange, type DoorStyle } from "../../features/glass-door";
import { featureOfBody, type CadDocument, type SketchFeature } from "../../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { isPartition, leafNiches } from "../../sketcher/partition-history";
import { el } from "../../ui/dom";
import { panelHeader } from "../../ui/panel-close";
import { placePanel } from "../../ui/dock";
import type { PointerHandler } from "../../viewport/pointer-input";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { nicheUnderPointer, type PickedNiche } from "./niche-pick";

type Mode = "doors" | "common";
type Target = Pick<PickedNiche, "sketch" | "partition">;

const SMALL = "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const FIELD = "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";

const partitions = (doc: CadDocument) => doc.features.filter((f): f is SketchFeature => f.type === "sketch" && !f.suppressed && (f.offsets ?? []).some((r) => isPartition(r) && r.step.depth));

/** The Répartition of what is selected: a whole sketch or one of its boards. */
function selectedPartition(editor: Editor): Target | null {
  const { sketches, sketch, bodies } = editor.picked.selection;
  const body = bodies[0] ?? editor.picked.bodyId;
  const feature = body ? findFeature(editor.doc, featureOfBody(bodyOrigin(editor.doc, body))) : undefined;
  const id = sketches[0] ?? sketch[0]?.sketchId ?? (feature?.type === "extrude" ? feature.sketch : undefined);
  const found = id ? partitions(editor.doc).find((s) => s.id === id) : undefined;
  const record = found?.offsets?.find(isPartition);
  return found && record ? { sketch: found.id, partition: record.id } : null;
}

class DoorFrontsTool implements PointerHandler {
  private readonly panel: HTMLElement;
  private first: PickedNiche | null = null;
  private last: Target | null = null;
  private readonly text = el("p", { class: "text-gray-600 dark:text-gray-300", "data-fronts-state": "" });
  private readonly settings = el("div", { class: "space-y-1.5" });
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(private readonly viewport: Viewport, private readonly editor: Editor, private readonly mode: Mode, private readonly closed: () => void) {
    const title = mode === "doors" ? "Façades" : "Façades communes";
    this.panel = el("div", { class: "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": title });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    // A door over the niches clicked, not over whole cases (niche-tool.ts).
    const byNiches = el("button", { type: "button", class: "h-8 w-full border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Porte sur des niches choisies…");
    byNiches.addEventListener("click", () => {
      const sketch = this.last?.sketch ?? null;
      this.close();
      editor.sketches.startEquip("door", sketch);
    });
    this.panel.append(panelHeader(title, () => this.close()), this.text, this.settings, byNiches);
    placePanel(viewport.renderer.domElement.parentElement as HTMLElement, this.panel);
    window.addEventListener("keydown", this.onKey, true);
    viewport.setPointerHandler(this);
    this.draw();
  }

  /** The Répartition worked on, from the start. */
  aim(target: Target): void {
    this.last = target;
    this.draw();
  }

  /** The door of this case, from the view or from a niche given to the tool. */
  toggle(niche: PickedNiche): void {
    this.last = niche;
    const at = niche.path[0] as number;
    const had = caseHasDoor(this.editor.doc, niche.sketch, niche.partition, at);
    void this.editor.change(withCaseDoor(this.editor.doc, niche.sketch, niche.partition, at)).then(() => {
      this.editor.notify(had ? `Case ${at + 1} sans porte.` : `Porte posée sur la case ${at + 1}.`, "success");
      this.draw();
    });
  }

  private apply(made: CadDocument): void {
    void this.editor.change(made).then(() => this.draw());
  }

  private draw(): void {
    this.text.textContent = this.mode === "doors"
      ? "Cliquez une case pour lui poser sa porte ; recliquez pour la retirer. Une case avec un module se traite comme une autre."
      : this.first ? `Case ${(this.first.path[0] as number) + 1} choisie : cliquez la dernière case de la façade.` : "Cliquez la première case de la façade, puis la dernière ; recliquez-les pour rendre leurs portes.";
    const swing = el("select", { class: FIELD, "aria-label": "Sens d'ouverture" }, ...([["pairs", "Par paires, en miroir"], ["left", "Toutes à gauche"], ["right", "Toutes à droite"]] as const).map(([value, label]) => el("option", { value }, label)));
    swing.addEventListener("change", () => {
      if (!this.last) return this.editor.notify("Cliquez d'abord une case de la Répartition.", "info");
      this.apply(withDoorSwing(this.editor.doc, this.last.sketch, this.last.partition, swing.value as DoorSwing));
    });
    const opening = el("label", { class: "block space-y-1" }, "Sens d'ouverture", swing);
    if (this.mode === "common" || !this.last) return this.settings.replaceChildren(opening);
    const { sketch, partition } = this.last;
    const doors = doorSettings(this.editor.doc, sketch, partition);
    const unit = this.editor.unit;
    const length = (label: string, value: number, set: (mm: number) => void) => {
      const input = el("input", { type: "text", inputMode: "decimal", class: FIELD, value: trim(toDisplay(value, unit), 3), "aria-label": label }) as HTMLInputElement;
      input.addEventListener("change", () => {
        const parsed = parseNumber(input.value);
        if (parsed !== null && parsed >= 0) set(fromDisplay(parsed, unit));
      });
      return el("label", { class: "block space-y-1" }, `${label} (${UNIT_LABELS[unit]})`, input);
    };
    // Flat, framed, or glazed: an aluminium frame round tempered glass, its glass and its finish chosen.
    const choice = (label: string, value: string, options: readonly (readonly [string, string])[], set: (v: string) => void) => {
      const list = el("select", { class: FIELD, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
      list.addEventListener("change", () => set(list.value));
      return el("label", { class: "block space-y-1" }, label, list);
    };
    const settings = (patch: Partial<DoorSettings>) => this.apply(withDoorSettings(this.editor.doc, sketch, partition, patch));
    const style = choice("Style des portes", doors.style ?? "flat", [["flat", "Plate"], ["frame", "À cadre"], ["glass", "Vitrée (cadre alu)"]], (v) => settings(styleChange(v as DoorStyle, doors)));
    const glass = doors.style === "glass"
      ? [
          length("Largeur du cadre alu", doors.frameWidth ?? GLASS_FRAME, (frameWidth) => settings({ frameWidth })),
          choice("Verre (trempé 4 mm)", doors.glass ?? "clear", GLASS_KINDS, (v) => settings({ glass: v as DoorSettings["glass"] })),
          choice("Cadre", doors.profile ?? "brushed", PROFILE_FINISHES, (v) => settings({ profile: v as DoorSettings["profile"] })),
        ]
      : [];
    const handles = el("input", { type: "checkbox", checked: doors.handles }) as HTMLInputElement;
    handles.addEventListener("change", () => this.apply(withDoorSettings(this.editor.doc, sketch, partition, { handles: handles.checked })));
    const all = el("button", { type: "button", class: SMALL }, "Toutes les cases");
    all.addEventListener("click", () => this.apply(withAllDoors(this.editor.doc, sketch, partition)));
    const none = el("button", { type: "button", class: SMALL }, "Aucune porte");
    none.addEventListener("click", () => this.apply(withoutDoors(this.editor.doc, sketch, partition)));
    this.settings.replaceChildren(
      el("div", { class: "flex gap-1" }, all, none),
      length("Jeu", doors.gap, (gap) => this.apply(withDoorSettings(this.editor.doc, sketch, partition, { gap }))),
      length("Épaisseur", doors.thickness, (thickness) => this.apply(withDoorSettings(this.editor.doc, sketch, partition, { thickness }))),
      style,
      ...glass,
      el("label", { class: "flex items-center gap-1.5" }, handles, "Trous de poignée"),
      opening,
    );
  }

  down(): boolean {
    return false;
  }

  move(): void {}

  up(event: PointerEvent, isClick: boolean): boolean {
    if (!isClick) return false;
    const niche = nicheUnderPointer(this.viewport, this.editor.doc, event);
    if (!niche) {
      this.editor.notify("Cliquez dans une case de la Répartition.", "info");
      return true;
    }
    this.last = niche;
    const first = this.first;
    if ((findFeature(this.editor.doc, niche.sketch) as SketchFeature).clip) {
      this.editor.notify("Un angle coupé a sa propre porte : cochez-la dans le Plan de dressing.", "info");
      return true;
    }
    if (this.mode === "doors") {
      this.toggle(niche);
      return true;
    }
    if (!first || first.sketch !== niche.sketch || first.partition !== niche.partition) {
      this.first = niche;
      this.draw();
      return true;
    }
    this.first = null;
    this.draw();
    const [a, b] = [first.path[0] as number, niche.path[0] as number];
    if (a === b) return true;
    const undo = casesJoined(this.editor.doc, niche.sketch, niche.partition, a, b);
    void this.editor.change(withCasesJoined(this.editor.doc, niche.sketch, niche.partition, a, b));
    this.editor.notify(undo ? "Portes séparées." : `Une seule porte sur ${Math.abs(a - b) + 1} cases.`, "success");
    return true;
  }

  close(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.panel.remove();
    this.viewport.setPointerHandler(null);
    this.closed();
  }
}

let opened: DoorFrontsTool | null = null;

function openTool(viewport: Viewport, editor: Editor, mode: Mode): DoorFrontsTool {
  opened?.close();
  editor.sketches.cancelJoinery();
  opened = new DoorFrontsTool(viewport, editor, mode, () => (opened = null));
  return opened;
}

/** The Façades tool on this niche: the door of its case goes on, or comes off. */
export function openNicheFront(viewport: Viewport, editor: Editor, niche: PickedNiche): void {
  if ((findFeature(editor.doc, niche.sketch) as SketchFeature).clip) return editor.notify("Un angle coupé a sa propre porte : cochez-la dans le Plan de dressing.", "info");
  openTool(viewport, editor, "doors").toggle(niche);
}

export function bindDoorFronts(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector('[data-workshop="door-fronts"]')?.addEventListener("click", () => openTool(viewport, editor, "common"));
  // Stops the click before the editor opens the cabinet's Façades: this button serves both, in Meuble and in Dressing.
  const open = (event: Event) => {
    const body = editor.picked.selection.bodies[0] ?? editor.picked.bodyId;
    const feature = body ? findFeature(editor.doc, featureOfBody(bodyOrigin(editor.doc, body))) : undefined;
    const cabinetPicked = feature?.type === "cabinet" || feature?.type === "fronts";
    if (cabinetPicked || !partitions(editor.doc).length) return;
    event.stopPropagation();
    const tool = openTool(viewport, editor, "doors");
    const target = selectedPartition(editor);
    if (target) tool.aim(target);
  };
  for (const button of root.querySelectorAll('[data-action="fronts"]')) button.addEventListener("click", open);
}
