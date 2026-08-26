/**
 * Runs once when the server boots.
 *
 * Harvest runs are in-process background work, so any run still marked active
 * at startup was orphaned by whatever killed the previous process. Reconciling
 * them here means a dead run never masquerades as a working one.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reconcileOrphanedRuns } = await import("./src/harvest/lifecycle");
  const reconciled = reconcileOrphanedRuns();
  if (reconciled > 0) {
    console.log(`[sold] marked ${reconciled} orphaned run(s) as cancelled`);
  }
}
