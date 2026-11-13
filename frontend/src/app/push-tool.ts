/**
 * « Pousser » : les éléments sélectionnés — un caisson avec ses façades, une Répartition avec ses pièces, sinon le corps
 * seul — avancent d'un pas à chaque flèche du clavier (ou bouton du panneau). Les flèches suivent la vue : ← et → le long
 * de l'axe du sol le plus proche de la droite de l'écran, ↑ et ↓ vers le fond ou vers soi ; Page↑ / Page↓ (ou Maj + ↑ / ↓)
 * montent et descendent. Le pas se tape au clavier, l'outil ouvert : les chiffres vont dans le champ « Pas », la flèche
 * suivante pousse de ce qui est tapé. On voit le résultat à chaque pas ; OK (ou Entrée) le garde en une annulation,
 * Annuler (ou Échap) remet tout. Un clic dans la vue choisit un autre élément (Maj : en ajoute un). Un élément poussé
 * contre un autre corps (un caisson voisin, un mur) s'arrête à son contact : il n'entre jamais dedans (pushTravel).
 * Un caisson emporte son électroménager (un four dedans, une plaque dessus…) ; un four ou un micro-ondes encastré
 * cliqué pousse son caisson ; un autre appareil (une plaque, une hotte…) se pousse entier, sa découpe le suit.
 */
import { keyChar } from "../ui/digit-keys";
import * as THREE from "three";
import { cabinetOfAppliance, shownCabinets } from "../document/appliance-follow";
import { bodyLabel, findFeature } from "../document/operations";
import { movesNeeded, spacingFeatures, type Moving } from "../document/spacing";
import { featureOfBody, type CabinetFeature, type Feature, type Vec3 } from "../document/types";
import { applianceDef } from "../features/appliance-library";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import { freshFeatureIds } from "./curic-common";
import { wholeBodies, wholeOwner } from "./move-whole";
import { COMPACT_INPUT, PanelTool, type ToolContext } from "./panel-tool";

/** Kept for the session: the step (mm). */
let lastStep = 10;

type Push = "left" | "right" | "away" | "near" | "up" | "down";
const ARROWS: Record<string, Push> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "away", ArrowDown: "near", PageUp: "up", PageDown: "down" };
const BUTTON = "h-8 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

type Box = [Vec3, Vec3];
/** Below this a gap is a contact, an overlap is a touch (mm). */
const TOUCH = 0.01;

/**
 * How far a box may go along an axis (`dir`, a unit axis) by up to `step`: up to the first obstacle ahead of it that it
 * would meet (overlapping it across the axis), then stopped at its contact. Obstacles it already overlaps along the way
 * (a kick under a cabinet, a body it is in) or behind it do not stop it.
 */
export function pushTravel(moving: Box, obstacles: readonly { id: string; box: Box }[], dir: Vec3, step: number): { travel: number; stop: string | null } {
  const k = dir.findIndex((c) => Math.abs(c) > 0.5);
  const sense = Math.sign(dir[k]!);
  let travel = step;
  let stop: string | null = null;
  for (const o of obstacles) {
    const across = [0, 1, 2].filter((i) => i !== k).every((i) => moving[0][i]! < o.box[1][i]! - TOUCH && o.box[0][i]! < moving[1][i]! - TOUCH);
    if (!across) continue;
    const gap = sense > 0 ? o.box[0][k]! - moving[1][k]! : moving[0][k]! - o.box[1][k]!;
    if (gap < -TOUCH || gap >= travel) continue;
    travel = Math.max(0, gap);
    stop = o.id;
  }
  return { travel: Math.round(travel * 1000) / 1000, stop };
}

/** The world axis of the floor nearest to `v` (projected on it), signed; null when `v` is upright. */
export function floorAxis(v: readonly number[]): Vec3 | null {
  const [x, y] = [v[0]!, v[1]!];
  if (Math.hypot(x, y) < 1e-6) return null;
  return Math.abs(x) >= Math.abs(y) ? [Math.sign(x), 0, 0] : [0, Math.sign(y), 0];
}

/** Where one push goes, seen from a camera: its right and its forward on the floor (or its up, looking down). */
export function pushDirection(push: Push, right: readonly number[], forward: readonly number[], up: readonly number[]): Vec3 {
  if (push === "up") return [0, 0, 1];
  if (push === "down") return [0, 0, -1];
  const side = floorAxis(right) ?? [1, 0, 0];
  const ahead = floorAxis(forward) ?? floorAxis(up) ?? [0, 1, 0];
  const v = push === "left" || push === "right" ? side : ahead;
  return (push === "right" || push === "away" ? v : v.map((c) => (c ? -c : 0))) as Vec3;
}

