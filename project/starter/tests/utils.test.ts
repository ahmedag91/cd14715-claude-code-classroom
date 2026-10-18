import { describe, it, expect, vi } from 'vitest';
import { withRetry, withTimeout, ErrorCodes, RateLimiter, withRateLimit } from '../src/utils';

describe('utility functions', () => {
  it('withRetry retries transient failures', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, 2, 1)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('withTimeout rejects slow operations', async () => {
    await expect(withTimeout(() => new Promise(resolve => setTimeout(resolve, 50)), 5, 'too slow'))
      .rejects.toMatchObject({ code: ErrorCodes.AGENT_TIMEOUT });
  });

  it('RateLimiter and withRateLimit enforce a request slot', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 2, maxTokensPerMinute: 1000, maxConcurrent: 1 });
    expect(limiter.canProceed(100)).toBe(true);
    await expect(withRateLimit(limiter, async () => 'done', 100)).resolves.toBe('done');
  });
});
