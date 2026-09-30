import type { SecurityMarketSnapshot } from "@/domain/market-data";
import type { RatioResult } from "@/lib/calculations/ratios";
import type { LearnConcept } from "./ask-router";
import { type Claim, ContextPack } from "./evidence";

/**
 * LEARNING MODE — explica un concepto con los datos REALES de la empresa que se está viendo.
 * Si falta el dato, el ejemplo dice UNKNOWN: nunca se inventa una cifra "ilustrativa".
 */
export interface LearnInput {
  concept: LearnConcept;
  ticker: string;
  companyName: string;
  currency: string;
  snapshot: SecurityMarketSnapshot | null;
  ratios: readonly RatioResult[];
  asOf: string | null;
  priceSource: string;
  /** Último BPA diluido anual reportado a la SEC. */
  eps?: { value: number; periodEnd: string } | null;
}

export interface LearnCard {
  concept: LearnConcept;
  title: string;
  definition: string;
  formula: string;
  howToRead: string;
  example: Claim[];
  pack: ContextPack;
  caveat: string;
}

const DEFS: Record<LearnConcept, { title: string; definition: string; formula: string; howToRead: string; caveat: string }> = {
  pe: { title: "P/E (price-to-earnings)", definition: "How many dollars investors pay today for one dollar of the company's annual profit.", formula: "Market cap / net income over the last 12 months (equivalently price / EPS)", howToRead: "Higher P/E = the market expects more future growth or sees lower risk. Compare it with the company's own history and with peers, not in isolation.", caveat: "Negative or tiny earnings make P/E meaningless. One-off gains or charges distort it." },
  fcf_yield: { title: "FCF yield", definition: "Free cash flow the business generated over the last year relative to what the whole company costs today.", formula: "(Operating cash flow − capex) over the last 12 months / market cap", howToRead: "A higher yield means more cash generated per dollar of market value. It is the inverse of a price/FCF multiple.", caveat: "Capex timing makes FCF lumpy; banks and insurers are not analysed this way." },
  rsi: { title: "RSI 14 (relative strength index)", definition: "A 0–100 momentum oscillator comparing the size of recent gains with recent losses over 14 sessions.", formula: "100 − 100 / (1 + average gain / average loss), 14 sessions (Wilder smoothing)", howToRead: "Above 70 is conventionally called 'overbought' and below 30 'oversold'. It describes recent momentum, not value.", caveat: "Strong trends can stay above 70 or below 30 for a long time." },
  market_cap: { title: "Market capitalization", definition: "Total market value of a company's shares.", formula: "Share price × shares outstanding (per share class)", howToRead: "Used to size companies and to weight cap-weighted indices.", caveat: "MarketRadar only shows VERIFIED market caps (share counts checked against SEC filings)." },
  relative_volume: { title: "Relative volume", definition: "Trading volume of the last session compared with its usual level.", formula: "Last-session volume / average volume of the previous 20 sessions", howToRead: "Above ~2x signals unusual interest (news, earnings, index events). It says nothing about direction.", caveat: "Index rebalances and option expiries inflate volume without company news." },
  revenue_growth: { title: "Revenue growth", definition: "How fast sales are growing compared with a year earlier.", formula: "Revenue (period) / revenue (same period a year earlier) − 1", howToRead: "Sustained growth usually supports higher valuations; decelerating growth often matters as much as the level.", caveat: "Acquisitions and currency effects can inflate or depress reported growth." },
  operating_margin: { title: "Operating margin", definition: "Share of revenue left after operating costs, before interest and taxes.", formula: "Operating income / revenue", howToRead: "Higher margins mean more pricing power or efficiency. Compare within the same industry.", caveat: "Not meaningful for banks (different income statement structure)." },
  roe: { title: "ROE (return on equity)", definition: "Profit generated per dollar of shareholders' equity.", formula: "Net income (TTM) / average shareholders' equity", howToRead: "High ROE can mean a strong business or simply high leverage — check debt as well.", caveat: "Buybacks shrink equity and can inflate ROE; negative equity makes it meaningless." },
  sma200: { title: "200-day moving average", definition: "Average closing price of the last 200 sessions: a slow trend line.", formula: "Mean of the last 200 closes", howToRead: "Price above a rising SMA 200 is conventionally read as a long-term uptrend.", caveat: "A lagging indicator: it confirms trends, it does not predict them." },
  range_52w: { title: "52-week range", definition: "Lowest and highest price of the last 52 weeks.", formula: "min / max of closes over 52 weeks", howToRead: "Where the price sits within its range gives quick context on the past year's trend.", caveat: "Based on split-adjusted closes (MarketRadar), not intraday extremes." },
  eps: { title: "EPS (earnings per share)", definition: "Net income attributable to each share.", formula: "Net income to common / weighted-average diluted shares", howToRead: "Growth in EPS is what ultimately supports the share price over long periods.", caveat: "MarketRadar only uses reported (SEC) diluted EPS; adjusted 'non-GAAP' EPS differs." },
};

