/** The equipments of niches (Penderie, Tiroirs) put in a document, with the default materials of their parts. */
import { nicheMaterials } from "../features/niche-parts";
import { setBodyInfo } from "./materials";
import { updateFeature } from "./operations";
import { PART_SEPARATOR, type CadDocument, type NicheFeature } from "./types";

/** The document with these equipments added (or the one changed), the drawer boxes in plywood and their bottoms in HDF. */
export function withEquipment(doc: CadDocument, features: NicheFeature[]): CadDocument {
  let next = doc;
  for (const f of features) {
    next = next.features.some((x) => x.id === f.id) ? updateFeature(next, f.id, () => f) : { ...next, features: [...next.features, f] };
    nicheMaterials(next.features, f).forEach((material, i) => {
      const body = `${f.id}${PART_SEPARATOR}${i}`;
      if (material && !next.bodyInfo?.[body]?.material) next = setBodyInfo(next, [body], { material });
    });
  }
  return next;
}
