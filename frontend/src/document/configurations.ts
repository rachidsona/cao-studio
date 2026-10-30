/**
 * Configurations : un même meuble en plusieurs variantes (« Petit 600 », « Grand 900 »), chacune un jeu de valeurs
 * des paramètres. Appliquer une configuration remet ces valeurs (les paramètres en formule suivent, comme les cotes
 * liées) ; la configuration active est celle dont toutes les valeurs sont celles du moment. Éditions pures.
 */
import type { CadDocument, Configuration } from "./types";

export function configurationsOf(doc: CadDocument): Configuration[] {
  return doc.configurations ?? [];
}

/** The plain parameters (not formulas) and their values: what a configuration keeps. */
function plainValues(doc: CadDocument): Record<string, number> {
  return Object.fromEntries(Object.entries(doc.parameters).filter(([, p]) => !p.expression).map(([name, p]) => [name, p.value]));
}

/** Saves the current values under a name (made unique); a configuration of the same values is not duplicated. */
export function saveConfiguration(doc: CadDocument, name: string): { doc: CadDocument; id: string } {
  const list = configurationsOf(doc);
  let n = 1;
  while (list.some((c) => c.id === `cf${n}`)) n++;
  let label = name.trim() || "Configuration";
  if (list.some((c) => c.name === label)) {
    let k = 2;
    while (list.some((c) => c.name === `${label} ${k}`)) k++;
    label = `${label} ${k}`;
  }
  const id = `cf${n}`;
  return { doc: { ...doc, configurations: [...list, { id, name: label, values: plainValues(doc) }] }, id };
}

/** The document with the values of a configuration (the parameters it does not know keep theirs). */
export function applyConfiguration(doc: CadDocument, id: string): CadDocument {
  const config = configurationsOf(doc).find((c) => c.id === id);
  if (!config) return doc;
  const parameters = { ...doc.parameters };
  for (const [name, value] of Object.entries(config.values)) {
    const p = parameters[name];
    if (p && !p.expression) parameters[name] = { ...p, value };
  }
  return { ...doc, parameters };
}

/** Replaces the values of a configuration by the current ones. */
export function updateConfiguration(doc: CadDocument, id: string): CadDocument {
  return { ...doc, configurations: configurationsOf(doc).map((c) => (c.id === id ? { ...c, values: plainValues(doc) } : c)) };
}

export function removeConfiguration(doc: CadDocument, id: string): CadDocument {
  return { ...doc, configurations: configurationsOf(doc).filter((c) => c.id !== id) };
}

/** The configuration whose values are all the current ones, if any. */
export function activeConfiguration(doc: CadDocument): string | undefined {
  const now = plainValues(doc);
  return configurationsOf(doc).find((c) => Object.entries(c.values).every(([name, v]) => name in now && Math.abs((now[name] as number) - v) < 1e-9))?.id;
}
