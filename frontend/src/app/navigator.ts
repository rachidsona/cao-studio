/**
 * Navigation of the document, like desktop CAD tools: the browser on the left
 * (bodies and sketches, each with an eye), the timeline at the bottom (the
 * operations in order) and the floating window of one item (edit, rename,
 * disable, delete). Builds what they show from the document and the last
 * regeneration; the editor does the actual changes.
 */
import { bodyTree, type BodyLeaf } from "../document/body-tree";
import { stepOfBody } from "../document/sketch-extrusion";
import { addFolder, folderIndex, foldersOf, moveToFolder, removeFolder, renameFolder } from "../document/folders";
import { bodyLabel, bodyOrigin, findFeature, isBodyHidden } from "../document/operations";
import { PART_SEPARATOR, featureInputs, featureOfBody } from "../document/types";
import type { CadDocument, Feature } from "../document/types";
import type { FeatureStatus } from "../history/recompute";
import { renderBrowser, type BodyEntry, type BodyRow } from "../ui/browser";
import { groupByCorps } from "../ui/body-kinds";
import { bindBrowserFilter, filterEntries, filterSketches, filtering, type BrowserFilter } from "../ui/browser-filter";
import { askConfirm } from "../ui/confirm-dialog";
import { ref } from "../ui/dom";
import { FeatureDialog } from "../ui/feature-dialog";
import type { NavItem } from "../ui/feature-meta";
import { isPartition } from "../sketcher/partition-history";
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
  /** The multiple selection: whole bodies and sketches, and the faces, edges and corners picked (of bodies). */
  pickedIds(): { bodies: string[]; sketches: string[]; faces?: { bodyId: string }[]; edges?: { bodyId: string }[]; vertices?: { bodyId: string }[] };
  /** Ctrl/Maj + clic in the browser: adds or removes a body or a sketch. */
  toggleInSelection(kind: "body" | "sketch", id: string): void;
  selectFeature(id: string): void;
  selectBody(bodyId: string): void;
  /** These whole bodies selected in the view, instead of what was (none: nothing selected). */
  selectBodies(bodyIds: string[]): void;
  /** Shows or hides a sketch, or the body created by this feature. */
  toggleHidden(id: string): void;
  /** Shows or hides all these sketches or bodies at once. */
  setHidden(ids: string[], hidden: boolean): void;
  rename(id: string, name: string): void;
  renameBody(bodyId: string, name: string): void;
  renameOffset(sketchId: string, offsetId: string, name: string): void;
  editOffset(sketchId: string, offsetId: string): void;
  removeOffset(sketchId: string, offsetId: string): void;
  edit(id: string): void;
  toggleSuppress(id: string): void;
  /** Deletes features (several at once: one undo step). */
  remove(ids: string | string[]): void;
  /** Deletes a body: the feature that created it and everything built on it. */
  removeBody(bodyId: string): void;
  /** Deletes all these bodies, after asking (one undo step); false when it was not done. */
  removeBodies(bodyIds: string[]): Promise<boolean>;
  /** Stores this change of the document (one undo step): the folders of the browser. */
  changeDoc(doc: CadDocument): void;
}

export class Navigator {
  private readonly dialog: FeatureDialog;
  /** The search and the « hidden only » button of the Navigator. */
  private readonly filter: () => BrowserFilter;

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
    this.filter = bindBrowserFilter(root, () => this.render());
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
      f.type === "sketch" ? (f.offsets ?? []).map((o): NavItem => ({ ...this.item(f, o.name), id: o.id, type: o.step?.kind === "shelves" && o.step.input.vertical ? "cloisons" : (o.step?.kind ?? "offset"), hidden: false, offset: { sketchId: f.id } })) : [this.item(f)],
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
  private open(id: string, anchor: DOMRect, body = false, inView = false): void {
    const item = this.find(id, body);
    if (body) this.host.selectBody(id);
    else this.host.selectFeature(item?.offset?.sketchId ?? id);
    // From the history: what the step made is selected in the view too.
    if (inView) this.host.selectBodies(this.bodiesOf(id));
    if (item) this.dialog.open(item, anchor);
  }

  /** The bodies a step made, or changed (a machining, a Répartition's step): those it lights in the history, the other way. */
  private bodiesOf(step: string): string[] {
    const doc = this.host.doc();
    return this.host.bodyIds().filter((body) => {
      const origin = bodyOrigin(doc, body);
      return featureOfBody(body) === step || (stepOfBody(doc, origin)?.offset ?? featureOfBody(origin)) === step;
    });
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
    const corpsOf = (entry: BodyEntry) => {
      const origin = "group" in entry ? entry.group.id : bodyOrigin(doc, entry.body.item.id);
      const feature = findFeature(doc, origin.includes(PART_SEPARATOR) ? featureOfBody(origin) : origin);
      const sketch = feature?.type === "extrude" || feature?.type === "niche" ? findFeature(doc, featureInputs(feature)[0] ?? "") : undefined;
      return sketch?.type === "sketch" && sketch.offsets?.some(isPartition) ? { id: sketch.id, name: sketch.name } : null;
    };
    // A folder per corps (a Répartition), its pieces inside in a folder per kind: Étagères, Côtés, Dessous…
    const build = (ids: string[], scope = ""): BodyEntry[] => {
      const entries = bodyTree(doc, ids).flatMap((node): BodyEntry[] => {
        if (node.kind === "body") {
          const body = toRow(node.body);
          return body ? [{ body }] : [];
        }
        const rows = node.group.bodies.map(toRow).filter((r): r is BodyRow => r !== null);
        return [{ group: { id: node.group.id, name: node.group.name, entries: rows.map((body) => ({ body })) } }];
      });
      return groupByCorps(entries, corpsOf, scope);
    };
    // The folders made by hand first (as in Fusion), each with its bodies; then the bodies in no folder.
    const index = folderIndex(doc);
    const ids = bodies.map((b) => b.id);
    const inFolder = (id: string) => index.get(bodyOrigin(doc, id));
    const folders = foldersOf(doc).map((f): BodyEntry => ({ group: { id: `folder:${f.id}`, name: f.name, folder: f.id, entries: build(ids.filter((id) => inFolder(id) === f.id), `${f.id}:`) } }));
    return [...folders, ...build(ids.filter((id) => !inFolder(id)))];
  }

