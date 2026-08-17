import { describe, expect, it, vi } from 'vitest';
import { estimateTokenCount, memoizeTokenCount } from '../codebuddy/token';

describe('estimateTokenCount', () => {
  it('counts CJK characters as one token each', () => {
    expect(estimateTokenCount('你好世界')).toBe(4);
  });

  it('approximates latin text at ~4 chars per token', () => {
    expect(estimateTokenCount('abcdefgh')).toBe(2);
  });

  it('returns 0 for empty input', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('combines CJK and latin heuristics', () => {
    // 2 CJK tokens + ceil(5/4) = 2 (' test' — the space counts as a latin char) → 4
    expect(estimateTokenCount('你好 test')).toBe(4);
  });

  it('weights JSON-like structured text higher than plain text', () => {
    const json = '{"id":"abc","name":"hello","nested":{"a":1,"b":true,"c":[1,2,3]}}';
    const plain = 'id abc name hello nested a b c';
    // JSON (with braces, quotes, punctuation) must cost at least as much as the
    // bare words it contains, typically more due to structural tokens.
    expect(estimateTokenCount(json)).toBeGreaterThanOrEqual(estimateTokenCount(plain));
  });

  it('weights code-block-like text higher than plain prose', () => {
    const code = 'function foo() { return [1,2,3].map((x) => x * 2); }';
    const prose = 'function foo return map times two';
    expect(estimateTokenCount(code)).toBeGreaterThanOrEqual(estimateTokenCount(prose));
  });

  it('does not count newline/whitespace-only text as many tokens', () => {
    expect(estimateTokenCount('\n\n  \n')).toBeLessThan(estimateTokenCount('abcabcabcabc'));
  });
});

describe('memoizeTokenCount', () => {
  it('returns the same result as the underlying estimator', () => {
    const memoized = memoizeTokenCount(estimateTokenCount);
    const text = '你好世界 abcdefgh';
    expect(memoized(text)).toBe(estimateTokenCount(text));
  });

  it('computes each distinct text only once', () => {
    const spy = vi.fn(estimateTokenCount);
    const memoized = memoizeTokenCount(spy);
    const text = 'repeat me 重复文本';

    memoized(text);
    memoized(text);
    memoized(text);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('computes distinct texts separately', () => {
    const spy = vi.fn(estimateTokenCount);
    const memoized = memoizeTokenCount(spy);

    memoized('one');
    memoized('two');
    memoized('one');

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
