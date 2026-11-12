/**
 * Un projet enregistré avant qu'un appareil gagne des pièces (un four son afficheur et son joint, une plaque gaz les
 * chapeaux de ses brûleurs…) s'ouvre avec elles habillées : chaque pièce sans apparence d'un appareil déjà habillé
 * prend la sienne (features/appliance-parts.ts), hors débit et sur le calque de ses autres pièces. Ce qu'on a donné à
 * une pièce reste. Pur.
 */
import { applianceParts } from "../features/appliance-parts";
import { PART_SEPARATOR, type BodyInfo, type CadDocument } from "./types";

export function withAppliancePartLooks(doc: CadDocument): CadDocument {
  let info: Record<string, BodyInfo> | undefined;
  for (const f of doc.features) {
    if (f.type !== "appliance") continue;
    const parts = applianceParts(f);
    const ids = parts.map((_, i) => `${f.id}${PART_SEPARATOR}${i}`);
    const dressed = ids.map((id) => doc.bodyInfo?.[id]).find((b) => b?.appearance);
    // Never dressed (made by hand, or by a script): left as it is.
    if (!dressed) continue;
    parts.forEach((p, i) => {
      if (doc.bodyInfo?.[ids[i]!]) return;
      info ??= { ...doc.bodyInfo };
      info[ids[i]!] = { appearance: p.look, room: true, ...(dressed.layer ? { layer: dressed.layer } : {}) };
    });
  }
  return info ? { ...doc, bodyInfo: info } : doc;
}
