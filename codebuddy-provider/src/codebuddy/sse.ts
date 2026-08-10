/**
 * Minimal SSE (Server-Sent Events) line parser for the CodeBuddy streaming
 * endpoint.
 *
 * The CodeBuddy stream is a standard SSE stream: each event is a line
 * `data: <json>`, terminated by a final `data: [DONE]` line. Chunks from the
 * network can split lines at arbitrary byte boundaries, so the parser keeps a
 * tail buffer across `push()` calls.
 */

export const DONE_MARKER = '[DONE]';

export class SseParser {
  private buffer = '';

  /**
   * Feed a network chunk. Returns the complete lines extracted so far
   * (without trailing newlines). Partial lines are kept in the buffer.
   */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    return lines;
  }

  /** Returns any remaining buffered content as a single final line, if present. */
  flush(): string[] {
    if (this.buffer === '') {
      return [];
    }
    const last = this.buffer;
    this.buffer = '';
    return [last];
  }
}

/**
 * Extract the payload of a `data:` SSE line.
 *
 * Returns:
 * - `'[DONE]'` for the stream-termination marker
 * - the raw JSON string for `data: {...}` lines
 * - `null` for comment lines, keep-alive `: ping` lines, or any line that does
 *   not start with `data:`
 */
export function parseDataLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const payload = trimmed.slice('data:'.length).trimStart();
  if (payload === '') {
    return null;
  }
  return payload;
}
