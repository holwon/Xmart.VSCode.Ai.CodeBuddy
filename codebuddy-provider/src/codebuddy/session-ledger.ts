// Path: codebuddy-provider/src/codebuddy/session-ledger.ts
/**
 * Session Ledger — cross-request accumulation of real Token Usage.
 *
 * Tracks how many tokens a session has actually consumed across requests
 * (input / output / cached / reasoning), so the extension can surface
 * real usage in logs and, in a later phase, drive its own context compaction
 * decisions.
 *
 * Pure logic, zero `vscode` dependency. It consumes already-parsed `TokenUsage`
 * values (see `usage.ts`) and is injected wherever a ledger is needed.
 */

import { TokenUsage } from './usage';

/** Cross-request summary of a session's token consumption. */
export interface TokenLedgerSummary {
  /** Total prompt tokens sent across all recorded requests. */
  input: number;
  /** Total completion tokens generated across all recorded requests. */
  output: number;
  /** Total cached prompt tokens across all recorded requests. */
  cached: number;
  /** Total reasoning tokens across all recorded requests. */
  reasoning: number;
  /** Number of requests recorded. */
  requests: number;
}

/** All-zero summary — the state of a fresh / reset ledger. */
export const EMPTY_LEDGER_SUMMARY: TokenLedgerSummary = {
  input: 0,
  output: 0,
  cached: 0,
  reasoning: 0,
  requests: 0,
};

export class SessionLedger {
  private input = 0;
  private output = 0;
  private cached = 0;
  private reasoning = 0;
  private requests = 0;

  /** Accumulate a single request's Token Usage into the ledger. */
  record(usage: TokenUsage): void {
    this.input += usage.input;
    this.output += usage.output;
    this.cached += usage.cached;
    this.reasoning += usage.reasoning;
    this.requests += 1;
  }

  /** Current cross-request accumulation summary. */
  summary(): TokenLedgerSummary {
    return {
      input: this.input,
      output: this.output,
      cached: this.cached,
      reasoning: this.reasoning,
      requests: this.requests,
    };
  }

  /** Clear all accumulated data, returning the ledger to its empty state. */
  reset(): void {
    this.input = 0;
    this.output = 0;
    this.cached = 0;
    this.reasoning = 0;
    this.requests = 0;
  }
}