export class PushTool extends PanelTool {
  /** The elements pushed, by key (a cabinet, a sketch, or a body alone). */
  private elements: { key: string; whole: boolean; name: string }[] = [];
  private shift: Vec3 = [0, 0, 0];
  private step = lastStep;
  /** What is being typed for the step, in the display unit. */
  private typed = "";
  private slots: { id: string; name: string }[] = [];
  private readonly keys = (event: KeyboardEvent) => this.key(event);
  /** Where every body shown stands as the tool opens (the model does not change before OK). */
  private readonly boxes = new Map<string, Box>();

  constructor(ctx: ToolContext, bodies: readonly string[]) {
    super(ctx, "Pousser", null);
    for (const id of ctx.viewport.displayedBodies) {
      const b = ctx.viewport.bodyMesh(id)?.metrics.bbox;
      if (b) this.boxes.set(id, [[...b[0]] as Vec3, [...b[1]] as Vec3]);
    }
    for (const id of bodies) this.add(id);
    window.addEventListener("keydown", this.keys, true);
  }

  /** The element a body is part of, added to those pushed (once). */
  private add(bodyId: string): void {
    const doc = this.ctx.doc();
    const f = findFeature(doc, featureOfBody(bodyId));
    if (f?.type === "appliance") {
      // Built in: its cabinet (it goes with it); else the appliance, whole.
      const cabinet = applianceDef(f.model)?.place === "in" ? cabinetOfAppliance(this.cabinets(), f) : undefined;
      const key = cabinet?.id ?? f.id;
      if (!this.elements.some((e) => e.key === key)) this.elements.push({ key, whole: true, name: (cabinet ?? f).name });
      return;
    }
    const owner = wholeOwner(doc, bodyId);
    const key = owner?.id ?? bodyId;
    if (this.elements.some((e) => e.key === key)) return;
    this.elements.push({ key, whole: !!owner, name: (owner && findFeature(doc, owner.id)?.name) ?? bodyLabel(doc, bodyId) });
  }

  private cabinets(): CabinetFeature[] {
    return shownCabinets(this.ctx.doc());
  }

  private moving(): Moving[] {
    const doc = this.ctx.doc();
    const shown = [...this.boxes.keys()];
    const cabinets = this.cabinets();
    const keys = new Set(this.elements.map((e) => e.key));
    return this.elements.flatMap((e) => {
      const type = findFeature(doc, e.key)?.type;
      if (type === "appliance") return [{ key: e.key, whole: true, shift: this.shift, bodies: shown.filter((b) => featureOfBody(b) === e.key) }];
      const main: Moving = { key: e.key, whole: e.whole, shift: this.shift, bodies: e.whole ? wholeBodies(doc, type === "cabinet" ? "cabinet" : "sketch", e.key, shown) : [e.key] };
      if (type !== "cabinet") return [main];
      // A cabinet's appliances go with it.
      const own = doc.features.filter((a) => a.type === "appliance" && !keys.has(a.id) && cabinetOfAppliance(cabinets, a)?.id === e.key);
      return [main, ...own.map((a): Moving => ({ key: a.id, whole: true, shift: this.shift, bodies: shown.filter((b) => featureOfBody(b) === a.id) }))];
    });
  }

  private made(): Feature[] | string {
    if (!this.elements.length) return "Cliquez un caisson, une Répartition ou un corps à pousser.";
    if (Math.hypot(...this.shift) < 1e-6) return "Poussez avec les flèches du clavier (ou les boutons) ; tapez d'abord le pas si besoin.";
    // From the document before this push: once stored, the current one has it already (OK would push it twice).
    const doc = this.docBefore();
    const moving = this.moving();
    const needed = movesNeeded(doc, moving);
    if (this.slots.length < needed) this.slots = freshFeatureIds(doc, "mv", "Poussée", needed);
    return spacingFeatures(doc, moving, this.slots);
  }

  protected feature(): Feature | string {
    const made = this.made();
    return typeof made === "string" ? made : made[0]!;
  }

  protected override companions(): Feature[] {
    const made = this.made();
    return typeof made === "string" ? [] : made.slice(1);
  }

  /** The step typed, taken (in mm), if any and valid. */
  private takeTyped(): void {
    if (!this.typed) return;
    const parsed = parseNumber(this.typed);
    this.typed = "";
    if (parsed !== null && parsed > 0) this.step = lastStep = Number(fromDisplay(parsed, this.ctx.unit()).toFixed(3));
    else this.ctx.notify("Tapez un pas plus grand que zéro.", "error");
  }

