/**
 * « Éclairage » (groupe Menuiserie) : poser des lumières dans la cuisine et le dressing, au choix.
 * - Dedans : des rubans LED sous le dessus et sous les étagères.
 * - Dehors : sous les meubles hauts (ruban ou spots), une corniche au-dessus, une plinthe lumineuse.
 *
 * Les meubles éclairés sont ceux de la sélection, sinon tous ceux de la vue. Ce sont les caissons et les murs du
 * dressing (les Répartitions), avec leurs planches et le côté de leur façade.
 *
 * Les lumières sont des corps du calque « Éclairage » (document/lighting.ts). Elles brillent dans la vue et éclairent
 * le rendu, et restent hors débit, devis et usinage. Relancer l'outil remplace l'éclairage déjà posé. L'aperçu est en
 * direct ; OK donne une seule annulation.
 */
import { isHardwareBody } from "../document/hardware";
import { cabinetAxes } from "../document/kitchen-catalog";
import { LIGHTING, LIGHT_COLORS, addLights, lightPieces, removeLights, type Box, type LightingSettings, type LitElement } from "../document/lighting";
import { bodyInfo } from "../document/materials";
import { bodyLabel, bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type CadDocument, type Feature, type SketchFeature, type Vec3 } from "../document/types";
import { PanelTool, type ToolContext } from "./panel-tool";

/** Kept for the session: the last settings. */
let last: LightingSettings = { ...LIGHTING };
/** A flat board: at most this thick, at least this wide both ways (mm). */
const FLAT = 40;
const WIDE = 100;

/** The front of a Répartition: away from its sketch plane (the dressing's panels come off the wall). */
function sketchFront(sketch: SketchFeature, box: Box): LitElement["front"] {
  const normal: Vec3 = sketch.frame?.normal ?? (sketch.plane === "XZ" ? [0, 1, 0] : sketch.plane === "YZ" ? [1, 0, 0] : [0, 0, 1]);
  const axis = (Math.abs(normal[0]) >= Math.abs(normal[1]) ? 0 : 1) as 0 | 1;
  const plane = sketch.frame ? sketch.frame.origin[axis]! : sketch.offset;
  const nearLow = Math.abs(plane - box[0][axis]!) <= Math.abs(plane - box[1][axis]!);
  return { axis, sign: nearLow ? 1 : -1 };
}

export class LightingTool extends PanelTool {
  private readonly s: LightingSettings = { ...last };
  private replace = true;
  private readonly chosen: string[];

  constructor(ctx: ToolContext, bodies: string[]) {
    super(ctx, "Éclairage", null);
    this.chosen = bodies;
  }

  private boxOf(id: string): Box | null {
    const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  }

  /** The piece of furniture a body belongs to (a cabinet, a Répartition), and whether it is one of its fronts. */
  private owner(doc: CadDocument, id: string): { key: string; front: boolean } | null {
    const f = findFeature(doc, featureOfBody(bodyOrigin(doc, id)));
    if (f?.type === "cabinet") return { key: f.id, front: false };
    if (f?.type === "fronts") return { key: f.cabinet, front: true };
    if (f?.type === "extrude" && f.sketch) {
      const sketch = findFeature(doc, f.sketch);
      if (sketch?.type === "sketch" && !sketch.hidden) return { key: sketch.id, front: false };
    }
    return null;
  }

  /** The pieces of furniture lit: the selection's, else all of those in view, with their flat boards. */
  private elements(): LitElement[] {
    const doc = this.ctx.doc();
    const wanted = this.chosen.length ? new Set(this.chosen.map((id) => this.owner(doc, id)?.key).filter(Boolean)) : null;
    const groups = new Map<string, { box: Box | null; boards: LitElement["boards"] }>();
    for (const id of this.ctx.viewport.displayedBodies) {
      const info = bodyInfo(doc, id);
      if (info.room || info.light || isHardwareBody(doc, id)) continue;
      const owner = this.owner(doc, id);
      if (!owner || owner.front || (wanted && !wanted.has(owner.key))) continue;
      const box = this.boxOf(id);
      if (!box) continue;
      const g = groups.get(owner.key) ?? { box: null, boards: [] };
      g.box = g.box ? [[0, 1, 2].map((i) => Math.min(g.box![0][i]!, box[0][i]!)) as Vec3, [0, 1, 2].map((i) => Math.max(g.box![1][i]!, box[1][i]!)) as Vec3] : box;
      const [dx, dy, dz] = [0, 1, 2].map((i) => box[1][i]! - box[0][i]!) as Vec3;
      if (dz <= FLAT && dx >= WIDE && dy >= WIDE) g.boards.push({ name: bodyLabel(doc, id).replace(/^.*— /, ""), box });
      groups.set(owner.key, g);
    }
    const out: LitElement[] = [];
    for (const [key, g] of groups) {
      const f = findFeature(doc, key);
      if (!g.box || !f || g.boards.length < 2) continue;
      if (f.type === "cabinet") {
        const { back } = cabinetAxes(f.rotation ?? 0);
        const axis = (Math.abs(back[0]) > 0.5 ? 0 : 1) as 0 | 1;
        out.push({ name: f.name, box: g.box, front: { axis, sign: back[axis]! > 0 ? -1 : 1 }, boards: g.boards });
      } else if (f.type === "sketch") out.push({ name: f.name.replace(/^Dressing — /, "Dressing "), box: g.box, front: sketchFront(f, g.box), boards: g.boards });
    }
    return out;
  }

