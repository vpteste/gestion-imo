export type RetryOptions = {
  retries?: number;
  delayMs?: number;
  retryOnStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  request: () => Promise<Response>,
  options: RetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 900;
  const retryOnStatuses = options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      const response = await request();
      if (response.ok || !retryOnStatuses.includes(response.status) || attempt === retries) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }
    }

    attempt += 1;
    await sleep(delayMs * attempt);
  }

  throw lastError instanceof Error ? lastError : new Error("Requete indisponible");
}
