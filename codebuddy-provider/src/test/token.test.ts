import { describe, expect, it } from 'vitest';
import { estimateTokenCount } from '../codebuddy/token';

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
});
