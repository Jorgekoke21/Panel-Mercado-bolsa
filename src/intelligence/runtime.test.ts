import { z } from "zod";
import { readAiConfig } from "./config";
import { ContextPack } from "./evidence";
import { AiRuntime } from "./runtime";
import { MemoryAiCache, MemorySpendLedger } from "./cost-guard";
import type { LlmProvider, LlmRequest, LlmResult } from "./llm";
import type { Locale } from "@/i18n/messages";

describe("AI locale propagation", () => {
  it("sends the locale to the provider and isolates cache entries by locale", async () => {
    const requests: LlmRequest<unknown>[] = [];
    const provider: LlmProvider = {
      id: "test-provider",
      modelFor: () => "gpt-6-luna",
      async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
        requests.push(request as LlmRequest<unknown>);
        return {
          output: { answer: "Evidence was checked." } as T,
          model: "gpt-6-luna",
          usage: { inputTokens: 20, outputTokens: 8, cachedInputTokens: 0 },
          costUsd: 0.0001,
        };
      },
    };
    const now = () => new Date("2026-09-30T12:00:00Z");
    const runtime = new AiRuntime({
      config: readAiConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "test", AI_ALLOW_PAID_CALLS: "true", AI_DAILY_BUDGET_USD: "10", AI_MONTHLY_BUDGET_USD: "10" }),
      provider,
      cache: new MemoryAiCache(),
      ledger: new MemorySpendLedger(),
      now,
    });
    const pack = new ContextPack();
    pack.add({ id: "evidence:1", kind: "MARKET_DATA", text: "MarketRadar observed a move.", values: [], source: "MarketRadar" });
    const schema = z.object({ answer: z.string() });
    const run = (locale: Locale) => runtime.run({
      locale,
      feature: "ask",
      task: "locale-propagation",
      subject: "NVDA",
      promptVersion: "test-v1",
      schemaName: "test_answer",
      schema,
      instructions: "Return a grounded answer.",
      input: { question: "What happened?" },
      pack,
      tier: "fast",
      claimsOf: () => [{ text: "The evidence was checked.", kind: "MARKET_DATA", evidenceIds: ["evidence:1"] }],
    });

    await run("es");
    await run("en");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.system).toContain("Write all user-facing prose in Spanish");
    expect(requests[1]?.system).toContain("Write all user-facing prose in English");
    expect(requests[0]?.input).toMatchObject({ locale: "es" });
    expect(requests[1]?.input).toMatchObject({ locale: "en" });
  });
});
