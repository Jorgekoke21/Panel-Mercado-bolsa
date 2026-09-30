import { explainMove, type MoveInput } from "./explain-move";

const baseInput: MoveInput = {
  ticker: "NVDA",
  companyName: "NVIDIA Corporation",
  range: "1D",
  asOfDate: "2026-09-28",
  securityReturn: 0.017,
  industry: { name: "Semiconductors & Semiconductor Equipment", return: -0.004 },
  sector: { name: "Information Technology", return: -0.007 },
  market: { name: "S&P 500 constituents (synthetic)", return: -0.008 },
  relativeVolume: 1.2,
  dailyVolatility: 0.0267,
  rsi14: 52,
  events: [],
  filings: [],
  source: "Alpaca (SIP)",
};

describe("explainMove locale", () => {
  it("localizes generated Spanish claims and evidence while preserving original source headlines", () => {
    const move = explainMove({
      ...baseInput,
      securityReturn: -0.08,
      events: [{
        eventId: "event-1",
        title: "NVIDIA reports quarterly results",
        type: "EARNINGS",
        lastSeenAt: "2026-09-28T20:00:00Z",
        firstSeenAt: "2026-09-28T19:00:00Z",
        scope: "company",
        direction: "potential_negative",
        confidence: 0.9,
        official: false,
      }],
    }, "es");

    expect(move.claims[0]?.text).toContain("se movió");
    expect(move.claims[0]?.text).toContain("−8,0");
    expect(move.claims.some((claim) => claim.text.includes("Sin movimiento inusual"))).toBe(false);
    expect(move.claims.some((claim) => claim.text === "Probablemente relacionado: NVIDIA reports quarterly results")).toBe(true);
    expect(move.pack.all().some((item) => item.text === "Resultados: NVIDIA reports quarterly results")).toBe(true);
    expect(move.pack.all().some((item) => item.text.includes("−8,0"))).toBe(true);
  });

  it("formats generated claims in English when requested", () => {
    const move = explainMove(baseInput, "en");

    expect(move.claims[0]?.text).toContain("moved +1.7%");
    expect(move.claims.some((claim) => claim.text === "Relative volume 1.2×.")).toBe(true);
    expect(move.claims.some((claim) => claim.text.startsWith("No unusual move:"))).toBe(true);
  });
});
