import { classificationLabel, marketDetailLabel } from "./classification";
import { aiStatusReason, eventFamilyLabel, eventTypeLabel, financialTerm, horizonLabel } from "./domain";
import { enumLabel, getMessages, normalizeLocale } from "./messages";
import { eventSummary, impactSummary } from "./templates";

describe("locale catalog and domain labels", () => {
  it("defaults safely to Spanish and falls back for unsupported locale values", () => {
    expect(normalizeLocale(undefined)).toBe("es");
    expect(normalizeLocale("fr")).toBe("es");
    expect(normalizeLocale("en")).toBe("en");
    expect(getMessages("es").navigation.dashboard).toBe("Panel");
    expect(getMessages("en").navigation.dashboard).toBe("Dashboard");
  });

  it("translates enums and domain concepts without changing identifiers", () => {
    expect(eventTypeLabel("es", "EARNINGS")).toBe("Resultados");
    expect(eventTypeLabel("en", "EARNINGS")).toBe("Earnings");
    expect(eventFamilyLabel("es", "geopolitics")).toBe("Geopolítica");
    expect(enumLabel("es", "potential_negative")).toBe("Posible impacto negativo");
    expect(horizonLabel("es", "weeks")).toBe("semanas");
    expect(financialTerm("es", "Gross profit")).toBe("Beneficio bruto");
    expect(classificationLabel("es", "Homebuilding")).toBe("Construcción residencial");
    expect(classificationLabel("en", "Homebuilding")).toBe("Homebuilding");
    expect(classificationLabel("es", "AI demand")).toBe("Demanda de IA");
    expect(classificationLabel("es", "Economic growth")).toBe("Crecimiento económico");
    expect(classificationLabel("es", "Data centers")).toBe("Centros de datos");
    expect(marketDetailLabel("es", "industry")).toBe("industria");
    expect(marketDetailLabel("es", "sector")).toBe("sector");
    expect(marketDetailLabel("es", "AAPL · price return")).toBe("AAPL · rendimiento del precio");
    expect(marketDetailLabel("en", "industry")).toBe("industry");
  });

  it("localizes AI status explanations while preserving provider identifiers", () => {
    expect(aiStatusReason("es", "AI_PROVIDER is not 'openai' — deterministic MarketRadar engine"))
      .toBe("AI_PROVIDER no es 'openai'; se usa el motor determinista de MarketRadar");
    expect(aiStatusReason("en", "AI_PROVIDER is not 'openai' — deterministic MarketRadar engine"))
      .toBe("AI_PROVIDER is not 'openai' — deterministic MarketRadar engine");
  });
});

describe("locale-native deterministic templates", () => {
  it("composes event summaries directly from metadata in each locale", () => {
    expect(eventSummary("es", "EARNINGS", 2, false, 2)).toBe("Resultados · 2 artículos · 2 fuentes independientes.");
    expect(eventSummary("en", "EARNINGS", 1, true, 1)).toBe("Earnings · 1 article · official source.");
  });

  it("composes impact explanations directly from structured direction, target, mechanism and horizon", () => {
    expect(impactSummary("es", "potential_negative", "Construcción residencial", "financing_cost", "weeks"))
      .toBe("Posible presión bajista sobre Construcción residencial por Coste de financiación; horizonte de semanas. Relación potencial, no predicción.");
    expect(impactSummary("en", "potential_positive", "Homebuilding", "demand", "weeks"))
      .toBe("Potential upward pressure on Homebuilding via Demand; weeks horizon. Potential relationship, not a prediction.");
    expect(impactSummary("es", "mixed_uncertain", "Mercado", "policy_reaction", "days"))
      .toContain("Posible efecto mixto o incierto");
  });
});
