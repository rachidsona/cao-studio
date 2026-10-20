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
import type { EdgePick, FacePick, ModelSelection, Viewport } from "../viewport/viewport";

export interface SelectionSummary {
  faces: { pick: FacePick; info?: FaceInfo }[];
  edges: { pick: EdgePick; info?: EdgeInfo }[];
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

export class ModelSelectionController {
  selection: ModelSelection = { faces: [], edges: [] };
  private faceInfos = new Map<string, FaceInfo>();
  private edgeInfos = new Map<string, EdgeInfo>();

  constructor(
    private readonly viewport: Viewport,
    private readonly geometry: GeometryClient,
    private readonly host: { unit(): DisplayUnit; changed(): void },
  ) {
    viewport.onSelectionChange = (selection) => void this.update(selection);
  }

  get empty(): boolean {
    return this.selection.faces.length === 0 && this.selection.edges.length === 0;
  }

  /** Last face clicked (holes are placed on it). */
  get lastFace(): FacePick | undefined {
    return this.selection.faces.at(-1);
  }

  /** Body of the selection, if any (shown in the measurements panel). */
  get bodyId(): string | undefined {
    return this.selection.edges[0]?.bodyId ?? this.selection.faces[0]?.bodyId;
  }

  summary(): SelectionSummary {
    return {
      faces: this.selection.faces.map((pick) => ({ pick, info: this.faceInfos.get(`${pick.bodyId}#${pick.faceIndex}`) })),
      edges: this.selection.edges.map((pick) => ({ pick, info: this.edgeInfos.get(`${pick.bodyId}#${pick.edgeIndex}`) })),
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
