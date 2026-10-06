/** At most `n` heavy jobs (image decoding, PDF parsing) at once — the server has 2 cores. */
export function createLimiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= n) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await job();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

export const heavyJob = createLimiter(2);
