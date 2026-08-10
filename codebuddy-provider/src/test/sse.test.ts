import { describe, expect, it } from 'vitest';
import { DONE_MARKER, parseDataLine, SseParser } from '../codebuddy/sse';

describe('SseParser', () => {
  it('returns complete lines and buffers a trailing partial line', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"a":1}\ndata: {"b"')).toEqual(['data: {"a":1}']);
    expect(parser.push(':2}\n')).toEqual(['data: {"b":2}']);
    expect(parser.flush()).toEqual([]);
  });

  it('splits lines at arbitrary byte boundaries across chunks', () => {
    const parser = new SseParser();
    const chunk1 = 'data: {"choices":[{"delta":{"con';
    const chunk2 = 'tent":"hi"}}]}\ndata: [DONE]\n';
    const lines = [...parser.push(chunk1), ...parser.push(chunk2)];
    expect(lines).toEqual(['data: {"choices":[{"delta":{"content":"hi"}}]}', 'data: [DONE]']);
  });

  it('handles CRLF line endings', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"a":1}\r\ndata: {"b":2}\r\n')).toEqual(['data: {"a":1}', 'data: {"b":2}']);
  });

  it('flushes a trailing line without a newline', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"a":1}')).toEqual([]);
    expect(parser.flush()).toEqual(['data: {"a":1}']);
  });
});

describe('parseDataLine', () => {
  it('extracts the JSON payload', () => {
    expect(parseDataLine('data: {"a":1}')).toBe('{"a":1}');
  });

  it('trims leading whitespace after the colon', () => {
    expect(parseDataLine('data:  {"a":1}')).toBe('{"a":1}');
  });

  it('recognizes the DONE marker', () => {
    expect(parseDataLine('data: [DONE]')).toBe(DONE_MARKER);
  });

  it('returns null for non-data lines and empty payloads', () => {
    expect(parseDataLine(': keep-alive')).toBeNull();
    expect(parseDataLine('')).toBeNull();
    expect(parseDataLine('data:')).toBeNull();
    expect(parseDataLine('data:   ')).toBeNull();
  });
});
