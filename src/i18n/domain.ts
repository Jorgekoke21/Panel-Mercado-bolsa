import type { EventFamily, EventType } from "@/domain/news";
import type { EntityKind } from "@/domain/entity";
import type { LineItemCode } from "@/domain/fundamentals";
import type { Horizon, Mechanism } from "@/knowledge/types";
import type { TimeRange } from "@/domain/time-range";
import type { Locale } from "./messages";
import { EVENT_TYPE_DEFS } from "@/news/taxonomy";
import type { MarketCapReason, MarketCapStatus } from "@/lib/calculations/market-cap";

const EVENT_ES: Record<EventType, string> = {
  CENTRAL_BANK: "Bancos centrales", INFLATION: "Inflación", EMPLOYMENT: "Empleo", ECONOMIC_GROWTH: "Crecimiento económico", RATES_BONDS: "Tipos y bonos", CURRENCY: "Divisas", CREDIT: "Crédito", FISCAL_POLICY: "Política fiscal",
  TRADE_TARIFFS: "Comercio y aranceles", SANCTIONS_EXPORT_CONTROLS: "Sanciones y controles de exportación", REGULATION: "Regulación", ANTITRUST: "Competencia y antimonopolio", ELECTION_POLITICS: "Elecciones y política", GEOPOLITICAL_CONFLICT: "Geopolítica y conflictos",
  ENERGY_MARKETS: "Energía", METALS_MINING: "Metales y minería", AGRICULTURE: "Agricultura", EARNINGS: "Resultados", GUIDANCE: "Previsiones", MERGER_ACQUISITION: "Fusiones y adquisiciones", CAPITAL_MARKETS: "Retorno de capital y financiación", CAPEX_INVESTMENT: "Inversión y gasto de capital", PRODUCT_TECHNOLOGY: "Producto y tecnología", CONTRACT_PARTNERSHIP: "Contratos y alianzas", MANAGEMENT_CHANGE: "Cambios directivos", WORKFORCE: "Empleo y reestructuración", LEGAL: "Asuntos legales e investigaciones", ANALYST_RATING: "Recomendaciones de analistas", AI_DATA_CENTERS: "IA y centros de datos", SEMICONDUCTORS: "Semiconductores", CYBERSECURITY: "Ciberseguridad", HEALTHCARE_REGULATORY: "Salud y FDA", SUPPLY_CHAIN_LOGISTICS: "Cadena de suministro y logística", NATURAL_DISASTER_CLIMATE: "Desastres y clima", MARKET_MOVE: "Movimientos de mercado", OTHER: "Otros",
};

const FAMILY_ES: Record<EventFamily, string> = { macro: "Macro", policy: "Política y regulación", geopolitics: "Geopolítica", commodities: "Materias primas", corporate: "Empresas", technology: "Tecnología", risk: "Riesgo y cadena de suministro", markets: "Mercados" };
const ENTITY_ES: Record<EntityKind, string> = { index: "Índice", sector: "Sector", industry: "Industria", subIndustry: "Subindustria", company: "Empresa" };
const LINE_ITEM_ES: Record<LineItemCode | "gross_margin" | "operating_margin" | "net_margin", string> = {
  revenue: "Ingresos", gross_profit: "Beneficio bruto", operating_income: "Resultado operativo", net_income: "Beneficio neto", net_income_to_common: "Beneficio neto atribuible a ordinarias", weighted_average_shares_basic: "Acciones medias ponderadas (básicas)", weighted_average_shares_diluted: "Acciones medias ponderadas (diluidas)", eps_basic: "BPA (básico)", eps_diluted: "BPA (diluido)", pretax_income: "Beneficio antes de impuestos", income_tax_expense: "Gasto por impuestos", depreciation_amortization: "Depreciación y amortización", dividends_per_share: "Dividendos declarados por acción", operating_cash_flow: "Flujo de caja operativo", capital_expenditure: "Inversión en capital", free_cash_flow: "Flujo de caja libre", cash_and_equivalents: "Efectivo y equivalentes", total_assets: "Activos totales", total_liabilities: "Pasivos totales", total_debt: "Deuda total", total_equity: "Patrimonio neto", shares_outstanding: "Acciones en circulación", gross_margin: "Margen bruto", operating_margin: "Margen operativo", net_margin: "Margen neto",
};
const MECHANISM_ES: Record<Mechanism, string> = { revenue: "Ingresos", input_cost: "Costes de insumos", demand: "Demanda", financing_cost: "Coste de financiación", valuation: "Valoración", safe_haven: "Activo refugio", policy_reaction: "Respuesta de política", fx_translation: "Conversión de divisas", supply_constraint: "Restricción de suministro", trade_access: "Acceso comercial", risk_premium: "Prima de riesgo" };

