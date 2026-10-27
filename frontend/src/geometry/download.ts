/**
 * Download of the OpenCascade kernel with its progress, so the loading screen can show a real bar. The size
 * expected is the file's own size, measured at build time: a compressed download announces its compressed
 * length, which the decompressed bytes read here would overrun.
 */
export type Progress = (loaded: number, total: number) => void;

/** Reads a response to the end, reporting the bytes received against `total`. */
export async function readWithProgress(response: Response, total: number, report: Progress): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(`Téléchargement du noyau impossible (erreur ${response.status}).`);
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    report(buffer.byteLength, buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    report(loaded, Math.max(total, loaded));
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  report(loaded, loaded);
  return out.buffer;
}
