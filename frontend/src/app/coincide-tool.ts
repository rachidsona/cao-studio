/**
 * « Coïncidence » dans le modèle, en trois clics : d'abord ce qu'on veut déplacer — un corps (une de ses faces) ou une
 * esquisse, ou ce qui était sélectionné en ouvrant l'outil —, puis un de ses points (seuls les siens se prennent : un
 * coin partagé avec une pièce voisine reste à la pièce choisie), puis un point (d'un autre corps, d'une autre
 * esquisse) ou un trait (une arête de corps, une ligne d'esquisse), et le point vient s'y coller. Sur un trait, au plus près ou à l'endroit cliqué. Un corps est
 * déplacé par une opération « Déplacement », une esquisse avec son plan ; le résultat se voit avant OK, une seule
 * annulation. Comme dans Déplacer, « Copier » laisse le corps en place et colle des copies (la k-ième déplacée k fois).
 * Le calcul est dans features/coincide.ts. Les boutons d'accrochage de l'esquisse valent ici aussi : sans
 * l'accrochage à la géométrie, ni coins ni traits, le point pris est celui de la face ; avec l'accrochage intelligent,
 * un point de la face en ligne avec un coin (même X, Y ou Z) se prend aussi, montré par un guide rose en tirets. Où
 * coller, une face plane d'un autre corps (éclairée au survol) se prend aussi : ce qu'on déplace vient dans son plan,
 * au plus près, ou le point vient à l'endroit cliqué. Un corps calé entre deux voisins (une étagère entre ses côtés)
 * s'ajuste à la niche où il arrive : élargi ou raccourci par un étirement, avec les mêmes jeux (au choix). La touche
 * Ctrl garde la direction horizontale (la pièce reste au même niveau), ⌘ verticale (axis-lock.ts).
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { ArrayFeature, Feature, MoveFeature, SketchFeature, StretchFeature, Vec3 } from "../document/types";
import { MIN_LENGTH } from "../features/common";
import { coincideMove, fitInNiche, segmentNearRay, snugAxes, type Box } from "../features/coincide";
import { formatLength } from "../measurements/units";
import { pointPos } from "../sketcher/edit";
import { frameOf, toWorld } from "../sketcher/frame";
import { moveSketchPlane, sketchSnapPoints } from "../sketcher/move";
import { bodyVertices } from "../viewport/body-points";
import { faceSnaps } from "../viewport/face-snaps";
import { SnapGuides } from "../viewport/snap-guides";
import { SnapDots } from "../viewport/snap-squares";
import type { Viewport } from "../viewport/viewport";
import { AXIS_LOCK_OPTIONS, AxisLock, lockMove, lockPoint, type AxisLockMode } from "./axis-lock";
import { bodySnap, facePoint } from "./body-snap";
import { freshFeatureIds } from "./curic-common";
import { COPIES } from "./move-tool";
import { PanelTool, type ToolContext } from "./panel-tool";

type Subject = { kind: "body" | "sketch"; id: string; name: string };
type Fit = ReturnType<typeof fitInNiche>;
type Target = { point: Vec3; name: string } | { trait: Vec3[]; pairs: boolean; clicked: Vec3; name: string } | { plane: Vec3; normal: Vec3; clicked: Vec3; name: string };

/** A body with more corners than this (a rounded one) shows only the corners of the face pointed at. */
const MAX_BODY_CORNERS = 40;
/** The point under the pointer, and the point reached; the point moved from. */
const HOVER_COLOR = 0xf8500a;
const SOURCE_COLOR = 0xec4899;
/** How near the pointer (px) a point or a trait is taken. */
const POINT_PX = 14;
const TRAIT_PX = 8;

