import { describe, expect, it } from 'vitest';
import { dispatchPart, flattenPartArray, renderPartForTokens } from '../codebuddy/parts';

/** Stand-ins that mimic the vscode part classes by shape (duck typing). */
function textPart(value: string): unknown {
  return { value };
}
function toolCallPart(callId: string, name: string, input: object): unknown {
  return { callId, name, input };
}
function toolResultPart(callId: string, content: unknown[]): unknown {
  return { callId, content };
}

describe('dispatchPart', () => {
  it('passes non-empty strings through as text', () => {
    expect(dispatchPart('hello')).toEqual({ kind: 'text', text: 'hello' });
  });

  it('returns null for empty strings', () => {
    expect(dispatchPart('')).toBeNull();
  });

  it('returns null for primitives and null', () => {
    expect(dispatchPart(42)).toBeNull();
    expect(dispatchPart(null)).toBeNull();
    expect(dispatchPart(undefined)).toBeNull();
  });

  it('recognises a text part by its value field', () => {
    expect(dispatchPart(textPart('hi'))).toEqual({ kind: 'text', text: 'hi' });
  });

  it('recognises a tool-call part by callId + name', () => {
    expect(dispatchPart(toolCallPart('call_1', 'read_file', { path: '/a' }))).toEqual({
      kind: 'tool-call',
      callId: 'call_1',
      name: 'read_file',
      input: { path: '/a' },
    });
  });

  it('recognises a tool-result part by callId + array content', () => {
    const part = toolResultPart('call_1', [textPart('file contents')]);
    expect(dispatchPart(part)).toEqual({ kind: 'tool-result', callId: 'call_1', content: 'file contents' });
  });

  it('returns null for unknown object shapes', () => {
    expect(dispatchPart({ foo: 'bar' })).toBeNull();
  });
});

describe('flattenPartArray', () => {
  it('passes strings through and joins with newlines', () => {
    expect(flattenPartArray(['a', 'b'])).toBe('a\nb');
  });

  it('extracts value from text-like parts', () => {
    expect(flattenPartArray([textPart('x'), 'y'])).toBe('x\ny');
  });

  it('JSON-serialises other objects', () => {
    expect(flattenPartArray([{ a: 1 }])).toBe('{"a":1}');
  });
});

describe('renderPartForTokens', () => {
  it('renders text parts by value', () => {
    expect(renderPartForTokens(textPart('some text'))).toBe('some text');
  });

  it('renders tool calls as name(input-json)', () => {
    expect(renderPartForTokens(toolCallPart('c1', 'read_file', { path: '/a' }))).toBe(
      'read_file({"path":"/a"})',
    );
  });

  it('renders tool results by flattened content', () => {
    expect(renderPartForTokens(toolResultPart('c1', [textPart('result')]))).toBe('result');
  });

  it('renders unknown parts as empty', () => {
    expect(renderPartForTokens({ foo: 1 })).toBe('');
  });
});
