import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors";
import { EodhdAdapter } from "./adapter";
import { EodhdClient } from "./client";

const TOKEN = "secret-token-123456";

function response(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

function clientWith(responses: (Response | Error)[]) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const client = new EodhdClient({ token: TOKEN, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, maxRetries: 2 });
  return { client, fetchImpl };
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

describe("EODHD client — typed provider errors", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "not_found"],
    [400, "invalid_response"],
  ] as const)("HTTP %i → %s (no retry)", async (status, kind) => {
    const { client, fetchImpl } = clientWith([response(status, "Ticker Not Found.")]);
    const error = await failure(client.getJson("/eod/NOPE.US"));
    expect(error.kind).toBe(kind);
    expect(error.details.status).toBe(status);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("402 (daily quota) is rate_limited and is NOT retried", async () => {
    const { client, fetchImpl } = clientWith([response(402, "You exceeded your daily API requests limit")]);
    const error = await failure(client.getJson("/eod/AAPL.US"));
    expect(error.kind).toBe("rate_limited");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("429 is retried honouring Retry-After, then succeeds", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, "Too Many Requests", { "retry-after": "2" }))
      .mockResolvedValueOnce(response(200, "[]"));
    const client = new EodhdClient({ token: TOKEN, fetchImpl, sleep: async (ms) => void sleeps.push(ms) });
    await expect(client.getJson("/eod/AAPL.US")).resolves.toEqual([]);
    expect(sleeps).toEqual([2000]);
    expect(client.requestCount).toBe(2);
  });

  it("5xx and network failures are transient and retried up to the limit", async () => {
    const { client, fetchImpl } = clientWith([response(502, "Bad gateway"), new TypeError("fetch failed"), response(503, "busy")]);
    const error = await failure(client.getJson("/eod/AAPL.US"));
    expect(error.kind).toBe("transient");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("a non-JSON 200 body is invalid_response (never an empty result)", async () => {
    const { client } = clientWith([response(200, "<html>maintenance</html>")]);
    expect((await failure(client.getJson("/eod/AAPL.US"))).kind).toBe("invalid_response");
  });

  it("never leaks the API token in error messages", async () => {
    const { client } = clientWith([response(401, `Unauthenticated token ${TOKEN}`), new Error(`connect ECONNRESET https://eodhd.com/api/eod?api_token=${TOKEN}`)]);
    const auth = await failure(client.getJson("/eod/AAPL.US"));
    expect(auth.message).not.toContain(TOKEN);
    expect(auth.operation).toBe("/eod/AAPL.US");
    const { client: other } = clientWith([new Error(`boom ${TOKEN}`), new Error(`boom ${TOKEN}`), new Error(`boom ${TOKEN}`)]);
    const transient = await failure(other.getJson("/eod/AAPL.US"));
    expect(transient.message).not.toContain(TOKEN);
    expect(transient.message).toContain("***");
  });

  it("refuses to start without a token", () => {
    expect(() => new EodhdClient({ token: "" })).toThrow(ProviderError);
  });
});

describe("EODHD adapter — response validation", () => {
  it("an unexpected response shape is invalid_response, not []", async () => {
    const { client } = clientWith([response(200, JSON.stringify({ error: "something" }))]);
    const adapter = new EodhdAdapter(client);
    const error = await failure(adapter.priceHistory.getDailyBars({ provider: "eodhd", symbol: "AAPL.US" }, { from: "2024-01-01", to: "2024-01-31" }));
    expect(error.kind).toBe("invalid_response");
  });

  it("a legitimately empty range is returned as an empty list", async () => {
    const { client } = clientWith([response(200, "[]")]);
    const adapter = new EodhdAdapter(client);
    const result = await adapter.priceHistory.getDailyBars({ provider: "eodhd", symbol: "AAPL.US" }, { from: "2030-01-01", to: "2030-01-31" });
    expect(result).toMatchObject({ bars: [], volumeBasis: "split_adjusted" });
  });

  it("rejects identifiers that belong to another provider", async () => {
    const { client } = clientWith([]);
    const adapter = new EodhdAdapter(client);
    await expect(adapter.corporateActions.getSplits({ provider: "other", symbol: "AAPL" })).rejects.toBeInstanceOf(ProviderError);
  });

  it("fetches /fundamentals once per symbol for profile, fundamentals, earnings and valuation", async () => {
    const body = JSON.stringify({ General: { Code: "AAPL", CIK: "0000320193", UpdatedAt: "2026-09-27" }, Valuation: { ForwardPE: 30 } });
    const { client, fetchImpl } = clientWith([response(200, body)]);
    const adapter = new EodhdAdapter(client);
    const symbol = { provider: "eodhd", symbol: "AAPL.US" };
    await adapter.profile.getProfile(symbol);
    await adapter.fundamentals.getFundamentals(symbol);
    await adapter.earnings.getEarnings(symbol);
    const valuation = await adapter.valuation.getValuation(symbol);
    expect(valuation.values).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
