/** Start-up of the editor: the kernel download with its progress, and the sizes shown on the loading screen. */
import { describe, expect, it } from "vitest";
import { readWithProgress } from "../../frontend/src/geometry/download";
import { formatBytes } from "../../frontend/src/ui/format-bytes";

const streamed = (chunks: number[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((n, i) => controller.enqueue(new Uint8Array(n).fill(i + 1)));
        controller.close();
      },
    }),
  );

describe("chargement", () => {
  it("lit le noyau morceau par morceau et rapporte l'avancement", async () => {
    const seen: [number, number][] = [];
    const buffer = await readWithProgress(streamed([3, 4, 5]), 20, (loaded, total) => seen.push([loaded, total]));
    expect(new Uint8Array(buffer)).toEqual(Uint8Array.from([1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3]));
    expect(seen).toEqual([[3, 20], [7, 20], [12, 20], [12, 12]]);
  });

  it("un fichier plus gros que prévu ne fait pas dépasser la barre", async () => {
    const seen: [number, number][] = [];
    const bytes = await readWithProgress(streamed([8, 8]), 10, (loaded, total) => seen.push([loaded, total]));
    expect(seen.every(([loaded, total]) => loaded <= total)).toBe(true);
    // The buffer grew: every byte is there, in order.
    expect(Array.from(bytes)).toEqual([...Array(8).fill(1), ...Array(8).fill(2)]);
  });

  it("à la taille annoncée, les octets sont lus dans un seul tampon, sans copie finale", async () => {
    const bytes = await readWithProgress(streamed([4, 6]), 10, () => {});
    expect(bytes.byteLength).toBe(10);
    expect(bytes.buffer.byteLength).toBe(10);
  });

  it("une réponse en erreur est refusée avec un message", async () => {
    await expect(readWithProgress(new Response("", { status: 404 }), 10, () => {})).rejects.toThrow(/erreur 404/);
  });

  it("écrit les tailles en Ko et Mo", () => {
    expect(formatBytes(650 * 1024)).toBe("650 Ko");
    expect(formatBytes(5_012_753)).toBe("4,8 Mo");
  });
});
