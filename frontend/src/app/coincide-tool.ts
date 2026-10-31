/**
 * « Coïncidence » dans le modèle : on clique un point de ce qu'on veut déplacer — un coin d'un corps, un point d'une
 * esquisse — puis un point (d'un autre corps, d'une autre esquisse) ou un trait (une arête de corps, une ligne
 * d'esquisse), et le premier point vient s'y coller. Sur un trait, au plus près ou à l'endroit cliqué. Un corps est
 * déplacé par une opération « Déplacement », une esquisse avec son plan ; le résultat se voit avant OK, une seule
 * annulation. Le calcul est dans features/coincide.ts.
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { Feature, MoveFeature, SketchFeature, Vec3 } from "../document/types";
import { MIN_LENGTH } from "../features/common";
import { coincideMove, segmentNearRay } from "../features/coincide";
import { pointPos } from "../sketcher/edit";
import { frameOf, toWorld } from "../sketcher/frame";
import { moveSketchPlane, sketchSnapPoints } from "../sketcher/move";
import { bodyVertices } from "../viewport/body-points";
import { faceSnaps } from "../viewport/face-snaps";
import { SnapDots } from "../viewport/snap-squares";
import { PanelTool, type ToolContext } from "./panel-tool";

type Subject = { kind: "body" | "sketch"; id: string; name: string };
type Target = { point: Vec3; name: string } | { trait: Vec3[]; pairs: boolean; clicked: Vec3; name: string };

/** A body with more corners than this (a rounded one) shows only the corners of the face pointed at. */
const MAX_BODY_CORNERS = 40;
/** The point under the pointer, and the point reached; the point moved from. */
const HOVER_COLOR = 0x63df0f;
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
  /** Only the point under the pointer, a small green dot; the source (rose) and the target (green) once picked. */
  private readonly squares = new SnapDots(this.ctx.viewport.scene);
  private readonly markers = new SnapDots(this.ctx.viewport.scene, 9);
  private hover: { points: Vec3[]; owners: string[]; index: number; trait: Target | null } | null = null;
  /**
   * The corners of the last bodies pointed at: a corner sits on the outline, where the pointer often just misses its
   * body or meets the next one.
   */
  private recent: { owner: string; points: Vec3[] }[] = [];

  constructor(ctx: ToolContext) {
    super(ctx, "Coïncidence", null);
    const doc = ctx.doc();
    this.moveId = uniqueId(doc, "mv");
    this.moveName = uniqueName(doc, "Coïncidence");
  }

  private sketch(): SketchFeature | null {
    const f = this.subject?.kind === "sketch" ? findFeature(this.ctx.doc(), this.subject.id) : undefined;
    return f?.type === "sketch" ? f : null;
  }

  private delta(): Vec3 | null {
    if (!this.source || !this.target) return null;
    const t = this.target;
    return coincideMove(this.source, "point" in t ? t : { trait: t.trait, pairs: t.pairs, ...(this.placement === "clicked" ? { clicked: t.clicked } : {}) });
  }

  protected feature(): Feature | string {
    if (!this.subject || !this.source) return "Cliquez un point de l'esquisse ou du corps à déplacer.";
    const move = this.delta();
    if (!move) return "Cliquez le point ou le trait où le coller.";
    if (Math.hypot(...move) < MIN_LENGTH) return "Ce point y est déjà.";
    const sketch = this.sketch();
    if (sketch) return moveSketchPlane(sketch, move);
    const translate = move.map((x) => Number(x.toFixed(6))) as Vec3;
    return { id: this.moveId, type: "move", name: this.moveName, target: this.subject.id, translate } satisfies MoveFeature;
  }

  protected override blocker(): string | null {
    if (this.subject?.kind !== "body") return null;
    const status = this.ctx.status(this.moveId);
    return status && status.state !== "ok" ? (status.message ?? "Ce déplacement est impossible.") : null;
  }

  protected rows(): (HTMLElement | null)[] {
    const step = !this.source
      ? "1. Cliquez un point de ce qu'il faut déplacer : un coin d'un corps, un point d'une esquisse."
      : !this.target
        ? `2. Cliquez où coller le point de « ${this.subject?.name} » : un point, une arête de corps ou une ligne d'esquisse.`
        : `« ${this.subject?.name} » vient sur « ${this.target.name} ». OK pour valider, ou cliquez un autre point ou trait.`;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
    again.textContent = "Recommencer (choisir un autre point de départ)";
    again.addEventListener("click", () => this.restart());
    return [
      this.info(step),
      this.target && "trait" in this.target
        ? this.selectRow("Sur le trait", this.placement, [["nearest", "Au plus près"], ["clicked", "À l'endroit cliqué"]], (v) => {
            this.placement = v as "nearest" | "clicked";
            this.update();
          })
        : null,
      this.source ? again : null,
    ];
  }

  private restart(): void {
    this.subject = null;
    this.source = null;
    this.target = null;
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
    return !!this.subject && (owner === this.subject.id || owner === `sketch:${this.subject.id}` || owner === this.moveId);
  }

  private visibleSketches(): SketchFeature[] {
    return this.ctx.doc().features.filter((f): f is SketchFeature => f.type === "sketch" && !f.suppressed && !f.hidden);
  }

  private hoverAt(event: PointerEvent): void {
    const viewport = this.ctx.viewport;
    const picking = this.source ? "target" : "source";
    const points: Vec3[] = [];
    const owners: string[] = [];
    const pick = viewport.pickFace(event);
    if (pick && !(picking === "target" && this.own(pick.bodyId))) {
      const mesh = viewport.bodyMesh(pick.bodyId);
      const snaps = mesh ? faceSnaps(mesh, pick.faceIndex) : null;
      if (mesh && snaps) {
        const corners = bodyVertices(mesh).length <= MAX_BODY_CORNERS ? bodyVertices(mesh) : snaps.corners;
        this.recent = [{ owner: pick.bodyId, points: [...corners, snaps.center] }, ...this.recent.filter((r) => r.owner !== pick.bodyId)].slice(0, 3);
      }
    }
    for (const body of this.recent) {
      if (picking === "target" && this.own(body.owner)) continue;
      if (body.owner !== pick?.bodyId && !body.points.some((p) => viewport.screenDistance(event, p) < POINT_PX * 2)) continue;
      for (const p of body.points) points.push(p), owners.push(body.owner);
    }
    for (const sketch of this.visibleSketches()) {
      if (picking === "target" && this.own(`sketch:${sketch.id}`)) continue;
      for (const p of sketchSnapPoints(sketch)) if (viewport.screenDistance(event, p) < 40) points.push(p), owners.push(`sketch:${sketch.id}`);
    }
    let index = -1;
    let best = POINT_PX;
    points.forEach((p, i) => {
      const d = viewport.screenDistance(event, p);
      if (d < best) [best, index] = [d, i];
    });
    this.hover = { points, owners, index, trait: picking === "target" && index < 0 ? this.traitAt(event) : null };
    // Nothing but the point the click would take.
    const under = this.hover.trait && "trait" in this.hover.trait ? this.hover.trait.clicked : index >= 0 ? points[index] : undefined;
    this.squares.show(under ? [under] : [], [HOVER_COLOR]);
    viewport.renderer.domElement.style.cursor = index >= 0 || this.hover.trait ? THIN_CROSSHAIR : "";
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
    this.hoverAt(event);
    const hover = this.hover;
    const index = hover?.index ?? -1;
    const point = hover && index >= 0 ? hover.points[index] : undefined;
    const owner = hover && index >= 0 ? hover.owners[index] : undefined;
    if (!this.source) {
      if (!point || !owner) return this.ctx.notify("Cliquez un des points affichés (survolez un corps ou une esquisse).", "info");
      const sketchId = owner.startsWith("sketch:") ? owner.slice(7) : null;
      const doc = this.ctx.doc();
      this.subject = sketchId ? { kind: "sketch", id: sketchId, name: findFeature(doc, sketchId)?.name ?? sketchId } : { kind: "body", id: owner, name: bodyLabel(doc, owner) };
      this.source = point;
    } else if (point && owner) {
      const doc = this.ctx.doc();
      this.target = { point, name: owner.startsWith("sketch:") ? `un point de ${findFeature(doc, owner.slice(7))?.name}` : `un point de ${bodyLabel(doc, owner)}` };
    } else if (hover?.trait && "trait" in hover.trait) {
      // The point goes to the nearest point of the trait, or where it was clicked (« Sur le trait »).
      this.target = hover.trait;
    } else return this.ctx.notify("Cliquez un point, une arête de corps ou une ligne d'esquisse.", "info");
    this.squares.clear();
    this.recent = [];
    this.update();
  }

  protected override dispose(): void {
    this.squares.clear();
    this.markers.clear();
    this.ctx.viewport.renderer.domElement.style.cursor = "";
  }
}
