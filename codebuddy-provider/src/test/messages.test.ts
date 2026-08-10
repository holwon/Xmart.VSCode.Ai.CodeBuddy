import { describe, expect, it } from 'vitest';
import {
  stringifyToolResult,
  toCodeBuddyMessages,
  toCodeBuddyToolChoice,
  toCodeBuddyTools,
} from '../codebuddy/messages';
import { ChatRequestMessage } from '../codebuddy/types';

describe('toCodeBuddyMessages', () => {
  it('preserves the order of VS Code messages as-is', () => {
    const inOrder: ChatRequestMessage[] = [
      { role: 'user', parts: [{ kind: 'text', text: 'hi' }] },
      { role: 'assistant', parts: [{ kind: 'text', text: 'ok' }] },
      { role: 'user', parts: [{ kind: 'text', text: 'please fix' }] },
    ];
    const result = toCodeBuddyMessages(inOrder);
    expect(result.map((m) => m.content)).toEqual(['hi', 'ok', 'please fix']);
    // Input array must not be mutated.
    expect(inOrder[0].parts[0]).toEqual({ kind: 'text', text: 'hi' });
  });

  it('keeps tool results directly after the assistant message that made the calls', () => {
    const inOrder: ChatRequestMessage[] = [
      { role: 'user', parts: [{ kind: 'text', text: 'analyze this' }] },
      {
        role: 'assistant',
        parts: [{ kind: 'tool-call', callId: 'call_1', name: 'read_file', input: { path: '/a.txt' } }],
      },
      { role: 'user', parts: [{ kind: 'tool-result', callId: 'call_1', content: 'file contents' }] },
    ];
    const result = toCodeBuddyMessages(inOrder);
    expect(result).toEqual([
      { role: 'user', content: 'analyze this' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/a.txt"}' } },
        ],
      },
      { role: 'tool', content: 'file contents', tool_call_id: 'call_1' },
    ]);
  });

  it('folds a tool result that has no matching outstanding call into user text', () => {
    const messages: ChatRequestMessage[] = [
      { role: 'user', parts: [{ kind: 'tool-result', callId: 'call_orphan', content: 'stale result' }] },
    ];
    const result = toCodeBuddyMessages(messages);
    expect(result).toEqual([{ role: 'user', content: '[tool result call_orphan]\nstale result' }]);
  });

  it('does not emit a second tool message for a call already answered', () => {
    const messages: ChatRequestMessage[] = [
      {
        role: 'assistant',
        parts: [{ kind: 'tool-call', callId: 'call_1', name: 'f', input: {} }],
      },
      { role: 'user', parts: [{ kind: 'tool-result', callId: 'call_1', content: 'first result' }] },
      { role: 'user', parts: [{ kind: 'tool-result', callId: 'call_1', content: 'duplicate result' }] },
    ];
    const result = toCodeBuddyMessages(messages);
    // call_1 is consumed by the first result; the duplicate folds into text.
    const toolMessages = result.filter((m) => m.role === 'tool');
    expect(toolMessages).toEqual([{ role: 'tool', content: 'first result', tool_call_id: 'call_1' }]);
    expect(result.some((m) => m.role === 'user' && m.content?.includes('duplicate result'))).toBe(true);
  });

  it('converts tool-call parts into assistant tool_calls with JSON-string arguments', () => {
    const messages: ChatRequestMessage[] = [
      {
        role: 'assistant',
        parts: [{ kind: 'tool-call', callId: 'call_1', name: 'read_file', input: { path: '/a.txt' } }],
      },
    ];
    const result = toCodeBuddyMessages(messages);
    expect(result).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/a.txt"}' } },
        ],
      },
    ]);
  });

  it('emits tool results as role:tool messages with tool_call_id (when the call is outstanding)', () => {
    const messages: ChatRequestMessage[] = [
      { role: 'assistant', parts: [{ kind: 'tool-call', callId: 'call_1', name: 'f', input: {} }] },
      { role: 'user', parts: [{ kind: 'tool-result', callId: 'call_1', content: 'file contents' }] },
    ];
    const result = toCodeBuddyMessages(messages);
    expect(result).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'f', arguments: '{}' } }] },
      { role: 'tool', content: 'file contents', tool_call_id: 'call_1' },
    ]);
  });

  it('keeps the user text and emits tool results separately for mixed user messages', () => {
    const messages: ChatRequestMessage[] = [
      { role: 'assistant', parts: [{ kind: 'tool-call', callId: 'call_2', name: 'f', input: {} }] },
      {
        role: 'user',
        parts: [
          { kind: 'tool-result', callId: 'call_2', content: { lines: 3 } },
          { kind: 'text', text: 'based on that, summarize' },
        ],
      },
    ];
    const result = toCodeBuddyMessages(messages);
    expect(result).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'f', arguments: '{}' } }] },
      { role: 'tool', content: '{"lines":3}', tool_call_id: 'call_2' },
      { role: 'user', content: 'based on that, summarize' },
    ]);
  });

  it('passes a plain assistant message with null content through', () => {
    const messages: ChatRequestMessage[] = [{ role: 'assistant', parts: [] }];
    expect(toCodeBuddyMessages(messages)).toEqual([{ role: 'assistant', content: null }]);
  });
});

describe('stringifyToolResult', () => {
  it('passes strings through unchanged', () => {
    expect(stringifyToolResult('plain text')).toBe('plain text');
  });

  it('serializes objects as JSON', () => {
    expect(stringifyToolResult({ a: 1 })).toBe('{"a":1}');
  });
});

describe('toCodeBuddyTools', () => {
  it('maps tools to the function shape', () => {
    expect(
      toCodeBuddyTools([
        { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: {} } },
      ]),
    ).toEqual([
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
  });

  it('returns undefined for empty or missing tool lists', () => {
    expect(toCodeBuddyTools(undefined)).toBeUndefined();
    expect(toCodeBuddyTools([])).toBeUndefined();
  });
});

describe('toCodeBuddyToolChoice', () => {
  it('maps Required (2) to "required"', () => {
    expect(toCodeBuddyToolChoice(2)).toBe('required');
  });

  it('leaves Auto (1) and undefined as the upstream default', () => {
    expect(toCodeBuddyToolChoice(1)).toBeUndefined();
    expect(toCodeBuddyToolChoice(undefined)).toBeUndefined();
  });
});