export function eventTypeLabel(locale: Locale, type: EventType): string {
  return locale === "es" ? EVENT_ES[type] : type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
export function eventTypeText(locale: Locale, label: string): string {
  const definition = EVENT_TYPE_DEFS.find((entry) => entry.label === label);
  return definition ? eventTypeLabel(locale, definition.type) : label;
}
export function eventFamilyLabel(locale: Locale, family: EventFamily): string {
  if (locale === "es") return FAMILY_ES[family];
  const names: Record<EventFamily, string> = { macro: "Macro", policy: "Policy & regulation", geopolitics: "Geopolitics", commodities: "Commodities", corporate: "Companies", technology: "Technology", risk: "Risk & supply chain", markets: "Markets" };
  return names[family];
}
export function entityKindLabel(locale: Locale, kind: EntityKind): string {
  if (locale === "es") return ENTITY_ES[kind];
  const names: Record<EntityKind, string> = { index: "Index", sector: "Sector", industry: "Industry", subIndustry: "Sub-industry", company: "Company" };
  return names[kind];
}
export function lineItemLabel(locale: Locale, code: LineItemCode | "gross_margin" | "operating_margin" | "net_margin", english: string): string {
  return locale === "es" ? LINE_ITEM_ES[code] ?? english : english;
}
export function mechanismLabel(locale: Locale, value: string): string {
  const english: Record<string, string> = { revenue: "Revenue", input_cost: "Input cost", demand: "Demand", financing_cost: "Financing cost", valuation: "Valuation", safe_haven: "Safe haven", policy_reaction: "Policy reaction", fx_translation: "FX translation", supply_constraint: "Supply constraint", trade_access: "Trade access", risk_premium: "Risk premium", "supplier dependency": "Supplier dependency", "customer demand": "Customer demand", "geographic exposure": "Geographic exposure", "interest-rate exposure": "Interest-rate exposure" };
  const spanish: Record<string, string> = {
    "supplier dependency": "Dependencia de proveedores", "customer demand": "Demanda de clientes", "geographic exposure": "Exposición geográfica", "interest-rate exposure": "Exposición a los tipos de interés",
    "stated in the event": "descrito en el evento", "policy reaction": "respuesta de política", "market moves": "movimientos del mercado", "capital return & financing — positive headline tone": "retorno de capital y financiación; tono positivo del titular", "capital return & financing — negative headline tone": "retorno de capital y financiación; tono negativo del titular", "m&a — positive headline tone": "fusiones y adquisiciones; tono positivo del titular", "m&a — negative headline tone": "fusiones y adquisiciones; tono negativo del titular", "ai & data centers — positive headline tone": "IA y centros de datos; tono positivo del titular", "ai & data centers — negative headline tone": "IA y centros de datos; tono negativo del titular", "company-specific": "específico de la empresa", "sector-wide": "de todo el sector", "industry-wide": "de toda la industria", "market-wide": "de todo el mercado",
  };
  const normalized = value.trim().replaceAll("_", " ");
  if (locale === "en") return english[value] ?? normalized;
  return (MECHANISM_ES as Record<string, string>)[value] ?? spanish[normalized.toLocaleLowerCase("en-US")] ?? normalized;
}
export function horizonLabel(locale: Locale, horizon: Horizon): string {
  const labels: Record<Horizon, [string, string]> = { days: ["días", "days"], weeks: ["semanas", "weeks"], months: ["meses", "months"], quarters: ["trimestres", "quarters"] };
  return labels[horizon][locale === "es" ? 0 : 1];
}

export function timeRangeLabel(locale: Locale, range: TimeRange): string {
  if (locale === "en") return ({ "1D": "1 day", "1W": "1 week", "1M": "1 month", YTD: "year to date", "1Y": "1 year", "5Y": "5 years", MAX: "all time" } as Partial<Record<TimeRange, string>>)[range] ?? range;
  return ({ "1D": "1 día", "1W": "1 semana", "1M": "1 mes", YTD: "desde inicio de año", "1Y": "1 año", "5Y": "5 años", MAX: "todo el periodo" } as Partial<Record<TimeRange, string>>)[range] ?? range;
}

/** Localizes stable financial and indicator labels emitted by MarketRadar's domain services. */
const FINANCIAL_ES: Record<string, string> = {
  "Key metrics": "Métricas clave", "Market cap": "Capitalización bursátil", "Market cap (calc.)": "Capitalización bursátil (calc.)", Volume: "Volumen", "Relative volume": "Volumen relativo", "Industry": "Industria", "Sector": "Sector", "Performance": "Rendimiento", "Industry & sector context": "Contexto de industria y sector", "Relative performance": "Rendimiento relativo", Identity: "Identidad", Company: "Empresa", Exchange: "Bolsa", Currency: "Divisa", "Sub-industry": "Subindustria", Headquarters: "Sede", Founded: "Fundación", Employees: "Empleados", Website: "Sitio web", About: "Acerca de", Peers: "Comparables", "All peers": "Ver comparables", Reference: "Referencia", "No peers in the current universe": "No hay comparables en el universo actual", "Income statement": "Cuenta de resultados", "Balance sheet": "Balance de situación", "Cash flow": "Flujo de caja", Margins: "Márgenes", Annual: "Anual", Quarterly: "Trimestral", "Fiscal years": "Años fiscales", "Fiscal quarters": "Trimestres fiscales", "No periods available": "No hay periodos disponibles", "Items not available from filings": "Partidas no disponibles en los informes", "line items": "partidas", "Technical indicators": "Indicadores técnicos", "Last session": "Última sesión", Calculated: "Calculado", "Not enough history": "Historial insuficiente", "SMA 20": "SMA 20", "SMA 50": "SMA 50", "SMA 200": "SMA 200", "EMA 20": "EMA 20", "EMA 50": "EMA 50", "EMA 200": "EMA 200", "MACD signal (9)": "Señal MACD (9)", "MACD histogram": "Histograma MACD", "ATR 14 (% of price)": "ATR 14 (% del precio)", "Avg volume (20)": "Volumen medio (20)", "Avg dollar volume (20)": "Volumen medio en dólares (20)", "52W high": "Máximo de 52 semanas", "52W low": "Mínimo de 52 semanas", "P/E (TTM)": "P/E (últimos 12 meses)", "P/S (TTM)": "P/S (últimos 12 meses)", "P/B": "P/B", "EV/EBITDA (TTM)": "EV/EBITDA (últimos 12 meses)", "FCF yield (TTM)": "Rentabilidad del flujo de caja libre (12 meses)", "Dividend yield (TTM)": "Rentabilidad por dividendo (12 meses)", "Gross margin": "Margen bruto", "Operating margin": "Margen operativo", "Net margin": "Margen neto", "FCF margin": "Margen de flujo de caja libre", "ROE (TTM)": "ROE (12 meses)", "ROIC (TTM)": "ROIC (12 meses)", "Revenue growth (YoY, TTM)": "Crecimiento de ingresos (interanual, 12 meses)", "Net income growth (YoY, TTM)": "Crecimiento del beneficio neto (interanual, 12 meses)", "EPS growth (YoY, TTM)": "Crecimiento del BPA (interanual, 12 meses)", "Diluted EPS growth (last FY)": "Crecimiento del BPA diluido (último ejercicio fiscal)", "Diluted EPS growth (FY)": "Crecimiento del BPA diluido (ejercicio fiscal)", "Enterprise value": "Valor de empresa", Valuation: "Valoración", Profitability: "Rentabilidad", Growth: "Crecimiento", Methodology: "Metodología", "Reported results": "Resultados publicados", Quarter: "Trimestre", "Period end": "Fin del periodo", Revenue: "Ingresos", "Net income": "Beneficio neto", "Estimates & upcoming dates": "Estimaciones y próximas fechas", "Not available": "No disponible",
};

export function financialTerm(locale: Locale, label: string): string {
  const additional: Record<string, string> = {
    "Gross profit": "Beneficio bruto", "Operating income": "Resultado operativo", "Free cash flow": "Flujo de caja libre", Cash: "Efectivo", "Cash & equivalents": "Efectivo y equivalentes", Debt: "Deuda", Assets: "Activos", Equity: "Patrimonio neto", "Return on equity": "Rentabilidad sobre patrimonio", "Return on invested capital": "Rentabilidad sobre el capital invertido", Growth: "Crecimiento", "Interest expense": "Gastos por intereses", "Total debt": "Deuda total", "Total assets": "Activos totales", "Total equity": "Patrimonio neto",
  };
  return locale === "es" ? FINANCIAL_ES[label] ?? additional[label] ?? label : label;
}

const TECHNICAL_ES: Record<string, string> = {
  "MACD (12, 26)": "MACD (12, 26)", "MACD signal (9)": "Señal MACD (9)", "MACD histogram": "Histograma MACD", "ATR 14": "ATR 14", "ATR 14 (% of price)": "ATR 14 (% del precio)", "Avg volume (20)": "Volumen medio (20)", "Avg dollar volume (20)": "Volumen medio negociado (20)", "52W high": "Máximo de 52 semanas", "52W low": "Mínimo de 52 semanas", "Last session": "Última sesión",
  "Simple moving average of the last 20 split-adjusted closes.": "Media móvil simple de los últimos 20 cierres ajustados por splits.", "Simple moving average of the last 50 split-adjusted closes.": "Media móvil simple de los últimos 50 cierres ajustados por splits.", "Simple moving average of the last 200 split-adjusted closes.": "Media móvil simple de los últimos 200 cierres ajustados por splits.", "Exponential moving average (α = 2/21), seeded with the SMA.": "Media móvil exponencial (α = 2/21), inicializada con la SMA.", "Exponential moving average (α = 2/51), seeded with the SMA.": "Media móvil exponencial (α = 2/51), inicializada con la SMA.", "Exponential moving average (α = 2/201), seeded with the SMA.": "Media móvil exponencial (α = 2/201), inicializada con la SMA.", "Wilder's Relative Strength Index over 14 sessions (0–100).": "Índice de fuerza relativa de Wilder en 14 sesiones (0–100).", "EMA 12 − EMA 26 of closes.": "EMA 12 − EMA 26 de los cierres.", "EMA 9 of the MACD line.": "EMA 9 de la línea MACD.", "MACD − signal.": "MACD − señal.", "Wilder's Average True Range over 14 sessions.": "Rango verdadero medio de Wilder en 14 sesiones.", "ATR 14 divided by the last close, in percent.": "ATR 14 dividido por el último cierre, en porcentaje.", "Shares traded in the last session (consolidated SIP, including extended hours).": "Acciones negociadas en la última sesión (SIP consolidado, incluidas horas extendidas).", "Average volume of the 20 sessions before the last one.": "Volumen medio de las 20 sesiones anteriores a la última.", "Last session volume / average volume of the previous 20 sessions.": "Volumen de la última sesión / volumen medio de las 20 sesiones anteriores.", "Average of close × volume over the previous 20 sessions (USD).": "Media de cierre × volumen de las 20 sesiones anteriores (USD).", "Highest split-adjusted intraday high over the last 12 months.": "Máximo intradía ajustado por splits de los últimos 12 meses.", "Lowest split-adjusted intraday low over the last 12 months.": "Mínimo intradía ajustado por splits de los últimos 12 meses.",
};

export function technicalTerm(locale: Locale, value: string): string {
  return locale === "es" ? TECHNICAL_ES[value] ?? financialTerm(locale, value) : value;
}

const MARKET_CAP_ES: Record<MarketCapReason, string> = {
  missing_price: "no hay datos de precios sincronizados para este valor",
  missing_shares_outstanding: "no hay datos disponibles de acciones en circulación",
  multi_class_share_scope_unverified: "el emisor tiene varias clases de acciones y no se especifica el número por clase",
  shares_outstanding_stale: "el último dato de acciones en circulación está desactualizado",
  no_independent_reference: "no hay una referencia independiente para contrastar el cálculo",
  deviates_from_provider_market_cap: "difiere en más de un 5 % de la capitalización del proveedor",
  consistent_with_provider_market_cap: "coincide con la capitalización del proveedor (margen de hasta un 5 %)",
  shares_inconsistent_with_weighted_average: "las acciones de portada difieren en más de un 15 % de las acciones medias ponderadas publicadas más recientes",
  consistent_with_weighted_average_shares: "las acciones de portada coinciden con las medias ponderadas publicadas más recientes (margen de hasta un 15 %, ajustadas por splits)",
  consistent_with_filing_eps_shares: "las acciones de esta clase coinciden con las acciones medias usadas para el BPA en el último 10-Q/10-K",
  share_class_unresolved: "el último informe no permite asignar este ticker a una sola clase de acciones",
};

export function marketCapReasonLabel(locale: Locale, reason: MarketCapReason, english: string): string {
  return locale === "es" ? MARKET_CAP_ES[reason] : english;
}

export function marketCapStatusLabel(locale: Locale, status: MarketCapStatus, english: string): string {
  if (locale === "en") return english;
  return status === "VERIFIED" ? "Verificada" : status === "UNVERIFIED" ? "Sin verificar; no se muestra" : "Sin datos";
}

export function syncStatusLabel(locale: Locale, status: string): string {
  if (locale === "en") return status;
  return ({ running: "En curso", succeeded: "Completada", partial: "Parcial", failed: "Fallida", skipped: "Omitida" } as Record<string, string>)[status.toLowerCase()] ?? status;
}

export function aiStatusReason(locale: Locale, reason: string): string {
  if (locale === "en") return reason;
  const exact: Record<string, string> = {
    "AI_PROVIDER is not 'openai' — deterministic MarketRadar engine": "AI_PROVIDER no es 'openai'; se usa el motor determinista de MarketRadar",
    "OPENAI_API_KEY is not set — deterministic MarketRadar engine": "OPENAI_API_KEY no está configurada; se usa el motor determinista de MarketRadar",
    "AI_ALLOW_PAID_CALLS is not 'true' — paid calls are not authorized": "AI_ALLOW_PAID_CALLS no es 'true'; las llamadas de pago no están autorizadas",
    "AI budget is 0 — set AI_DAILY_BUDGET_USD and AI_MONTHLY_BUDGET_USD": "El presupuesto de IA es 0; configura AI_DAILY_BUDGET_USD y AI_MONTHLY_BUDGET_USD",
    "within budget": "dentro del presupuesto",
  };
  if (exact[reason]) return exact[reason];
  const disabled = reason.match(/^AI feature '([^']+)' is disabled in AI_FEATURES$/);
  if (disabled) return `La función de IA '${disabled[1]}' está desactivada en AI_FEATURES`;
  const enabled = reason.match(/^OpenAI enabled \((.+)\)$/);
  if (enabled) return `OpenAI activado (${enabled[1]})`;
  const calls = reason.match(/^AI_MAX_CALLS_PER_RUN \((\d+)\) reached$/);
  if (calls) return `Se alcanzó AI_MAX_CALLS_PER_RUN (${calls[1]})`;
  const rejected = reason.match(/^AI output rejected by grounding \((\d+)% of claims supported\)$/);
  if (rejected) return `La validación de evidencia rechazó la respuesta de IA (${rejected[1]} % de las afirmaciones respaldadas)`;
  if (/^No price configured for model /.test(reason)) return reason.replace("No price configured for model", "No hay un precio configurado para el modelo");
  const budget = reason.match(/^(Daily|Monthly) budget ([\d.]+) USD would be exceeded \(spent ([\d.]+)\)$/);
  if (budget) return `Se superaría el presupuesto ${budget[1] === "Daily" ? "diario" : "mensual"} de ${budget[2]} USD (gastado: ${budget[3]} USD)`;
  return reason;
}

