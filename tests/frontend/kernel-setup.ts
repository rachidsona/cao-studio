/** Loads the OpenCascade kernel and the planegcs solver once per test file (Node builds). */
import init from "replicad-opencascadejs";
import { initSolver } from "../../frontend/src/constraints/solver";
import { initKernel, isKernelReady } from "../../frontend/src/geometry/kernel";

export async function setupKernel(): Promise<void> {
  await initSolver();
  if (isKernelReady()) return;
  initKernel(await init());
}
