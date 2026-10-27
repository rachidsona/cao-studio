/** "4,8 Mo", "650 Ko": a size in bytes as the French interface writes it. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mo`;
}
