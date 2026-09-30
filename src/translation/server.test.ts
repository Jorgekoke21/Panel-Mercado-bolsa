import { describe, expect, it, vi } from "vitest";
import { LibreTranslateProvider, OllamaTranslateGemmaProvider } from "./server";

describe("local translation adapters", () => {
  it("calls TranslateGemma with the documented translation prompt", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      expect(request.model).toBe("translategemma:4b");
      expect(request.stream).toBe(false);
      expect(request.messages[0].content).toContain("English (en) to Spanish (es)");
      expect(request.messages[0].content).toContain("\n\n\nNvidia launches");
      return new Response(JSON.stringify({ message: { content: "Nvidia anuncia una recompra" } }), { status: 200 });
    });
    const adapter = new OllamaTranslateGemmaProvider("translategemma:4b", "http://127.0.0.1:11434", fetcher as typeof fetch);
    expect(await adapter.translateBatch(["Nvidia launches"], "en", "es")).toEqual(["Nvidia anuncia una recompra"]);
    expect(adapter.batchSize).toBe(1);
  });

  it("keeps LibreTranslate as a free provider behind the same interface", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toMatchObject({ q: ["Hello"], source: "en", target: "es" });
      return new Response(JSON.stringify({ translatedText: ["Hola"] }), { status: 200 });
    });
    const adapter = new LibreTranslateProvider("argos-v1", "http://127.0.0.1:5000", fetcher as typeof fetch);
    expect(await adapter.translateBatch(["Hello"], "en", "es")).toEqual(["Hola"]);
  });
});
