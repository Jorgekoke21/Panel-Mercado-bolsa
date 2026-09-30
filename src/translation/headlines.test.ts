import { describe, expect, it, vi } from "vitest";
import { headlineCacheKey, localizeHeadlines, type HeadlineInput, type HeadlineTranslation, type TranslationCache, type TranslationProvider } from "./headlines";

const nvidia: HeadlineInput = {
  id: "event:nvda",
  title: "Nvidia launches record $150bn share buyback",
  originalLanguage: "en",
  originalUrl: "https://example.org/nvda",
  source: "Reuters",
};

function fixture() {
  const values = new Map<string, string>();
  const provider: TranslationProvider = {
    id: "local",
    version: "v1",
    translateBatch: vi.fn(async (texts: readonly string[]) => texts.map(() => "Nvidia anuncia una recompra récord de acciones por 150.000 millones de dólares")),
  };
  const cache: TranslationCache = {
    getMany: vi.fn(async (keys: readonly string[]) => new Map(keys.filter((key) => values.has(key)).map((key) => [key, values.get(key)!]))),
    putMany: vi.fn(async (entries: readonly HeadlineTranslation[]) => { entries.forEach((entry) => values.set(entry.key, entry.translatedTitle)); }),
  };
  return { provider, cache, values };
}

describe("dynamic headline localization", () => {
  it("shows Spanish while preserving original metadata and reuses the persisted cache", async () => {
    const { provider, cache } = fixture();
    const [first] = await localizeHeadlines([nvidia], "es", provider, cache);
    expect(first?.headline).toEqual({ title: "Nvidia anuncia una recompra récord de acciones por 150.000 millones de dólares", language: "es", status: "translated", provider: "local" });
    expect(first).toMatchObject(nvidia);
    const [again] = await localizeHeadlines([nvidia], "es", provider, cache);
    expect(again?.headline).toEqual(first?.headline);
    expect(provider.translateBatch).toHaveBeenCalledTimes(1);
  });

  it("uses original English after an ES to EN switch, then cached Spanish after EN to ES", async () => {
    const { provider, cache } = fixture();
    await localizeHeadlines([nvidia], "es", provider, cache);
    const [english] = await localizeHeadlines([nvidia], "en", provider, cache);
    expect(english?.headline).toEqual({ title: nvidia.title, language: "en", status: "original", provider: null });
    const [spanish] = await localizeHeadlines([nvidia], "es", provider, cache);
    expect(spanish?.headline.status).toBe("translated");
    expect(provider.translateBatch).toHaveBeenCalledTimes(1);
  });

  it("marks original fallback when translation fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { cache } = fixture();
    const provider: TranslationProvider = { id: "local", version: "v1", translateBatch: vi.fn(async () => { throw new Error("local model unavailable"); }) };
    const [result] = await localizeHeadlines([nvidia], "es", provider, cache);
    expect(result?.headline).toEqual({ title: nvidia.title, language: "en", status: "fallback", provider: null });
    expect(cache.putMany).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it("stops retrying a failed local provider across a large page", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { cache } = fixture();
    const provider: TranslationProvider = { id: "local", version: "v1", batchSize: 1, translateBatch: vi.fn(async () => { throw new Error("service down"); }) };
    const events = Array.from({ length: 36 }, (_, index) => ({ ...nvidia, id: `event:${index}` }));
    const result = await localizeHeadlines(events, "es", provider, cache);
    expect(result.every((event) => event.headline.status === "fallback")).toBe(true);
    expect(provider.translateBatch).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });

  it("invalidates on title, source, language, URL, locale, provider or version change", () => {
    const { provider } = fixture();
    const key = headlineCacheKey(nvidia, "es", provider);
    expect(headlineCacheKey({ ...nvidia, title: "Revised title" }, "es", provider)).not.toBe(key);
    expect(headlineCacheKey({ ...nvidia, source: "SEC" }, "es", provider)).not.toBe(key);
    expect(headlineCacheKey({ ...nvidia, originalLanguage: "de" }, "es", provider)).not.toBe(key);
    expect(headlineCacheKey({ ...nvidia, originalUrl: "https://example.org/new" }, "es", provider)).not.toBe(key);
    expect(headlineCacheKey(nvidia, "en", provider)).not.toBe(key);
    expect(headlineCacheKey(nvidia, "es", { ...provider, id: "other" })).not.toBe(key);
    expect(headlineCacheKey(nvidia, "es", { ...provider, version: "v2" })).not.toBe(key);
  });
});
