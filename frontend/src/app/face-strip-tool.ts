/**
 * "Truelle" — tracé et extrusion sur face (like Curic DIO 2's Trowel and
 * Chalkline), in three steps:
 *
 * 1. Hover: a corner of the face under the pointer (orange dot), an edge (orange), or the inside of the face.
 * 2. After clicking an edge or a corner, the line follows the pointer: a copy
 *    of the edge, parallel to it — on its own face or on any other face it is
 *    carried to — or a line across the face from the corner. The distances to
 *    the boundary on both sides are shown. Ctrl: one line / double line (its
 *    width starts as the thickness of the board); Tab: the pointer is on the
 *    first line, the second, or the centre. Click to lay the line(s).
 * 3. Then pull or push the band (or the face clicked in step 1): pulling adds (union), pushing digs
 *    (subtraction), Tab reverses; aiming at a corner or an edge of a body stops at its level.
 *
 * The result is a sketch on the face ("Tracé n") and an extrusion of its band
 * on the body, in one undo step; OK while laying the line makes the sketch alone.
 */
import { uniqueId, uniqueName } from "../document/operations";
import type { ExtrudeFeature, FaceRef, Feature, SketchFeature, Vec3 } from "../document/types";
import { formatLength } from "../measurements/units";
import type { Vec2 } from "../sketcher/edit";
import {
  bandRange,
  bandSketch,
  cornerReference,
  edgeReference,
  nearestEdge,
  referenceDistance,
  sideDistances,
  stripPolygon,
  type FaceEdge,
  type GrooveAnchor,
  type StripReference,
} from "../sketcher/face-strip";
import { rayToSketch, toWorld } from "../sketcher/frame";
import { axisParameter, dragStep, roundTo } from "../viewport/axis-drag";
import type { FacePick } from "../viewport/viewport";
import { aimAt, captureTargets, loadFace, regionUnder, StripMarks, type LevelTargets, type LoadedFace, type SketchArea } from "./face-strip-view";
import { PanelTool, type ToolContext } from "./panel-tool";

/** Where the line starts from: an edge (kept in 3D, to be carried to another face) or a corner of a face. */
type Origin = { kind: "edge"; face: string; edge: FaceEdge; a3: Vec3; b3: Vec3 } | { kind: "corner"; face: string; index: number; at3: Vec3 };

type Hover = { kind: "edge"; edge: FaceEdge } | { kind: "corner"; index: number } | { kind: "face" } | { kind: "region" };

/** Pointer distance (pixels) within which a corner or an edge is hovered. */
const SNAP_PX = 12;

