/**
 * « Penderie » and « Tiroirs » worked in the 3D view, as Étagères (joinery-3d.ts): click one niche of a Répartition —
 * or several (a click on a chosen one releases it) — set the rod or the drawers, see the parts in orange, OK. Each
 * niche gets its own feature (« Penderie 1 », « Tiroirs 1 »), which follows the niche when the Répartition or its
 * divisions change; one OK is one undo step. « Porte sur niches » makes one door over all the niches chosen. The tool stays to equip other niches until Échap. The parts are in
 * features/niche-parts.ts.
 */
import type { SketchGeometry } from "../../document/sketch";
import type { CadDocument, DisplayUnit, NicheFeature, SketchFeature, Vec3 } from "../../document/types";
import { uniqueId } from "../../document/operations";
import { GLASS_FRAME, GLASS_KINDS, PROFILE_FINISHES, styleChange, type DoorStyle } from "../../features/glass-door";
import { nicheGeometry, nicheParts, nicheProblem, worldBox, type NicheGeometry } from "../../features/niche-parts";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import type { Vec2 } from "../../sketcher/edit";
import { leafNiches } from "../../sketcher/partition-history";
import type { NicheBox } from "../../sketcher/shelves";
import { el } from "../../ui/dom";
import { panelHeader } from "../../ui/panel-close";
import { placePanel } from "../../ui/dock";

export type NicheFill = Exclude<NicheFeature["fill"], "doors" | "back">;
type Chosen = { partition: string; path: number[]; box: NicheBox };
type Settings = Omit<NicheFeature, "id" | "type" | "name" | "sketch" | "partition" | "niche" | "fill">;

export interface NicheToolHost {
  doc(): CadDocument;
  /** The sketch holding the Répartition. */
  sketchId(): string;
  container(): HTMLElement;
  unit(): DisplayUnit;
  /** Adds these features (or replaces the one changed) as one undo step; false when it was refused. */
  apply(features: NicheFeature[], success: string): boolean;
  changed(): void;
  closed(): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

/** Kept for the session: the last values (mm). */
const LAST: Settings = { diameter: 25, drop: 60, drawers: 3, gap: 3, bottomGap: 3, betweenGap: 3, sideGap: 3, thickness: 18, handles: true };

const WORDS: Record<NicheFill, { title: string; one: string; help: string }> = {
  rod: { title: "Penderie", one: "penderie", help: "Une tringle Ø25 d'un côté à l'autre de la niche, à mi-profondeur, sur deux supports ; elle compte au devis (au mètre) mais pas au débit. Pour une double penderie, divisez d'abord la niche par une étagère." },
  door: { title: "Porte sur niches", one: "porte", help: "Une porte sur les niches choisies, voisines et formant un rectangle. En applique, elle couvre la moitié des panneaux autour (le panneau entier au bord du meuble), comme la porte d'une case ; encastrée, elle est dans les niches, au nu des panneaux, un jeu tout autour." },
  drawers: { title: "Tiroirs", one: "tiroirs", help: "Façades encastrées dans la niche (au nu des panneaux), ou en applique devant eux (elles couvrent la moitié des panneaux autour) ; chacune avec son caisson sur coulisses. Pour des tiroirs sous une penderie, divisez d'abord la niche par une étagère." },
};

const FIELD =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[7rem_1fr] items-center gap-1.5";

const same = (a: NicheBox, b: NicheBox) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

export class NicheTool {
  private fill: NicheFill;
  private settings: Settings;
  /** The niches chosen: their partition and path, and their box (sketch coordinates). */
  private niches: Chosen[] = [];
  private done = false;
  private readonly panel: HTMLElement;

