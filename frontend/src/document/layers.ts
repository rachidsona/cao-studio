/**
 * Calques (les étiquettes de SketchUp) : des familles de corps — caisson, façades, quincaillerie, plan de travail —
 * qu'on montre ou cache d'un clic. Un corps va sur un calque par son `bodyInfo.layer` (gardé avec l'opération qui
 * l'a créé, comme son nom) ; un calque caché cache ses corps dans la vue, le navigateur et la liste de débit.
 * Éditions pures du document.
 */
import { bodyInfo, setBodyInfo } from "./materials";
import { bodyOrigin } from "./operations";
import type { CadDocument, Layer } from "./types";

export function layersOf(doc: CadDocument): Layer[] {
  return doc.layers ?? [];
}

/** A new visible layer (its name made unique). */
export function addLayer(doc: CadDocument, name = "Calque"): { doc: CadDocument; id: string } {
  const layers = layersOf(doc);
  let n = 1;
  while (layers.some((l) => l.id === `ly${n}`)) n++;
  let label = name.trim() || "Calque";
  if (layers.some((l) => l.name === label)) {
    let k = 2;
    while (layers.some((l) => l.name === `${label} ${k}`)) k++;
    label = `${label} ${k}`;
  }
  const id = `ly${n}`;
  return { doc: { ...doc, layers: [...layers, { id, name: label, visible: true }] }, id };
}

export function renameLayer(doc: CadDocument, id: string, name: string): CadDocument {
  const label = name.trim();
  if (!label) return doc;
  return { ...doc, layers: layersOf(doc).map((l) => (l.id === id ? { ...l, name: label } : l)) };
}

export function setLayerVisible(doc: CadDocument, id: string, visible: boolean): CadDocument {
  return { ...doc, layers: layersOf(doc).map((l) => (l.id === id ? { ...l, visible } : l)) };
}

/** Removes a layer; its bodies go back to no layer (and are shown). */
export function removeLayer(doc: CadDocument, id: string): CadDocument {
  const info = Object.fromEntries(Object.entries(doc.bodyInfo ?? {}).map(([k, v]) => [k, v.layer === id ? (({ layer: _layer, ...rest }) => rest)(v) : v]));
  return { ...doc, layers: layersOf(doc).filter((l) => l.id !== id), bodyInfo: info };
}

/** Puts bodies on a layer (undefined: on none). */
export function assignLayer(doc: CadDocument, bodyIds: string[], id: string | undefined): CadDocument {
  return setBodyInfo(doc, bodyIds, { layer: id });
}

/** The bodies (among `bodyIds`) on a layer, counted once per body even when several ids reach it. */
export function bodiesOnLayer(doc: CadDocument, bodyIds: string[], id: string): string[] {
  const origins = new Set<string>();
  return bodyIds.filter((b) => {
    const origin = bodyOrigin(doc, b);
    if (origins.has(origin) || bodyInfo(doc, b).layer !== id) return false;
    origins.add(origin);
    return true;
  });
}
