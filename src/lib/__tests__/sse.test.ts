// sse.ts imports api/config/session which pull in native AsyncStorage — mock them.
jest.mock('@/lib/api', () => ({ authHeaders: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/config', () => ({ config: { apiBaseUrl: 'http://localhost' } }));
jest.mock('@/lib/session', () => ({ recoverSessionOrSignOut: jest.fn() }));
jest.mock('@/lib/i18n', () => ({ t: (key: string) => key }));

import { parseSseChunk, consumeSseText } from '@/lib/sse';

describe('parseSseChunk', () => {
  it('returns null for empty string', () => {
    expect(parseSseChunk('')).toBeNull();
  });

  it('returns null when no data lines present', () => {
    expect(parseSseChunk('event: status\n')).toBeNull();
    expect(parseSseChunk(': keep-alive\n')).toBeNull();
  });

  it('parses a simple data line as plain text', () => {
    expect(parseSseChunk('data: hello')).toEqual({ event: 'message', data: 'hello' });
  });

  it('parses JSON data', () => {
    const chunk = 'data: {"key":"value","num":42}';
    expect(parseSseChunk(chunk)).toEqual({ event: 'message', data: { key: 'value', num: 42 } });
  });

  it('parses event name', () => {
    const chunk = 'event: status\ndata: {"ok":true}';
    expect(parseSseChunk(chunk)).toEqual({ event: 'status', data: { ok: true } });
  });

  it('falls back to plain text on malformed JSON', () => {
    const chunk = 'data: {not: json}';
    const result = parseSseChunk(chunk);
    expect(result).toEqual({ event: 'message', data: '{not: json}' });
  });

  it('handles CRLF line endings', () => {
    const chunk = 'event: ping\r\ndata: {"status":"alive"}';
    expect(parseSseChunk(chunk)).toEqual({ event: 'ping', data: { status: 'alive' } });
  });

  it('joins multiple data lines with newline', () => {
    const chunk = 'data: line1\ndata: line2';
    expect(parseSseChunk(chunk)).toEqual({ event: 'message', data: 'line1\nline2' });
  });

  it('trims all leading spaces from data value via trimStart()', () => {
    // Implementation uses trimStart() which strips ALL leading whitespace,
    // not just the single optional space from the SSE spec.
    const chunk = 'data:  value with leading space';
    const result = parseSseChunk(chunk);
    expect(result?.data).toBe('value with leading space');
  });

  it('uses last event: line if multiple present', () => {
    const chunk = 'event: first\nevent: second\ndata: x';
    expect(parseSseChunk(chunk)?.event).toBe('second');
  });

  it('handles nested JSON objects', () => {
    const nested = { type: 'result', payload: { items: [1, 2, 3] } };
    const chunk = `data: ${JSON.stringify(nested)}`;
    expect(parseSseChunk(chunk)).toEqual({ event: 'message', data: nested });
  });

  it('handles unicode in data', () => {
    const chunk = 'data: {"text":"Příjmení: Černý"}';
    expect(parseSseChunk(chunk)).toEqual({ event: 'message', data: { text: 'Příjmení: Černý' } });
  });

  it('handles data: null as JSON', () => {
    expect(parseSseChunk('data: null')).toEqual({ event: 'message', data: null });
  });

  it('handles data: true/false as JSON', () => {
    expect(parseSseChunk('data: true')).toEqual({ event: 'message', data: true });
    expect(parseSseChunk('data: false')).toEqual({ event: 'message', data: false });
  });
});

describe('consumeSseText', () => {
  it('returns empty string when text has no complete chunks', () => {
    const messages: unknown[] = [];
    const rest = consumeSseText('data: incomplete', (m) => messages.push(m));
    expect(messages).toHaveLength(0);
    expect(rest).toBe('data: incomplete');
  });

  it('processes a single complete chunk and returns empty rest', () => {
    const messages: unknown[] = [];
    const rest = consumeSseText('data: hello\n\n', (m) => messages.push(m));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ event: 'message', data: 'hello' });
    expect(rest).toBe('');
  });

  it('processes multiple complete chunks', () => {
    const messages: unknown[] = [];
    const text = 'data: first\n\ndata: second\n\n';
    const rest = consumeSseText(text, (m) => messages.push(m));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ event: 'message', data: 'first' });
    expect(messages[1]).toEqual({ event: 'message', data: 'second' });
    expect(rest).toBe('');
  });

  it('returns incomplete tail as rest', () => {
    const messages: unknown[] = [];
    const text = 'data: first\n\ndata: partial';
    const rest = consumeSseText(text, (m) => messages.push(m));
    expect(messages).toHaveLength(1);
    expect(rest).toBe('data: partial');
  });

  it('skips chunks with no data lines (keep-alives)', () => {
    const messages: unknown[] = [];
    const text = ': keep-alive\n\ndata: real\n\n';
    const rest = consumeSseText(text, (m) => messages.push(m));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ event: 'message', data: 'real' });
    expect(rest).toBe('');
  });

  it('handles accumulated buffer from multiple progress chunks', () => {
    const messages: unknown[] = [];
    // simulate XHR progress events arriving in chunks
    let buffer = '';
    buffer = consumeSseText(buffer + 'data: {"chunk":1}\n\n', (m) => messages.push(m));
    buffer = consumeSseText(buffer + 'data: {"chunk":2}\n\ndata: in', (m) => messages.push(m));
    buffer = consumeSseText(buffer + 'complete', (m) => messages.push(m));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ event: 'message', data: { chunk: 1 } });
    expect(messages[1]).toEqual({ event: 'message', data: { chunk: 2 } });
    // The full incomplete SSE line (including "data: " prefix) is returned as rest
    expect(buffer).toBe('data: incomplete');
  });

  it('handles event + data chunks', () => {
    const messages: unknown[] = [];
    const text = 'event: status\ndata: {"progress":50}\n\nevent: done\ndata: {}\n\n';
    consumeSseText(text, (m) => messages.push(m));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ event: 'status', data: { progress: 50 } });
    expect(messages[1]).toEqual({ event: 'done', data: {} });
  });
});
