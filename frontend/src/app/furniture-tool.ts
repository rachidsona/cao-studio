/**
 * « Assistant meuble » : un meuble entier en quelques choix — meuble TV, bibliothèque, bureau, banc d'entrée ou tête
 * de lit —, à la largeur, la hauteur et la profondeur voulues, dans la matière voulue (document/furniture-models.ts).
 * OK le pose à droite de ce qui est déjà là, son dos sur le plan Y = 0, ou contre un mur d'une Pièce (« Où le poser »,
 * à la distance voulue du début du mur) ; l'assistant reste ouvert pour en poser un autre, « Terminer » le ferme. Ses
 * caissons sont des Répartitions : étagères, tiroirs, portes et modules s'y retouchent ensuite comme dans un dressing.
 * Ouvert avec un de ses meubles sélectionné, il le reprend : OK le refait à neuf aux nouvelles cotes (ses cases
 * recomptées), à sa place.
 */
import { furnitureOf, withFurniture, withFurnitureRemade } from "../document/furniture-build";
import { FURNITURE, furnitureModel, furnitureProblem, furnitureSize, type FurnitureAsk, type FurnitureKind } from "../document/furniture-models";
import { bodyInfo, MATERIALS } from "../document/materials";
import { bodyOrigin } from "../document/operations";
import { passageProblem } from "../document/passage";
import { featureOfBody, type FurnitureRecord, type RoomFeature, type Vec3 } from "../document/types";
import { wallFrames, WALL_NAMES } from "../features/room-plan";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import { panelFooter, panelHeader } from "../ui/panel-close";
import type { Viewport } from "../viewport/viewport";
import { FIELD, ROW } from "./dressing/module-options";
import type { Editor } from "./editor";

/** Room left between the furniture already there and the new one (mm). */
const SPACING = 300;

/** Kept for the session: the last furniture asked for, and its material. */
let last: FurnitureAsk = { kind: "tv", ...furnitureModel("tv").size, thickness: 18, option: furnitureModel("tv").options[0]![0] };
let lastMaterial = "melamine-white";
/**
 * Where it goes: « right » of what is there, against a wall of a Pièce (« roomId:index ») this far from its start, or
 * in the middle of a Pièce (« mid:roomId », an island).
 */
let lastWhere = "right";
let lastFrom = 0;