export class CoincideTool extends PanelTool {
  private subject: Subject | null = null;
  private source: Vec3 | null = null;
  private target: Target | null = null;
  private placement: "nearest" | "clicked" = "nearest";
  private readonly moveId: string;
  private readonly moveName: string;
  /** Copies made instead of moving the body (the original stays); the operation that makes them. */
  private copies = 0;
  private readonly copy: { id: string; name: string };
  /** Only the point under the pointer, a small green dot; the source (rose) and the target (green) once picked. */
  private readonly squares = new SnapDots(this.ctx.viewport.scene);
  private readonly markers = new SnapDots(this.ctx.viewport.scene, 9);
  private readonly guides = new SnapGuides(this.ctx.viewport.scene);
  /** What a click would take: a point (`index`), else a trait or a flat face (`target`). */
  private hover: { points: Vec3[]; owners: string[]; index: number; target: Target | null } | null = null;
  /**
   * The corners of the last bodies pointed at: a corner sits on the outline, where the pointer often just misses its
   * body or meets the next one.
   */
  private recent: { owner: string; points: Vec3[] }[] = [];
  /** Fitted to the niche where it arrives; the bodies' boxes when the piece was chosen, and the axes it is held on. */
  private fit = true;
  /** The direction kept: horizontal (Ctrl), vertical (⌘). */
  private readonly lock = new AxisLock(this.ctx.viewport.renderer.domElement, () => this.subject && this.update());
  private readonly boxes = new Map<string, Box>();
  private snug: ReturnType<typeof snugAxes> = [];

  constructor(ctx: ToolContext, bodies: string[] = [], sketches: string[] = []) {
    super(ctx, "Coïncidence", null);
    const doc = ctx.doc();
    this.moveId = uniqueId(doc, "mv");
    this.moveName = uniqueName(doc, "Coïncidence");
    this.copy = { id: uniqueId(doc, "ar"), name: uniqueName(doc, "Copie") };
    // What was selected when the tool opened is what moves: its points come next.
    const [body] = bodies;
    const [sketch] = sketches;
    if (body) this.subject = { kind: "body", id: body, name: bodyLabel(doc, body) };
    else if (sketch) this.subject = { kind: "sketch", id: sketch, name: findFeature(doc, sketch)?.name ?? sketch };
    if (this.subject?.kind === "body") ctx.viewport.setHoverHighlight({ bodies: [this.subject.id] });
    this.measure();
  }

  /** The bodies' boxes before anything moves, and the axes along which the piece is held between two neighbours. */
  private measure(): void {
    this.boxes.clear();
    const viewport = this.ctx.viewport;
    for (const id of viewport.displayedBodies) {
      const b = viewport.bodyMesh(id)?.metrics.bbox;
      if (b) this.boxes.set(id, [[...b[0]] as Vec3, [...b[1]] as Vec3]);
    }
    const box = this.subject?.kind === "body" ? this.boxes.get(this.subject.id) : undefined;
    this.snug = box ? snugAxes(box, this.others(false)) : [];
  }

  /** The other bodies' boxes (the piece's own too when copied: the original stays). */
  private others(original: boolean): Box[] {
    return [...this.boxes].filter(([id]) => original || id !== this.subject?.id).map(([, b]) => b);
  }

  /** How the piece moved (or each copy) changes to fit its new niche. */
  private fits(move: Vec3): { body: string; changes: Fit }[] {
    const box = this.subject?.kind === "body" ? this.boxes.get(this.subject.id) : undefined;
    if (!this.fit || !box || !this.snug.length) return [];
    const at = (k: number) => box.map((c) => c.map((x, i) => x + move[i]! * k)) as Box;
    if (this.copies === 0) return [{ body: this.subject!.id, changes: fitInNiche(at(1), this.others(false), this.snug) }];
    return Array.from({ length: this.copies }, (_, i) => ({ body: `${this.copy.id}#${i}`, changes: fitInNiche(at(i + 1), this.others(true), this.snug) }));
  }

  /** The shift that brings the piece's low side onto its new place, along each axis it is fitted on. */
  private static shift(changes: Fit): Vec3 {
    const v: Vec3 = [0, 0, 0];
    for (const c of changes) v[c.axis] = Number((c.to[0] - c.from[0]).toFixed(6));
    return v;
  }

  private sketch(): SketchFeature | null {
    const f = this.subject?.kind === "sketch" ? findFeature(this.ctx.doc(), this.subject.id) : undefined;
    return f?.type === "sketch" ? f : null;
  }

  private delta(): Vec3 | null {
    if (!this.source || !this.target) return null;
    const t = this.target;
    const clicked = this.placement === "clicked" && !("point" in t) ? { clicked: t.clicked } : {};
    const move = "point" in t ? coincideMove(this.source, t) : coincideMove(this.source, "trait" in t ? { trait: t.trait, pairs: t.pairs, ...clicked } : { plane: t.plane, normal: t.normal, ...clicked });
    return lockMove(move, this.lock.mode);
  }