  /** `editing`: the equipment to change (its niche is chosen, its values come back). */
  constructor(
    private readonly host: NicheToolHost,
    fill: NicheFill,
    private readonly editing: NicheFeature | null = null,
  ) {
    this.fill = editing && editing.fill !== "doors" && editing.fill !== "back" ? editing.fill : fill;
    const { id: _id, type: _type, name: _name, sketch: _sketch, partition: _partition, niche: _niche, fill: _fill, ...rest } = editing ?? ({} as NicheFeature);
    // Older drawers had one gap all round.
    this.settings = editing ? { ...rest, sideGap: rest.sideGap ?? rest.gap, betweenGap: rest.betweenGap ?? rest.gap, bottomGap: rest.bottomGap ?? rest.gap } : { ...LAST };
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
        "max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": WORDS[this.fill].title,
    });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(host.container(), this.panel);
  }

  private sketch(): SketchFeature | undefined {
    const f = this.host.doc().features.find((x) => x.id === this.host.sketchId());
    return f?.type === "sketch" ? f : undefined;
  }

  private geometry(): SketchGeometry | null {
    return this.sketch() ?? null;
  }

  start(): void {
    if (this.editing) {
      const n = nicheGeometry(this.editing, this.sketch());
      if (typeof n === "string") this.host.notify(`${this.editing.name} : ${n}`, "error");
      else {
        const leaves = leafNiches(this.geometry()!);
        const box = (path: number[]) => leaves.find((l) => l.partition === this.editing!.partition && l.path.join(".") === path.join("."))?.box ?? n.box;
        this.niches = [this.editing.niche, ...(this.editing.span ?? [])].map((path) => ({ partition: this.editing!.partition, path, box: box(path) }));
      }
    }
    this.recompute();
  }

  /** The document changed under the tool (undo, redo): the niches chosen may be gone. */
  sync(): void {
    if (!this.editing) this.niches = [];
    this.recompute();
  }

  /** A click in a niche (its centre, sketch coordinates): chooses it, or releases it. */
  click(p: Vec2): void {
    if (this.editing && this.fill !== "door") return this.host.notify(`On change ${this.editing.name} ; terminez pour équiper d'autres niches.`, "info");
    const g = this.geometry();
    const leaf = g ? leafNiches(g).find((n) => p[0] > n.box.x0 && p[0] < n.box.x1 && p[1] > n.box.y0 && p[1] < n.box.y1) : undefined;
    if (!leaf) return this.host.notify("Cliquez dans une niche de la répartition.", "info");
    const at = this.niches.findIndex((n) => same(n.box, leaf.box));
    if (at >= 0) this.niches.splice(at, 1);
    else this.niches.push({ partition: leaf.partition, path: leaf.path, box: leaf.box });
    this.recompute();
  }

  chosen(): NicheBox[] {
    return this.niches.map((n) => n.box);
  }

  /** The feature this tool would make for a niche chosen. */
  private feature(n: { partition: string; path: number[] }, id: string, name: string): NicheFeature {
    const { span: _span, ...all } = this.settings as Settings & { span?: number[][] };
    // Only a door has a style (and its glass).
    const { style: _style, frameWidth: _w, frameDepth: _d, glass: _g, profile: _p, ...rest } = all;
    const settings = this.fill === "door" ? all : rest;
    const span = this.fill === "door" ? this.niches.filter((o) => o.path.join(".") !== n.path.join(".")).map((o) => [...o.path]) : [];
    return { id, type: "niche", name, sketch: this.host.sketchId(), partition: n.partition, niche: [...n.path], fill: this.fill, ...settings, ...(span.length ? { span } : {}) };
  }

  /** Each niche chosen with its geometry, or why it cannot be equipped. */
  private checked(): { niche: Chosen; geometry: NicheGeometry | null; problem: string | null }[] {
    const sketch = this.sketch();
    if (this.fill === "door") {
      const [first] = this.niches;
      if (!first) return [];
      if (this.niches.some((n) => n.partition !== first.partition)) return [{ niche: first, geometry: null, problem: "Les niches d'une porte sont dans la même répartition." }];
      const geometry = nicheGeometry(this.feature(first, "preview", ""), sketch);
      if (typeof geometry === "string") return [{ niche: first, geometry: null, problem: geometry }];
      return [{ niche: first, geometry, problem: nicheProblem({ fill: "door", ...this.settings }, geometry) }];
    }
    return this.niches.map((niche) => {
      const geometry = nicheGeometry({ partition: niche.partition, niche: niche.path, fill: this.fill, mount: this.settings.mount }, sketch);
      if (typeof geometry === "string") return { niche, geometry: null, problem: geometry };
      return { niche, geometry, problem: nicheProblem({ fill: this.fill, ...this.settings }, geometry) };
    });
  }

  /** The parts OK would make, as boxes of the world (the rod by its square): the orange preview. */
  solids(): [Vec3, Vec3][] {
    return this.checked().flatMap(({ niche, geometry, problem }) => {
      if (!geometry || problem) return [];
      return nicheParts(this.feature(niche, "preview", ""), geometry).map((part) => {
        if (part.kind === "box") return worldBox(geometry, part);
        const r = part.radius ?? 1;
        return worldBox(geometry, { from: [part.from[0], part.from[1] - r, part.from[2] - r], to: [part.to[0], part.to[1] + r, part.to[2] + r] });
      });
    });
  }

  // ---- panel ------------------------------------------------------------------------

  private recompute(): void {
    if (!this.editing) Object.assign(LAST, this.settings);
    this.draw();
    this.host.changed();
  }

  private draw(): void {
    if (this.done) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.panel.contains(active)) return;
    const unit = this.host.unit();
    const words = WORDS[this.fill];
    const number = (label: string, mm: number, set: (mm: number) => void, allowZero = false): HTMLElement => {
      const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(mm, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
      const apply = () => {
        const parsed = parseNumber(input.value);
        const ok = parsed !== null && (allowZero ? parsed >= 0 : parsed > 0);
        input.setAttribute("aria-invalid", String(!ok));
        if (ok) set(fromDisplay(parsed, unit));
      };
      input.addEventListener("change", apply);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          apply();
          input.blur();
        }
      });
      return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
    };
    const kind = el(
      "select",
      { class: FIELD, "aria-label": "Équipement", disabled: !!this.editing },
      el("option", { value: "rod", selected: this.fill === "rod" }, "Penderie (tringle)"),
      el("option", { value: "drawers", selected: this.fill === "drawers" }, "Tiroirs"),
      el("option", { value: "door", selected: this.fill === "door" }, "Porte sur niches"),
    );
    kind.addEventListener("change", () => {
      this.fill = kind.value as NicheFill;
      this.panel.setAttribute("aria-label", WORDS[this.fill].title);
      this.recompute();
    });
    const count = el("select", { class: FIELD, "aria-label": "Tiroirs" }, ...Array.from({ length: 8 }, (_, i) => el("option", { value: String(i + 1), selected: i + 1 === this.settings.drawers }, String(i + 1))));
    count.addEventListener("change", () => ((this.settings.drawers = Number(count.value)), this.recompute()));
    const handles = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: this.settings.handles });
    handles.addEventListener("change", () => ((this.settings.handles = handles.checked), this.recompute()));
    // Door and drawer fronts: in front of the panels, or in the niche. Each its own default when none is chosen.
    const mounted = this.settings.mount ?? (this.fill === "door" ? "overlay" : "inset");
    const mount = el("select", { class: FIELD, "aria-label": "Pose" }, el("option", { value: "overlay", selected: mounted === "overlay" }, "En applique (devant)"), el("option", { value: "inset", selected: mounted === "inset" }, "Encastrée (dans la niche)"));
    mount.addEventListener("change", () => ((this.settings.mount = mount.value as "overlay" | "inset"), this.recompute()));
    // A door's style: flat, framed, or glazed (an aluminium frame round tempered glass, its glass and finish).
    const pick = (label: string, value: string, options: readonly (readonly [string, string])[], set: (v: string) => void) => {
      const list = el("select", { class: FIELD, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
      list.addEventListener("change", () => (set(list.value), this.recompute()));
      return el("label", { class: ROW }, label, list);
    };
    const styles = [
      pick("Style", this.settings.style ?? "flat", [["flat", "Plate"], ["frame", "À cadre"], ["glass", "Vitrée (cadre alu)"]], (v) => Object.assign(this.settings, styleChange(v as DoorStyle, this.settings))),
      ...(this.settings.style === "glass"
        ? [
            number("Cadre alu", this.settings.frameWidth ?? GLASS_FRAME, (v) => ((this.settings.frameWidth = v), this.recompute())),
            pick("Verre", this.settings.glass ?? "clear", GLASS_KINDS, (v) => (this.settings.glass = v as NicheFeature["glass"])),
            pick("Cadre", this.settings.profile ?? "brushed", PROFILE_FINISHES, (v) => (this.settings.profile = v as NicheFeature["profile"])),
          ]
        : []),
    ];
    const hinge = el("select", { class: FIELD, "aria-label": "Charnières" }, el("option", { value: "left", selected: this.settings.hinges?.[0] !== "right" }, "À gauche"), el("option", { value: "right", selected: this.settings.hinges?.[0] === "right" }, "À droite"));
    hinge.addEventListener("change", () => ((this.settings.hinges = [hinge.value as "left" | "right"]), this.recompute()));
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Terminer");
    cancel.addEventListener("click", () => this.cancel());
    const checked = this.checked();
    const problem = checked.find((c) => c.problem)?.problem ?? null;
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: this.niches.length === 0 || problem !== null }, "OK");
    ok.addEventListener("click", () => this.confirm());

    const first = checked[0];
    const box = first?.niche.box;
    const size = box ? `${formatLength(box.x1 - box.x0, unit)} × ${formatLength(box.y1 - box.y0, unit)}` : null;
    let result: string | null = null;
    if (first?.geometry && !problem && box) {
      const parts = nicheParts(this.feature(first.niche, "preview", ""), first.geometry);
      if (this.fill === "door") {
        const door = parts.find((p) => p.role === "front");
        if (door) result = `Porte de ${formatLength(door.to[0] - door.from[0], unit)} × ${formatLength(door.to[1] - door.from[1], unit)} sur ${this.niches.length} niche${this.niches.length > 1 ? "s" : ""}.`;
      } else if (this.fill === "rod") {
        const rod = parts.find((p) => p.kind === "rod");
        if (rod) result = `Tringle de ${formatLength(rod.to[0] - rod.from[0], unit)}, à ${formatLength(rod.from[1] - box.y0, unit)} du bas de la niche.`;
      } else {
        const front = parts.find((p) => p.role === "front");
        const side = parts.find((p) => p.name.endsWith("côté gauche"));
        if (front && side) result = `${this.settings.drawers} façade${this.settings.drawers > 1 ? "s" : ""} de ${formatLength(front.to[1] - front.from[1], unit)} de haut, coulisses de ${formatLength(side.to[2] - side.from[2], unit)}.`;
      }
      if (result && this.niches.length > 1 && this.fill !== "door") result += ` (${this.niches.length} niches)`;
    }
    const rows: (HTMLElement | null)[] = [
      panelHeader(this.editing ? `Modifier : ${this.editing.name}` : words.title, () => this.cancel()),
      el(
        "p",
        { class: "text-gray-600 dark:text-gray-300" },
        this.niches.length === 0
          ? this.fill === "door"
            ? "Cliquez les niches que la porte va occuper : voisines, elles doivent former un rectangle."
            : `Cliquez la niche à équiper ; cliquez-en plusieurs pour y mettre la même ${this.fill === "rod" ? "penderie" : "série de tiroirs"}.`
          : this.niches.length === 1
            ? `Niche choisie : ${size}.${this.editing ? "" : " Cliquez-en d'autres pour les ajouter, ou la même pour la retirer."}`
            : `${this.niches.length} niches choisies.`,
      ),
      el("label", { class: ROW }, "Équipement", kind),
      ...(this.fill === "door"
        ? [
            el("label", { class: ROW }, "Pose", mount),
            number("Jeu", this.settings.gap, (v) => ((this.settings.gap = v), this.recompute()), true),
            number("Épaisseur porte", this.settings.thickness, (v) => ((this.settings.thickness = v), this.recompute())),
            ...styles,
            el("label", { class: ROW }, "Charnières", hinge),
            el("label", { class: "flex min-h-8 items-center gap-2" }, handles, "Trous de poignée (entraxe 128)"),
          ]
        : this.fill === "rod"
        ? [number("Diamètre", this.settings.diameter, (v) => ((this.settings.diameter = v), this.recompute())), number("Axe sous le haut", this.settings.drop, (v) => ((this.settings.drop = v), this.recompute()))]
        : [
            el("label", { class: ROW }, "Tiroirs", count),
            el("label", { class: ROW }, "Façades", mount),
            number("Jeu en haut", this.settings.gap, (v) => ((this.settings.gap = v), this.recompute()), true),
            this.settings.drawers > 1 ? number("Jeu entre façades", this.settings.betweenGap ?? this.settings.gap, (v) => ((this.settings.betweenGap = v), this.recompute()), true) : null,
            number("Jeu en bas", this.settings.bottomGap ?? this.settings.gap, (v) => ((this.settings.bottomGap = v), this.recompute()), true),
            number("Jeu de côté", this.settings.sideGap ?? this.settings.gap, (v) => ((this.settings.sideGap = v), this.recompute()), true),
            number("Épaisseur façades", this.settings.thickness, (v) => ((this.settings.thickness = v), this.recompute())),
            el("label", { class: "flex min-h-8 items-center gap-2" }, handles, "Trous de poignée (entraxe 128)"),
          ]),
      result ? el("p", { class: "bg-sky-50 px-2 py-1.5 text-sky-900 dark:bg-sky-950 dark:text-sky-100" }, result) : null,
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, problem) : null,
      el("p", { class: "text-[11px] text-gray-500" }, words.help),
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  // ---- end --------------------------------------------------------------------------

  /** OK: one feature per niche chosen (or the one changed), as one undo step; the tool stays for other niches. */
  confirm(): void {
    if (this.done) return;
    const problem = this.checked().find((c) => c.problem)?.problem;
    if (this.niches.length === 0 || problem) return this.host.notify(problem ?? "Cliquez d'abord la niche à équiper.", "error");
    const title = this.fill === "door" ? "Porte" : WORDS[this.fill].title;
    if (this.editing) {
      const niche = this.niches[0];
      if (!niche || !this.host.apply([this.feature(niche, this.editing.id, this.editing.name)], `${this.editing.name} : modification faite.`)) return;
      return this.cancel();
    }
    let doc = this.host.doc();
    const used = doc.features.map((f) => new RegExp(`^${title} (\\d+)$`).exec(f.name)?.[1]).filter((n): n is string => n !== undefined).map(Number);
    let next = Math.max(0, ...used) + 1;
    // Left to right, bottom to top.
    const order = [...this.niches].sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0);
    if (this.fill === "door") order.splice(1);
    const features = order.map((n) => {
      const id = uniqueId(doc, this.fill === "rod" ? "pd" : this.fill === "door" ? "pn" : "td");
      const f = this.feature(n, id, `${title} ${next++}`);
      doc = { ...doc, features: [...doc.features, f] };
      return f;
    });
    const n = features.length;
    if (!this.host.apply(features, this.fill === "door" ? `Porte posée sur ${this.niches.length} niche${this.niches.length > 1 ? "s" : ""}.` : `${n > 1 ? `${n} niches équipées` : "Niche équipée"} : ${WORDS[this.fill].one}.`)) return;
    this.niches = [];
    this.recompute();
  }

  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.host.closed();
  }

  dispose(): void {
    this.done = true;
    this.panel.remove();
  }
}
