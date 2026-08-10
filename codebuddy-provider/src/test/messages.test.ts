import { describe, expect, it } from 'vitest';
import {
  stringifyToolResult,
  toCodeBuddyMessages,
  toCodeBuddyToolChoice,
  toCodeBuddyTools,
} from '../codebuddy/messages';
import { ChatRequestMessage } from '../codebuddy/types';

describe('toCodeBuddyMessages', () => {
  it('reverses newest-first VS Code messages into oldest-first order', () => {
    const newestFirst: ChatRequestMessage[] = [
      { role: 'user', parts: [{ kind: 'text', text: 'please fix' }] },
      { role: 'assistant', parts: [{ kind: 'text', text: 'ok' }] },
      { role: 'user', parts: [{ kind: 'text', text: 'hi' }] },
    ];
    const result = toCodeBuddyMessages(newestFirst);
    expect(result.map((m) => m.content)).toEqual(['hi', 'ok', 'please fix']);
    // Input array must not be mutated.
    expect(newestFirst[0].parts[0]).toEqual({ kind: 'text', text: 'please fix' });
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

  it('emits tool results as role:tool messages with tool_call_id', () => {
    const messages: ChatRequestMessage[] = [
      { role: 'user', parts: [{ kind: 'tool-result', callId: 'call_1', content: 'file contents' }] },
    ];
    const result = toCodeBuddyMessages(messages);
    expect(result).toEqual([{ role: 'tool', content: 'file contents', tool_call_id: 'call_1' }]);
  });

  it('keeps the user text and emits tool results separately for mixed user messages', () => {
    const messages: ChatRequestMessage[] = [
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
