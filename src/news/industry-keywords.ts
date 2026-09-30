import type { NodeKey } from "@/knowledge/types";

/**
 * Menciones DIRECTAS de sectores, industrias e índices en el texto ("chipmakers", "airlines",
 * "Wall Street"). Se anclan a códigos GICS. `exclude`: contexto que anula la coincidencia
 * ("central bank" no es la industria bancaria).
 */
export interface GroupKeyword {
  node: NodeKey;
  phrases: readonly string[];
  confidence: number;
  exclude?: RegExp;
}

export const GROUP_KEYWORDS: readonly GroupKeyword[] = [
  { node: "subIndustry:45301020", confidence: 0.85, phrases: ["semiconductor stocks", "semiconductor companies", "semiconductor industry", "chipmaker", "chipmakers", "chip maker", "chip makers", "chip stocks", "chip designers", "chip industry", "chip sector", "semiconductor makers", "semiconductores", "Halbleiterhersteller", "Chiphersteller", "fabricantes de chips", "memory chipmakers"] },
  { node: "subIndustry:45301010", confidence: 0.85, phrases: ["chip equipment", "chipmaking equipment", "semiconductor equipment", "chip toolmakers", "chip-equipment makers", "lithography machines", "wafer fab equipment"] },
  { node: "industry:453010", confidence: 0.75, phrases: ["semiconductors", "semiconductor sector", "semiconductor", "Halbleiter"] },
  { node: "subIndustry:20302010", confidence: 0.85, phrases: ["airlines", "airline stocks", "airline industry", "air carriers", "aerolíneas", "Fluggesellschaften", "compagnies aériennes"] },
  { node: "industry:401010", confidence: 0.75, phrases: ["banks", "bank stocks", "banking sector", "banking industry", "lenders", "regional banks", "big banks", "Wall Street banks", "bancos", "Banken"], exclude: /\b(central|world|development|investment|food|data|reserve|national) banks?\b|\bbanco central\b/i },
  { node: "subIndustry:40101015", confidence: 0.85, phrases: ["regional banks", "regional lenders", "community banks"] },
  { node: "industry:403010", confidence: 0.8, phrases: ["insurers", "insurance companies", "insurance stocks", "reinsurers", "aseguradoras", "Versicherer"] },
  { node: "subIndustry:25102010", confidence: 0.85, phrases: ["automakers", "carmakers", "car makers", "auto makers", "auto industry", "EV makers", "automotive industry", "fabricantes de automóviles", "Autobauer", "Autohersteller", "constructeurs automobiles"] },
  { node: "subIndustry:25201030", confidence: 0.85, phrases: ["homebuilders", "home builders", "homebuilding stocks"] },
  { node: "sector:55", confidence: 0.8, phrases: ["utilities", "utility companies", "utility stocks", "power companies", "electric utilities", "eléctricas", "Versorger"] },
  { node: "subIndustry:55105010", confidence: 0.75, phrases: ["power producers", "independent power producers", "nuclear operators"] },
  { node: "industry:101020", confidence: 0.8, phrases: ["oil companies", "oil majors", "oil producers", "energy companies", "energy stocks", "oil stocks", "petroleras", "Ölkonzerne"] },
  { node: "subIndustry:10102020", confidence: 0.8, phrases: ["shale producers", "shale drillers", "drillers", "oil and gas producers", "gas producers", "shale"] },
  { node: "subIndustry:10102030", confidence: 0.85, phrases: ["refiners", "oil refiners", "refining margins"] },
  { node: "subIndustry:10101020", confidence: 0.85, phrases: ["oilfield services", "oil services companies"] },
  { node: "industry:151040", confidence: 0.75, phrases: ["miners", "mining companies", "mining stocks", "mineras"] },
  { node: "subIndustry:15104030", confidence: 0.85, phrases: ["gold miners", "gold producers", "gold mining"] },
  { node: "subIndustry:15104025", confidence: 0.85, phrases: ["copper miners", "copper producers", "copper mining"] },
  { node: "subIndustry:15104050", confidence: 0.85, phrases: ["steelmakers", "steel makers", "steel producers", "steel industry", "siderúrgicas"] },
  { node: "subIndustry:15101030", confidence: 0.85, phrases: ["fertilizer makers", "fertilizer producers", "fertilizer companies"] },
  { node: "industry:151010", confidence: 0.75, phrases: ["chemical makers", "chemical companies", "chemicals industry", "químicas"] },
  { node: "subIndustry:35202010", confidence: 0.85, phrases: ["drugmakers", "drug makers", "pharmaceutical companies", "pharma companies", "big pharma", "pharma stocks", "farmacéuticas", "Pharmakonzerne"] },
  { node: "subIndustry:35201010", confidence: 0.85, phrases: ["biotech", "biotechs", "biotech companies", "biotech stocks", "biotecnológicas"] },
  { node: "subIndustry:35101010", confidence: 0.8, phrases: ["medical device makers", "medtech", "medical devices"] },
  { node: "subIndustry:35102030", confidence: 0.85, phrases: ["health insurers", "managed care", "Medicare Advantage insurers"] },
  { node: "subIndustry:35102020", confidence: 0.8, phrases: ["hospital operators", "hospital chains"] },
  { node: "sector:25", confidence: 0.6, phrases: ["retailers", "retail stocks", "consumer discretionary", "minoristas"] },
  { node: "subIndustry:25301040", confidence: 0.8, phrases: ["restaurant chains", "fast-food chains", "fast food chains", "restaurant stocks"] },
  { node: "subIndustry:25301020", confidence: 0.8, phrases: ["cruise lines", "cruise operators", "hotel chains", "hotel operators"] },
  { node: "subIndustry:20101010", confidence: 0.85, phrases: ["defense contractors", "defense companies", "defense stocks", "defence contractors", "defence companies", "defence stocks", "aerospace and defense", "arms makers", "weapons makers", "planemakers", "aircraft makers"] },
  { node: "subIndustry:20304010", confidence: 0.85, phrases: ["railroads", "rail operators", "freight railroads"] },
  { node: "subIndustry:20304030", confidence: 0.8, phrases: ["truckers", "trucking companies", "trucking industry"] },
  { node: "subIndustry:20301010", confidence: 0.75, phrases: ["logistics companies", "parcel carriers", "delivery companies", "freight forwarders"] },
  { node: "industry:451030", confidence: 0.8, phrases: ["software companies", "software stocks", "software makers", "SaaS", "software sector"] },
  { node: "subIndustry:45103020", confidence: 0.7, phrases: ["cybersecurity companies", "cybersecurity firms", "cybersecurity stocks", "security software"] },
  { node: "sector:45", confidence: 0.7, phrases: ["tech stocks", "technology stocks", "tech sector", "technology sector", "tech companies", "tech giants", "Big Tech", "tecnológicas", "Techwerte", "Tech-Konzerne"] },
  { node: "sector:50", confidence: 0.6, phrases: ["media companies", "telecom companies", "telecoms", "communication services"] },
  { node: "subIndustry:50203010", confidence: 0.75, phrases: ["social media companies", "social media platforms", "internet companies"] },
  { node: "subIndustry:50202010", confidence: 0.75, phrases: ["streaming services", "streamers", "Hollywood studios", "movie studios"] },
  { node: "subIndustry:50102010", confidence: 0.8, phrases: ["wireless carriers", "mobile carriers"] },
  { node: "sector:60", confidence: 0.75, phrases: ["REITs", "real estate stocks", "real estate investment trusts", "commercial real estate", "office landlords"] },
  { node: "subIndustry:60108050", confidence: 0.85, phrases: ["data center REITs", "data centre REITs"] },
  { node: "subIndustry:40201060", confidence: 0.8, phrases: ["payment companies", "payments companies", "card networks", "payment processors"] },
  { node: "subIndustry:40203010", confidence: 0.75, phrases: ["asset managers", "fund managers", "private equity firms", "alternative asset managers"] },
  { node: "subIndustry:40203020", confidence: 0.75, phrases: ["investment banks", "brokerages", "brokers"] },
  { node: "industry:302010", confidence: 0.75, phrases: ["beverage makers", "soft drink makers", "brewers"] },
  { node: "subIndustry:30202030", confidence: 0.75, phrases: ["food companies", "packaged food", "food makers", "snack makers"] },
  { node: "subIndustry:30203010", confidence: 0.85, phrases: ["tobacco companies", "cigarette makers"] },
  { node: "sector:30", confidence: 0.7, phrases: ["consumer staples", "staples stocks"] },
  { node: "sector:20", confidence: 0.65, phrases: ["industrials", "industrial stocks", "industrial companies", "manufacturers"] },
  { node: "sector:15", confidence: 0.65, phrases: ["materials sector", "materials stocks"] },
  { node: "sector:10", confidence: 0.7, phrases: ["energy sector"] },
  { node: "sector:40", confidence: 0.7, phrases: ["financials", "financial stocks", "financial sector"] },
  { node: "sector:35", confidence: 0.7, phrases: ["healthcare stocks", "health care stocks", "healthcare sector", "health care sector"] },
  { node: "subIndustry:20104010", confidence: 0.7, phrases: ["electrical equipment makers", "power equipment makers", "grid equipment"] },
  { node: "index:sp500", confidence: 0.7, phrases: ["S&P 500", "S&P500", "S&P", "Wall Street", "U.S. stocks", "US stocks", "American stocks", "U.S. equities", "US equities", "stock market", "Wall St", "Wall St.", "blue chips", "mercado de valores", "Wall Street"], exclude: /S&P Global/ },
  { node: "index:nasdaq-100", confidence: 0.6, phrases: ["Nasdaq 100", "Nasdaq-100", "Nasdaq Composite", "tech-heavy Nasdaq"] },
  { node: "index:dow-jones-industrial-average", confidence: 0.6, phrases: ["Dow Jones", "Dow Jones Industrial Average", "the Dow", "Dow industrials", "blue-chip Dow"] },
  { node: "index:russell-2000", confidence: 0.6, phrases: ["Russell 2000", "small caps", "small-cap stocks"] },
];

