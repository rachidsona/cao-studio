/** Loads the OpenCascade WASM kernel once per test file (Node build of the module). */
import init from "replicad-opencascadejs";
import { initKernel, isKernelReady } from "../../frontend/src/geometry/kernel";

export async function setupKernel(): Promise<void> {
  if (isKernelReady()) return;
  initKernel(await init());
}