  /** Every body the selection reaches (whole, or through a face, an edge, a corner) is lit in the browser. */
  private picked(): { bodies: string[]; sketches: string[] } {
    const { bodies, sketches, faces = [], edges = [], vertices = [] } = this.host.pickedIds();
    return { bodies: [...new Set([...bodies, ...[...faces, ...edges, ...vertices].map((p) => p.bodyId)])], sketches };
  }

  /** The steps of the history that made what is selected: an étagère's division, a side's Répartition, a body's own operation. */
  private stepsPicked(): Set<string> {
    const doc = this.host.doc();
    return new Set(this.picked().bodies.map((body) => {
      const origin = bodyOrigin(doc, body);
      return stepOfBody(doc, origin)?.offset ?? featureOfBody(origin);
    }));
  }

  /** The steps marked in the history strip (Ctrl/⌘ + click), to delete together. */
  private marked = new Set<string>();
  private lastMarked: string | null = null;

  render(): void {
    const { sketches, operations, bodies } = this.items();
    const selectedId = this.host.selectedId();
    const filter = this.filter();
    renderBrowser(
      ref(this.root, "tree"),
      { bodies: filterEntries(this.tree(bodies), filter), sketches: filterSketches(sketches, filter), selectedId, selectedBodyId: this.host.selectedBodyId(), picked: this.picked(), filtering: filtering(filter) },
      {
        onSelectBody: (bodyId, adding) => (adding ? this.host.toggleInSelection("body", bodyId) : this.host.selectBody(bodyId)),
        onSelectSketch: (id, adding) => (adding ? this.host.toggleInSelection("sketch", id) : this.host.selectFeature(id)),
        onSelectFeature: (id) => this.host.selectFeature(id),
        onToggleHidden: (id) => this.host.toggleHidden(id),
        onSetHidden: (ids, hidden) => this.host.setHidden(ids, hidden),
        onRemoveBodies: (ids) => void this.host.removeBodies(ids),
        onMenu: (id, anchor, body) => this.open(id, anchor, body),
        onRemoveSketches: async (ids) => {
          if (ids.length > 1 && !(await askConfirm(`Supprimer les ${ids.length} esquisses ? (Ctrl+Z pour annuler)`, "Supprimer"))) return;
          this.host.remove(ids);
        },
        onNewFolder: (bodies) => this.host.changeDoc(addFolder(this.host.doc(), "Dossier", bodies).doc),
        onRenameFolder: (folder, name) => this.host.changeDoc(renameFolder(this.host.doc(), folder, name)),
        onMoveToFolder: (bodies, folder) => this.host.changeDoc(moveToFolder(this.host.doc(), bodies, folder)),
        onRemoveFolder: async (folder, bodyIds) => {
          if (bodyIds.length && !(await this.host.removeBodies(bodyIds))) return;
          this.host.changeDoc(removeFolder(this.host.doc(), folder));
        },
      },
    );
    for (const id of this.marked) if (!operations.some((o) => o.id === id)) this.marked.delete(id);
    renderTimeline(ref(this.root, "timeline"), operations, selectedId, this.stepsPicked(), (id, anchor) => this.open(id, anchor, false, true), {
      marked: this.marked,
      onMark: (id, range) => {
        const order = operations.map((o) => o.id);
        if (range && this.lastMarked && order.includes(this.lastMarked)) {
          const [a, b] = [order.indexOf(this.lastMarked), order.indexOf(id)].sort((x, y) => x - y);
          for (const step of order.slice(a!, b! + 1)) this.marked.add(step);
        } else if (this.marked.has(id)) this.marked.delete(id);
        else this.marked.add(id);
        this.lastMarked = id;
        this.render();
      },
      // Deleted together: one undo step, and what goes with them is asked first (Editor.removeFeature).
      onRemove: () => {
        const ids = [...this.marked];
        this.marked.clear();
        this.host.remove(ids);
      },
      onClear: () => ((this.marked.clear(), this.render())),
    });
    // Nothing picked in the model: say which sketch is selected (it is highlighted in the view).
    const sketch = sketches.find((s) => s.id === selectedId);
    if (!this.host.modelPicked()) ref(this.root, "status-selection").textContent = sketch ? `Esquisse « ${sketch.name} » sélectionnée` : "Aucune sélection";
    const open = this.dialog.openItem;
    if (open) this.dialog.update(this.find(open.id, !!open.body));
  }
}