const RATIO_FOR: Partial<Record<LearnConcept, RatioResult["id"]>> = { pe: "pe", fcf_yield: "fcf_yield", revenue_growth: "revenue_growth", operating_margin: "operating_margin", roe: "roe", market_cap: "market_cap", eps: "eps_growth" };

function fmtRatio(r: RatioResult, currency: string): string {
  if (r.value === null) return "n/a";
  if (r.unit === "percent") return `${(r.value * 100).toFixed(1)}%`;
  if (r.unit === "multiple") return `${r.value.toFixed(1)}x`;
  return `${currency} ${(r.value / 1e9).toFixed(1)} billion`;
}

export function buildLearnCard(input: LearnInput): LearnCard {
  const def = DEFS[input.concept];
  const pack = new ContextPack();
  const example: Claim[] = [];
  const s = input.snapshot;
  const ratioId = RATIO_FOR[input.concept];
  if (ratioId && input.concept !== "eps") {
    const r = input.ratios.find((x) => x.id === ratioId);
    if (r && r.status === "ok" && r.value !== null) {
      const text = `${input.ticker} ${r.label}: ${fmtRatio(r, input.currency)} (${r.formula}; inputs: ${r.inputs.join("; ")})`;
      const values = r.unit === "percent" ? [Math.round(r.value * 1000) / 10] : r.unit === "multiple" ? [Math.round(r.value * 10) / 10] : [Math.round((r.value / 1e9) * 10) / 10];
      const id = pack.add({ id: `md:${input.ticker}:${r.id}`, kind: "MARKET_DATA", text, values, source: "MarketRadar (SEC XBRL + Alpaca prices)", asOf: input.asOf ?? undefined });
      example.push({ text: `${input.companyName} (${input.ticker}) today: ${r.label} = ${fmtRatio(r, input.currency)}.`, kind: "MARKET_DATA", evidenceIds: [id] });
      for (const inp of r.inputs.slice(0, 3)) example.push({ text: `Input used: ${inp}.`, kind: "MARKET_DATA", evidenceIds: [id] });
    } else {
      example.push({ text: `${input.ticker}: ${def.title} is not available (${r?.reason ?? "not computed for this company"}).`, kind: "UNKNOWN", evidenceIds: [] });
    }
  } else if (input.concept === "rsi" || input.concept === "relative_volume" || input.concept === "sma200" || input.concept === "range_52w") {
    if (!s) example.push({ text: `No real market snapshot for ${input.ticker}.`, kind: "UNKNOWN", evidenceIds: [] });
    else {
      const add = (label: string, value: number | null, fmt: (v: number) => string, round: (v: number) => number) => {
        if (value === null) {
          example.push({ text: `${label} not available for ${input.ticker}.`, kind: "UNKNOWN", evidenceIds: [] });
          return;
        }
        const id = pack.add({ id: `md:${input.ticker}:${label}`, kind: "MARKET_DATA", text: `${input.ticker} ${label} ${fmt(value)} (session ${s.asOfDate})`, values: [round(value)], source: input.priceSource, asOf: s.asOfDate ?? undefined });
        example.push({ text: `${input.ticker} ${label}: ${fmt(value)} (session ${s.asOfDate}).`, kind: "MARKET_DATA", evidenceIds: [id] });
      };
      const two = (v: number) => v.toFixed(2);
      const r2 = (v: number) => Math.round(v * 100) / 100;
      if (input.concept === "rsi") add("RSI 14", s.rsi14, (v) => v.toFixed(1), (v) => Math.round(v * 10) / 10);
      if (input.concept === "relative_volume") add("relative volume", s.relativeVolume, (v) => `${v.toFixed(1)}x`, (v) => Math.round(v * 10) / 10);
      if (input.concept === "sma200") {
        add("close", s.price, two, r2);
        add("SMA 200", s.sma200, two, r2);
      }
      if (input.concept === "range_52w") {
        add("52-week low", s.low52w, two, r2);
        add("52-week high", s.high52w, two, r2);
        add("close", s.price, two, r2);
      }
    }
  } else if (input.concept === "eps" && input.eps) {
    const id = pack.add({ id: `md:${input.ticker}:eps`, kind: "MARKET_DATA", text: `${input.ticker} diluted EPS ${input.eps.value.toFixed(2)} (fiscal year ended ${input.eps.periodEnd}, SEC filing)`, values: [Math.round(input.eps.value * 100) / 100], source: "SEC XBRL (reported)", asOf: input.eps.periodEnd });
    example.push({ text: `${input.companyName} reported diluted EPS of ${input.eps.value.toFixed(2)} for the fiscal year ended ${input.eps.periodEnd}.`, kind: "MARKET_DATA", evidenceIds: [id] });
  } else {
    example.push({ text: `No real data example available for ${def.title} (${input.ticker}).`, kind: "UNKNOWN", evidenceIds: [] });
  }
  return { concept: input.concept, ...def, example, pack };
}