export function rankingTitle(locale: Locale, id: string, range: string): { title: string; description: string } | null {
  const byId: Record<string, { title: [string, string]; description: [string, string] }> = {
    "top-gainers": { title: ["Mayores subidas", "Top Gainers"], description: [`Mayor rendimiento en ${range}`, `Highest return over ${range}`] },
    "top-losers": { title: ["Mayores caídas", "Top Losers"], description: [`Menor rendimiento en ${range}`, `Lowest return over ${range}`] },
    "most-active": { title: ["Más activos", "Most Active"], description: ["Mayor volumen negociado en la última sesión", "Highest dollar volume in the last session"] },
    "relative-volume": { title: ["Volumen relativo", "Relative Volume"], description: ["Volumen frente a la media de 20 sesiones", "Volume vs 20-session average"] },
    "highest-rsi": { title: ["RSI más alto", "Highest RSI"], description: ["RSI (14) — lecturas más altas", "RSI (14) — highest readings"] },
    "lowest-rsi": { title: ["RSI más bajo", "Lowest RSI"], description: ["RSI (14) — lecturas más bajas", "RSI (14) — lowest readings"] },
    "new-52w-highs": { title: ["Nuevos máximos de 52 semanas", "52W Highs"], description: ["Cotizando en un nuevo máximo de 52 semanas", "Trading at a new 52-week high"] },
    "new-52w-lows": { title: ["Nuevos mínimos de 52 semanas", "52W Lows"], description: ["Cotizando en un nuevo mínimo de 52 semanas", "Trading at a new 52-week low"] },
  };
  const entry = byId[id];
  return entry ? { title: entry.title[locale === "es" ? 0 : 1], description: entry.description[locale === "es" ? 0 : 1] } : null;
}