  protected feature(): Feature | string {
    if (!this.subject) return "Cliquez le corps (une de ses faces) ou l'esquisse à déplacer.";
    if (!this.source) return `Cliquez le point de « ${this.subject.name} » qui doit venir se coller.`;
    const move = this.delta();
    if (!move) return "Cliquez le point, le trait ou la face où le coller.";
    if (Math.hypot(...move) < MIN_LENGTH) return "Ce point y est déjà.";
    const sketch = this.sketch();
    if (sketch) return moveSketchPlane(sketch, move);
    // Moved (not copied), the piece's move takes the shift onto its niche too; its stretch follows.
    const shift = this.copies > 0 ? [0, 0, 0] : CoincideTool.shift(this.fits(move)[0]?.changes ?? []);
    const translate = move.map((x, i) => Number((x + shift[i]!).toFixed(6))) as Vec3;
    if (this.copies > 0) return { ...this.copy, type: "array", targets: [this.subject.id], step: translate, count: this.copies } satisfies ArrayFeature;
    return { id: this.moveId, type: "move", name: this.moveName, target: this.subject.id, translate } satisfies MoveFeature;
  }

  /** The stretches (and, for a copy, the shift) that fit the piece to its new niche. */
  protected override companions(): Feature[] {
    const move = this.subject?.kind === "body" && this.source && this.target ? this.delta() : null;
    if (!move || Math.hypot(...move) < MIN_LENGTH) return [];
    const fits = this.fits(move).filter((f) => f.changes.length);
    const ids = freshFeatureIds(this.ctx.doc(), "st", "Ajustement", fits.reduce((n, f) => n + f.changes.length + 1, 0));
    const out: Feature[] = [];
    // Each operation makes a new body from the one before it: the move's (or the copy's), then each stretch's.
    for (const { body, changes } of fits) {
      let current = this.copies > 0 ? body : this.moveId;
      for (const c of changes) {
        const length = c.from[1] - c.from[0];
        const distance = c.to[1] - c.to[0] - length;
        // The plane past the middle when it gets shorter, so that what is cut away stays on its far side.
        const low = this.copies > 0 ? c.from[0] : c.to[0];
        const position = low + (length + Math.max(0, -distance)) / 2;
        if (Math.abs(distance) < MIN_LENGTH) continue;
        const id = ids.shift()!;
        out.push({ ...id, type: "stretch", target: current, axis: c.axis, position: Number(position.toFixed(6)), distance: Number(distance.toFixed(6)) } satisfies StretchFeature);
        current = id.id;
      }
      const shift = CoincideTool.shift(changes);
      if (this.copies > 0 && Math.hypot(...shift) >= MIN_LENGTH) out.push({ ...ids.shift()!, type: "move", target: current, translate: shift } satisfies MoveFeature);
    }
    return out;
  }

  protected override blocker(): string | null {
    if (this.subject?.kind !== "body") return null;
    const status = this.ctx.status(this.copies > 0 ? this.copy.id : this.moveId);
    return status && status.state !== "ok" ? (status.message ?? "Ce déplacement est impossible.") : null;
  }

  protected rows(): (HTMLElement | null)[] {
    const step = !this.subject
      ? "1. Cliquez ce qu'il faut déplacer : un corps (une de ses faces) ou une esquisse."
      : !this.source
        ? `2. Cliquez le point de « ${this.subject.name} » à coller : seuls ses points à lui se prennent.`
        : !this.target
          ? `3. Cliquez où coller le point de « ${this.subject.name} » : un point, une arête de corps, une ligne d'esquisse ou une face plane.`
          : `« ${this.subject.name} » vient sur « ${this.target.name} ». OK pour valider, ou cliquez un autre point, trait ou face.`;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
    again.textContent = "Recommencer (choisir une autre pièce)";
    again.addEventListener("click", () => this.restart());
    const otherPoint = document.createElement("button");
    otherPoint.type = "button";
    otherPoint.className = again.className;
    otherPoint.textContent = "Choisir un autre point de la pièce";
    otherPoint.addEventListener("click", () => ((this.source = null), (this.target = null), this.update()));
    return [
      this.info(step),
      this.target && !("point" in this.target)
        ? this.selectRow("trait" in this.target ? "Sur le trait" : "Sur la face", this.placement, [["nearest", "trait" in this.target ? "Au plus près" : "Au plus près (droit sur son plan)"], ["clicked", "À l'endroit cliqué"]], (v) => {
            this.placement = v as "nearest" | "clicked";
            this.update();
          })
        : null,
      this.subject ? this.selectRow("Direction", this.lock.mode, AXIS_LOCK_OPTIONS, (v) => ((this.lock.mode = v as AxisLockMode), this.update())) : null,
      this.fitRow(),
      // A body can be copied instead of moved (as in Déplacer); a sketch is only moved.
      this.subject?.kind === "body" ? this.selectRow("Copier", String(this.copies), COPIES, (v) => ((this.copies = Number(v)), this.update())) : null,
      this.source ? otherPoint : null,
      this.subject ? again : null,
    ];
  }