/** Grupos de empresas con nombre propio ("Magnificent Seven"). */
export const NAMED_COMPANY_GROUPS: Readonly<Record<string, readonly string[]>> = {
  "Magnificent Seven": ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"],
  "Magnificent 7": ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"],
};

/** Instituciones que implican país (y factor): "Fed" ⇒ country:US + factor:interest_rates. */
export const INSTITUTIONS: readonly { phrases: readonly string[]; nodes: readonly NodeKey[]; caseSensitive: boolean }[] = [
  { phrases: ["Federal Reserve", "Fed", "FOMC", "Fed's", "Reserva Federal"], nodes: ["country:US", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["European Central Bank", "ECB", "BCE", "EZB"], nodes: ["country:EU", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["Bank of England", "BoE"], nodes: ["country:GB", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["Bank of Japan", "BOJ", "BoJ"], nodes: ["country:JP", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["People's Bank of China", "PBOC", "PBoC"], nodes: ["country:CN", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["Bank of Canada"], nodes: ["country:CA", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["Swiss National Bank", "SNB"], nodes: ["country:CH", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["Reserve Bank of Australia", "RBA"], nodes: ["country:AU", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["Reserve Bank of India", "RBI"], nodes: ["country:IN", "factor:interest_rates"], caseSensitive: true },
  { phrases: ["OPEC", "OPEC+"], nodes: ["commodity:crude_oil"], caseSensitive: true },
  { phrases: ["Pentagon"], nodes: ["country:US", "factor:defense_spending"], caseSensitive: true },
  { phrases: ["Commerce Department", "Department of Commerce", "Bureau of Industry and Security"], nodes: ["country:US"], caseSensitive: true },
  { phrases: ["Treasury Department", "U.S. Treasury", "US Treasury"], nodes: ["country:US"], caseSensitive: true },
  { phrases: ["USTR", "U.S. Trade Representative"], nodes: ["country:US", "factor:trade_barriers"], caseSensitive: true },
];
