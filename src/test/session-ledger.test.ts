// Path: codebuddy-provider/src/test/session-ledger.test.ts
import { describe, expect, it } from 'vitest';
import { SessionLedger, TokenLedgerSummary } from '../codebuddy/session-ledger';

describe('SessionLedger', () => {
  it('records a single Token Usage', () => {
    const ledger = new SessionLedger();
    ledger.record({ input: 100, output: 20, cached: 0, reasoning: 0 });
    expect(ledger.summary()).toEqual<TokenLedgerSummary>({
      input: 100,
      output: 20,
      cached: 0,
      reasoning: 0,
      requests: 1,
    });
  });

  it('accumulates across multiple requests', () => {
    const ledger = new SessionLedger();
    ledger.record({ input: 100, output: 20, cached: 10, reasoning: 5 });
    ledger.record({ input: 50, output: 30, cached: 0, reasoning: 2 });
    ledger.record({ input: 25, output: 5, cached: 5, reasoning: 1 });
    expect(ledger.summary()).toEqual<TokenLedgerSummary>({
      input: 175,
      output: 55,
      cached: 15,
      reasoning: 8,
      requests: 3,
    });
  });

  it('returns an all-zero summary for an empty ledger', () => {
    const ledger = new SessionLedger();
    expect(ledger.summary()).toEqual<TokenLedgerSummary>({
      input: 0,
      output: 0,
      cached: 0,
      reasoning: 0,
      requests: 0,
    });
  });

  it('records zero-valued usage as a request without changing totals', () => {
    const ledger = new SessionLedger();
    ledger.record({ input: 0, output: 0, cached: 0, reasoning: 0 });
    expect(ledger.summary()).toEqual<TokenLedgerSummary>({
      input: 0,
      output: 0,
      cached: 0,
      reasoning: 0,
      requests: 1,
    });
  });

  it('reset clears all accumulated data', () => {
    const ledger = new SessionLedger();
    ledger.record({ input: 100, output: 20, cached: 0, reasoning: 0 });
    ledger.reset();
    expect(ledger.summary()).toEqual<TokenLedgerSummary>({
      input: 0,
      output: 0,
      cached: 0,
      reasoning: 0,
      requests: 0,
    });
  });

  it('records a usage from a parsed TokenUsage object', () => {
    const ledger = new SessionLedger();
    const parsed = { input: 200, output: 50, cached: 60, reasoning: 12 };
    ledger.record(parsed);
    expect(ledger.summary()).toEqual<TokenLedgerSummary>({
      input: 200,
      output: 50,
      cached: 60,
      reasoning: 12,
      requests: 1,
    });
  });
});