  /** The choice to fit the piece to its niche, with the length it gets, when it was held between two neighbours. */
  private fitRow(): HTMLElement | null {
    if (!this.snug.length) return null;
    const move = this.delta();
    const change = move ? this.fits(move)[0]?.changes[0] : undefined;
    const unit = this.ctx.unit();
    const label = change ? `Oui : ${formatLength(change.from[1] - change.from[0], unit)} → ${formatLength(change.to[1] - change.to[0], unit)}` : "Oui (élargie ou raccourcie entre ses voisins)";
    return this.selectRow("Ajuster à la niche", this.fit ? "yes" : "no", [["yes", label], ["no", "Non : garder ses mesures"]], (v) => ((this.fit = v === "yes"), this.update()));
  }

  private restart(): void {
    this.subject = null;
    this.source = null;
    this.target = null;
    this.snug = [];
    this.ctx.viewport.setHoverHighlight(null);
    this.update();
  }

  private update(): void {
    const marks: Vec3[] = [];
    const colors: number[] = [];
    if (this.source) marks.push(this.source), colors.push(SOURCE_COLOR);
    const move = this.delta();
    if (this.source && move) marks.push([0, 1, 2].map((i) => this.source![i]! + move[i]!) as Vec3), colors.push(HOVER_COLOR);
    this.markers.show(marks, colors);
    this.render();
    this.schedulePreview();
  }

  // ---- what the pointer can take ------------------------------------------------------

  /** Is this body or sketch what is moved (its preview too)? */
  private own(owner: string): boolean {
    return !!this.subject && (owner === this.subject.id || owner === `sketch:${this.subject.id}` || owner === this.moveId || owner.startsWith(`${this.copy.id}#`));
  }

  private visibleSketches(): SketchFeature[] {
    return this.ctx.doc().features.filter((f): f is SketchFeature => f.type === "sketch" && !f.suppressed && !f.hidden);
  }

  /** The piece to move: the body (a face of it) or the sketch under the pointer, lit up. */
  private hoverSubject(event: PointerEvent): { kind: "body" | "sketch"; id: string } | null {
    const viewport = this.ctx.viewport;
    const t = viewport.hoverTargetForTool(event);
    viewport.setHoverHighlight(t?.kind === "body" ? { bodies: [t.id] } : null);
    viewport.renderer.domElement.style.cursor = t ? "pointer" : "";
    this.squares.clear();
    return t ? { kind: t.kind, id: t.id } : null;
  }

  /** Is this body or sketch the piece chosen (a point to move must be one of its own)? */
  private chosen(owner: string): boolean {
    return !!this.subject && (owner === this.subject.id || owner === `sketch:${this.subject.id}`);
  }

