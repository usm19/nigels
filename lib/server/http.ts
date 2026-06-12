import "server-only";

const RETRY_DELAY_MS = 800;

/** A response that must NOT be retried (4xx — retrying never helps, and
 *  re-sending on a 429 would hammer a source that is already throttling). */
class NoRetryError extends Error {}

/**
 * Fetch JSON with one automatic retry on transient failures (5xx or network
 * errors) — Adzuna in particular throws the odd 503. 4xx responses fail
 * immediately.
 */
export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  sourceName: string
): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    try {
      const res = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500) {
        lastError = new Error(`${sourceName} responded with HTTP ${res.status}`);
        if (attempt > 0) break;
        continue;
      }
      if (!res.ok) {
        throw new NoRetryError(`${sourceName} responded with HTTP ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      if (error instanceof NoRetryError) throw error;
      lastError = error;
      if (attempt > 0) break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${sourceName} request failed`);
}
