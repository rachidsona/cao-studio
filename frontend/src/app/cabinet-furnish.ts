/**
 * « Isoler et aménager » un caisson de cuisine (clic droit sur lui ou sur sa porte) : il devient un caisson du dressing
 * à sa place (document/cabinet-furnish.ts) et la vue ne montre que lui, de face. Étagères, Cloisons, Niche, Tiroirs,
 * Penderie et Portes y marchent par le clic droit dans une niche ou le ruban ; « Tout montrer » rend la cuisine.
 */
import { withCabinetFurnished } from "../document/cabinet-furnish";
import { findFeature } from "../document/operations";
import type { Editor } from "./editor";
import { isolateSketch } from "./zone-view";

export async function furnishCabinet(editor: Editor, cabinetId: string): Promise<void> {
  const name = findFeature(editor.doc, cabinetId)?.name ?? "Caisson";
  const made = withCabinetFurnished(editor.doc, cabinetId);
  if (typeof made === "string") return editor.notify(made, "info");
  await editor.change(made.doc);
  isolateSketch(made.sketch, name);
  editor.notify([`« ${name} » est prêt à aménager : clic droit dans une niche pour Étagères, Cloisons, Niche, Tiroirs, Penderie ou Porte.`, ...made.notes].join(" "), "success");
}
