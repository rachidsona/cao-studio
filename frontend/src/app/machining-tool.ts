/**
 * "Usinage" (cabinet-making machining): the 32 mm drilling rows, hinge cups
 * and back groove, cut in a face clicked on a board; and the joints between
 * two boards (dowels, confirmat screws, half-lap, mortise and tenon), cut or
 * grown in both boards at once. Exact cuts of the solids, one undo step.
 * The numbers of each preset are in features/joinery.ts.
 */
import { chosenHardware } from "../document/hardware-catalog";
import { bodyLabel } from "../document/operations";
import type { Axis, Feature, MachiningFeature, MachiningOp } from "../document/types";
import {
  CONFIRMAT, DOWELS, DRILLING_32, GROOVE, HINGES, MINIFIX, TENON,
  confirmats, contactOf, dowels, drilling32, groove, halfLap, hinges, holesIn, minifix, tenon,
  type Box, type BoxFace, type Joint,
} from "../features/joinery";
import { formatLength } from "../measurements/units";
import { freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

type Kind = MachiningFeature["kind"];
const FACE_KINDS: readonly Kind[] = ["drilling32", "hinge", "groove"];
const KINDS: [Kind, string][] = [
  ["drilling32", "Perçages 32 (face d'un côté)"],
  ["hinge", "Charnières (cuvettes Ø35)"],
  ["groove", "Rainure de fond"],
  ["dowel", "Tourillons (2 planches)"],
  ["confirmat", "Confirmat (2 planches)"],
  ["minifix", "Excentrique Minifix (A : la face, B : le chant)"],
  ["halflap", "Mi-bois (planches croisées)"],
  ["tenon", "Tenon et mortaise (2 planches)"],
];
const NAMES: Partial<Record<Kind, string>> = { drilling32: "Perçages 32", hinge: "Charnières", groove: "Rainure", dowel: "Tourillons", confirmat: "Confirmat", minifix: "Minifix", halflap: "Mi-bois", tenon: "Tenon-mortaise" };
const SIDES: [string, string][] = [["low", "Du bord bas (le plus petit)"], ["high", "Du bord haut"]];
const AXIS_LETTER = ["X", "Y", "Z"];

const isFaceKind = (kind: Kind) => FACE_KINDS.includes(kind);

/** The face of the box the point lies on (boards are boxes), or null when it is on none within 0.6 mm. */
export function faceAt(box: Box, point: [number, number, number]): BoxFace | null {
  let best: { face: BoxFace; d: number } | null = null;
  for (const axis of [0, 1, 2] as Axis[]) {
    for (const sign of [-1, 1] as const) {
      const d = Math.abs(point[axis] - (sign > 0 ? (box[1][axis] as number) : (box[0][axis] as number)));
      if (!best || d < best.d) best = { face: { axis, sign }, d };
    }
  }
  return best && best.d <= 0.6 ? best.face : null;
}

export class MachiningTool extends PanelTool {
  private kind: Kind = "drilling32";
  /** Boards picked: one for a face kind, two (A then B) for a joint. */
  private picked: string[];
  private face: BoxFace | null = null;
  private drill = { ...DRILLING_32 };
  /** The cups of the hinge chosen for the project (catalogue), else the usual Ø35 × 13 at 22.5 mm. */
  private cups = (() => {
    const { hinge } = chosenHardware(this.ctx.doc());
    return { ...HINGES, diameter: hinge.cup.diameter, depth: hinge.cup.depth, edgeDistance: hinge.cup.edge };
  })();
  private slot = { ...GROOVE };
  private pins = { ...DOWELS };
  private screws = { ...CONFIRMAT };
  private cams = { ...MINIFIX };
  private tongue = { ...TENON };
  private aOnTop = true;
  /** Boxes of the boards, taken when they were picked: the preview replaces the bodies in the view. */
  private readonly boxes = new Map<string, Box>();

  constructor(ctx: ToolContext, selected: string[] = []) {
    super(ctx, "Usinage", null);
    this.picked = selected.slice(0, 2);
    this.picked.forEach((id) => this.remember(id));
    if (this.picked.length === 2) this.kind = "dowel";
  }

  private remember(id: string): void {
    const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
    if (b) this.boxes.set(id, [[...b[0]], [...b[1]]]);
  }

  private box(id: string | undefined): Box | null {
    return (id && this.boxes.get(id)) || null;
  }

  private jointOf(): Joint | string {
    const [a, b] = [this.box(this.picked[0]), this.box(this.picked[1])];
    if (!a || !b) return "Cliquez la planche A, puis la planche B.";
    if (this.kind === "halflap") return halfLap(a, b, this.aOnTop) ?? "Ces deux planches ne se croisent pas.";
    const contact = contactOf(a, b);
    if (!contact) return "Ces deux planches ne se touchent pas face à face.";
    if (this.kind === "dowel") return dowels(a, b, contact, this.pins);
    if (this.kind === "confirmat") return confirmats(a, b, contact, this.screws);
    if (this.kind === "minifix") return minifix(a, b, contact, this.cams);
    return tenon(a, b, contact, this.tongue);
  }

  /** The features of the machining: one for a face kind, one per board for a joint. */
  private features(): MachiningFeature[] | string {
    const doc = this.ctx.doc();
    if (isFaceKind(this.kind)) {
      const target = this.picked[0];
      const box = this.box(target);
      if (!target || !box || !this.face) return "Cliquez une face de la planche à usiner.";
      const ops: MachiningOp[] = this.kind === "drilling32" ? drilling32(box, this.face, this.drill) : this.kind === "hinge" ? hinges(box, this.face, this.cups) : groove(box, this.face, this.slot);
      const [slot] = freshFeatureIds(doc, "mc", NAMES[this.kind] as string, 1);
      return [{ id: slot!.id, type: "machining", name: slot!.name, target, kind: this.kind, ops, anchor: [...box[0]], anchorHigh: [...box[1]] }];
    }
    const joint = this.jointOf();
    if (typeof joint === "string") return joint;
    const slots = freshFeatureIds(doc, "mc", NAMES[this.kind] as string, 2);
    const parts = [
      { target: this.picked[0] as string, ops: joint.a },
      { target: this.picked[1] as string, ops: joint.b },
    ];
    return parts.flatMap((p, i): MachiningFeature[] => {
      const box = this.box(p.target);
      return p.ops.length && box ? [{ id: slots[i]!.id, type: "machining", name: slots[i]!.name, target: p.target, kind: this.kind, ops: p.ops, anchor: [...box[0]], anchorHigh: [...box[1]] }] : [];
    });
  }

  protected feature(): Feature | string {
    const made = this.features();
    return typeof made === "string" ? made : (made[0] ?? "Rien à usiner.");
  }

  protected override companions(): Feature[] {
    const made = this.features();
    return typeof made === "string" ? [] : made.slice(1);
  }

  protected override blocker(): string | null {
    const made = this.features();
    if (typeof made === "string") return null;
    const bad = made.map((f) => this.ctx.status(f.id)).find((s) => s && s.state !== "ok");
    return bad ? (bad.message ?? "Cet usinage est impossible.") : null;
  }

  private changed(): void {
    this.render();
    this.schedulePreview();
  }

  private name(id: string | undefined): string {
    return id ? bodyLabel(this.ctx.doc(), id) : "—";
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const num = (label: string, value: number, set: (v: number) => void) => this.numberRow(label, value, unit, (v) => (set(v), this.changed()));
    const side = (value: "low" | "high", set: (v: "low" | "high") => void) => this.selectRow("Côté", value, SIDES, (v) => (set(v as "low" | "high"), this.changed()));
    const picked = isFaceKind(this.kind)
      ? this.picked[0]
        ? `${this.name(this.picked[0])}${this.face ? ` — face ${this.face.sign > 0 ? "+" : "−"}${AXIS_LETTER[this.face.axis]}` : ""}`
        : "Cliquez une face de la planche."
      : `A : ${this.name(this.picked[0])} · B : ${this.name(this.picked[1])}`;
    return [
      this.selectRow("Usinage", this.kind, KINDS, (v) => {
        this.kind = v as Kind;
        this.picked = this.picked.slice(0, isFaceKind(this.kind) ? 1 : 2);
        this.face = null;
        this.changed();
      }),
      this.info(picked),
      ...this.options(num, side),
      this.info(this.hint()),
    ];
  }

  private hint(): string {
    if (isFaceKind(this.kind)) return "Cliquez la face à usiner : les trous se placent depuis ses bords.";
    return this.kind === "tenon" ? "Cliquez la planche qui porte le tenon (A), puis celle qui reçoit la mortaise (B)." : "Cliquez la planche A, puis la planche B (une planche déjà choisie, recliquée, est retirée).";
  }

  private options(num: (label: string, value: number, set: (v: number) => void) => HTMLElement, side: (value: "low" | "high", set: (v: "low" | "high") => void) => HTMLElement): HTMLElement[] {
    switch (this.kind) {
      case "drilling32": {
        const box = this.box(this.picked[0]);
        const length = box && this.face ? Math.max(...([0, 1, 2] as Axis[]).filter((i) => i !== this.face!.axis).map((i) => (box[1][i] as number) - (box[0][i] as number))) : 0;
        return [
          side(this.drill.side, (v) => (this.drill.side = v)),
          num("Retrait", this.drill.setback, (v) => (this.drill.setback = v)),
          num("Entraxe", this.drill.spacing, (v) => (this.drill.spacing = v)),
          num("Départ", this.drill.start, (v) => (this.drill.start = v)),
          num("Diamètre", this.drill.diameter, (v) => (this.drill.diameter = v)),
          num("Profondeur", this.drill.depth, (v) => (this.drill.depth = v)),
          this.checkRow("Deux files (bord opposé aussi)", this.drill.rows === 2, (v) => ((this.drill.rows = v ? 2 : 1), this.changed())),
          this.info(length ? `${holesIn(length, this.drill.spacing, this.drill.start)} trous par file sur ${formatLength(length, this.ctx.unit())}.` : "Une file de trous tous les 32 mm."),
        ];
      }
      case "hinge":
        return [
          side(this.cups.side, (v) => (this.cups.side = v)),
          this.selectRow("Charnières", String(this.cups.count), ["2", "3", "4", "5"].map((n): [string, string] => [n, n]), (v) => ((this.cups.count = Number(v)), this.changed())),
          num("Bord → centre", this.cups.edgeDistance, (v) => (this.cups.edgeDistance = v)),
          num("Marge bouts", this.cups.margin, (v) => (this.cups.margin = v)),
          num("Diamètre", this.cups.diameter, (v) => (this.cups.diameter = v)),
          num("Profondeur", this.cups.depth, (v) => (this.cups.depth = v)),
        ];
      case "groove":
        return [
          side(this.slot.side, (v) => (this.slot.side = v)),
          this.selectRow("Sens", this.slot.direction, [["long", "Parallèle au grand côté"], ["short", "Parallèle au petit côté"]], (v) => ((this.slot.direction = v as "long" | "short"), this.changed())),
          num("Du bord", this.slot.offset, (v) => (this.slot.offset = v)),
          num("Largeur", this.slot.width, (v) => (this.slot.width = v)),
          num("Profondeur", this.slot.depth, (v) => (this.slot.depth = v)),
        ];
      case "dowel":
        return [
          num("Diamètre", this.pins.diameter, (v) => (this.pins.diameter = v)),
          num("Profondeur", this.pins.depth, (v) => (this.pins.depth = v)),
          num("Entraxe", this.pins.spacing, (v) => (this.pins.spacing = v)),
          num("Marge bouts", this.pins.margin, (v) => (this.pins.margin = v)),
        ];
      case "confirmat":
        return [
          this.selectRow("Traverse", this.screws.through, [["a", "La planche A"], ["b", "La planche B"]], (v) => ((this.screws.through = v as "a" | "b"), this.changed())),
          num("Entraxe", this.screws.spacing, (v) => (this.screws.spacing = v)),
          num("Marge bouts", this.screws.margin, (v) => (this.screws.margin = v)),
          num("Pilote", this.screws.pilotDepth, (v) => (this.screws.pilotDepth = v)),
        ];
      case "minifix":
        return [
          this.selectRow("Tige", String(this.cams.distance), [["24", "Excentrique à 24 mm du chant"], ["34", "Excentrique à 34 mm du chant"]], (v) => ((this.cams.distance = Number(v)), (this.cams.boreDepth = Number(v) + 10), this.changed())),
          num("Entraxe", this.cams.spacing, (v) => (this.cams.spacing = v)),
          num("Marge bouts", this.cams.margin, (v) => (this.cams.margin = v)),
        ];
      case "halflap":
        return [this.checkRow("A au-dessus (B en dessous)", this.aOnTop, (v) => ((this.aOnTop = v), this.changed()))];
      case "tenon":
        return [num("Longueur", this.tongue.length, (v) => (this.tongue.length = v)), num("Épaulement", this.tongue.shoulder, (v) => (this.tongue.shoulder = v))];
      default:
        return [];
    }
  }

  override move(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (target?.kind === "body") this.ctx.viewport.setHoverHighlight(isFaceKind(this.kind) ? { face: target.face } : { bodies: [target.id] });
    else this.ctx.viewport.setHoverHighlight(null);
  }

  protected override click(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (target?.kind !== "body") return;
    // A click on the preview of a machined board is a click on the board itself.
    const made = this.features();
    const source = typeof made === "string" ? undefined : made.find((f) => f.id === target.id)?.target;
    const id = source ?? target.id;
    if (!source) this.remember(id);
    if (isFaceKind(this.kind)) {
      const box = this.box(id);
      const face = box ? faceAt(box, [target.face.point.x, target.face.point.y, target.face.point.z]) : null;
      if (!face) return this.ctx.notify("Cette face n'est pas parallèle aux axes : usinez une face de planche.", "error");
      this.picked = [id];
      this.face = face;
    } else {
      const i = this.picked.indexOf(id);
      if (i >= 0) this.picked.splice(i, 1);
      else this.picked = this.picked.length >= 2 ? [this.picked[0] as string, id] : [...this.picked, id];
    }
    this.changed();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
