/**
 * Cheap token estimation used by `provideTokenCount`.
 *
 * VS Code calls this for context budgeting; a rough estimate is sufficient —
 * CJK characters count as one token each, everything else is approximated at
 * ~4 characters per token (OpenAI's conventional rule of thumb).
 */
export function estimateTokenCount(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) ?? []).length;
  const otherCount = text.length - cjkCount;
  return Math.ceil(cjkCount + otherCount / 4);
}
