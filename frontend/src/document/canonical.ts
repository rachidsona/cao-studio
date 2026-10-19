/**
 * Canonical JSON (keys sorted at every level), matching the server checksum
 * serialization. Used to compare documents regardless of key order, which a
 * database such as PostgreSQL (jsonb) does not preserve.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameDocument(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
