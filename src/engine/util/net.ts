/**
 * Network helpers: every request gets a timeout (mobile connections hang
 * rather than fail) and idempotent GETs retry with backoff on transient errors.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export interface FetchOptions extends RequestInit {
  /** Abort if no response within this many ms (default 20 s). */
  timeoutMs?: number;
  /** Extra attempts for network errors / 429 / 5xx (default 2 for GET, 0 otherwise). */
  retries?: number;
}

const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

const transient = (status: number) => status === 408 || status === 429 || status >= 500;

/** fetch() with timeout + retries. Resolves only with ok responses (throws HttpError otherwise). */
export async function fetchSafe(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 20_000, retries = (opts.method ?? 'GET') === 'GET' ? 2 : 0, signal, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs);
    const onAbort = () => ac.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(url, { ...init, signal: ac.signal });
      if (res.ok) return res;
      lastErr = new HttpError(res.status, url);
      if (!transient(res.status)) throw lastErr;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      if (err instanceof HttpError && !transient(err.status)) throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    if (attempt < retries) await sleep(400 * 2 ** attempt + Math.random() * 300, signal);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
  return (await fetchSafe(url, opts)).json() as Promise<T>;
}
