/**
 * Navigation of the document, like desktop CAD tools: the browser on the left
 * (bodies and sketches, each with an eye), the timeline at the bottom (the
 * operations in order) and the floating window of one item (edit, rename,
 * disable, delete). Builds what they show from the document and the last
 * regeneration; the editor does the actual changes.
 */
import { bodyTree, type BodyLeaf } from "../document/body-tree";
import { bodyLabel, bodyOrigin, findFeature, isBodyHidden } from "../document/operations";
import { featureOfBody } from "../document/types";
import type { CadDocument, Feature } from "../document/types";
import type { FeatureStatus } from "../history/recompute";
import { renderBrowser, type BodyEntry, type BodyRow } from "../ui/browser";
import { ref } from "../ui/dom";
import { FeatureDialog } from "../ui/feature-dialog";
import type { NavItem } from "../ui/feature-meta";
import { renderTimeline } from "../ui/timeline";

export interface NavigatorHost {
  doc(): CadDocument;
  statuses(): Map<string, FeatureStatus>;
  /** Ids of the bodies of the last regeneration (hidden ones included). */
  bodyIds(): string[];
  selectedId(): string | null;
  selectedBodyId(): string | null;
  /** Something is picked in the 3D view (it writes its own status line). */
  modelPicked(): boolean;
  /** Whole bodies and sketches of the multiple selection (highlighted in the browser). */
  pickedIds(): { bodies: string[]; sketches: string[] };
  /** Ctrl/Maj + clic in the browser: adds or removes a body or a sketch. */
  toggleInSelection(kind: "body" | "sketch", id: string): void;
  selectFeature(id: string): void;
  selectBody(bodyId: string): void;
  /** Shows or hides a sketch, or the body created by this feature. */
  toggleHidden(id: string): void;
  rename(id: string, name: string): void;
  renameBody(bodyId: string, name: string): void;
  renameOffset(sketchId: string, offsetId: string, name: string): void;
  editOffset(sketchId: string, offsetId: string): void;
  removeOffset(sketchId: string, offsetId: string): void;
  edit(id: string): void;
  toggleSuppress(id: string): void;
  remove(id: string): void;
  /** Deletes a body: the feature that created it and everything built on it. */
  removeBody(bodyId: string): void;
}

export class Navigator {
  private readonly dialog: FeatureDialog;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: NavigatorHost,
  ) {
    this.dialog = new FeatureDialog(ref(root, "workspace"), {
      rename: (item, name) =>
        item.body ? host.renameBody(item.id, name) : item.offset ? host.renameOffset(item.offset.sketchId, item.id, name) : host.rename(item.id, name),
      edit: (item) => (item.offset ? host.editOffset(item.offset.sketchId, item.id) : host.edit(item.id)),
      toggleSuppress: (item) => host.toggleSuppress(item.id),
      remove: (item) =>
        item.body ? host.removeBody(item.id) : item.offset ? host.removeOffset(item.offset.sketchId, item.id) : host.remove(item.id),
    });
  }

  private item(feature: Feature, name = feature.name): NavItem {
    const status = this.host.statuses().get(feature.id);
    const state = status?.state ?? (feature.suppressed ? "suppressed" : "ok");
    return {
      id: feature.id,
      name,
      type: feature.type,
      state,
      ...(status?.message && state !== "ok" ? { message: status.message } : {}),
      suppressed: !!feature.suppressed,
      hidden: !!feature.hidden,
    };
  }

  private items(): { sketches: NavItem[]; operations: NavItem[]; bodies: NavItem[] } {
    const doc = this.host.doc();
    const sketches = doc.features.filter((f) => f.type === "sketch").map((f) => this.item(f));
    // The timeline follows the history: an offset comes where its sketch is.
    const operations = doc.features.flatMap((f) =>
      f.type === "sketch" ? (f.offsets ?? []).map((o): NavItem => ({ ...this.item(f, o.name), id: o.id, type: "offset", hidden: false, offset: { sketchId: f.id } })) : [this.item(f)],
    );
    const bodies = this.host.bodyIds().flatMap((bodyId) => {
      // A piece of a split ("sp1#2") has no feature of its own: it takes the state of the split.
      const feature = findFeature(doc, featureOfBody(bodyId));
      const originId = bodyOrigin(doc, bodyId);
      // A body is hidden through the feature that created it (or the hidden list, for a piece), so later operations keep it hidden.
      return feature ? [{ ...this.item(feature, bodyLabel(doc, bodyId)), id: bodyId, hidden: isBodyHidden(doc, bodyId), body: { originId } }] : [];
    });
    return { sketches, operations, bodies };
  }

  /** Opens the window of a feature (or of a body) next to `anchor`; it is selected too. */
  private open(id: string, anchor: DOMRect, body = false): void {
    const item = this.find(id, body);
    if (body) this.host.selectBody(id);
    else this.host.selectFeature(item?.offset?.sketchId ?? id);
    if (item) this.dialog.open(item, anchor);
  }

  private find(id: string, body: boolean): NavItem | undefined {
    const { sketches, operations, bodies } = this.items();
    return (body ? bodies : [...sketches, ...operations]).find((i) => i.id === id);
  }

  /** The bodies as a tree: folders of the bodies made together, each body with its history. */
  private tree(bodies: NavItem[]): BodyEntry[] {
    const doc = this.host.doc();
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const toRow = (leaf: BodyLeaf): BodyRow | null => {
      const item = byId.get(leaf.bodyId);
      const history = leaf.history.flatMap((id) => {
        const feature = findFeature(doc, id);
        return feature ? [this.item(feature)] : [];
      });
      return item ? { item, label: leaf.label, history } : null;
    };
    return bodyTree(doc, bodies.map((b) => b.id)).flatMap((node): BodyEntry[] => {
      if (node.kind === "body") {
        const body = toRow(node.body);
        return body ? [{ body }] : [];
      }
      const rows = node.group.bodies.map(toRow).filter((r): r is BodyRow => r !== null);
      return [{ group: { id: node.group.id, name: node.group.name, bodies: rows } }];
    });
  }

  render(): void {
    const { sketches, operations, bodies } = this.items();
    const selectedId = this.host.selectedId();
    renderBrowser(
      ref(this.root, "tree"),
      { bodies: this.tree(bodies), sketches, selectedId, selectedBodyId: this.host.selectedBodyId(), picked: this.host.pickedIds() },
      {
        onSelectBody: (bodyId, adding) => (adding ? this.host.toggleInSelection("body", bodyId) : this.host.selectBody(bodyId)),
        onSelectSketch: (id, adding) => (adding ? this.host.toggleInSelection("sketch", id) : this.host.selectFeature(id)),
        onSelectFeature: (id) => this.host.selectFeature(id),
        onToggleHidden: (id) => this.host.toggleHidden(id),
        onMenu: (id, anchor, body) => this.open(id, anchor, body),
      },
    );
    renderTimeline(ref(this.root, "timeline"), operations, selectedId, (id, anchor) => this.open(id, anchor));
    // Nothing picked in the model: say which sketch is selected (it is highlighted in the view).
    const sketch = sketches.find((s) => s.id === selectedId);
    if (!this.host.modelPicked()) ref(this.root, "status-selection").textContent = sketch ? `Esquisse « ${sketch.name} » sélectionnée` : "Aucune sélection";
    const open = this.dialog.openItem;
    if (open) this.dialog.update(this.find(open.id, !!open.body));
  }
}
