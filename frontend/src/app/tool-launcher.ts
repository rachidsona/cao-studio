/** Opens the panel tools (revolution, fillet, chamfer, combination, hole) on new or existing features. */
import { findFeature } from "../document/operations";
import type { Axis, CadDocument, Feature } from "../document/types";
import type { EdgePick, FacePick, ModelSelection, VertexPick } from "../viewport/viewport";
import { EdgeTool } from "./edge-tool";
import { FaceExtrudeTool } from "./face-extrude-tool";
import { MoveTool, type MoveSubject, type MoveToolOptions } from "./move-tool";
import { PanelsTool } from "./panels-tool";
import { CabinetTool } from "./cabinet-tool";
import { FaceStripTool } from "./face-strip-tool";
import { MirrorTool } from "./mirror-tool";
import { AlignTool } from "./align-tool";
import { CoincideTool } from "./coincide-tool";
import { FinishTool } from "./finish-tool";
import { RoomTool } from "./room-tool";
import { StretchTool } from "./stretch-tool";
import { ArrayTool } from "./array-tool";
import { RotateTool } from "./rotate-tool";
import { MachiningTool } from "./machining-tool";
import { SweepTool } from "./sweep-tool";
import { DrawOnFaceTool } from "./draw-on-face-tool";
import { SplitTool } from "./split-tool";
import { CombineTool, HoleTool, RevolveTool } from "./feature-tools";
import type { PanelTool, ToolContext } from "./panel-tool";
import { LoftTool, ShellTool } from "./shell-loft-tools";
import { ModifierTool } from "./modifier-tool";
import { FrontsTool } from "./fronts-tool";
import { AssemblyTool } from "./assembly-tool";
import { KitchenTool } from "./kitchen-tool";
import { DressingTool } from "./dressing-tool";

export type PanelToolKind = "revolve" | "fillet" | "chamfer" | "combine" | "hole" | "faceExtrude" | "split" | "move" | "panels" | "cabinet" | "faceStrip" | "mirror" | "align" | "stretch" | "array" | "rotate" | "machining" | "sweep" | "rectArray" | "drawOnFace" | "shell" | "loft" | "modifier" | "fronts" | "assembly" | "kitchen" | "dressing" | "coincide" | "trim" | "room";

/** Bodies created before `featureId` that an extrusion may join or cut. */
export function extrudeTargets(doc: CadDocument, featureId: string | null): { id: string; name: string }[] {
  const index = doc.features.findIndex((f) => f.id === featureId);
  return doc.features
    .slice(0, index < 0 ? undefined : index)
    .filter((f) => f.type === "extrude" || f.type === "hole")
    .map((f) => ({ id: f.id, name: f.name }));
}

export const EDITABLE_WITH_TOOL: ReadonlySet<Feature["type"]> = new Set(["revolve", "fillet", "chamfer", "combine", "hole", "split", "move", "panels", "cabinet", "mirror", "align", "stretch", "array", "rotate", "sweep", "shell", "loft", "modifier", "fronts", "trim", "room"]);

export interface ToolOptions {
  featureId?: string;
  sketchId?: string;
  pick?: FacePick;
  edges?: EdgePick[];
  faces?: FacePick[];
  vertices?: VertexPick[];
  bodies?: string[];
  /** Whole sketches picked (Curic tools also work on sketches). */
  sketches?: string[];
  /** Axis the rotation tool starts with (a curved arrow of the Move manipulator was taken). */
  axis?: Axis;
}

