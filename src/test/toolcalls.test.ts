import { describe, expect, it } from 'vitest';
import { ToolCallAccumulator } from '../codebuddy/toolcalls';

describe('ToolCallAccumulator', () => {
  it('accumulates arguments across stream chunks', () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add({ index: 0, id: 'call_1', type: 'function', function: { name: 'read_file' } });
    accumulator.add({ index: 0, function: { arguments: '{"path":' } });
    accumulator.add({ index: 0, function: { arguments: '"a.txt"}' } });

    expect(accumulator.size).toBe(1);
    expect(accumulator.toParts()).toEqual([
      { callId: 'call_1', name: 'read_file', input: { path: 'a.txt' } },
    ]);
  });

  it('tracks multiple tool calls by index and keeps their order', () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add({ index: 1, id: 'call_2', function: { name: 'exec' } });
    accumulator.add({ index: 0, id: 'call_1', function: { name: 'read_file', arguments: '{}' } });

    expect(accumulator.toParts().map((p) => p.callId)).toEqual(['call_1', 'call_2']);
  });

  it('drops fragments that never got an id or name', () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add({ index: 0, function: { arguments: '{}' } });
    expect(accumulator.toParts()).toEqual([]);
  });

  it('wraps unparseable arguments as { raw }', () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add({ index: 0, id: 'call_1', function: { name: 'f', arguments: 'not json' } });
    expect(accumulator.toParts()).toEqual([{ callId: 'call_1', name: 'f', input: { raw: 'not json' } }]);
  });

  it('treats empty arguments as an empty input object', () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add({ index: 0, id: 'call_1', function: { name: 'noop' } });
    expect(accumulator.toParts()[0].input).toEqual({});
  });
});
