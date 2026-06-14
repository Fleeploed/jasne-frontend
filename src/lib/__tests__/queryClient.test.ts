import { shouldRetry } from '@/lib/queryClient';
import type { ApiError } from '@/lib/types';

function makeApiError(status: number): ApiError {
  const err = new Error('API Error') as ApiError;
  err.status = status;
  return err;
}

describe('shouldRetry', () => {
  describe('4xx errors — never retry', () => {
    it('does not retry 400 Bad Request', () => {
      expect(shouldRetry(0, makeApiError(400))).toBe(false);
      expect(shouldRetry(1, makeApiError(400))).toBe(false);
      expect(shouldRetry(2, makeApiError(400))).toBe(false);
    });

    it('does not retry 401 Unauthorized', () => {
      expect(shouldRetry(0, makeApiError(401))).toBe(false);
    });

    it('does not retry 403 Forbidden', () => {
      expect(shouldRetry(0, makeApiError(403))).toBe(false);
    });

    it('does not retry 404 Not Found', () => {
      expect(shouldRetry(0, makeApiError(404))).toBe(false);
    });

    it('does not retry 422 Unprocessable Entity', () => {
      expect(shouldRetry(0, makeApiError(422))).toBe(false);
    });

    it('does not retry 429 Too Many Requests', () => {
      expect(shouldRetry(0, makeApiError(429))).toBe(false);
    });

    it('does not retry 499 (edge of 4xx range)', () => {
      expect(shouldRetry(0, makeApiError(499))).toBe(false);
    });
  });

  describe('5xx errors — retry up to 3 times', () => {
    it('retries 500 on first failure', () => {
      expect(shouldRetry(0, makeApiError(500))).toBe(true);
    });

    it('retries 503 on second failure', () => {
      expect(shouldRetry(1, makeApiError(503))).toBe(true);
    });

    it('retries 502 on third failure (failureCount=2)', () => {
      expect(shouldRetry(2, makeApiError(502))).toBe(true);
    });

    it('stops after 3 attempts (failureCount=3)', () => {
      expect(shouldRetry(3, makeApiError(500))).toBe(false);
    });
  });

  describe('network errors (no status)', () => {
    it('retries plain Error (network timeout, DNS failure)', () => {
      expect(shouldRetry(0, new Error('Network request failed'))).toBe(true);
      expect(shouldRetry(1, new Error('timeout'))).toBe(true);
      expect(shouldRetry(2, new Error('fetch failed'))).toBe(true);
    });

    it('stops after 3 attempts for network errors', () => {
      expect(shouldRetry(3, new Error('Network request failed'))).toBe(false);
    });

    it('retries null/undefined error', () => {
      expect(shouldRetry(0, null)).toBe(true);
      expect(shouldRetry(0, undefined)).toBe(true);
    });
  });
});
