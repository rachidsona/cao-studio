/**
 * Les pièces à fabriquer : une seule source pour la liste de débit, le devis, le dossier de production et la CNC
 * (audit d'architecture du 11/11/2026). Elles viennent du dernier recalcul du document, pas de la vue : un corps caché
 * par l'œil ou sur un calque masqué reste une pièce du meuble ; seuls les murs de la pièce et la quincaillerie en
 * sortent (comme le reste du document les traite).
 */
import type { PartInput } from "./cut-list";
import { isHardwareBody } from "./hardware";
import { bodyInfo } from "./materials";
import type { CadDocument } from "./types";

/** A computed body: its id and its measures (geometry/protocol BodyMesh). */
export interface ComputedBody {
  bodyId: string;
  metrics: { bbox: PartInput["bbox"]; volume: number };
}

/** Whether this body is a part to make (not a wall of the room, not hardware). */
export function isFabricated(doc: CadDocument, bodyId: string): boolean {
  return !bodyInfo(doc, bodyId).room && !isHardwareBody(doc, bodyId);
}

export function fabricationParts(doc: CadDocument, bodies: readonly ComputedBody[]): PartInput[] {
  return bodies.filter((b) => isFabricated(doc, b.bodyId)).map((b) => ({ id: b.bodyId, bbox: b.metrics.bbox, volume: b.metrics.volume }));
}