class FurnitureTool {
  private readonly panel: HTMLElement;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || (event.target as HTMLElement | null)?.closest("input, select")) return;
    event.stopImmediatePropagation();
    this.close();
  };

  /** The furniture of the assistant being made again (one of its bodies was selected when it opened). */
  private editing: FurnitureRecord | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly editor: Editor,
    private readonly closed: () => void,
  ) {
    const doc = editor.doc;
    const picked = [...editor.picked.selection.bodies].map((id) => furnitureOf(doc, featureOfBody(bodyOrigin(doc, id)))).find(Boolean);
    if (picked) {
      this.editing = picked;
      last = { ...picked.ask, kind: picked.ask.kind as FurnitureKind };
      lastMaterial = picked.material;
    }
    this.panel = el("div", { class: "absolute top-2 right-2 z-30 w-72 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Assistant meuble" });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(viewport.renderer.domElement.parentElement as HTMLElement, this.panel);
    window.addEventListener("keydown", this.onKey, true);
    this.draw();
  }

  /** The walls of the Pièces, to set furniture against: their id, name, start (room side), way and length. */
  private walls(): { id: string; name: string; start: [number, number]; along: [number, number]; length: number }[] {
    return this.editor.doc.features
      .filter((f): f is RoomFeature => f.type === "room" && !f.suppressed)
      .flatMap((room) => wallFrames(room).map((w, i) => ({ id: `${room.id}:${i}`, name: `Contre le mur ${WALL_NAMES[i] ?? i + 1} (${room.name})`, start: w.start, along: w.u, length: w.length })));
  }

  /** The middle of each Pièce (between its walls' inner faces), to set an island there. */
  private middles(): { id: string; name: string; at: [number, number] }[] {
    return this.editor.doc.features
      .filter((f): f is RoomFeature => f.type === "room" && !f.suppressed)
      .map((room) => {
        const ends = wallFrames(room).map((w) => w.start);
        const mid = (k: 0 | 1) => (Math.min(...ends.map((p) => p[k])) + Math.max(...ends.map((p) => p[k]))) / 2;
        return { id: `mid:${room.id}`, name: `Au milieu de la pièce (${room.name})`, at: [mid(0), mid(1)] as [number, number] };
      });
  }

  /**
   * Seen from above, what stands around the furniture to be set: the displayed bodies but the rooms' and its own
   * (made again), and the walls of the Pièces.
   */
  private around(): [Vec3, Vec3][] {
    const doc = this.editor.doc;
    const own = new Set(this.editing?.features ?? []);
    const bodies = this.viewport.displayedBodies
      .filter((id) => !bodyInfo(doc, id).room && !own.has(featureOfBody(bodyOrigin(doc, id))))
      .map((id) => this.viewport.bodyMesh(id)?.metrics.bbox)
      .filter((b): b is [Vec3, Vec3] => !!b && b.flat().every(Number.isFinite));
    const walls = doc.features
      .filter((f): f is RoomFeature => f.type === "room" && !f.suppressed)
      .flatMap((room) => wallFrames(room).map((w): [Vec3, Vec3] => {
        const xs = w.outline.map((p) => p[0]);
        const ys = w.outline.map((p) => p[1]);
        return [[Math.min(...xs), Math.min(...ys), 0], [Math.max(...xs), Math.max(...ys), 10000]];
      }));
    return [...bodies, ...walls];
  }

  /** An island: too little room to walk round it, as a sentence (null: room enough, or not an island). */
  private passage(wall: { corner: Vec3; along: [number, number] } | null): string | null {
    if (last.kind !== "island") return null;
    const [w, d, h] = furnitureSize(last);
    const p = this.place();
    const corner: Vec3 = wall?.corner ?? this.editing?.corner ?? [p[0], p[1] + d, 0];
    const u = wall?.along ?? this.editing?.along ?? [1, 0];
    const f = [u[1], -u[0]];
    const pts = [[0, 0], [w, 0], [0, d], [w, d]].map(([x, y]) => [corner[0] + u[0] * x! + f[0]! * y!, corner[1] + u[1] * x! + f[1]! * y!]);
    const box: [Vec3, Vec3] = [[Math.min(...pts.map((q) => q[0]!)), Math.min(...pts.map((q) => q[1]!)), corner[2]], [Math.max(...pts.map((q) => q[0]!)), Math.max(...pts.map((q) => q[1]!)), corner[2] + h]];
    return passageProblem(box, this.around(), (mm) => formatLength(mm, this.editor.unit));
  }

  /** Against a wall: the back left corner of the foot and the way of its width; or why it does not go there. */
  private wallFrame(): { corner: Vec3; along: [number, number] } | string | null {
    if (lastWhere === "right") return null;
    const wall = this.walls().find((w) => w.id === lastWhere);
    if (!wall) return null;
    if (lastFrom < 0 || lastFrom + last.width > wall.length + 0.5) return `Le meuble dépasse du mur : ${formatLength(wall.length, this.editor.unit)} de long, il en faut ${formatLength(lastFrom + last.width, this.editor.unit)} depuis son début.`;
    return { corner: [wall.start[0] + wall.along[0] * lastFrom, wall.start[1] + wall.along[1] * lastFrom, 0], along: wall.along };
  }

  /**
   * Where the new furniture goes: its front left corner, right of every body but the room's, its back at Y = 0; or
   * centred in the middle of a Pièce.
   */
  private place(): Vec3 {
    const doc = this.editor.doc;
    const middle = this.middles().find((m) => m.id === lastWhere);
    if (middle) {
      const [w, d] = furnitureSize(last);
      return [Math.round(middle.at[0] - w / 2), Math.round(middle.at[1] - d / 2), 0];
    }
    const right = this.viewport.displayedBodies
      .filter((id) => !bodyInfo(doc, id).room)
      .map((id) => this.viewport.bodyMesh(id)?.metrics.bbox[1][0])
      .filter((x): x is number => x !== undefined && Number.isFinite(x));
    const x = right.length ? Math.ceil((Math.max(...right) + SPACING) / 10) * 10 : 0;
    const depth = last.kind === "headboard" ? (last.option === "with" ? last.thickness + last.depth : 150) : last.depth;
    return [x, -depth, 0];
  }

  private draw(): void {
    const unit = this.editor.unit;
    const model = furnitureModel(last.kind);
    const number = (label: string, mm: number, set: (mm: number) => void, zero = false): HTMLElement => {
      const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(mm, unit), 4), "aria-label": label });
      const apply = () => {
        const parsed = parseNumber(input.value);
        const ok = parsed !== null && (zero ? parsed >= 0 : parsed > 0);
        input.setAttribute("aria-invalid", String(!ok));
        if (!ok) return;
        set(fromDisplay(parsed, unit));
        this.draw();
      };
      input.addEventListener("change", apply);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") apply();
      });
      return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
    };
    const select = (label: string, value: string, options: readonly (readonly [string, string])[], set: (v: string) => void): HTMLElement => {
      const list = el("select", { class: FIELD, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
      list.addEventListener("change", () => {
        set(list.value);
        this.draw();
      });
      return el("label", { class: ROW }, label, list);
    };
    const wall = this.editing ? null : this.wallFrame();
    const problem = furnitureProblem(last) ?? (typeof wall === "string" ? wall : null);
    const walls = this.walls();
    const middles = this.middles();
    const places: [string, string][] = [["right", "À droite de ce qui est là"], ...(last.kind === "island" ? middles.map((m): [string, string] => [m.id, m.name]) : []), ...walls.map((w): [string, string] => [w.id, w.name])];
    if (!places.some(([id]) => id === lastWhere)) lastWhere = last.kind === "island" && middles.length ? middles[0]!.id : "right";
    const passage = problem ? null : this.passage(wall && typeof wall !== "string" ? wall : null);
    const range = (key: "width" | "height" | "depth") => model.limits[key].map((v) => formatLength(v, unit)).join(" à ");
    const rows: (HTMLElement | null)[] = [
      panelHeader(this.editing ? `Modifier : ${this.editing.name}` : "Assistant meuble", () => this.close()),
      this.editing ? el("p", { class: "text-[11px] text-gray-500" }, "OK le refait à neuf à ces cotes, à sa place : ses cases sont recomptées, ce qui y a été retouché à la main est refait.") : null,
      select("Meuble", last.kind, FURNITURE.map((m): [string, string] => [m.kind, m.label]), (v) => {
        const m = furnitureModel(v as FurnitureKind);
        // Another furniture starts at its usual size.
        last = { kind: m.kind, ...m.size, thickness: last.thickness, option: m.options[0]![0] };
        // An island goes in the middle of the room, when there is one.
        if (m.kind === "island") lastWhere = this.middles()[0]?.id ?? lastWhere;
      }),
      el("p", { class: "text-gray-600 dark:text-gray-300", "data-furniture-what": "" }, model.what),
      number("Largeur", last.width, (v) => (last = { ...last, width: v })),
      number(last.kind === "stairs" ? "Hauteur haute (sous le haut de l'escalier)" : "Hauteur", last.height, (v) => (last = { ...last, height: v })),
      number(last.kind === "headboard" ? "Profondeur des chevets" : "Profondeur", last.depth, (v) => (last = { ...last, depth: v })),
      last.kind === "stairs" ? number("Hauteur basse (au pied de l'escalier)", last.low ?? 0, (v) => (last = { ...last, low: v }), true) : null,
      el("p", { class: "text-[11px] text-gray-500" }, `Largeur de ${range("width")}, hauteur de ${range("height")}, profondeur de ${range("depth")}.`),
      select(model.choice, last.option, model.options, (v) => (last = { ...last, option: v })),
      number("Épaisseur des panneaux", last.thickness, (v) => (last = { ...last, thickness: v })),
      select("Matière", lastMaterial, MATERIALS.filter((m) => m.kind === "panel").map((m): [string, string] => [m.id, m.name]), (v) => (lastMaterial = v)),
      !this.editing && places.length > 1 ? select("Où le poser", lastWhere, places, (v) => (lastWhere = v)) : null,
      !this.editing && lastWhere !== "right" && walls.some((w) => w.id === lastWhere) ? number("Depuis le début du mur", lastFrom, (v) => (lastFrom = v), true) : null,
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, problem) : null,
      passage ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100", "data-furniture-passage": "" }, passage) : null,
      el("p", { class: "text-[11px] text-gray-500" }, "Ses caissons sont des Répartitions : étagères, tiroirs, portes et modules s'y retouchent ensuite (clic droit dans une niche)."),
      panelFooter(() => this.close(), () => this.confirm(), problem !== null),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  /** OK: the furniture added (one undo step), the view on it; the assistant stays for another. */
  private confirm(): void {
    const wall = this.editing ? null : this.wallFrame();
    if (typeof wall === "string") return this.editor.notify(wall, "error");
    const passage = this.passage(wall);
    const made = this.editing ? withFurnitureRemade(this.editor.doc, this.editing, last, lastMaterial) : withFurniture(this.editor.doc, last, this.place(), lastMaterial, wall ?? undefined);
    if (typeof made === "string") return this.editor.notify(made, "error");
    // Made again: it stays the one being changed.
    if (this.editing) this.editing = made.doc.furniture?.find((r) => r.name === made.name) ?? null;
    void this.editor.change(made.doc).then(() => this.viewport.fit());
    this.editor.notify(this.editing ? `« ${made.name} » refait à ces cotes.` : `« ${made.name} » posé : clic droit dans une de ses niches pour l'aménager.`, "success");
    if (passage) this.editor.notify(passage, "info");
    this.draw();
  }

  close(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.panel.remove();
    this.closed();
  }
}

let tool: FurnitureTool | null = null;

export function openFurnitureTool(viewport: Viewport, editor: Editor): void {
  tool?.close();
  tool = new FurnitureTool(viewport, editor, () => (tool = null));
}

export function bindFurnitureTool(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector('[data-workshop="furniture"]')?.addEventListener("click", () => openFurnitureTool(viewport, editor));
}