/** What a tool starts with: the sketch selected in the navigator, and what is picked in the 3D view. */
export function toolOptions(kind: PanelToolKind, selected: Feature | undefined, picked: { lastFace: FacePick | undefined; selection: ModelSelection }): ToolOptions {
  const { edges, faces, vertices, bodies } = picked.selection;
  return {
    ...((selected?.type === "sketch" && (kind === "revolve" || kind === "move" || kind === "panels")) ? { sketchId: selected.id } : {}),
    ...((kind === "hole" || kind === "faceStrip") && picked.lastFace ? { pick: picked.lastFace } : {}),
    ...((kind === "fillet" || kind === "chamfer") && edges.length ? { edges } : {}),
    ...((kind === "combine" || kind === "split" || kind === "move" || kind === "mirror" || kind === "align" || kind === "stretch" || kind === "array" || kind === "rotate" || kind === "machining" || kind === "assembly" || kind === "rectArray" || kind === "modifier" || kind === "trim") && bodies.length ? { bodies } : {}),
    ...(kind === "mirror" || kind === "align" || kind === "stretch" || kind === "array" || kind === "rotate" || kind === "sweep" || kind === "rectArray" ? curicSketches(selected, picked.selection.sketches) : {}),
    ...((kind === "split" || kind === "move" || kind === "shell") && faces.length ? { faces } : {}),
    ...(kind === "loft" ? curicSketches(selected, picked.selection.sketches) : {}),
    ...(kind === "move" ? { ...(edges.length ? { edges } : {}), ...(vertices.length ? { vertices } : {}) } : {}),
  };
}

/** The sketches a Curic tool works on: those of the multiple selection, and the one selected in the browser. */
function curicSketches(selected: Feature | undefined, picked: string[]): { sketches?: string[] } {
  const sketches = [...picked, ...(selected?.type === "sketch" && !picked.includes(selected.id) ? [selected.id] : [])];
  return sketches.length ? { sketches } : {};
}

export class ToolLauncher {
  active: PanelTool | null = null;

  constructor(private readonly context: Omit<ToolContext, "closed"> & { closed(): void }) {}

