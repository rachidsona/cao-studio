/**
 * Download of the OpenCascade kernel with its progress, so the loading screen can show a real bar. The size
 * expected is the file's own size, measured at build time: a compressed download announces its compressed
 * length, which the decompressed bytes read here would overrun.
 */
export type Progress = (loaded: number, total: number) => void;

/**
 * Reads a response to the end, reporting the bytes received against `total`. The bytes go straight into one buffer of
 * the expected size (audit of 11/11/2026): no list of pieces copied again at the end — on an iPad, the 23 MB kernel
 * held once in memory rather than twice. A larger file than announced grows the buffer.
 */
export async function readWithProgress(response: Response, total: number, report: Progress): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`Téléchargement du noyau impossible (erreur ${response.status}).`);
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    report(buffer.byteLength, buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  let out = new Uint8Array(Math.max(total, 1));
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.byteLength > out.byteLength) {
      const bigger = new Uint8Array(Math.max(out.byteLength * 2, loaded + value.byteLength));
      bigger.set(out.subarray(0, loaded));
      out = bigger;
    }
    out.set(value, loaded);
    loaded += value.byteLength;
    report(loaded, Math.max(total, loaded));
  }
  report(loaded, loaded);
  return loaded === out.byteLength ? out : out.subarray(0, loaded);
}