  private plan(): { doc: CadDocument; bodies: string[]; strips: number; spots: number; meters: number; furniture: number } {
    const elements = this.elements();
    const pieces = lightPieces(elements, this.s);
    const base = this.ctx.doc();
    const made = addLights(base, pieces, this.s.color);
    const strips = pieces.filter((p) => p.kind === "strip");
    const meters = strips.reduce((sum, p) => sum + Math.max(p.box[1][0] - p.box[0][0], p.box[1][1] - p.box[0][1]), 0) / 1000;
    return { ...made, strips: strips.length, spots: pieces.length - strips.length, meters, furniture: elements.length };
  }

  /** The new features (sketches and extrusions), after those of the document. */
  private made(): Feature[] {
    const known = new Set(this.ctx.doc().features.map((f) => f.id));
    return this.plan().doc.features.filter((f) => !known.has(f.id));
  }

  protected feature(): Feature | string {
    return this.made()[0] ?? "Aucune lumière à poser : sélectionnez des caissons ou un dressing, ou cochez un emplacement.";
  }

  protected override companions(): Feature[] {
    return this.made().slice(1);
  }

  /** The lights already set go (when asked), the new ones are lit, named and on the « Éclairage » layer. */
  protected override decorate(doc: CadDocument): CadDocument {
    const plan = this.plan().doc;
    const fresh = new Set(this.made().map((f) => f.id));
    const kept = this.replace ? removeLights(doc) : doc;
    const own = <T>(map: Record<string, T> | undefined) => Object.fromEntries(Object.entries(map ?? {}).filter(([id]) => fresh.has(id)));
    return { ...kept, layers: plan.layers, bodyInfo: { ...kept.bodyInfo, ...own(plan.bodyInfo) }, bodyNames: { ...kept.bodyNames, ...own(plan.bodyNames) } };
  }

  private set<K extends keyof LightingSettings>(key: K, value: LightingSettings[K]): void {
    this.s[key] = value;
    last = { ...this.s };
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const s = this.s;
    const plan = this.plan();
    const already = Object.values(this.ctx.doc().bodyInfo ?? {}).filter((i) => i.light).length;
    const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    return [
      this.info(this.chosen.length ? `${plan.furniture} meuble(s) de la sélection.` : `Tous les meubles de la vue : ${plan.furniture} (sélectionnez des caissons ou un dressing pour n'éclairer qu'eux).`),
      this.checkRow("Dedans : sous le dessus et les étagères", s.inside, (v) => this.set("inside", v)),
      this.selectRow("Sous les meubles hauts", s.under, [["strip", "Ruban LED"], ["spots", "Spots"], ["none", "Rien"]], (v) => this.set("under", v as LightingSettings["under"])),
      this.checkRow("Corniche au-dessus des meubles hauts et des colonnes", s.cornice, (v) => this.set("cornice", v)),
      this.checkRow("Plinthe lumineuse sous les meubles sur socle", s.plinth, (v) => this.set("plinth", v)),
      this.selectRow("Lumière", s.color, LIGHT_COLORS.map((c): [string, string] => [c.id, c.name]), (v) => this.set("color", v as LightingSettings["color"])),
      already ? this.checkRow(`Remplacer l'éclairage déjà posé (${already} lumière(s))`, this.replace, (v) => ((this.replace = v), this.render(), this.schedulePreview())) : null,
      this.info(`${plan.strips} ruban(s) LED (${fr(plan.meters)} m)${plan.spots ? `, ${plan.spots} spot(s)` : ""}. Calque « Éclairage » ; elles éclairent le rendu et restent hors débit et devis.`),
    ];
  }
}
