import { MockMarketDataRepository } from "@/data/mock/mock-market-data";
import { MemoryReferenceRepository, type MemoryReferenceData } from "@/data/memory/memory-reference-repository";
import type { MarketIndex } from "@/domain/market-index";
import type { ClassificationPath, SecuritySummary } from "@/domain/reference";
import { getCompaniesList, getCompanyHeader, getCompanyPeers, parseCompaniesParams } from "./companies";
import { getSectorPageData, getSectorsOverview, getSubIndustryPageData } from "./classification";
import { getDashboardData } from "./dashboard";
import { getIndexPageData, getMarketsOverview } from "./markets";
import type { Repositories } from "./market-rows";
import { MemoryPriceHistoryRepository } from "@/data/memory/memory-price-history-repository";
import { MemoryFundamentalsRepository } from "@/data/memory/memory-fundamentals-repository";
import { MemoryNewsRepository } from "@/data/memory/memory-news-repository";
import { MemoryGroupIndexRepository } from "@/data/memory/memory-group-index-repository";

const node = (id: string, code: string, name: string) => ({ id, taxonomyCode: "GICS", code, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") });

const TECH = node("sec-it", "45", "Information Technology");
const SEMI_GROUP = node("ig-semi", "4530", "Semiconductors & Semiconductor Equipment");
const SEMI_IND = node("ind-semi", "453010", "Semiconductors & Semiconductor Equipment");
const SEMIS = node("sub-semi", "45301020", "Semiconductors");
const ENERGY = node("sec-en", "10", "Energy");
const OIL_GROUP = node("ig-en", "1010", "Energy");
const OIL_IND = node("ind-oil", "101020", "Oil, Gas & Consumable Fuels");
const INTEGRATED = node("sub-int", "10102010", "Integrated Oil & Gas");

const path = (sector: typeof TECH, group: typeof TECH, industry: typeof TECH, sub: typeof TECH): ClassificationPath => ({
  taxonomyCode: "GICS", sector, industryGroup: group, industry, subIndustry: sub,
});

function security(ticker: string, companyId: string, cls: ClassificationPath, extra: Partial<SecuritySummary> = {}): SecuritySummary {
  return {
    securityId: `s-${ticker}`,
    ticker,
    securityName: ticker,
    currency: "USD",
    shareClass: null,
    isPrimary: true,
    companyId,
    companyName: `${ticker} Corp`,
    companySlug: ticker.toLowerCase(),
    exchange: { id: "x-nas", mic: "XNAS", name: "Nasdaq", acronym: "Nasdaq", countryCode: "US" },
    headquarters: { city: null, region: null, countryCode: "US", countryName: "United States" },
    classification: cls,
    ...extra,
  };
}

const semi = path(TECH, SEMI_GROUP, SEMI_IND, SEMIS);
const oil = path(ENERGY, OIL_GROUP, OIL_IND, INTEGRATED);
const SECURITIES = [
  security("NVDA", "c-nvda", semi),
  security("AMD", "c-amd", semi),
  security("AVGO", "c-avgo", semi),
  security("MU", "c-mu", semi),
  security("XOM", "c-xom", oil),
  security("CVX", "c-cvx", oil),
  security("GOOGL", "c-goog", semi, { shareClass: "A" }),
  security("GOOG", "c-goog", semi, { shareClass: "C", isPrimary: false }),
];

const SPX: MarketIndex = {
  id: "i-spx", code: "SPX", slug: "sp500", name: "S&P 500", shortName: "S&P 500", kind: "official", methodology: "provider",
  provider: "S&P Dow Jones Indices", countryCode: "US", currency: "USD", description: null, scope: null, constituentsTracked: true,
};
const NDX: MarketIndex = { ...SPX, id: "i-ndx", code: "NDX", slug: "nasdaq-100", name: "Nasdaq-100", shortName: "Nasdaq-100", provider: "Nasdaq", constituentsTracked: false };

const DATA: MemoryReferenceData = {
  indices: [SPX, NDX],
  memberships: SECURITIES.map((s) => ({ indexId: SPX.id, securityId: s.securityId, addedOn: "2020-01-01", datasetId: "d-sp500" })),
  sectors: [
    { ...ENERGY, sortOrder: 1 },
    { ...TECH, sortOrder: 2 },
  ],
  industryGroups: [
    { ...OIL_GROUP, sectorId: ENERGY.id },
    { ...SEMI_GROUP, sectorId: TECH.id },
  ],
  industries: [
    { ...OIL_IND, industryGroupId: OIL_GROUP.id },
    { ...SEMI_IND, industryGroupId: SEMI_GROUP.id },
  ],
  subIndustries: [
    { ...INTEGRATED, industryId: OIL_IND.id },
    { ...SEMIS, industryId: SEMI_IND.id },
  ],
  securities: SECURITIES,
  profiles: [],
  themes: [],
  datasets: [],
};

const repos = (): Repositories => ({
  reference: new MemoryReferenceRepository(DATA),
  marketData: new MockMarketDataRepository(() => new Date("2026-09-29T00:00:00Z")),
  priceHistory: new MemoryPriceHistoryRepository(),
  fundamentals: new MemoryFundamentalsRepository(),
  groupIndices: new MemoryGroupIndexRepository(),
  news: new MemoryNewsRepository(),
});

describe("services", () => {
  it("builds the dashboard from the primary universe with demo provenance", async () => {
    const data = await getDashboardData(repos(), "1D");
    expect(data.universe.securities).toBe(SECURITIES.length);
    expect(data.marketProvenance.isDemo).toBe(true);
    expect(data.heatmap.groups.map((g) => g.label).sort()).toEqual(["Energy", "Information Technology"]);
    expect(data.sectors).toHaveLength(2);
    expect(data.rankings.map((r) => r.definition.id)).toContain("top-gainers");
    // Breadth cuenta COMPAÑÍAS (una cotización por emisor): un emisor multiclase no pesa doble.
    const companies = new Set(SECURITIES.map((s) => s.companyId)).size;
    expect(data.universeStats.securities).toBe(SECURITIES.length);
    expect(data.universeStats.companies).toBe(companies);
    expect(data.universeStats.breadth.total).toBe(companies);
  });

  it("lists markets with constituent counts, tracked first", async () => {
    const { indices } = await getMarketsOverview(repos());
    expect(indices.map((i) => [i.index.code, i.constituents])).toEqual([["SPX", 8], ["NDX", 0]]);
  });

  it("returns index pages without constituents for untracked indices", async () => {
    expect((await getIndexPageData(repos(), "sp500", "1M"))?.constituents?.rows).toHaveLength(8);
    expect((await getIndexPageData(repos(), "nasdaq-100", "1M"))?.constituents).toBeNull();
    expect(await getIndexPageData(repos(), "unknown", "1M")).toBeNull();
  });

  it("aggregates sectors and drills down to industries and sub-industries", async () => {
    const overview = await getSectorsOverview(repos(), "1D");
    expect(overview.sectors.map((s) => [s.name, s.stats.performance.count, s.industries])).toEqual([
      ["Energy", 2, 1],
      ["Information Technology", 6, 1],
    ]);
    const sector = await getSectorPageData(repos(), TECH.slug, "1D");
    expect(sector?.industryGroups[0]?.industries[0]?.stats.performance.count).toBe(6);
    expect(sector?.crumbs).toEqual([{ kind: "sector", label: TECH.name, href: `/sector/${TECH.slug}` }]);
    const sub = await getSubIndustryPageData(repos(), SEMI_IND.slug, SEMIS.slug, "1D");
    expect(sub?.crumbs.map((c) => c.kind)).toEqual(["sector", "industry", "subIndustry"]);
    expect(await getSubIndustryPageData(repos(), SEMI_IND.slug, "missing", "1D")).toBeNull();
  });

  it("normalises tickers, redirects non-canonical URLs and 404s unknown ones", async () => {
    expect(await getCompanyHeader(repos(), "nvda")).toEqual({ kind: "redirect", ticker: "NVDA" });
    expect(await getCompanyHeader(repos(), "ZZZZ")).toEqual({ kind: "not_found" });
    expect(await getCompanyHeader(repos(), "<bad>")).toEqual({ kind: "not_found" });
    const found = await getCompanyHeader(repos(), "GOOGL");
    expect(found.kind).toBe("found");
    if (found.kind === "found") {
      expect(found.data.otherListings.map((l) => l.ticker)).toEqual(["GOOG"]);
      expect(found.data.memberships[0]?.indexCode).toBe("SPX");
      expect(found.data.crumbs.map((c) => c.kind)).toEqual(["sector", "industry", "subIndustry"]);
    }
  });

  it("uses REAL synced prices only for securities that have them, never mixing with demo in the header", async () => {
    const nvda = SECURITIES.find((s) => s.ticker === "NVDA")!;
    const bars = Array.from({ length: 30 }, (_, i) => {
      const close = 100 + i;
      const tradeDate = new Date(Date.UTC(2026, 7, 1) + i * 86_400_000).toISOString().slice(0, 10);
      return { tradeDate, open: close, high: close, low: close, close, volume: 10, providerAdjustedClose: close };
    });
    const withReal = (): Repositories => ({
      ...repos(),
      priceHistory: new MemoryPriceHistoryRepository(
        new Map([
          [
            nvda.securityId,
            {
              securityId: nvda.securityId,
              bars,
              volumeBasis: "split_adjusted",
              factors: [{ exDate: bars[10]!.tradeDate, kind: "split", priceFactor: 0.5, volumeFactor: 2, referenceClose: null, referenceDate: null }],
              source: "eodhd",
              datasetKey: "eodhd-eod-prices",
              datasetName: "EODHD end-of-day prices",
              lastIngestedAt: "2026-09-29T06:00:00Z",
              feed: null,
              qualityStatus: "PASS" as const,
              qualityNotes: [],
            },
          ],
        ]),
      ),
    });
    const real = await getCompanyHeader(withReal(), "NVDA");
    const demo = await getCompanyHeader(withReal(), "GOOGL");
    if (real.kind !== "found" || demo.kind !== "found") throw new Error("expected found");
    expect(real.data.provenance).toMatchObject({ source: "eodhd", sourceLabel: "EODHD", isDemo: false, frequency: "eod", asOf: bars.at(-1)!.tradeDate });
    expect(real.data.row.snapshot?.price).toBe(129);
    // Precio anterior al split ajustado ×0.5 en el gráfico (price return).
    expect(real.data.realMarketData?.chart.bars[0]?.close).toBe(50);
    expect(real.data.realMarketData?.chart.basis).toBe("price_return");
    expect(demo.data.provenance.isDemo).toBe(true);
    expect(demo.data.realMarketData).toBeNull();
  });

  it("publishes a market cap only when VERIFIED; class shares stay UNVERIFIED and hidden", async () => {
    const nvda = SECURITIES.find((s) => s.ticker === "NVDA")!;
    const googl = SECURITIES.find((s) => s.ticker === "GOOGL")!;
    const bars = Array.from({ length: 5 }, (_, i) => ({
      tradeDate: `2026-09-2${i + 1}`,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 10,
      providerAdjustedClose: 100,
    }));
    const history = (securityId: string) => ({
      securityId,
      bars,
      volumeBasis: "split_adjusted" as const,
      factors: [],
      source: "eodhd",
      datasetKey: "eodhd-eod-prices",
      datasetName: null,
      lastIngestedAt: "2026-09-26T06:00:00Z",
      feed: null,
      qualityStatus: "PASS" as const,
      qualityNotes: [],
    });
    const shares = { shares: 1_000, asOfDate: "2026-09-20", source: "eodhd" };
    const mcap = { value: 100_000, asOfDate: "2026-09-20", source: "eodhd" };
    const r: Repositories = {
      ...repos(),
      priceHistory: new MemoryPriceHistoryRepository(
        new Map([
          [nvda.securityId, history(nvda.securityId)],
          [googl.securityId, history(googl.securityId)],
        ]),
        new Map([
          [nvda.securityId, shares],
          [googl.securityId, shares],
        ]),
        new Map([
          [`${nvda.securityId}:market_cap`, mcap],
          [`${googl.securityId}:market_cap`, mcap],
        ]),
      ),
    };
    const single = await getCompanyHeader(r, "NVDA");
    const multi = await getCompanyHeader(r, "GOOGL");
    if (single.kind !== "found" || multi.kind !== "found") throw new Error("expected found");
    expect(single.data.realMarketData?.marketCap.status).toBe("VERIFIED");
    expect(single.data.row.snapshot?.marketCap).toBe(100_000);
    expect(multi.data.realMarketData?.marketCap).toMatchObject({ status: "UNVERIFIED", reason: "multi_class_share_scope_unverified" });
    expect(multi.data.row.snapshot?.marketCap).toBeNull();
  });

  it("derives peers from the classification excluding the company's own share classes", async () => {
    const peers = await getCompanyPeers(repos(), SECURITIES[0]!);
    expect(peers.scope).toBe("Semiconductors");
    expect(peers.rows.map((r) => r.ticker).sort()).toEqual(["AMD", "AVGO", "GOOGL", "MU"]);
  });

  it("filters, sorts and paginates the companies list", async () => {
    const query = parseCompaniesParams({ sector: ENERGY.slug, sort: "company", dir: "desc", page: "1" });
    const list = await getCompaniesList(repos(), query);
    expect(list.total).toBe(2);
    expect(list.rows.map((r) => r.ticker)).toEqual(["XOM", "CVX"]);
    expect(parseCompaniesParams({ sort: "evil", page: "-3" })).toMatchObject({ sort: "ticker", page: 1, dir: "asc" });
  });
});