/** Last settings, kept for the next use in the session. */
let last = { mode: "line" as "line" | "groove", anchor: "start" as GrooveAnchor };

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class FaceStripTool extends PanelTool {
  private readonly sketchId: string;
  private readonly sketchName: string;
  private readonly extrudeId: string;
  private readonly extrudeName: string;
  private phase: "pick" | "place" | "pull" = "pick";
  private readonly loading = new Set<string>();
  private readonly loaded = new Map<string, LoadedFace | null>();
  /** The face under the pointer (steps 1 and 2), or the one pulled (step 3). */
  private face: LoadedFace | null = null;
  private hover: Hover | null = null;
  private origin: Origin | null = null;
  private strip: StripReference | null = null;
  private pointer: Vec2 | null = null;
  private mode = last.mode;
  private anchor = last.anchor;
  private distance = 0;
  private width = 18;
  private widthTyped = false;
  /** A typed distance stops the line following the pointer. */
  private frozen = false;
  /** Step 3: the band (or whole face) pulled, how far along the outward normal, and whether push/pull is reversed. */
  private band: Vec2[] | null = null;
  private faceRef: FaceRef | null = null;
  /** A closed area of a sketch pulled (into a new body, or into the body the sketch lies on). */
  private area: SketchArea | null = null;
  private height = 0;
  /** A typed height stops it following the pointer. */
  private frozenHeight = false;
  private reversed = false;
  /** While pulling: what can be aimed at, and the corner or edge point aimed at (the pull stops at its level). */
  private targets: LevelTargets = { corners: [], segments: [] };
  private target: Vec3 | null = null;
  private lastEvent: PointerEvent | null = null;
  private readonly marks: StripMarks;

  constructor(ctx: ToolContext) {
    super(ctx, "Truelle — tracé et extrusion", null);
    const doc = ctx.doc();
    this.sketchId = uniqueId(doc, "sk");
    this.sketchName = uniqueName(doc, "Tracé");
    this.extrudeId = uniqueId(doc, "ex");
    this.extrudeName = uniqueName(doc, "Extrusion");
    this.marks = new StripMarks(ctx.viewport.scene);
  }

  async open(_pick?: FacePick): Promise<void> {
    this.start();
  }

  // ---- faces -------------------------------------------------------------------------

  /** The face of a pick, once its outline is known (loaded in the background the first time it is hovered). */
  private faceOf(pick: FacePick): LoadedFace | null {
    const key = `${pick.bodyId}#${pick.faceIndex}`;
    if (this.loaded.has(key)) return this.loaded.get(key) ?? null;
    if (!this.loading.has(key)) {
      this.loading.add(key);
      void loadFace(this.ctx.geometry, key, pick).then((face) => {
        this.loaded.set(key, face);
        if (this.lastEvent) this.move(this.lastEvent);
      });
    }
    return null;
  }

  private onFace(face: LoadedFace, event: PointerEvent): Vec2 | null {
    const { origin, direction } = this.ctx.viewport.rayFromEvent(event);
    return rayToSketch(face.frame, origin, direction);
  }

  private world(face: LoadedFace, p: Vec2): Vec3 {
    return toWorld(face.frame, p[0], p[1]);
  }

  // ---- step 2: the line ----------------------------------------------------------------

  /** The reference of the line on `face` (its distances are measured from it), for the pointer at p. */
  private referenceOn(face: LoadedFace, p: Vec2): StripReference | null {
    const origin = this.origin;
    if (!origin) return null;
    if (origin.kind === "corner") return origin.face === face.key ? cornerReference(face.polygon, origin.index, p) : null;
    if (origin.face === face.key) return edgeReference(face.polygon, origin.edge);
    // The edge carried to another face: parallel to it, measured from the boundary behind the pointer.
    const d: Vec3 = [origin.b3[0] - origin.a3[0], origin.b3[1] - origin.a3[1], origin.b3[2] - origin.a3[2]];
    const u: Vec2 = [dot3(d, face.frame.u), dot3(d, face.frame.v)];
    const l = Math.hypot(...u);
    if (l < 0.2 * Math.hypot(...d)) return null; // the edge is across this face: no parallel line on it
    const n: Vec2 = [-u[1] / l, u[0] / l];
    const back = sideDistances(face.polygon, p, n).back;
    return back === null ? null : { origin: [p[0] - n[0] * back, p[1] - n[1] * back], normal: n };
  }

  private place(face: LoadedFace, p: Vec2): void {
    const ref = this.referenceOn(face, p);
    if (!ref) {
      this.strip = null;
      return;
    }
    this.strip = ref;
    this.pointer = p;
    if (this.frozen) return;
    const raw = referenceDistance(ref, p);
    const snap = SNAP_PX * this.ctx.viewport.worldPerPixel();
    // A double line whose first line is at the pointer snaps onto the start (retrait 0).
    const distance = this.mode === "groove" && this.anchor === "start" && raw < snap ? 0 : roundTo(raw, dragStep(this.ctx.viewport.worldPerPixel()));
    if (distance < 0 || (distance === 0 && this.mode === "line")) return;
    this.distance = distance;
  }

  private currentBand(): Vec2[] | null {
    if (!this.face || !this.strip) return null;
    const [from, to] = bandRange(this.mode, this.anchor, this.distance, this.width);
    return stripPolygon(this.face.polygon, this.strip, Math.max(0, from), to);
  }

  // ---- features ---------------------------------------------------------------------

  private sketch(face: LoadedFace, band: Vec2[]): SketchFeature {
    return { id: this.sketchId, type: "sketch", name: this.sketchName, plane: face.plane, offset: Number(face.offset.toFixed(6)), ...(face.slanted ? { frame: face.slanted } : {}), ...bandSketch(face.outline, face.frame, band), support: face.pick.bodyId };
  }

  /** Pulling adds, pushing digs; Tab swaps them. */
  private operation(): "join" | "cut" {
    return this.height > 0 !== this.reversed ? "join" : "cut";
  }

  private extrusion(face: LoadedFace): ExtrudeFeature {
    const area = this.area;
    if (area) return { id: this.extrudeId, type: "extrude", name: this.extrudeName, sketch: area.sketchId, regions: [area.probe], distance: this.height, operation: area.support ? this.operation() : "new", ...(area.support ? { target: area.support } : {}) };
    if (this.faceRef) return { id: this.extrudeId, type: "extrude", name: this.extrudeName, faces: [this.faceRef], target: face.pick.bodyId, distance: this.height, operation: this.operation() };
    // Along the sketch normal, which may point into the body.
    const sign = dot3(face.outline.normal, face.frame.normal) >= 0 ? 1 : -1;
    return { id: this.extrudeId, type: "extrude", name: this.extrudeName, sketch: this.sketchId, distance: this.height * sign, operation: this.operation(), target: face.pick.bodyId };
  }

  protected feature(): Feature | string {
    if (this.phase === "pick") return "Survolez une arête (trait parallèle), un coin (trait en travers) ou l'intérieur d'une face (la tirer ou la pousser), puis cliquez.";
    if (!this.face) return "Amenez le pointeur sur une face.";
    if (this.phase === "place") {
      if (!this.strip) return "Ce départ ne donne pas de trait sur cette face : revenez sur sa face, ou sur une face parallèle à l'arête.";
      const band = this.currentBand();
      return band ? this.sketch(this.face, band) : "Le trait sort de la face : rapprochez-le.";
    }
    if (this.faceRef || this.area) return Math.abs(this.height) < 1e-3 ? "Tirez la face pour ajouter, poussez-la pour creuser (ou saisissez la hauteur)." : this.extrusion(this.face);
    return this.band ? this.sketch(this.face, this.band) : "Bande introuvable.";
  }

  protected override companions(): Feature[] {
    return this.phase === "pull" && !this.faceRef && !this.area && this.face && Math.abs(this.height) >= 1e-3 ? [this.extrusion(this.face)] : [];
  }

  protected override blocker(): string | null {
    const status = this.phase === "pull" ? this.ctx.status(this.extrudeId) : undefined;
    return status && status.state !== "ok" ? (status.message ?? "L'extrusion est impossible ici.") : null;
  }

  override confirm(): void {
    const built = this.feature();
    if (typeof built !== "string") last = { mode: this.mode, anchor: this.anchor };
    const extruded = this.phase === "pull" && Math.abs(this.height) >= 1e-3;
    const joined = this.operation() === "join";
    super.confirm();
    if (typeof built !== "string") this.ctx.notify(extruded ? (joined ? "Matière ajoutée." : "Matière enlevée (creusée).") : "Tracé créé : avec « Extrusion », creusez la bande ou ajoutez-la.", "success");
  }

  // ---- panel -------------------------------------------------------------------------

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const changed = () => {
      this.redraw();
      this.render();
      this.schedulePreview();
    };
    if (this.phase === "pick") {
      return [
        this.info("1. Survolez : une arête (orange) → trait parallèle, copiable sur une autre face ; un coin → trait en travers ; l'intérieur d'une face → la tirer ou la pousser."),
        this.info(this.mode === "line" ? "Une ligne (Ctrl : double trait)." : "Double trait (Ctrl : une ligne)."),
      ];
    }
    if (this.phase === "place") {
      const sides = this.sidesAtLine();
      return [
        this.selectRow(
          "Tracé",
          this.mode,
          [
            ["line", "Une ligne"],
            ["groove", "Double trait (Ctrl)"],
          ],
          (v) => {
            this.mode = v as "line" | "groove";
            changed();
          },
        ),
        this.numberRow(
          this.mode === "line" ? "Distance" : "Retrait",
          this.distance,
          unit,
          (v) => {
            if (v < 0 || (v === 0 && this.mode === "line")) return;
            this.distance = v;
            this.frozen = true;
            changed();
          },
          this.mode === "groove",
        ),
        this.mode === "groove"
          ? this.numberRow("Largeur", this.width, unit, (v) => {
              this.width = v;
              this.widthTyped = true;
              changed();
            })
          : null,
        this.mode === "groove"
          ? this.selectRow(
              "Pointeur",
              this.anchor,
              [
                ["start", "Sur le 1er trait"],
                ["end", "Sur le 2e trait"],
                ["center", "Au centre"],
              ],
              (v) => {
                this.anchor = v as GrooveAnchor;
                changed();
              },
            )
          : null,
        sides ? this.info(`Bords : ← ${sides.back === null ? "—" : formatLength(sides.back, unit)} · ${sides.ahead === null ? "—" : formatLength(sides.ahead, unit)} →`) : null,
        this.info("2. Clic : poser le trait, puis tirer/pousser. Tab : côté du double trait. OK : tracé seul. Échap : autre départ."),
      ];
    }
    const op = this.operation();
    return [
      this.numberRow(
        "Hauteur",
        this.height,
        unit,
        (v) => {
          this.height = v;
          this.frozenHeight = true;
          changed();
        },
        true,
      ),
      this.info(Math.abs(this.height) < 1e-3 ? "Tirez pour ajouter, poussez pour creuser." : this.area && !this.area.support ? "Crée un nouveau corps." : op === "join" ? "Ajoute de la matière (Joindre)." : "Creuse le corps (Couper)."),
      this.checkRow("Inverser tirer/pousser (Tab)", this.reversed, (v) => {
        this.reversed = v;
        changed();
      }),
      this.info(`${this.target ? "Niveau visé (point vert)." : "Visez un coin ou un trait d'un corps pour vous arrêter à son niveau."} 3. Clic, OK ou Entrée : terminer. Échap : revenir au tracé.`),
    ];
  }

  /** Distances from the line to the face's boundary on both sides (at the pointer). */
  private sidesAtLine(): { back: number | null; ahead: number | null; at: Vec2 } | null {
    if (!this.face || !this.strip || !this.pointer) return null;
    const n = this.strip.normal;
    const shift = this.distance - referenceDistance(this.strip, this.pointer);
    const at: Vec2 = [this.pointer[0] + n[0] * shift, this.pointer[1] + n[1] * shift];
    return { ...sideDistances(this.face.polygon, at, n), at };
  }

  // ---- view --------------------------------------------------------------------------

  private redraw(): void {
    const face = this.face;
    if (!face) {
      this.marks.clear();
      this.ctx.viewport.setHoverHighlight(null);
      return;
    }
    const w = (p: Vec2) => this.world(face, p);
    const unit = this.ctx.unit();
    if (this.phase === "pick") {
      this.ctx.viewport.setHoverHighlight(this.hover?.kind === "face" ? { face: face.pick } : null);
      if (this.hover?.kind === "edge") this.marks.draw({ edge: [w(this.hover.edge.a), w(this.hover.edge.b)] });
      else if (this.hover?.kind === "corner") this.marks.draw({ corner: w(face.polygon[this.hover.index] as Vec2) });
      else if (this.hover?.kind === "region") this.marks.draw({ band: face.polygon.map(w) });
      else this.marks.clear();
      return;
    }
    this.ctx.viewport.setHoverHighlight(this.phase === "pull" && this.faceRef ? { face: face.pick } : null);
    const start = this.origin?.kind === "edge" ? { edge: [this.origin.a3, this.origin.b3] as [Vec3, Vec3] } : this.origin?.kind === "corner" ? { corner: this.origin.at3 } : {};
    const band = this.phase === "pull" ? this.band : this.currentBand();
    const labels: { at: Vec3; text: string }[] = [];
    const sides = this.phase === "place" ? this.sidesAtLine() : null;
    if (sides && this.strip) {
      const n = this.strip.normal;
      if (sides.back) labels.push({ at: w([sides.at[0] - (n[0] * sides.back) / 2, sides.at[1] - (n[1] * sides.back) / 2]), text: formatLength(sides.back, unit) });
      if (sides.ahead) labels.push({ at: w([sides.at[0] + (n[0] * sides.ahead) / 2, sides.at[1] + (n[1] * sides.ahead) / 2]), text: formatLength(sides.ahead, unit) });
    }
    if (this.phase === "pull" && Math.abs(this.height) >= 1e-3) {
      const c = this.pullBase();
      const nrm = face.outline.normal;
      labels.push({ at: [c[0] + nrm[0] * this.height, c[1] + nrm[1] * this.height, c[2] + nrm[2] * this.height], text: `${this.operation() === "join" ? "+" : "−"} ${formatLength(Math.abs(this.height), unit)}` });
    }
    this.marks.draw({ ...start, ...(this.phase === "pull" && this.target ? { target: this.target } : {}), ...(band ? { band: band.map(w) } : {}), labels });
  }

  /** Centre of what is pulled: the band, or the face. */
  private pullBase(): Vec3 {
    const face = this.face as LoadedFace;
    if (this.faceRef || !this.band) return face.outline.center;
    const c: Vec2 = [this.band.reduce((s, p) => s + p[0], 0) / this.band.length, this.band.reduce((s, p) => s + p[1], 0) / this.band.length];
    return this.world(face, c);
  }

  protected override dispose(): void {
    this.marks.dispose();
    this.ctx.viewport.setHoverHighlight(null);
  }

  // ---- pointer and keys ---------------------------------------------------------------

  override move(event: PointerEvent): void {
    this.lastEvent = event;
    if (this.phase === "pull") {
      const face = this.face;
      if (!face || this.frozenHeight) return;
      const [base, n] = [this.pullBase(), face.outline.normal];
      const { origin, direction } = this.ctx.viewport.rayFromEvent(event);
      this.target = aimAt(this.ctx.viewport, event, SNAP_PX, this.targets);
      const t = this.target ? dot3([this.target[0] - base[0], this.target[1] - base[1], this.target[2] - base[2]], n) : axisParameter(base, n, origin, direction);
      if (t === null) return;
      this.height = this.target ? Number(t.toFixed(4)) : roundTo(t, dragStep(this.ctx.viewport.worldPerPixel()));
    } else {
      const pick = this.ctx.viewport.pickFace(event);
      // A sketch area in front of the body faces is pulled like a face (as DIO's trowel on a face).
      const under = this.phase === "pick" ? regionUnder(this.ctx.viewport, this.ctx.doc(), event, pick ? pick.point.distanceTo(this.ctx.viewport.camera.position) : null) : null;
      this.area = under?.area ?? null;
      this.face = under?.face ?? (pick ? this.faceOf(pick) : null);
      const face = this.face;
      const p = face ? this.onFace(face, event) : null;
      if (!face || !p) {
        this.hover = null;
        this.strip = null;
      } else if (this.phase === "pick") {
        const snap = SNAP_PX * this.ctx.viewport.worldPerPixel();
        const corner = face.polygon.findIndex((v) => Math.hypot(p[0] - v[0], p[1] - v[1]) <= snap);
        const near = nearestEdge(face.polygon, p);
        this.hover = this.area ? { kind: "region" } : corner >= 0 ? { kind: "corner", index: corner } : near && near.d <= snap ? { kind: "edge", edge: near.edge } : { kind: "face" };
        // The double line's width starts as the board's thickness under the pointer.
        const n = face.outline.normal;
        const depth = pick && !this.widthTyped ? this.ctx.viewport.depthAt(face.pick.bodyId, pick.point.toArray() as Vec3, [-n[0], -n[1], -n[2]]) : null;
        if (depth) this.width = Number(depth.toFixed(3));
      } else this.place(face, p);
    }
    this.redraw();
    this.render();
    if (this.phase !== "pick") this.schedulePreview();
  }

  protected override click(event: PointerEvent): void {
    if (this.phase === "pull") {
      this.confirm();
      return;
    }
    if (this.phase === "place") {
      const band = this.currentBand();
      if (!band || !this.face) return;
      [this.band, this.faceRef, this.height, this.frozenHeight, this.target] = [band, null, 0, false, null];
      this.targets = captureTargets(this.ctx.viewport);
      this.phase = "pull";
      this.move(event);
      return;
    }
    const face = this.face;
    if (!face || !this.hover) {
      if (this.ctx.viewport.pickFace(event)) this.ctx.notify("Face non plane ou encore en lecture : choisissez une face plane bordée d'arêtes droites.", "info");
      return;
    }
    if (this.hover.kind === "region") {
      [this.band, this.faceRef, this.height, this.frozenHeight, this.target] = [face.polygon, null, 0, false, null];
      this.targets = captureTargets(this.ctx.viewport);
      this.phase = "pull";
      this.move(event);
      return;
    }
    if (this.hover.kind === "face") {
      void this.ctx.geometry.describe(face.pick.bodyId, [], face.pick.faceIndex).then(({ face: ref }) => {
        if (!ref || ref.type !== "PLANE") return this.ctx.notify("Seules les faces planes se tirent ou se poussent.", "error");
        [this.faceRef, this.band, this.height, this.frozenHeight, this.target] = [ref, null, 0, false, null];
        this.targets = captureTargets(this.ctx.viewport);
        this.phase = "pull";
        this.redraw();
        this.render();
      });
      return;
    }
    this.origin =
      this.hover.kind === "edge"
        ? { kind: "edge", face: face.key, edge: this.hover.edge, a3: this.world(face, this.hover.edge.a), b3: this.world(face, this.hover.edge.b) }
        : { kind: "corner", face: face.key, index: this.hover.index, at3: this.world(face, face.polygon[this.hover.index] as Vec2) };
    this.frozen = false;
    this.distance = 0;
    this.phase = "place";
    this.move(event);
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Control") {
      if (this.phase === "pull") return false;
      this.mode = this.mode === "line" ? "groove" : "line";
    } else if (event.key === "Tab") {
      if (this.phase === "place" && this.mode === "groove") this.anchor = this.anchor === "start" ? "end" : this.anchor === "end" ? "center" : "start";
      else if (this.phase === "pull") this.reversed = !this.reversed;
      else return false;
    } else if (event.key === "Escape" && this.phase !== "pick") {
      // Back one step: from pulling to laying the line (or picking, for a face), from the line to picking.
      this.phase = this.phase === "pull" && !this.faceRef && !this.area ? "place" : "pick";
      if (this.phase === "pick") [this.origin, this.area] = [null, null];
      [this.faceRef, this.band, this.height] = [null, null, 0];
      void this.ctx.preview(null);
      this.redraw();
      this.render();
      return true;
    } else return super.handleKey(event);
    if (this.lastEvent) this.move(this.lastEvent);
    else {
      this.redraw();
      this.render();
    }
    return true;
  }
}
