/**
 * « Isoler et aménager » un caisson de cuisine (clic droit sur lui ou sur sa porte) : il devient un caisson du dressing
 * à sa place (document/cabinet-furnish.ts) et la vue ne montre que lui, de face. Étagères, Cloisons, Niche, Tiroirs,
 * Penderie et Portes y marchent par le clic droit dans une niche ou le ruban ; « Tout montrer » rend la cuisine.
 * « Mes caissons » : un caisson gardé (clic droit dans une de ses niches), avec son intérieur, pour tous les projets ;
 * il se pose dans un linéaire de cuisine (onglet « Mes meubles ») ou dans une case d'un dressing.
 */
import { withCabinetFurnished } from "../document/cabinet-furnish";
import { caissonEntry, withCaissonInCase } from "../document/caisson-spec";
import type { CatalogEntry } from "../document/kitchen-catalog";
import { findFeature } from "../document/operations";
import { askName } from "./door-menu";
import type { PickedNiche } from "./dressing/niche-pick";
import type { Editor } from "./editor";
import { addMyUnit } from "./kitchen/my-units";
import { isolateSketch } from "./zone-view";

export async function furnishCabinet(editor: Editor, cabinetId: string): Promise<void> {
  const name = findFeature(editor.doc, cabinetId)?.name ?? "Caisson";
  const made = withCabinetFurnished(editor.doc, cabinetId);
  if (typeof made === "string") return editor.notify(made, "info");
  await editor.change(made.doc);
  isolateSketch(made.sketch, name);
  editor.notify([`« ${name} » est prêt à aménager : clic droit dans une niche pour Étagères, Cloisons, Niche, Tiroirs, Penderie ou Porte.`, ...made.notes].join(" "), "success");
}

/** The caisson of this niche kept in « Mes caissons » (of a dressing's wall, its case only), under the name typed. */
export function keepCaisson(event: MouseEvent, editor: Editor, niche: PickedNiche, name: string): void {
  askName(event.clientX, event.clientY, name.replace(/^(Caisson|Plan) — /, ""), (typed) => {
    const entry = caissonEntry(editor.doc, niche.sketch, typed, niche.path[0]);
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

