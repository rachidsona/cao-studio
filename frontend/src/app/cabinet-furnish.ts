/**
 * « Isoler et aménager » un caisson de cuisine (clic droit sur lui ou sur sa porte) : il devient un caisson du dressing
 * à sa place (document/cabinet-furnish.ts) et la vue ne montre que lui, de face. Étagères, Cloisons, Niche, Tiroirs,
 * Penderie et Portes y marchent par le clic droit dans une niche ou le ruban ; « Tout montrer » rend la cuisine. Le menu
 * du meuble propose aussi l'outil tout de suite (un accessoire, des étagères, des tiroirs) : le meuble est isolé et
 * aménagé, et l'outil s'ouvre sur la niche cliquée.
 * « Mes caissons » : un caisson gardé (clic droit dans une de ses niches), avec son intérieur, pour tous les projets ;
 * il se pose dans un linéaire de cuisine (onglet « Mes meubles ») ou dans une case d'un dressing.
 */
import { withCabinetFurnished } from "../document/cabinet-furnish";
import { caissonEntry, withCaissonInCase } from "../document/caisson-spec";
import type { CatalogEntry } from "../document/kitchen-catalog";
import { findFeature } from "../document/operations";
import { askName } from "./door-menu";
import { nicheAt, type PickedNiche } from "./dressing/niche-pick";
import { Joinery3D } from "./joinery-3d";
import type { Editor } from "./editor";
import { addMyUnit } from "./kitchen/my-units";
import { isolateSketch } from "./zone-view";

/** The cabinet made a caisson to furnish, alone in the view; its Répartition (null: it could not be). `quiet`: a tool opens next, it says the rest. */
export async function furnishCabinet(editor: Editor, cabinetId: string, quiet = false): Promise<string | null> {
  const name = findFeature(editor.doc, cabinetId)?.name ?? "Caisson";
  const made = withCabinetFurnished(editor.doc, cabinetId);
  if (typeof made === "string") return (editor.notify(made, "info"), null);
  await editor.change(made.doc);
  isolateSketch(made.sketch, name);
  if (!quiet || made.notes.length) editor.notify([...(quiet ? [] : [`« ${name} » est prêt à aménager : clic droit dans une niche pour Étagères, Cloisons, Niche, Tiroirs, Penderie ou Porte.`]), ...made.notes].join(" "), "success");
  return made.sketch;
}

/** What the cabinet's menu opens straight away, on the niche clicked. */
export const STRAIGHT_TOOLS: ["accessory" | "shelves" | "drawers", string][] = [["accessory", "Accessoire intérieur…"], ["shelves", "Étagères…"], ["drawers", "Tiroirs…"]];

/** The cabinet isolated and furnished, then a tool opened on its niche at `at` (a point of the model clicked on it). */
export async function openInCabinet(editor: Editor, cabinetId: string, at: [number, number, number], tool: "accessory" | "shelves" | "drawers"): Promise<void> {
  const sketch = await furnishCabinet(editor, cabinetId, true);
  const niche = sketch ? nicheAt(editor.doc, sketch, at) : null;
  if (!niche) return;
  Joinery3D.pick = niche.middle;
  if (tool === "shelves") editor.sketches.startJoinery(tool, niche.sketch);
  else editor.sketches.startEquip(tool, niche.sketch);
}

/** The caisson of this niche kept in « Mes caissons » (of a dressing's wall, its case only), under the name typed. */
export function keepCaisson(event: MouseEvent, editor: Editor, niche: PickedNiche, name: string): void {
  keepCaissonAt(event.clientX, event.clientY, editor, niche.sketch, name, niche.path[0]);
}

/** The caisson on `sketch` (`at`: of a dressing's wall, that case only) kept in « Mes caissons », asked for its name at x, y. */
export function keepCaissonAt(x: number, y: number, editor: Editor, sketch: string, name: string, at?: number): void {
  askName(x, y, name.replace(/^(Caisson|Plan) — /, "").replace(/\s*\([A-Z]+\d+\)$/, ""), (typed) => {
    const entry = caissonEntry(editor.doc, sketch, typed, at);
    if (typeof entry === "string") return editor.notify(entry, "info");
    if (!addMyUnit(entry)) return editor.notify("Mes caissons n'ont pas pu être gardés dans ce navigateur.", "error");
    editor.notify(`« ${entry.name} » gardé dans Mes caissons : posez-le dans un linéaire (Plan de cuisine, Ajouter des meubles, onglet « Mes meubles ») ou dans une case d'un dressing (clic droit dans la case).`, "success");
  }, { label: "Nom du caisson", attr: "data-caisson-name" });
}

/** One of « Mes caissons » in this case of a Répartition and the next ones. */
export async function putCaisson(editor: Editor, niche: PickedNiche, entry: CatalogEntry): Promise<void> {
  if (!entry.caisson) return;
  const made = withCaissonInCase(editor.doc, niche.sketch, niche.partition, niche.path[0] ?? 0, entry.caisson);
  if (typeof made === "string") return editor.notify(made, "info");
  await editor.change(made);
  editor.notify(`« ${entry.name} » posé : son intérieur suit la largeur de la case.`, "success");
}