  /** One push, by the step, the way the view shows it. */
  push(push: Push): void {
    this.takeTyped();
    if (!this.elements.length) return this.render();
    const cam = this.ctx.viewport.camera;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const forward = cam.getWorldDirection(new THREE.Vector3());
    const d = pushDirection(push, right.toArray(), forward.toArray(), up.toArray());
    // Stopped against what it meets: the other bodies, where they stand.
    const mine = new Set(this.moving().flatMap((m) => m.bodies));
    const own = [...mine].map((id) => this.boxes.get(id)).filter((b): b is Box => !!b);
    if (own.length) {
      const at: Box = [[0, 1, 2].map((i) => Math.min(...own.map((b) => b[0][i]!)) + this.shift[i]!) as Vec3, [0, 1, 2].map((i) => Math.max(...own.map((b) => b[1][i]!)) + this.shift[i]!) as Vec3];
      const obstacles = [...this.boxes].filter(([id]) => !mine.has(id)).map(([id, box]) => ({ id, box }));
      const { travel, stop } = pushTravel(at, obstacles, d, this.step);
      if (stop) {
        // The element met, by its name (the cabinet, not its side).
        const doc = this.ctx.doc();
        const owner = wholeOwner(doc, stop);
        const met = findFeature(doc, featureOfBody(stop));
        const name = (owner && findFeature(doc, owner.id)?.name) ?? (met?.type === "appliance" ? met.name : bodyLabel(doc, stop));
        this.ctx.notify(travel > 0 ? `Arrêté contre « ${name} ».` : `Déjà contre « ${name} » : il ne peut pas aller plus loin.`, "info");
      }
      if (travel <= 0) return this.render();
      this.shift = this.shift.map((c, i) => Number((c + d[i]! * travel).toFixed(3))) as Vec3;
    } else this.shift = this.shift.map((c, i) => Number((c + d[i]! * this.step).toFixed(3))) as Vec3;
    this.render();
    this.schedulePreview();
  }

  /** The keys while the tool is open: arrows push, digits type the step (not while typing in another field). */
  private key(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const field = event.target instanceof Element ? event.target.closest("input, textarea, select") : null;
    if (field && !field.hasAttribute("data-push-step")) return;
    const arrow = ARROWS[event.key];
    if (arrow) {
      if (field) this.typed = (field as HTMLInputElement).value;
      this.push(event.shiftKey && arrow === "away" ? "up" : event.shiftKey && arrow === "near" ? "down" : arrow);
    } else if (!field && /^[0-9.,]$/.test(keyChar(event))) {
      // The digit row without Maj (AZERTY) types its digits too.
      this.typed += keyChar(event);
      this.render();
    } else if (!field && event.key === "Backspace" && this.typed) {
      this.typed = this.typed.slice(0, -1);
      this.render();
    } else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const input = el("input", { type: "text", inputmode: "decimal", class: `${COMPACT_INPUT} text-right font-mono ${this.typed ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : ""}`, value: this.typed || trim(toDisplay(this.step, unit), 4), "aria-label": `Pas (${UNIT_LABELS[unit]})`, "data-push-step": "" });
    input.addEventListener("change", () => ((this.typed = input.value), this.takeTyped(), this.render()));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.stopPropagation();
        this.typed = input.value;
        this.takeTyped();
        this.render();
      }
    });
    const button = (push: Push, text: string, title: string) => {
      const b = el("button", { type: "button", class: BUTTON, title, "data-push": push }, text);
      b.addEventListener("click", () => this.push(push));
      return b;
    };
    const reset = el("button", { type: "button", class: `${BUTTON} w-full`, disabled: Math.hypot(...this.shift) < 1e-6 }, "Remettre à zéro");
    reset.addEventListener("click", () => ((this.shift = [0, 0, 0]), this.render(), this.schedulePreview()));
    const [x, y, z] = this.shift.map((v) => formatLength(v, unit));
    return [
      this.info(this.elements.length ? `À pousser : ${this.elements.map((e) => `« ${e.name} »`).join(", ")}.` : "Cliquez un caisson, une Répartition ou un corps (Maj : en ajouter un)."),
      el("label", { class: "grid grid-cols-[5rem_1fr] items-center gap-1.5" }, `Pas (${UNIT_LABELS[unit]})`, input),
      el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, "Tapez le pas au clavier puis une flèche : ← → sur les côtés, ↑ ↓ vers le fond ou vers vous, Page↑ / Page↓ pour monter ou descendre."),
      el(
        "div",
        { class: "grid grid-cols-3 gap-1", role: "group", "aria-label": "Pousser" },
        button("up", "⤒", "Monter"), button("away", "↑", "Vers le fond"), button("down", "⤓", "Descendre"),
        button("left", "←", "À gauche"), button("near", "↓", "Vers vous"), button("right", "→", "À droite"),
      ),
      el("p", { class: "font-mono text-gray-700 dark:text-gray-200", "data-push-total": "" }, `Poussé de X ${x} · Y ${y} · Z ${z}`),
      reset,
    ];
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (!face) return;
    if (Math.hypot(...this.shift) > 1e-6) return this.ctx.notify("Cette poussée est enregistrée : fermez l'outil (✕), puis rouvrez-le pour pousser un autre élément (Ctrl + Z la reprend).", "info");
    if (!event.shiftKey) this.elements = [];
    this.add(face.bodyId);
    this.render();
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { face } : null);
  }

  protected override dispose(): void {
    window.removeEventListener("keydown", this.keys, true);
    this.ctx.viewport.setHoverHighlight(null);
  }
}
