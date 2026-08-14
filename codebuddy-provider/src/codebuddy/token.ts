// Path: codebuddy-provider/src/codebuddy/token.ts
/**
 * Cheap token estimation used by `provideTokenCount`.
 *
 * VS Code calls this for context budgeting; a rough estimate is sufficient —
 * CJK characters count as one token each, everything else is approximated at
 * ~4 characters per token (OpenAI's conventional rule of thumb).
 *
 * Structured text (JSON, code) is weighted slightly higher than plain prose:
 * punctuation, braces, quotes, and operators map to extra tokens, so treating
 * them at the plain 4-char/token rate underestimates real usage. The weighting
 * keeps the pure function shape and the existing plain-text/CJK semantics.
 */

// ─── Token estimation ───

/** CJK Unified Ideographs + Extension A + Compatibility Ideographs. */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

/** Characters that typically cost their own token in code/JSON: braces, quotes, operators, etc. */
const STRUCTURAL_RE = /[{}[\]()"'`=:;,!?<>|&*%$#@^~\\/+\-.]/g;

/**
 * Rough per-char token factor for structured content. A structural char is
 * worth ~2 plain chars (i.e. about 0.5 token each at the 4-char rate, plus
 * surrounding breakage), and code lines break more frequently than prose.
 */
const STRUCTURAL_WEIGHT = 2;

/**
 * Estimate the token count of `text`. Pure function; never throws.
 * Plain latin ≈ 4 chars/token, CJK = 1 char/token, structural chars (JSON/code
 * punctuation) weighted ×2 to avoid underestimating structured payloads.
 */
export function estimateTokenCount(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const cjkCount = (text.match(CJK_RE) ?? []).length;
  const structuralCount = (text.match(STRUCTURAL_RE) ?? []).length;
  // Every structural char counts as 2 "effective" chars toward the token rate;
  // CJK is already 1 token/char so it is excluded from the char pool below.
  const otherChars = text.length - cjkCount;
  const effective = otherChars - structuralCount + structuralCount * STRUCTURAL_WEIGHT;
  return Math.ceil(cjkCount + effective / 4);
}

// ─── Memoization ───

export type TokenEstimator = (text: string) => number;

/**
 * Wrap a token estimator with an unbounded memo cache keyed by the exact text.
 * Tool schemas and repeated system content are estimated repeatedly by VS Code;
 * caching avoids recomputing the same text. Cache grows only with distinct
 * inputs; caller may bound it if needed.
 */
export function memoizeTokenCount(estimate: TokenEstimator): TokenEstimator {
  const cache = new Map<string, number>();
  return (text: string) => {
    const hit = cache.get(text);
    if (hit !== undefined) {
      return hit;
    }
    const count = estimate(text);
    cache.set(text, count);
    return count;
  };
}
