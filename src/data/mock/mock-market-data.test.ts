import { MARKET_OVERVIEW } from "@/config/market-overview";
import { TIME_RANGES } from "@/domain/time-range";
import { createRng, MockMarketDataRepository, mockBenchmarkQuote, mockSnapshot } from "./mock-market-data";

const REF = { securityId: "id-nvda", ticker: "NVDA", currency: "USD" };

describe("mock market data", () => {
  it("is deterministic per ticker", () => {
    expect(mockSnapshot(REF)).toEqual(mockSnapshot(REF));
    expect(mockSnapshot(REF)).not.toEqual(mockSnapshot({ ...REF, ticker: "AMD" }));
    const a = createRng("x");
    const b = createRng("x");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces internally consistent snapshots", () => {
    for (const ticker of ["AAPL", "MSFT", "XOM", "BRK.B", "NEM"]) {
      const s = mockSnapshot({ ...REF, ticker });
      expect(s.currency).toBe("USD");
      expect(s.price).toBeGreaterThan(0);
      expect(s.marketCap).toBeGreaterThan(0);
      expect(s.low52w).toBeLessThanOrEqual(s.price ?? 0);
      expect(s.high52w).toBeGreaterThanOrEqual(s.price ?? 0);
      expect(s.rsi14).toBeGreaterThanOrEqual(0);
      expect(s.rsi14).toBeLessThanOrEqual(100);
      for (const range of TIME_RANGES) expect(s.returns[range]).toBeGreaterThan(-1);
    }
  });

  it("keeps the currency of the security (no USD assumption)", () => {
    expect(mockSnapshot({ ...REF, currency: "EUR" }).currency).toBe("EUR");
  });

  it("always labels responses as demo data", async () => {
    const repo = new MockMarketDataRepository(() => new Date("2026-09-29T00:00:00Z"));
    const snapshots = await repo.getSnapshots([REF]);
    expect(snapshots.provenance).toMatchObject({ source: "mock", isDemo: true, asOf: "2026-09-29T00:00:00.000Z" });
    expect(snapshots.data.get(REF.securityId)?.securityId).toBe(REF.securityId);
    const benchmarks = await repo.getBenchmarkQuotes(MARKET_OVERVIEW);
    expect(benchmarks.provenance.isDemo).toBe(true);
    expect(benchmarks.data).toHaveLength(MARKET_OVERVIEW.length);
  });

  it("builds benchmark sparklines", () => {
    const quote = mockBenchmarkQuote(MARKET_OVERVIEW[0]!);
    expect(quote.sparkline).toHaveLength(30);
    expect(quote.value).toBe(quote.sparkline.at(-1));
  });
});
