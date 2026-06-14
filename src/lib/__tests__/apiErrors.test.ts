import { parseErrorBody, isRecord } from '@/lib/apiErrors';

// Mock i18n so tests don't depend on locale state
jest.mock('@/lib/i18n', () => ({
  t: (key: string) => key,
}));

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it('returns true for arrays (they are objects)', () => {
    expect(isRecord([])).toBe(true);
  });
});

describe('parseErrorBody', () => {
  const FALLBACK = 'fallback message';

  describe('5xx responses', () => {
    it('returns serviceDown for 500', () => {
      const result = parseErrorBody(500, '{"detail":"error"}', FALLBACK);
      expect(result.message).toBe('common.serviceDown');
    });

    it('returns serviceDown for 503', () => {
      const result = parseErrorBody(503, '', FALLBACK);
      expect(result.message).toBe('common.serviceDown');
    });
  });

  describe('empty body', () => {
    it('returns serviceDown for empty text', () => {
      const result = parseErrorBody(404, '', FALLBACK);
      expect(result.message).toBe('common.serviceDown');
    });
  });

  describe('invalid JSON', () => {
    it('returns serviceDown for non-JSON body', () => {
      const result = parseErrorBody(400, 'not json at all', FALLBACK);
      expect(result.message).toBe('common.serviceDown');
    });

    it('returns serviceDown for partial JSON', () => {
      const result = parseErrorBody(400, '{"detail":', FALLBACK);
      expect(result.message).toBe('common.serviceDown');
    });
  });

  describe('non-object JSON', () => {
    it('returns fallback for JSON array (arrays pass isRecord, no known shape matches)', () => {
      // Arrays are objects in JS so isRecord passes, but no .detail or .status=="error" matches,
      // so they fall through to fallback rather than serviceDown.
      const result = parseErrorBody(400, '["a","b"]', FALLBACK);
      expect(result.message).toBe(FALLBACK);
    });

    it('returns serviceDown for JSON primitive string (not an object)', () => {
      // Primitive strings are not records, so serviceDown is returned.
      const result = parseErrorBody(400, '"error"', FALLBACK);
      expect(result.message).toBe('common.serviceDown');
    });
  });

  describe('FastAPI format', () => {
    it('extracts string detail', () => {
      const result = parseErrorBody(422, '{"detail":"Validation error"}', FALLBACK);
      expect(result.message).toBe('Validation error');
      expect(result.code).toBeUndefined();
    });

    it('extracts object detail with message and code', () => {
      const body = JSON.stringify({ detail: { message: 'Limit reached', code: 'limit_exceeded' } });
      const result = parseErrorBody(429, body, FALLBACK);
      expect(result.message).toBe('Limit reached');
      expect(result.code).toBe('limit_exceeded');
    });

    it('extracts object detail with message but no code', () => {
      const body = JSON.stringify({ detail: { message: 'Not found' } });
      const result = parseErrorBody(404, body, FALLBACK);
      expect(result.message).toBe('Not found');
      expect(result.code).toBeUndefined();
    });

    it('handles detail.code being non-string gracefully', () => {
      const body = JSON.stringify({ detail: { message: 'Error', code: 42 } });
      const result = parseErrorBody(400, body, FALLBACK);
      expect(result.message).toBe('Error');
      expect(result.code).toBeUndefined();
    });
  });

  describe('proxy envelope format (Railway/fly.io)', () => {
    it('returns serviceDown for proxy error shape', () => {
      const body = JSON.stringify({ status: 'error', code: 'upstream_unavailable', message: 'Service unavailable', request_id: 'abc123' });
      const result = parseErrorBody(503, body, FALLBACK);
      // proxy envelopes collapse to serviceDown regardless of body content
      expect(result.message).toBe('common.serviceDown');
    });
  });

  describe('unknown shapes fall back to fallback', () => {
    it('returns fallback for unknown JSON shape', () => {
      const result = parseErrorBody(400, '{"unknown":"field"}', FALLBACK);
      expect(result.message).toBe(FALLBACK);
    });

    it('returns fallback for object with non-string/object detail', () => {
      const result = parseErrorBody(400, '{"detail":42}', FALLBACK);
      expect(result.message).toBe(FALLBACK);
    });

    it('returns fallback for detail as null', () => {
      const result = parseErrorBody(400, '{"detail":null}', FALLBACK);
      expect(result.message).toBe(FALLBACK);
    });
  });
});
