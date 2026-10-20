/** Opens the panel tools (revolution, fillet, chamfer, combination, hole) on new or existing features. */
import { findFeature } from "../document/operations";
import type { Feature } from "../document/types";
import type { EdgePick, FacePick } from "../viewport/viewport";
import { EdgeTool } from "./edge-tool";
import { FaceExtrudeTool } from "./face-extrude-tool";
import { CombineTool, HoleTool, RevolveTool } from "./feature-tools";
import type { PanelTool, ToolContext } from "./panel-tool";

export type PanelToolKind = "revolve" | "fillet" | "chamfer" | "combine" | "hole" | "faceExtrude";

export const EDITABLE_WITH_TOOL: ReadonlySet<Feature["type"]> = new Set(["revolve", "fillet", "chamfer", "combine", "hole"]);

export class ToolLauncher {
  active: PanelTool | null = null;

  constructor(private readonly context: Omit<ToolContext, "closed"> & { closed(): void }) {}

  open(
    kind: PanelToolKind,
    options: { featureId?: string; sketchId?: string; pick?: FacePick; edges?: EdgePick[]; faces?: FacePick[]; bodies?: string[] } = {},
  ): void {
    this.active?.cancel();
    const editing = options.featureId ? (findFeature(this.context.doc(), options.featureId) ?? null) : null;
    const ctx: ToolContext = {
      ...this.context,
      closed: () => {
        this.active = null;
        this.context.closed();
      },
    };
    switch (kind) {
      case "fillet":
      case "chamfer": {
        const tool = new EdgeTool(ctx, kind, editing?.type === kind ? editing : null);
        this.active = tool;
        void tool.open(options.edges ?? []);
        return;
      }
      case "faceExtrude": {
        const tool = new FaceExtrudeTool(ctx, editing?.type === "extrude" && editing.faces ? editing : null);
        this.active = tool;
        void tool.open(options.faces ?? []);
        return;
      }
      case "revolve":
        this.active = new RevolveTool(ctx, editing?.type === "revolve" ? editing : null, options.sketchId);
        break;
      case "combine":
        this.active = new CombineTool(ctx, editing?.type === "combine" ? editing : null, options.bodies ?? []);
        break;
      case "hole": {
        const tool = new HoleTool(ctx, editing?.type === "hole" ? editing : null);
        this.active = tool;
        tool.start();
        if (options.pick) tool.placeAt(options.pick);
        return;
      }
    }
    this.active.start();
  }

  /** Reopens the tool matching an existing feature. */
  edit(featureId: string): void {
    const feature = findFeature(this.context.doc(), featureId);
    if (feature && EDITABLE_WITH_TOOL.has(feature.type)) this.open(feature.type as PanelToolKind, { featureId });
  }
}
