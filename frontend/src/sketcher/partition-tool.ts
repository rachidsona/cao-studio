/**
 * « Répartition » tool of the sketch, next to « Étagères »: a rectangle (a cabinet front: height and length) divided
 * into 2 to 12 cases of the same width, one per door, by dividers drawn with their thickness — simple (one panel) or
 * double (two panels back to back): 3 cases give a simple and a double, 4 give simple · double · simple, 5 give simple
 * · double · double · simple, and each one can be changed. The bottom can be raised (an option, 4 cm), leaving a plinth
 * under it, and where the sides meet the top and the bottom it is chosen which runs through (the doubles cut the
 * boards by default). The partition is shown dashed in the sketch as the values change; a click in the view puts its
 * lower-left corner there, and OK draws it: every panel and case is then a closed area, ready to extrude, and the
 * niches can be divided by shelves. Doors can be asked for (extruded panels): one in front of each case, as wide as
 * its sides and dividers allow, and a back applied behind the panels (document/partition-doors.ts). The maths are in
 * partition.ts.
 */
import type { BackSettings, DoorSettings, OffsetRecord, SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import type { Vec2 } from "./edit";
import type { PartitionPlan } from "../features/partition-dims";
import { extrusionOption } from "./extrusion-option";
import { extrusionGroups, isPartition, isShelves, partitionRecord, rebuildChain, stepName } from "./partition-history";
import { defaultDividers, MAX_CASES, partitionElements, partitionGeometry, partitionLayout, type DividerKind, type PartitionInput, type PartitionLayout, type Pass } from "./partition";
import { extractLoops, sketchFaces } from "./loops";
import { regionAt } from "./region-pick";
import { pointPos } from "./edit";
import type { SketchExtrusion } from "./mode";
import type { Preview } from "./tools";

export interface PartitionHost {
  geometry(): SketchGeometry;
  container(): HTMLElement;
  unit(): DisplayUnit;
  /** Stores the new geometry as one undo step (with an extrusion of some areas when asked); false when it was refused. */
  apply(geometry: SketchGeometry, success: string, extrusion?: SketchExtrusion): boolean;
  /** An id for a new step of the history, unique in the document. */
  offsetId(): string;
  /** The sketch lies flat (its plane is horizontal, seen from above). */
  flat(): boolean;
  /** The preview changed (redraw). */
  changed(): void;
  /** Frames this rectangle of the sketch in the view. */
  fit(min: Vec2, max: Vec2): void;
  /** The tool ended. */
  closed(): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

/** Kept for the session: the last measures given (mm). */
const last: PartitionInput = {
  length: 1800,
  height: 2500,
  thickness: 18,
  cases: 3,
  dividers: defaultDividers(3),
  boards: true,
  plinth: 0,
  outer: "board",
  single: "board",
  double: "side",
};

/** Kept for the session: the last doors asked for (mm). */
const lastDoors: DoorSettings = { gap: 3, thickness: 18, handles: true };
const lastBack: BackSettings = { thickness: 8, split: "whole" };

/** The plinth height offered when the option is ticked (mm): 4 cm. */
let plinthHeight = 40;

const KIND_NAMES: Record<DividerKind, string> = { single: "simple", double: "double", none: "sans" };

/** « 3 cases de 57 cm », or « 2 cases de 57 cm et 114 cm » when they differ. */
function casesText(layout: PartitionLayout, unit: DisplayUnit): string {
  const widths = layout.caseWidths;
  const equal = widths.every((w) => Math.abs(w - (widths[0] as number)) < 1e-6);
  if (equal) return `${widths.length} cases de ${formatLength(widths[0] as number, unit)}`;
  const shown = widths.map((w) => formatLength(w, unit));
  return `${widths.length} cases de ${shown.slice(0, -1).join(", ")} et ${shown.at(-1)}`;
}

const FIELD =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr] items-center gap-1.5";

export class SketchPartitionTool {
  preview: Preview | null = null;
  private input: PartitionInput = { ...last, dividers: [...last.dividers] };
  /** Where the lower-left corner goes (mm). */
  private origin: Vec2 = [0, 0];
  /** The doors in front of the cases, null: none. */
  private doors: DoorSettings | null = null;
  /** The back behind the panels, null: none. */
  private back: BackSettings | null = null;
  private done = false;
  private readonly panel: HTMLElement;

  /** `editing`: the step of the history to make again (its values come back, its lines and bodies are replaced). */
  constructor(
    private readonly host: PartitionHost,
    private readonly editing: OffsetRecord | null = null,
  ) {
    if (editing && isPartition(editing)) {
      this.input = structuredClone(editing.step.input);
      this.origin = [...editing.step.origin];
      extrusionOption.on = editing.step.depth !== undefined;
      if (editing.step.depth !== undefined) extrusionOption.depth = editing.step.depth;
      this.doors = editing.step.doors ? { ...editing.step.doors } : null;
      this.back = editing.step.back ? { ...editing.step.back } : null;
    }
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 max-h-[calc(100%-1rem)] w-64 space-y-2 overflow-y-auto border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
        "max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Répartition",
    });
    // The panel must not start a sketch gesture when it is clicked.
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(host.container(), this.panel);
  }

  start(): void {
    this.recompute();
    this.fit();
  }

  /** The view shows all of the partition. */
  private fit(): void {
    this.host.fit(this.origin, [this.origin[0] + this.input.length, this.origin[1] + this.input.height]);
  }

  /** The sketch changed under the tool (undo, redo). */
  sync(): void {
    this.recompute();
  }

  /** A click in the view puts the lower-left corner of the partition there (to the millimetre). */
  click(p: Vec2): void {
    this.origin = [Math.round(p[0]), Math.round(p[1])];
    this.recompute();
  }

  /** The panels OK would make, as outlines of the sketch (each closed area of a panel, mitred ends included): the preview in volume of the 3D view. */
  pieces(): Vec2[][] {
    const layout = partitionLayout(this.input);
    if (typeof layout === "string") return [];
    const faces = sketchFaces(extractLoops(partitionGeometry(this.input, layout)));
    const [ox, oy] = this.origin;
    return partitionElements(layout).flatMap((e) => {
      const region = regionAt(faces, e.probe);
      return region ? [region.outer.map(([x, y]): Vec2 => [x + ox, y + oy])] : [];
    });
  }

  /** The Répartition OK would make, for the dimensions in the view. */
  plan(): PartitionPlan | null {
    const layout = partitionLayout(this.input);
    if (typeof layout === "string") return null;
    const [ox, oy] = this.origin;
    return {
      outer: { x0: ox, y0: oy, x1: ox + this.input.length, y1: oy + this.input.height },
      niches: layout.caseSpans.map(([x0, x1]) => ({ x0: x0 + ox, x1: x1 + ox, y0: layout.inner[0] + oy, y1: layout.inner[1] + oy })),
      depth: extrusionOption.on ? extrusionOption.depth : 0,
      plinth: this.input.plinth,
    };
  }

  /** Changes the size: the view follows. */
  private resize(patch: Partial<PartitionInput>): void {
    this.set(patch);
    this.fit();
  }

  /** Changes a value: the panel and the dashed drawing follow. */
  private set(patch: Partial<PartitionInput>): void {
    this.input = { ...this.input, ...patch };
    this.recompute();
  }

  private recompute(): void {
    // The values of a new partition are kept for the next one (not those of one being changed).
    if (!this.editing) Object.assign(last, this.input);
    const layout = partitionLayout(this.input);
    if (typeof layout === "string") this.preview = null;
    else {
      const g = partitionGeometry(this.input, layout);
      const at = (id: string): Vec2 => {
        const [x, y] = pointPos(g, id);
        return [x + this.origin[0], y + this.origin[1]];
      };
      this.preview = { lines: g.curves.flatMap((c): [Vec2, Vec2][] => (c.kind === "line" ? [[at(c.p1), at(c.p2)]] : [])), circles: [], arcs: [] };
    }
    this.draw();
    this.host.changed();
  }

  private draw(): void {
    if (this.done) return;
    // A result arriving while a field is being edited must not replace it.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.panel.contains(active)) return;
    const unit = this.host.unit();
    const layout = partitionLayout(this.input);
    const number = (label: string, mm: number, set: (mm: number) => void, signed = false): HTMLElement => {
      const field = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(mm, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
      const apply = () => {
        const parsed = parseNumber(field.value);
        const ok = parsed !== null && (signed || parsed > 0);
        field.setAttribute("aria-invalid", String(!ok));
        if (ok) set(fromDisplay(parsed, unit));
      };
      field.addEventListener("change", apply);
      field.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          apply();
          field.blur();
        }
      });
      return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, field);
    };
    const select = (label: string, value: string, options: [string, string][], set: (v: string) => void): HTMLElement => {
      const s = el("select", { class: FIELD, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
      s.addEventListener("change", () => set(s.value));
      return el("label", { class: ROW }, label, s);
    };
    const check = (label: string, checked: boolean, set: (v: boolean) => void): HTMLElement => {
      const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked });
      box.addEventListener("change", () => set(box.checked));
      return el("label", { class: "flex min-h-8 items-center gap-2" }, box, label);
    };
    const pass = (label: string, key: "outer" | "single" | "double") =>
      select(
        label,
        this.input[key],
        [["board", "Le dessus passe"], ["side", "Le côté passe"], ...(key === "outer" ? ([["miter", "D'onglet (45°)"]] as [string, string][]) : [])],
        (v) => this.set({ [key]: v as Pass }),
      );
    const heading = (text: string) => el("h3", { class: "panel-title pt-1" }, text);
    const info = (text: string) => el("p", { class: "text-gray-600 dark:text-gray-300" }, text);

    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Annuler");
    cancel.addEventListener("click", () => this.cancel());
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: typeof layout === "string" }, "OK");
    ok.addEventListener("click", () => this.confirm());

    const joined = typeof layout !== "string" && layout.caseSpans.length < this.input.cases;
    const result =
      typeof layout === "string"
        ? null
        : `${casesText(layout, unit)} — côtés : ${this.input.dividers.map((k) => KIND_NAMES[k]).join(" · ")}.${joined ? ` Niches : ${layout.caseSpans.map(([a, b]) => formatLength(b - a, unit)).join(" · ")}.` : ""}`;
    // The share of a case, without a unit (« 2 »: twice as wide as a case of 1).
    const share = (i: number): HTMLElement => {
      const value = this.input.widths?.[i] ?? 1;
      const field = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(value, 4), "aria-label": `Case ${i + 1} (parts)` });
      const apply = () => {
        const parsed = parseNumber(field.value);
        const ok = parsed !== null && parsed > 0;
        field.setAttribute("aria-invalid", String(!ok));
        if (ok) this.set({ widths: Array.from({ length: this.input.cases }, (_, k) => (k === i ? parsed : (this.input.widths?.[k] ?? 1))) });
      };
      field.addEventListener("change", apply);
      field.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          apply();
          field.blur();
        }
      });
      const width = typeof layout === "string" ? "" : ` → ${formatLength(layout.caseWidths[i] ?? 0, unit)}`;
      return el("label", { class: ROW }, `Case ${i + 1} (parts)${width}`, field);
    };
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "panel-title" }, this.editing ? `Modifier : ${this.editing.name}` : "Répartition"),
      info(
        this.editing
          ? `Les étagères posées dans ses niches (${this.divisions().length}) sont refaites avec elle ; chacune reste une étape de l'historique.`
          : "Un rectangle réparti en cases égales, une par porte, avec ses côtés à leur épaisseur. Cliquez dans la vue pour poser son coin bas-gauche.",
      ),
      number("Hauteur", this.input.height, (v) => this.resize({ height: v })),
      number("Longueur", this.input.length, (v) => this.resize({ length: v })),
      number("Épaisseur", this.input.thickness, (v) => this.set({ thickness: v })),
      select("Cases", String(this.input.cases), Array.from({ length: MAX_CASES - 1 }, (_, i): [string, string] => [String(i + 2), `${i + 2} cases (${i + 2} portes)`]), (v) =>
        // Changing the number of cases starts again from the usual dividers; each one can then be changed.
        this.set({ cases: Number(v), dividers: defaultDividers(Number(v)), ...(this.input.widths ? { widths: Array.from({ length: Number(v) }, () => 1) } : {}) }),
      ),
      // 3 cases = 2 modules (2 doors + 1 door): the double side is where they meet, on the right or on the left.
      this.input.cases === 3
        ? select("Côté double", this.input.dividers[0] === "double" && this.input.dividers[1] !== "double" ? "left" : "right", [["right", "À droite (2 portes + 1)"], ["left", "À gauche (1 + 2 portes)"]], (v) =>
            this.set({ dividers: defaultDividers(3, v as "left" | "right") }),
          )
        : null,
      this.input.cases === 3 && !this.input.widths ? info("Trois niches égales ; un seul côté double, l'autre simple.") : null,
      // Equal cases, or each its share of the length (« 1 » and « 2 »: the second twice as wide).
      select("Largeur des cases", this.input.widths ? "shares" : "equal", [["equal", "Égales"], ["shares", "En proportions"]], (v) => {
        const { widths: _omit, ...rest } = this.input;
        this.input = v === "shares" ? { ...rest, widths: Array.from({ length: rest.cases }, () => 1) } : rest;
        this.recompute();
      }),
      ...(this.input.widths ? Array.from({ length: this.input.cases }, (_, i) => share(i)) : []),
      this.input.widths ? info("Chaque case prend sa part de la longueur libre : 1 et 2, la seconde est deux fois plus large.") : null,
      ...this.input.dividers.map((kind, i) =>
        select(`Côté ${i + 1}`, kind, [["single", "Simple (un panneau)"], ["double", "Double (deux panneaux)"], ["none", "Sans côté (une seule niche)"]], (v) => this.set({ dividers: this.input.dividers.map((k, j) => (j === i ? (v as DividerKind) : k)) })),
      ),
      check("Dessus et dessous", this.input.boards, (v) => this.set({ boards: v })),
      // Option: the bottom is raised, which leaves a plinth under it.
      this.input.boards ? check("Socle (dessous relevé)", this.input.plinth > 0, (v) => this.set({ plinth: v ? plinthHeight : 0 })) : null,
      this.input.boards && this.input.plinth > 0 ? number("Hauteur du socle", this.input.plinth, (v) => ((plinthHeight = v), this.set({ plinth: v }))) : null,
      this.input.boards ? heading("Qui passe aux angles") : null,
      this.input.boards ? info("Un côté qui passe monte de bout en bout et coupe le dessus et le dessous.") : null,
      this.input.boards ? pass("Côtés extérieurs", "outer") : null,
      this.input.boards && this.input.outer === "miter"
        ? info(this.input.plinth > 0 ? "D'onglet en haut : le dessus et le côté se rejoignent sur la diagonale à 45°. Avec le socle, le côté descend jusqu'au sol et le dessous s'appuie contre lui." : "D'onglet : le dessus et le dessous rejoignent chaque côté extérieur sur la diagonale à 45° de l'angle.")
        : null,
      this.input.boards ? pass("Côtés simples", "single") : null,
      this.input.boards ? pass("Côtés doubles", "double") : null,
      heading("Extrusion"),
      check("Extruder les panneaux", extrusionOption.on, (v) => ((extrusionOption.on = v), this.draw())),
      extrusionOption.on ? number("Profondeur", extrusionOption.depth, (v) => ((extrusionOption.depth = v), this.draw())) : null,
      extrusionOption.on ? info("Chaque panneau devient un corps, nommé Dessous, Dessus ou Côté ; les niches restent vides.") : null,
      heading("Portes"),
      extrusionOption.on
        ? check("Une porte par case", this.doors !== null, (v) => ((this.doors = v ? { ...lastDoors } : null), this.draw()))
        : info("Cochez « Extruder les panneaux » pour poser des portes."),
      extrusionOption.on && this.doors ? number("Jeu", this.doors.gap, (v) => this.setDoors({ gap: v }), true) : null,
      extrusionOption.on && this.doors ? number("Épaisseur portes", this.doors.thickness, (v) => this.setDoors({ thickness: v })) : null,
      extrusionOption.on && this.doors ? check("Trous de poignée (entraxe 128)", this.doors.handles, (v) => this.setDoors({ handles: v })) : null,
      extrusionOption.on && this.doors
        ? select("Style des portes", this.doors.style ?? "flat", [["flat", "Plate"], ["frame", "À cadre (panneau en retrait, usinée dans la masse)"]], (v) => this.setDoors(v === "frame" ? { style: "frame", frameWidth: this.doors?.frameWidth ?? 70, frameDepth: this.doors?.frameDepth ?? 6 } : { style: "flat" }))
        : null,
      extrusionOption.on && this.doors?.style === "frame" ? number("Largeur du cadre", this.doors.frameWidth ?? 70, (v) => this.setDoors({ frameWidth: v })) : null,
      extrusionOption.on && this.doors?.style === "frame" ? number("Retrait du panneau", this.doors.frameDepth ?? 6, (v) => this.setDoors({ frameDepth: v })) : null,
      // The side each door opens from.
      ...(extrusionOption.on && this.doors && typeof layout !== "string"
        ? layout.caseWidths.slice(this.doors.joined?.filter((c) => c < layout.caseWidths.length - 1).length ?? 0).map((_, i, doors) =>
            select(`Porte ${i + 1}`, this.hinge(i), [["left", "S'ouvre à gauche (charnières à gauche)"], ["right", "S'ouvre à droite (charnières à droite)"]], (v) =>
              this.setDoors({ hinges: doors.map((__, k) => (k === i ? (v as "left" | "right") : this.hinge(k))) }),
            ),
          )
        : []),
      extrusionOption.on && this.doors
        ? info("En applique devant les panneaux : chaque porte couvre le dessus, le dessous, le côté extérieur ou son côté double en entier, et la moitié d'un côté simple ; deux cases sans côté entre elles ont chacune la leur, jointives au milieu.")
        : null,
      heading("Fond"),
      extrusionOption.on
        ? check("Panneau de fond", this.back !== null, (v) => ((this.back = v ? { ...lastBack } : null), this.draw()))
        : info("Cochez « Extruder les panneaux » pour poser un fond."),
      extrusionOption.on && this.back ? number("Épaisseur fond", this.back.thickness, (v) => this.setBack({ thickness: v })) : null,
      extrusionOption.on && this.back
        ? select("Découpe", this.back.split, [["whole", "Un seul fond (tout le placard)"], ["cases", "Un fond par case (suit les côtés)"]], (v) => this.setBack({ split: v as BackSettings["split"] }))
        : null,
      extrusionOption.on && this.back
        ? info("En applique derrière les panneaux : le fond couvre le dessus, le dessous et les côtés jusqu'à leurs bords. Par case, il est coupé au milieu d'un côté simple, entier sur un côté double.")
        : null,
      heading("Position"),
      number("Coin X", this.origin[0], (v) => ((this.origin = [v, this.origin[1]]), this.recompute()), true),
      number("Coin Y", this.origin[1], (v) => ((this.origin = [this.origin[0], v]), this.recompute()), true),
      result ? el("p", { class: " bg-sky-50 px-2 py-1.5 text-sky-900 dark:bg-sky-950 dark:text-sky-100" }, result) : null,
      this.host.flat()
        ? el(
            "p",
            { class: " bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" },
            "Cette esquisse est à plat (plan XY, vue de dessus) : la hauteur du meuble sera couchée sur le sol, et vues de face les étagères fermeront les niches. Pour un meuble debout, dessinez-le dans une esquisse du plan XZ (de face).",
          )
        : null,
      typeof layout === "string" ? el("p", { class: " bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, layout) : null,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  // ---- end --------------------------------------------------------------------------

  /** The divisions of this partition's niches by shelves (steps of the history after it). */
  private divisions(): OffsetRecord[] {
    const id = this.editing?.id;
    return (this.host.geometry().offsets ?? []).filter((r) => isShelves(r) && r.step.of === id);
  }

  /**
   * OK: the partition is a step of the sketch's history, its lines made from it (one undo step), and the tool ends; the
   * niches are then divided with « Étagères ». Changing a step made before makes it, and what follows it, again.
   */
  confirm(): void {
    if (this.done) return;
    const layout = partitionLayout(this.input);
    if (typeof layout === "string") {
      this.host.notify(layout, "error");
      return;
    }
    const g = this.host.geometry();
    const depth = extrusionOption.on ? extrusionOption.depth : undefined;
    const id = this.editing?.id ?? this.host.offsetId();
    const doors = depth !== undefined && this.doors ? { doors: { ...this.doors } } : {};
    const back = depth !== undefined && this.back ? { back: { ...this.back } } : {};
    const step = { kind: "partition" as const, input: structuredClone(this.input), origin: [...this.origin] as [number, number], ...(depth !== undefined ? { depth } : {}), ...doors, ...back };
    const offsets = this.editing
      ? // An automatic name follows the number of cases ("Répartition 2 cases" → "Répartition 3 cases"); one the user chose stays.
        (g.offsets ?? []).map((r) => (r.id === id ? { ...r, step, name: /^Répartition \d+ cases( \(\d+\))?$/.test(r.name) ? r.name.replace(/\d+ cases/, `${this.input.cases} cases`) : r.name } : r))
      : [...(g.offsets ?? []), { ...partitionRecord(id, stepName(g, `Répartition ${this.input.cases} cases`), this.input, this.origin, depth), step }];
    const rebuilt = rebuildChain({ ...g, offsets }, id);
    if (typeof rebuilt === "string") {
      this.host.notify(rebuilt, "error");
      return;
    }
    // The panels (not the niches) are extruded when asked, each one a body of its own (replacing the ones made before).
    const groups = extrusionGroups(g.offsets ?? [], rebuilt);
    const extruded: SketchExtrusion | undefined = groups.length ? { groups } : undefined;
    const unit = this.host.unit();
    const made = `${this.editing ? "Répartition modifiée" : "Répartition"} en ${casesText(layout, unit)}${depth !== undefined ? `, panneaux extrudés de ${formatLength(depth, unit)}` : ""}${"doors" in doors ? `, ${layout.caseWidths.length} porte${layout.caseWidths.length > 1 ? "s" : ""}` : ""}${"back" in back ? ", avec son fond" : ""}${rebuilt.dropped.length ? ` — ${rebuilt.problems.join(" ")}` : ""}.`;
    if (!this.host.apply(rebuilt.geometry, made, extruded)) return;
    this.cancel();
  }

  /** The side door i opens from: the one chosen, else left, right, left… in turn. */
  private hinge(i: number): "left" | "right" {
    return this.doors?.hinges?.[i] ?? (i % 2 === 0 ? "left" : "right");
  }

  private setDoors(change: Partial<DoorSettings>): void {
    if (!this.doors) return;
    this.doors = { ...this.doors, ...change };
    const { hinges: _own, ...kept } = this.doors;
    Object.assign(lastDoors, kept);
    this.draw();
  }

  private setBack(change: Partial<BackSettings>): void {
    if (!this.back) return;
    this.back = { ...this.back, ...change };
    Object.assign(lastBack, this.back);
    this.draw();
  }

  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.host.closed();
  }

  /** Removes the panel without notifying the host (the sketch mode is switching tools itself). */
  dispose(): void {
    this.done = true;
    this.preview = null;
    this.panel.remove();
  }
}
