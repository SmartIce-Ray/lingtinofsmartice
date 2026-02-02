// Fetch with Retry - Network resilience for cross-border connections
// v1.2 - Use WARN for retry attempts, ERROR only for final failure

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (response: Response) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 9,  // 10 total attempts (1 initial + 9 retries)
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryOn: (response) => response.status >= 500,
};

// Log levels: WARN for retries, ERROR for final failure
function logWarn(message: string): void {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] [FetchRetry] WARN: ${message}`);
}

function logError(message: string): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [FetchRetry] ERROR: ${message}`);
}

/**
 * Fetch with exponential backoff retry
 * Designed for unstable cross-border network (China → overseas services)
 */
export async function fetchWithRetry(
  url: string | URL | Request,
  init?: RequestInit,
  options?: RetryOptions,
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : 'Request';
  const shortUrl = urlStr.length > 80 ? urlStr.substring(0, 80) + '...' : urlStr;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      // Check if we should retry based on response
      if (!response.ok && opts.retryOn(response) && attempt < opts.maxRetries) {
        const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
        logWarn(`Attempt ${attempt + 1}/${opts.maxRetries + 1} failed (HTTP ${response.status}), retrying in ${delay}ms: ${shortUrl}`);
        await sleep(delay);
        continue;
      }

      if (attempt > 0) {
        logWarn(`Success after ${attempt + 1} attempts: ${shortUrl}`);
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt >= opts.maxRetries) {
        logError(`All ${opts.maxRetries + 1} attempts failed: ${shortUrl} - ${lastError.message}`);
        break;
      }

      // Exponential backoff with jitter
      const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
      const jitter = Math.random() * 200;
      logWarn(`Attempt ${attempt + 1}/${opts.maxRetries + 1} failed (${lastError.message}), retrying in ${Math.round(delay + jitter)}ms: ${shortUrl}`);
      await sleep(delay + jitter);
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a custom fetch function with retry for Supabase client
 */
export function createRetryFetch(options?: RetryOptions): typeof fetch {
  return (url: string | URL | Request, init?: RequestInit) => {
    return fetchWithRetry(url, init, options);
  };
}
