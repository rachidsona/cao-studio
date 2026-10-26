/**
 * Selection of faces and edges in the 3D model: fetches their measurements
 * from the kernel (edge length / diameter, face type and area), labels the
 * selected edges in the view, and exposes the selection to the tools
 * (fillet/chamfer on edges, extrusion or hole on faces).
 */
import type { DisplayUnit } from "../document/types";
import type { GeometryClient } from "../geometry/client";
import type { EdgeInfo, FaceInfo } from "../geometry/protocol";
import { formatArea, formatLength } from "../measurements/units";
import type { Point3 } from "../viewport/body-points";
import type { EdgePick, FacePick, ModelSelection, SketchPick, VertexPick, Viewport } from "../viewport/viewport";

export interface SelectionSummary {
  faces: { pick: FacePick; info?: FaceInfo }[];
  edges: { pick: EdgePick; info?: EdgeInfo }[];
  vertices: VertexPick[];
  /** Points, curves and areas of sketches, with the name of their sketch. */
  sketch: (SketchPick & { sketchName: string })[];
  bodies: { id: string; name: string }[];
  /** Whole sketches of a multiple selection. */
  sketches: { id: string; name: string }[];
}

const SURFACES: Record<string, string> = { PLANE: "plane", CYLINDRE: "cylindrique", CONE: "conique", SPHERE: "sphérique", TORUS: "torique" };

export function edgeText(info: EdgeInfo, unit: DisplayUnit): string {
  if (info.radius !== undefined) {
    const closed = Math.abs(info.length - 2 * Math.PI * info.radius) < 1e-6 * Math.max(1, info.length);
    return closed ? `Ø ${formatLength(2 * info.radius, unit)}` : `R ${formatLength(info.radius, unit)} — ${formatLength(info.length, unit)}`;
  }
  return formatLength(info.length, unit);
}

export function faceText(info: FaceInfo, unit: DisplayUnit): string {
  return `Face ${SURFACES[info.surface] ?? info.surface} — ${formatArea(info.area, unit)}`;
}

/** "X 12 · Y 0 · Z 5" in the display unit (the model's own axes, mm underneath). */
export function pointText(point: Point3, unit: DisplayUnit): string {
  return point.map((value, i) => `${"XYZ"[i]} ${formatLength(Math.abs(value) < 5e-7 ? 0 : value, unit)}`).join(" · ");
}

export class ModelSelectionController {
  selection: ModelSelection = { faces: [], edges: [], vertices: [], sketch: [], bodies: [], sketches: [] };
  private faceInfos = new Map<string, FaceInfo>();
  private edgeInfos = new Map<string, EdgeInfo>();

  constructor(
    private readonly viewport: Viewport,
    private readonly geometry: GeometryClient,
    private readonly host: { unit(): DisplayUnit; changed(): void; bodyName(id: string): string; sketchName(id: string): string },
  ) {
    viewport.onSelectionChange = (selection) => void this.update(selection);
  }

  get empty(): boolean {
    const { faces, edges, vertices, sketch, bodies, sketches } = this.selection;
    return faces.length === 0 && edges.length === 0 && vertices.length === 0 && sketch.length === 0 && bodies.length === 0 && sketches.length === 0;
  }

  /** One-line summary for the status bar. */
  statusText(): string {
    const { faces, edges, vertices, sketch, bodies, sketches } = this.selection;
    if (this.empty) return "Aucune sélection";
    if (sketches.length) {
      const parts = [bodies.length ? `${bodies.length} corps` : "", `${sketches.length} esquisse${sketches.length > 1 ? "s" : ""}`].filter(Boolean);
      return `${parts.join(" et ")} sélectionné${bodies.length + sketches.length > 1 ? "s" : ""}`;
    }
    if (sketch.length) {
      const n = (kind: SketchPick["kind"]) => sketch.filter((p) => p.kind === kind).length;
      const parts = [
        n("point") ? `${n("point")} point(s)` : "",
        n("curve") ? `${n("curve")} trait(s)` : "",
        n("region") ? `${n("region")} zone(s)` : "",
      ].filter(Boolean);
      const solid = vertices.length + edges.length + faces.length;
      return `${parts.join(", ")} d'esquisse${solid ? ` et ${solid} élément(s) de corps` : ""} sélectionné(s)`;
    }
    if (bodies.length) return `${bodies.length} corps sélectionné(s)`;
    if (vertices.length === 1 && edges.length === 0 && faces.length === 0) return `Point sélectionné — ${pointText((vertices[0] as VertexPick).point, this.host.unit())}`;
    if (vertices.length) return `${vertices.length} point(s), ${edges.length} arête(s), ${faces.length} face(s) sélectionné(s)`;
    return `${edges.length} arête(s), ${faces.length} face(s) sélectionnée(s)`;
  }

  /** Last face clicked (holes are placed on it). */
  get lastFace(): FacePick | undefined {
    return this.selection.faces.at(-1);
  }

  /** Body of the selection, if any (shown in the measurements panel). */
  get bodyId(): string | undefined {
    return this.selection.bodies[0] ?? this.selection.edges[0]?.bodyId ?? this.selection.faces[0]?.bodyId ?? this.selection.vertices[0]?.bodyId;
  }

  summary(): SelectionSummary {
    return {
      faces: this.selection.faces.map((pick) => ({ pick, info: this.faceInfos.get(`${pick.bodyId}#${pick.faceIndex}`) })),
      edges: this.selection.edges.map((pick) => ({ pick, info: this.edgeInfos.get(`${pick.bodyId}#${pick.edgeIndex}`) })),
      vertices: this.selection.vertices,
      sketch: this.selection.sketch.map((p) => ({ ...p, sketchName: this.host.sketchName(p.sketchId) })),
      bodies: this.selection.bodies.map((id) => ({ id, name: this.host.bodyName(id) })),
      sketches: this.selection.sketches.map((id) => ({ id, name: this.host.sketchName(id) })),
    };
  }

  /** Relabels the selected edges (after a change of display unit). */
  refreshLabels(): void {
    for (const pick of this.selection.edges) {
      const info = this.edgeInfos.get(`${pick.bodyId}#${pick.edgeIndex}`);
      if (info) this.viewport.setEdgeLabel(pick, edgeText(info, this.host.unit()));
    }
  }

  private async update(selection: ModelSelection): Promise<void> {
    this.selection = selection;
    this.host.changed();
    try {
      await Promise.all([
        ...selection.edges.map(async (pick) => {
          const k = `${pick.bodyId}#${pick.edgeIndex}`;
          const info = this.edgeInfos.get(k) ?? (await this.geometry.edgeInfo(pick.bodyId, pick.edgeIndex));
          this.edgeInfos.set(k, info);
          this.viewport.setEdgeLabel(pick, edgeText(info, this.host.unit()));
        }),
        ...selection.faces.map(async (pick) => {
          const k = `${pick.bodyId}#${pick.faceIndex}`;
          if (!this.faceInfos.has(k)) this.faceInfos.set(k, await this.geometry.faceInfo(pick.bodyId, pick.faceIndex));
        }),
      ]);
    } catch {
      // Measurements are informative; a stale pick after regeneration is simply not labelled.
    }
    this.host.changed();
  }

  /** Measurements depend on the geometry: forget them when the model is regenerated. */
  invalidate(): void {
    this.faceInfos.clear();
    this.edgeInfos.clear();
  }
}
