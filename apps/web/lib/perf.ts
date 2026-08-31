// TEMPORARY sign-in-latency instrumentation. Active only when PERF_TRACE=1, so
// it is inert in every normal run (dev, prod, CI). Used to attribute the
// dashboard render's milliseconds by phase; remove once the latency work lands.
export async function perfTime<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (process.env.PERF_TRACE !== '1') return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[PERF] ${label}\t${(performance.now() - t0).toFixed(0)}ms`);
  }
}