  private hoverAt(event: PointerEvent): void {
    const viewport = this.ctx.viewport;
    if (!this.subject) {
      this.hoverSubject(event);
      return;
    }
    const picking = this.source ? "target" : "source";
    const points: Vec3[] = [];
    const owners: string[] = [];
    const pick = viewport.pickFace(event);
    if (pick && bodySnap.geometry && !(picking === "target" && this.own(pick.bodyId))) {
      const mesh = viewport.bodyMesh(pick.bodyId);
      const snaps = mesh ? faceSnaps(mesh, pick.faceIndex) : null;
      if (mesh && snaps) {
        const corners = bodyVertices(mesh).length <= MAX_BODY_CORNERS ? bodyVertices(mesh) : snaps.corners;
        this.recent = [{ owner: pick.bodyId, points: [...corners, snaps.center] }, ...this.recent.filter((r) => r.owner !== pick.bodyId)].slice(0, 3);
      }
    }
    // The point to move: only the chosen piece's (all its corners, and the middle of the face pointed at).
    if (picking === "source" && this.subject.kind === "body" && bodySnap.geometry) {
      const mesh = viewport.bodyMesh(this.subject.id);
      if (mesh && !this.recent.some((r) => r.owner === this.subject!.id)) this.recent = [{ owner: this.subject.id, points: bodyVertices(mesh) }, ...this.recent];
    }
    for (const body of bodySnap.geometry ? this.recent : []) {
      if (picking === "target" && this.own(body.owner)) continue;
      if (picking === "source" && !this.chosen(body.owner)) continue;
      if (picking === "target" && body.owner !== pick?.bodyId && !body.points.some((p) => viewport.screenDistance(event, p) < POINT_PX * 2)) continue;
      for (const p of body.points) points.push(p), owners.push(body.owner);
    }
    for (const sketch of bodySnap.geometry ? this.visibleSketches() : []) {
      if (picking === "target" && this.own(`sketch:${sketch.id}`)) continue;
      if (picking === "source" && !this.chosen(`sketch:${sketch.id}`)) continue;
      for (const p of sketchSnapPoints(sketch)) if (viewport.screenDistance(event, p) < 40) points.push(p), owners.push(`sketch:${sketch.id}`);
    }
    let index = -1;
    let best = POINT_PX;
    points.forEach((p, i) => {
      const d = viewport.screenDistance(event, p);
      if (d < best) [best, index] = [d, i];
    });
    const trait = picking === "target" && index < 0 && bodySnap.geometry ? this.traitAt(event) : null;
    // Nothing caught: the point of the face, in line with a corner (smart snapping) — or anywhere for the point to move,
    // the geometry snapping off; for where it goes, a flat face is taken whole.
    const free = index < 0 && !trait ? facePoint(viewport, event, { alignedOnly: bodySnap.geometry || picking === "target", anchors: this.source ? [this.source] : [], skip: (id) => (picking === "target" ? this.own(id) : !this.chosen(id)) }) : null;
    if (free) {
      index = points.length;
      points.push(free.point);
      owners.push(free.bodyId);
    }
    const face = picking === "target" && index < 0 && !trait && pick && !this.own(pick.bodyId) ? this.faceTarget(pick) : null;
    // Choosing its point, the piece stays lit; then the face pointed at, as where to go.
    viewport.setHoverHighlight(face && pick ? { face: pick } : picking === "source" && this.subject.kind === "body" ? { bodies: [this.subject.id] } : null);
    this.guides.show(free?.guides ?? [], viewport);
    this.hover = { points, owners, index, target: trait ?? face };
    // Nothing but the point the click would take.
    const under = this.hover.target && !("point" in this.hover.target) ? this.hover.target.clicked : index >= 0 ? points[index] : undefined;
    // The direction kept, the point reached is the one level with the point moved (or straight above it), a guide to it.
    const mode = this.lock.of(event);
    const kept = mode !== "free" && picking === "target" && under && this.source ? lockPoint(this.source, under, mode) : null;
    if (kept && under) this.guides.show([...(free?.guides ?? []), [under, kept]], viewport);
    this.squares.show(kept ? [kept] : under ? [under] : [], [HOVER_COLOR]);
    viewport.renderer.domElement.style.cursor = index >= 0 || this.hover.target ? THIN_CROSSHAIR : "";
  }

  /** A flat face of another body, as where to go: its plane, and the point pointed at. */
  private faceTarget(pick: NonNullable<ReturnType<Viewport["pickFace"]>>): Target | null {
    const mesh = this.ctx.viewport.bodyMesh(pick.bodyId);
    const normal = mesh ? faceSnaps(mesh, pick.faceIndex)?.normal : null;
    if (!normal) return null;
    const clicked: Vec3 = [pick.point.x, pick.point.y, pick.point.z];
    return { plane: clicked, normal, clicked, name: `une face de ${bodyLabel(this.ctx.doc(), pick.bodyId)}` };
  }

