import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyMarketCap } from "@/lib/calculations/market-cap";
import { checkClassShares, type CoverData, parseCoverInstance, resolveSecurityClass } from "./cover";

/**
 * Fixtures: instancias XBRL REALES de filings (2026) reducidas a los hechos de portada y BPA
 * (`__fixtures__/covers/*.xml`). Tests offline.
 */
const cover = (name: string): CoverData => parseCoverInstance(readFileSync(join(__dirname, "__fixtures__", "covers", `${name}.xml`), "utf8"));

function resolveAndCheck(name: string, ticker: string) {
  const c = cover(name);
  const resolved = resolveSecurityClass(c, ticker);
  if (!resolved.ok) return { resolved, check: null };
  return { resolved, check: checkClassShares(c, resolved) };
}

describe("SEC cover page: shares by share class", () => {
  it("Alphabet: GOOGL → Class A and GOOG → Class C via dei:TradingSymbol; unlisted Class B never assigned", () => {
    const c = cover("googl");
    expect(c.classes.map((x) => [x.member, x.shares])).toEqual(
      expect.arrayContaining([
        ["us-gaap:CommonClassAMember", 5_868_000_000],
        ["us-gaap:CommonClassBMember", 835_000_000],
        ["goog:CapitalClassCMember", 5_527_000_000],
      ]),
    );
    const a = resolveAndCheck("googl", "GOOGL");
    const cc = resolveAndCheck("googl", "GOOG");
    expect(a.resolved).toMatchObject({ ok: true, member: "us-gaap:CommonClassAMember", via: "symbol_dimension" });
    expect(cc.resolved).toMatchObject({ ok: true, member: "goog:CapitalClassCMember", shares: 5_527_000_000 });
    // Alphabet publica el BPA por clase: comprobación con la media de la MISMA clase.
    expect(a.check).toMatchObject({ status: "consistent", rule: "class_weighted_average" });
    // No se duplica: cada security usa solo las acciones de su clase.
    expect((a.resolved as { shares: number }).shares + (cc.resolved as { shares: number }).shares).toBeLessThan(5_868_000_000 + 835_000_000 + 5_527_000_000);
  });

  it("META: undimensioned symbol mapped to Class A through its registered title (Class B is unlisted)", () => {
    const r = resolveAndCheck("meta", "META");
    expect(r.resolved).toMatchObject({ ok: true, member: "us-gaap:CommonClassAMember", via: "security_title" });
    expect(r.check?.status).toBe("consistent");
  });

  it("BF.B → non-voting class (symbol BFB in the filing); TKO Up-C → listed class vs total EPS shares", () => {
    expect(resolveAndCheck("bfb", "BF.B").resolved).toMatchObject({ ok: true, member: "us-gaap:NonvotingCommonStockMember" });
    const tko = resolveAndCheck("tko", "TKO");
    expect(tko.check).toMatchObject({ status: "consistent", rule: "listed_class_total" });
  });

  it("BRK.B: Class B shares are resolved, but EPS shares are only reported as class equivalents ⇒ no reference (stays UNVERIFIED)", () => {
    const r = resolveAndCheck("brk", "BRK.B");
    expect(r.resolved).toMatchObject({ ok: true, member: "us-gaap:CommonClassBMember", via: "symbol_dimension" });
    expect(r.check?.status).toBe("no_reference");
    const cap = verifyMarketCap({
      price: 503.09,
      priceDate: "2026-09-28",
      shares: null,
      providerMarketCap: null,
      isMultiClass: true,
      shareClass: { status: "no_reference", shares: (r.resolved as { shares: number }).shares, asOfDate: "2026-07-20", note: null },
    });
    expect(cap).toMatchObject({ status: "UNVERIFIED", reason: "no_independent_reference" });
  });

  it("XOM (single class, symbol with a member but one undimensioned cover figure) and IBKR (ambiguous title) ", () => {
    expect(resolveAndCheck("xom", "XOM").resolved).toMatchObject({ ok: true, member: null, via: "single_class" });
    expect(resolveAndCheck("xom", "XOM").check?.status).toBe("consistent");
    const ibkr = resolveAndCheck("ibkr", "IBKR");
    expect(ibkr.resolved).toMatchObject({ ok: false });
  });

  it("a class-verified market cap is VERIFIED for a multi-class security (price × shares of ITS class)", () => {
    const cap = verifyMarketCap({
      price: 250,
      priceDate: "2026-09-28",
      shares: null,
      providerMarketCap: null,
      isMultiClass: true,
      shareClass: { status: "consistent", shares: 5_868_000_000, asOfDate: "2026-07-17", note: null },
    });
    expect(cap).toMatchObject({ status: "VERIFIED", reason: "consistent_with_filing_eps_shares", calculated: 250 * 5_868_000_000 });
    const stale = verifyMarketCap({ price: 250, priceDate: "2026-09-28", shares: null, providerMarketCap: null, isMultiClass: true, shareClass: { status: "consistent", shares: 1, asOfDate: "2025-12-01", note: null } });
    expect(stale.reason).toBe("shares_outstanding_stale");
  });
});
