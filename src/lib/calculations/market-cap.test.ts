import { describe, expect, it } from "vitest";
import { isLikelyMultiClass, verifyMarketCap, WEIGHTED_AVERAGE_TOLERANCE } from "./market-cap";

const base = {
  price: 338.4,
  priceDate: "2026-09-28",
  shares: { value: 14_594_180_000, asOfDate: "2026-09-27" },
  providerMarketCap: { value: 4_977_636_933_632, asOfDate: "2026-09-27" },
  isMultiClass: false,
};

describe("market cap verification", () => {
  it("VERIFIED when single-class and consistent with the provider market cap (AAPL demo values)", () => {
    const check = verifyMarketCap(base);
    expect(check.status).toBe("VERIFIED");
    expect(check.calculated).toBeCloseTo(338.4 * 14_594_180_000);
    expect(check.deviation).toBeLessThan(0.01);
  });

  it("MISSING without price or shares", () => {
    expect(verifyMarketCap({ ...base, shares: null })).toMatchObject({ status: "MISSING", reason: "missing_shares_outstanding", calculated: null });
    expect(verifyMarketCap({ ...base, price: null })).toMatchObject({ status: "MISSING", reason: "missing_price" });
  });

  it("UNVERIFIED without an independent reference, with stale shares or when it deviates", () => {
    expect(verifyMarketCap({ ...base, providerMarketCap: null }).reason).toBe("no_independent_reference");
    expect(verifyMarketCap({ ...base, shares: { ...base.shares, asOfDate: "2025-12-31" } }).reason).toBe("shares_outstanding_stale");
    const off = verifyMarketCap({ ...base, providerMarketCap: { value: 3e12, asOfDate: "2026-09-27" } });
    expect(off).toMatchObject({ status: "UNVERIFIED", reason: "deviates_from_provider_market_cap" });
  });
});

describe("multi-class market cap safety", () => {
  it("never verifies price × shares for a class share, even if it matches the provider", () => {
    const check = verifyMarketCap({ ...base, isMultiClass: true });
    expect(check).toMatchObject({ status: "UNVERIFIED", reason: "multi_class_share_scope_unverified" });
    // El cálculo se conserva como información, pero no se publica.
    expect(check.calculated).not.toBeNull();
  });

  it("detects class shares: explicit class, several listings or a class suffix (BRK.B, BF.B)", () => {
    expect(isLikelyMultiClass({ ticker: "BRK.B", shareClass: null, listingsOfIssuer: 1 })).toBe(true);
    expect(isLikelyMultiClass({ ticker: "BF.B", shareClass: null, listingsOfIssuer: 1 })).toBe(true);
    expect(isLikelyMultiClass({ ticker: "GOOGL", shareClass: "A", listingsOfIssuer: 2 })).toBe(true);
    expect(isLikelyMultiClass({ ticker: "AAPL", shareClass: null, listingsOfIssuer: 1 })).toBe(false);
  });
});

describe("market cap cross-check against SEC weighted-average shares", () => {
  const sec = { price: 100, priceDate: "2026-09-28", providerMarketCap: null, isMultiClass: false };

  it("VERIFIED within 15 % of the latest diluted weighted-average shares (buybacks, issuance, dilution move it)", () => {
    // TSLA: portada 3.95B vs diluidas 3.54B (+11.6 %).
    const tsla = verifyMarketCap({ ...sec, shares: { value: 3_949_547_394, asOfDate: "2026-07-16" }, referenceShares: { value: 3_540_000_000, asOfDate: "2026-06-30" } });
    expect(tsla).toMatchObject({ status: "VERIFIED", reason: "consistent_with_weighted_average_shares" });
    const far = verifyMarketCap({ ...sec, shares: { value: 2e9, asOfDate: "2026-07-16" }, referenceShares: { value: 1e9, asOfDate: "2026-06-30" } });
    expect(far).toMatchObject({ status: "UNVERIFIED", reason: "shares_inconsistent_with_weighted_average" });
    expect(WEIGHTED_AVERAGE_TOLERANCE).toBe(0.15);
  });

  it("re-expresses pre-split references in the post-split share basis (KLAC 10:1)", () => {
    const klac = {
      ...sec,
      shares: { value: 1_306_546_783, asOfDate: "2026-08-03" },
      referenceShares: { value: 131_750_000, asOfDate: "2026-03-31" },
    };
    expect(verifyMarketCap(klac).status).toBe("UNVERIFIED");
    expect(verifyMarketCap({ ...klac, splits: [{ exDate: "2026-06-15", shareFactor: 10 }] }).status).toBe("VERIFIED");
    // Acciones de portada ANTERIORES a un split posterior: también se re-expresan (precio post-split).
    const pre = verifyMarketCap({ ...sec, shares: { value: 130_000_000, asOfDate: "2026-05-01" }, referenceShares: { value: 131_750_000, asOfDate: "2026-03-31" }, splits: [{ exDate: "2026-06-15", shareFactor: 10 }] });
    expect(pre.calculated).toBe(100 * 1_300_000_000);
  });

  it("falls back to basic weighted-average shares when the diluted figure is mis-tagged (MCD 711.1)", () => {
    const mcd = { ...sec, shares: { value: 707_641_531, asOfDate: "2026-06-30" }, referenceShares: { value: 711.1, asOfDate: "2026-06-30" } };
    expect(verifyMarketCap(mcd).status).toBe("UNVERIFIED");
    expect(verifyMarketCap({ ...mcd, alternateReferenceShares: { value: 708_500_000, asOfDate: "2026-06-30" } }).status).toBe("VERIFIED");
  });
});
