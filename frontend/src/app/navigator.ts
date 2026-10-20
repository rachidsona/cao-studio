/**
 * Navigation of the document, like desktop CAD tools: the browser on the left
 * (bodies and sketches, each with an eye), the timeline at the bottom (the
 * operations in order) and the floating window of one item (edit, rename,
 * disable, delete). Builds what they show from the document and the last
 * regeneration; the editor does the actual changes.
 */
import { bodyLabel, bodyOrigin, findFeature } from "../document/operations";
import type { CadDocument, Feature } from "../document/types";
import type { FeatureStatus } from "../history/recompute";
import { renderBrowser } from "../ui/browser";
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
  selectFeature(id: string): void;
  selectBody(bodyId: string): void;
  /** Shows or hides a sketch, or the body created by this feature. */
  toggleHidden(id: string): void;
  rename(id: string, name: string): void;
  renameBody(bodyId: string, name: string): void;
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
      rename: (item, name) => (item.body ? host.renameBody(item.id, name) : host.rename(item.id, name)),
      edit: (item) => host.edit(item.id),
      toggleSuppress: (item) => host.toggleSuppress(item.id),
      remove: (item) => (item.body ? host.removeBody(item.id) : host.remove(item.id)),
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
    const operations = doc.features.filter((f) => f.type !== "sketch").map((f) => this.item(f));
    const bodies = this.host.bodyIds().flatMap((bodyId) => {
      const feature = findFeature(doc, bodyId);
      const originId = bodyOrigin(doc, bodyId);
      const origin = findFeature(doc, originId);
      // A body is hidden through the feature that created it, so later operations keep it hidden.
      return feature ? [{ ...this.item(feature, bodyLabel(doc, bodyId)), hidden: !!origin?.hidden, body: { originId } }] : [];
    });
    return { sketches, operations, bodies };
  }

  /** Opens the window of a feature (or of a body) next to `anchor`; it is selected too. */
  private open(id: string, anchor: DOMRect, body = false): void {
    if (body) this.host.selectBody(id);
    else this.host.selectFeature(id);
    const item = this.find(id, body);
    if (item) this.dialog.open(item, anchor);
  }

  private find(id: string, body: boolean): NavItem | undefined {
    const { sketches, operations, bodies } = this.items();
    return (body ? bodies : [...sketches, ...operations]).find((i) => i.id === id);
  }

  render(): void {
    const { sketches, operations, bodies } = this.items();
    const selectedId = this.host.selectedId();
    renderBrowser(
      ref(this.root, "tree"),
      { bodies, sketches, selectedId, selectedBodyId: this.host.selectedBodyId() },
      {
        onSelectBody: (bodyId) => this.host.selectBody(bodyId),
        onSelectSketch: (id) => this.host.selectFeature(id),
        onToggleHidden: (id) => this.host.toggleHidden(id),
        onMenu: (id, anchor, body) => this.open(id, anchor, body),
      },
    );
    renderTimeline(ref(this.root, "timeline"), operations, selectedId, (id, anchor) => this.open(id, anchor));
    const open = this.dialog.openItem;
    if (open) this.dialog.update(this.find(open.id, !!open.body));
  }
}