  open(kind: PanelToolKind, options: ToolOptions = {}): void {
    this.active?.cancel();
    const editing = options.featureId ? (findFeature(this.context.doc(), options.featureId) ?? null) : null;
    const ctx: ToolContext = {
      ...this.context,
      // A curved arrow of the Move manipulator: the Rotation tool takes over, on the same thing, around that axis.
      // The pointer is still down: the new tool goes on with the same gesture.
      turn: (axis, subject, event) => {
        this.open("rotate", { axis, ...(subject.kind === "body" ? { bodies: [subject.id] } : { sketches: [subject.id] }) });
        this.active?.down(event);
      },
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
      case "shell": {
        const tool = new ShellTool(ctx, editing?.type === "shell" ? editing : null);
        this.active = tool;
        void tool.open(options.faces ?? []);
        return;
      }
      case "fronts":
        this.active = new FrontsTool(ctx, editing?.type === "fronts" ? editing : null);
        break;
      case "modifier":
        this.active = new ModifierTool(ctx, editing?.type === "modifier" ? editing : null, options.bodies ?? []);
        break;
      case "loft":
        this.active = new LoftTool(ctx, editing?.type === "loft" ? editing : null, options.sketches ?? []);
        break;
      case "faceExtrude": {
        const tool = new FaceExtrudeTool(ctx, editing?.type === "extrude" && editing.faces ? editing : null);
        this.active = tool;
        void tool.open(options.faces ?? []);
        return;
      }
      case "split": {
        const tool = new SplitTool(ctx, editing?.type === "split" ? editing : null, options.bodies?.[0]);
        this.active = tool;
        void tool.open(options.faces ?? []);
        return;
      }
      case "move":
        void this.openMove(ctx, editing, options);
        return;
      case "faceStrip": {
        const tool = new FaceStripTool(ctx);
        this.active = tool;
        void tool.open(options.pick);
        return;
      }
      case "mirror":
        this.active = new MirrorTool(ctx, editing?.type === "mirror" ? editing : null, options.bodies ?? [], options.sketches ?? []);
        break;
      case "coincide":
        this.active = new CoincideTool(ctx);
        break;
      case "room": {
        const tool = new RoomTool(ctx, editing?.type === "room" ? editing : null);
        this.active = tool;
        tool.open();
        return;
      }
      case "trim": {
        const tool = new FinishTool(ctx, editing?.type === "trim" ? editing : null, options.bodies ?? []);
        this.active = tool;
        tool.open();
        return;
      }
      case "align":
        this.active = new AlignTool(ctx, editing?.type === "align" ? editing : null, options.bodies ?? [], options.sketches ?? []);
        break;
      case "array":
        this.active = new ArrayTool(ctx, editing?.type === "array" ? editing : null, options.bodies ?? [], options.sketches ?? []);
        break;
      case "rotate":
        this.active = new RotateTool(ctx, editing?.type === "rotate" ? editing : null, options.bodies ?? [], options.sketches ?? [], options.axis);
        break;
      case "drawOnFace":
        this.active = new DrawOnFaceTool(ctx);
        break;
      case "rectArray":
        this.active = new ArrayTool(ctx, null, options.bodies ?? [], options.sketches ?? [], "rect");
        break;
      case "sweep":
        this.active = new SweepTool(ctx, editing?.type === "sweep" ? editing : null, options.sketches ?? []);
        break;
      case "machining":
        this.active = new MachiningTool(ctx, options.bodies ?? []);
        break;
      case "kitchen":
        this.active = new KitchenTool(ctx);
        break;
      case "dressing":
        this.active = new DressingTool(ctx);
        break;
      case "assembly":
        this.active = new AssemblyTool(ctx, options.bodies ?? []);
        break;
      case "stretch":
        this.active = new StretchTool(ctx, editing?.type === "stretch" ? editing : null, options.bodies ?? [], options.sketches ?? []);
        break;
      case "cabinet":
        this.active = new CabinetTool(ctx, editing?.type === "cabinet" ? editing : null);
        break;
      case "panels":
        this.active = new PanelsTool(ctx, editing?.type === "panels" ? editing : null, options.sketchId);
        break;
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

  /**
   * Moves what is selected, told apart by the selection: a body (also when only its edges, corners or
   * a face are picked: the face then gives the local frame, and "Face seule" hands over to the push/pull),
   * else the sketch selected in the navigator, else the only body there is.
   */
  private async openMove(ctx: ToolContext, editing: Feature | null, options: ToolOptions): Promise<void> {
    const run = (subject: MoveSubject, extra: MoveToolOptions = {}) => {
      const tool = new MoveTool(ctx, editing, subject, extra);
      this.active = tool;
      tool.open();
    };
    if (editing?.type === "move") return run({ kind: "body", id: editing.target });
    const bodyId = options.bodies?.[0] ?? options.faces?.[0]?.bodyId ?? options.edges?.[0]?.bodyId ?? options.vertices?.[0]?.bodyId;
    if (!bodyId && options.sketchId) {
      // The sketch is the thing edited: its own feature is replaced by the moved one.
      const sketch = findFeature(ctx.doc(), options.sketchId);
      if (sketch?.type === "sketch") {
        const tool = new MoveTool(ctx, sketch, { kind: "sketch", id: sketch.id });
        this.active = tool;
        tool.open();
        return;
      }
    }
    const only = ctx.bodies();
    const target = bodyId ?? (only.length === 1 ? only[0]?.id : undefined);
    if (!target) {
      ctx.notify("Sélectionnez un corps, une face, une esquisse ou un point à déplacer.", "info");
      ctx.closed();
      return;
    }
    const face = options.faces?.[0];
    const extra: MoveToolOptions = {};
    // Corners picked in the view: the first is the point to move from, the second (of another body) the point to reach.
    const [from, to] = options.vertices ?? [];
    if (from && from.bodyId === target) extra.points = { source: from.point, ...(to && to.bodyId !== target ? { target: to.point } : {}) };
    if (face && !options.bodies?.length) {
      try {
        const { face: ref } = await ctx.geometry.describe(face.bodyId, [], face.faceIndex);
        if (ref?.type === "PLANE") extra.faceNormal = ref.normal;
      } catch {
        // No local frame: the global one is used.
      }
      extra.moveFace = () => this.open("faceExtrude", { faces: options.faces ?? [] });
    }
    run({ kind: "body", id: target }, extra);
  }

  /** Reopens the tool matching an existing feature. */
  edit(featureId: string): void {
    const feature = findFeature(this.context.doc(), featureId);
    if (feature && EDITABLE_WITH_TOOL.has(feature.type)) this.open(feature.type as PanelToolKind, { featureId });
  }
}