  /** The trait under the pointer: an edge of another body, or a line of another sketch. */
  private traitAt(event: PointerEvent): Target | null {
    const viewport = this.ctx.viewport;
    const edge = viewport.pickEdge(event);
    if (edge && !this.own(edge.bodyId)) {
      const mesh = viewport.bodyMesh(edge.bodyId);
      const group = mesh?.edgeGroups[edge.edgeIndex];
      if (mesh && group) {
        const trait: Vec3[] = [];
        for (let k = group.start; k < group.start + group.count; k++) trait.push([mesh.edges[k * 3]!, mesh.edges[k * 3 + 1]!, mesh.edges[k * 3 + 2]!]);
        const { origin, direction } = viewport.rayFromEvent(event);
        const near = (a: Vec3, b: Vec3) => segmentNearRay(origin, direction, a, b);
        let clicked: Vec3 | null = null;
        for (let i = 0; i + 1 < trait.length; i += 2) {
          const q = near(trait[i]!, trait[i + 1]!);
          if (!clicked || viewport.screenDistance(event, q) < viewport.screenDistance(event, clicked)) clicked = q;
        }
        if (clicked) return { trait, pairs: true, clicked, name: `une arête de ${bodyLabel(this.ctx.doc(), edge.bodyId)}` };
      }
    }
    const { origin, direction } = viewport.rayFromEvent(event);
    let found: Target | null = null;
    let best = TRAIT_PX;
    for (const sketch of this.visibleSketches()) {
      if (this.own(`sketch:${sketch.id}`)) continue;
      const frame = frameOf(sketch);
      for (const c of sketch.curves) {
        if (c.kind !== "line") continue;
        const [a, b] = [c.p1, c.p2].map((id) => {
          const [x, y] = pointPos(sketch, id);
          return toWorld(frame, x, y);
        }) as [Vec3, Vec3];
        const q = segmentNearRay(origin, direction, a, b);
        const d = viewport.screenDistance(event, q);
        if (d < best) [best, found] = [d, { trait: [a, b], pairs: false, clicked: q, name: `une ligne de ${sketch.name}` }];
      }
    }
    return found;
  }

  override move(event: PointerEvent): void {
    this.hoverAt(event);
  }

  protected override click(event: PointerEvent): void {
    if (!this.subject) {
      const t = this.hoverSubject(event);
      if (!t) return this.ctx.notify("Cliquez un corps (une de ses faces) ou une esquisse.", "info");
      const doc = this.ctx.doc();
      this.subject = t.kind === "sketch" ? { kind: "sketch", id: t.id, name: findFeature(doc, t.id)?.name ?? t.id } : { kind: "body", id: t.id, name: bodyLabel(doc, t.id) };
      this.recent = [];
      if (t.kind === "body") this.ctx.viewport.setHoverHighlight({ bodies: [t.id] });
      this.measure();
      return this.update();
    }
    this.hoverAt(event);
    const hover = this.hover;
    const index = hover?.index ?? -1;
    const point = hover && index >= 0 ? hover.points[index] : undefined;
    const owner = hover && index >= 0 ? hover.owners[index] : undefined;
    if (!this.source) {
      if (!point || !owner) return this.ctx.notify(`Cliquez un point de « ${this.subject.name} » (survolez-le : son point sous le curseur apparaît).`, "info");
      this.source = point;
    } else {
      // Clicked with Ctrl or ⌘ held: that direction is kept.
      this.lock.take(event);
      const doc = this.ctx.doc();
      if (point && owner) this.target = { point, name: owner.startsWith("sketch:") ? `un point de ${findFeature(doc, owner.slice(7))?.name}` : `un point de ${bodyLabel(doc, owner)}` };
      // The point goes to the nearest point of the trait or of the face's plane, or where it was clicked (« Sur le trait »,
      // « Sur la face »).
      else if (hover?.target) this.target = hover.target;
      else return this.ctx.notify("Cliquez un point, une arête de corps, une ligne d'esquisse ou une face plane.", "info");
    }
    this.ctx.viewport.setHoverHighlight(null);
    this.squares.clear();
    this.guides.clear();
    this.recent = [];
    this.update();
  }

  protected override dispose(): void {
    this.lock.dispose();
    this.squares.clear();
    this.markers.clear();
    this.guides.clear();
    this.ctx.viewport.setHoverHighlight(null);
    this.ctx.viewport.renderer.domElement.style.cursor = "";
  }
}
