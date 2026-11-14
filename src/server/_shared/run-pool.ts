/** Runs `task` over `items` with at most `concurrency` in flight; results keep the input order. */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
) {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
