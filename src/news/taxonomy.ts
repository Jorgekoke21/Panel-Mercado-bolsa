import type { EventFamily, EventType } from "@/domain/news";
import type { Horizon, NodeKey } from "@/knowledge/types";

/**
 * Taxonomía de eventos de MarketRadar.
 *
 * 36 tipos agrupados en 8 familias. Criterio: cada tipo debe cambiar CÓMO se relaciona un evento con
 * el mercado (canal, horizonte, entidades afectadas). Materias primas concretas (oro, cobre, uranio…)
 * NO son tipos: son entidades (commodity:*) del evento, así la taxonomía no crece con cada activo.
 *
 * Equivalencias con la lista de partida: INTEREST_RATE ⇒ CENTRAL_BANK/RATES_BONDS · GDP ⇒ ECONOMIC_GROWTH ·
 * TRADE/TARIFF ⇒ TRADE_TARIFFS · SANCTION ⇒ SANCTIONS_EXPORT_CONTROLS · WAR ⇒ GEOPOLITICAL_CONFLICT ·
 * OIL/GAS/ENERGY ⇒ ENERGY_MARKETS · GOLD/COPPER/URANIUM/LITHIUM ⇒ METALS_MINING + commodity ·
 * LOGISTICS/SUPPLY_CHAIN ⇒ SUPPLY_CHAIN_LOGISTICS · CLIMATE/NATURAL_DISASTER ⇒ NATURAL_DISASTER_CLIMATE ·
 * PRODUCT ⇒ PRODUCT_TECHNOLOGY · CONTRACT ⇒ CONTRACT_PARTNERSHIP · CAPEX ⇒ CAPEX_INVESTMENT ·
 * LAYOFF ⇒ WORKFORCE · FDA ⇒ HEALTHCARE_REGULATORY · AI ⇒ AI_DATA_CENTERS · BOND_YIELD ⇒ RATES_BONDS.
 */
export interface EventTypeDef {
  type: EventType;
  label: string;
  family: EventFamily;
  /** Evento de alcance de mercado (se relaciona con el índice general). */
  marketWide: boolean;
  /** Tipo corporativo: su sujeto principal es una empresa. */
  corporate: boolean;
  horizon: Horizon;
  /** Nodos de factor que el tipo mueve por defecto (el sentido lo da el léxico del titular). */
  factors: NodeKey[];
  /** Peso base en la importancia del evento (0–1). */
  weight: number;
  /**
   * Palabras clave (regex sin flags; se evalúan en minúsculas con límites de palabra).
   * Idiomas: en + es/fr/de/it/pt para los términos más frecuentes.
   */
  keywords: readonly string[];
  /** Palabras que por sí solas son débiles (cuentan la mitad). */
  weakKeywords?: readonly string[];
}

export const EVENT_TYPE_DEFS: readonly EventTypeDef[] = [
  { type: "CENTRAL_BANK", label: "Central bank", family: "macro", marketWide: true, corporate: false, horizon: "months", factors: ["factor:interest_rates"], weight: 0.9,
    keywords: ["federal reserve", "fomc", "the fed", "fed's", "fed chair", "fed officials?", "fed governor", "central bank", "central banks", "ecb", "european central bank", "bank of england", "bank of japan", "boj", "pboc", "people's bank of china", "monetary policy", "rate cuts?", "rate hikes?", "rate decision", "policy rate", "cuts rates", "raises rates", "holds rates", "interest rates? decision", "banco central", "reserva federal", "bce", "banque centrale", "zentralbank", "notenbank", "leitzins", "tipos de interés", "taux directeurs?"],
    weakKeywords: ["fed", "interest rates?", "rates"] },
  { type: "INFLATION", label: "Inflation", family: "macro", marketWide: true, corporate: false, horizon: "months", factors: ["factor:inflation"], weight: 0.85,
    keywords: ["inflation", "cpi", "consumer prices?", "consumer price index", "pce", "core prices", "producer prices?", "ppi", "price index", "inflación", "ipc", "verbraucherpreise", "teuerung", "inflazione"] },
  { type: "EMPLOYMENT", label: "Employment", family: "macro", marketWide: true, corporate: false, horizon: "months", factors: ["factor:labor_market"], weight: 0.8,
    keywords: ["payrolls?", "nonfarm", "jobs report", "unemployment", "jobless claims", "jobless", "labou?r market", "job openings", "jolts", "employment situation", "wage growth", "desempleo", "paro", "empleo", "arbeitslos\\w*", "arbeitsmarkt", "chômage", "emploi"] },
  { type: "ECONOMIC_GROWTH", label: "Growth & activity", family: "macro", marketWide: true, corporate: false, horizon: "months", factors: ["factor:economic_growth"], weight: 0.75,
    keywords: ["gdp", "gross domestic product", "recession", "economic growth", "economy (grew|shrank|contracted|expanded)", "retail sales", "pmi", "purchasing managers", "industrial production", "factory activity", "manufacturing activity", "consumer confidence", "consumer sentiment", "personal income", "durable goods", "pib", "rezession", "récession", "recesión", "konjunktur", "wirtschaftswachstum"] },
  { type: "RATES_BONDS", label: "Rates & bonds", family: "macro", marketWide: true, corporate: false, horizon: "weeks", factors: ["factor:bond_yields"], weight: 0.7,
    keywords: ["treasury yields?", "bond yields?", "10-year yield", "10-year treasury", "treasuries", "bond market", "yield curve", "gilts?", "bund yields?", "jgbs?", "debt auction", "treasury auction", "bond sell-?off", "rendimiento del bono", "anleihen?", "renditen?"] },
  { type: "CURRENCY", label: "Currencies", family: "macro", marketWide: true, corporate: false, horizon: "weeks", factors: ["factor:usd"], weight: 0.6,
    keywords: ["dollar index", "dxy", "forex", "currency", "currencies", "exchange rate", "greenback", "yen", "yuan", "renminbi", "sterling", "rupee", "devaluation", "divisa", "währung", "devise"],
    weakKeywords: ["dollar", "euro", "peso"] },
  { type: "CREDIT", label: "Credit", family: "macro", marketWide: true, corporate: false, horizon: "months", factors: ["factor:credit_spreads"], weight: 0.7,
    keywords: ["credit spreads?", "defaults?", "defaulted", "bankruptcy", "bankrupt", "chapter 11", "credit rating", "junk bonds?", "high-yield", "private credit", "insolvency", "debt restructuring", "quiebra", "insolvenz", "faillite", "leveraged loans?"],
    weakKeywords: ["downgraded?", "debt"] },
  { type: "FISCAL_POLICY", label: "Fiscal policy", family: "macro", marketWide: true, corporate: false, horizon: "months", factors: [], weight: 0.65,
    keywords: ["budget deficit", "federal deficit", "debt ceiling", "government shutdown", "shutdown", "fiscal policy", "fiscal stimulus", "fiscal deficit", "tax cuts?", "tax bill", "tax hikes?", "tax reform", "stimulus", "spending bill", "appropriations", "presupuesto", "haushalt", "déficit"] },
  { type: "TRADE_TARIFFS", label: "Trade & tariffs", family: "policy", marketWide: true, corporate: false, horizon: "months", factors: ["factor:trade_barriers"], weight: 0.85,
    keywords: ["tariffs?", "trade war", "trade deal", "current[- ]account", "international transactions", "trade balance", "trade talks", "trade agreement", "trade deficit", "trade tensions", "import duties", "duties on", "anti-dumping", "section 232", "section 301", "wto", "aranceles?", "zölle", "zoll", "handelsstreit", "droits de douane", "dazi"] },
  { type: "SANCTIONS_EXPORT_CONTROLS", label: "Sanctions & export controls", family: "policy", marketWide: false, corporate: false, horizon: "quarters", factors: ["factor:export_controls"], weight: 0.85,
    keywords: ["sanctions?", "sanctioned", "export controls?", "export restrictions?", "export curbs?", "export ban", "entity list", "embargo", "blacklist(ed)?", "ofac", "chip curbs", "sanciones", "sanktionen", "exportkontrollen?", "embargo"] },
  { type: "REGULATION", label: "Regulation", family: "policy", marketWide: false, corporate: false, horizon: "quarters", factors: [], weight: 0.6,
    keywords: ["regulators?", "regulatory", "regulation", "rulemaking", "new rules", "final rule", "proposed rule", "oversight", "sec (charges|rule|proposal)", "cftc", "fdic", "occ", "capital requirements", "basel", "compliance", "regulación", "regulierung", "réglementation"] },
  { type: "ANTITRUST", label: "Antitrust", family: "policy", marketWide: false, corporate: false, horizon: "quarters", factors: [], weight: 0.7,
    keywords: ["antitrust", "anti-trust", "competition authority", "competition regulator", "competition commission", "monopoly", "monopolist", "ftc", "doj sues", "justice department sues", "break ?up", "merger review", "cma", "dma", "digital markets act", "kartell\\w*", "antimonopolio"] },
  { type: "ELECTION_POLITICS", label: "Elections & policy", family: "policy", marketWide: false, corporate: false, horizon: "months", factors: [], weight: 0.4,
    keywords: ["elections?", "presidential race", "ballot", "polls show", "congress", "senate", "house of representatives", "parliament", "lawmakers", "legislation", "executive order", "white house", "prime minister", "elecciones", "wahlen?", "élections?", "congreso"],
    weakKeywords: ["government", "president", "vote"] },
  { type: "GEOPOLITICAL_CONFLICT", label: "Geopolitics & conflict", family: "geopolitics", marketWide: true, corporate: false, horizon: "weeks", factors: ["factor:geopolitical_risk"], weight: 0.8,
    keywords: ["war", "invasion", "invade", "military", "missiles?", "airstrikes?", "air strikes?", "troops", "ceasefire", "cease-fire", "hostilities", "drone attacks?", "nato", "blockade", "naval", "coup", "houthis?", "hezbollah", "hamas", "armed conflict", "guerra", "krieg", "guerre", "ofensiva militar", "militär\\w*", "bombardeo"],
    weakKeywords: ["attack", "conflict", "tensions", "strikes", "ataques?"] },
  { type: "ENERGY_MARKETS", label: "Energy", family: "commodities", marketWide: false, corporate: false, horizon: "weeks", factors: ["factor:energy_costs"], weight: 0.75,
    keywords: ["oil prices?", "crude", "brent", "wti", "opec\\+?", "gasoline", "diesel", "natural gas", "lng", "refiner(y|ies)", "oil output", "oil production", "oil supply", "barrels? per day", "bpd", "pipeline", "power prices", "electricity prices", "petróleo", "crudo", "erdöl", "ölpreis\\w*", "pétrole", "gas natural", "erdgas"],
    weakKeywords: ["oil", "energy", "gas"] },
  { type: "METALS_MINING", label: "Metals & mining", family: "commodities", marketWide: false, corporate: false, horizon: "weeks", factors: [], weight: 0.65,
    keywords: ["gold prices?", "gold price", "bullion", "silver prices?", "copper", "lithium", "uranium", "iron ore", "nickel", "aluminum", "aluminium", "cobalt", "rare earths?", "miners", "mining", "smelter", "cobre", "litio", "kupfer", "cuivre", "bergbau", "minería"],
    weakKeywords: ["gold", "silver", "metals?"] },
  { type: "AGRICULTURE", label: "Agriculture", family: "commodities", marketWide: false, corporate: false, horizon: "months", factors: [], weight: 0.5,
    keywords: ["wheat", "corn", "soybeans?", "grain prices", "crop", "crops", "harvest", "fertilizers?", "cattle", "cocoa", "coffee prices", "sugar prices", "trigo", "maíz", "cosecha", "weizen", "ernte"] },
  { type: "EARNINGS", label: "Earnings", family: "corporate", marketWide: false, corporate: true, horizon: "days", factors: [], weight: 0.7,
    keywords: ["earnings", "quarterly (results|profit|revenue|earnings|loss)", "results of operations", "(first|second|third|fourth)[- ]quarter (results|profit|earnings|revenue|sales)", "q[1-4] (results|earnings|revenue|profit|sales)", "profit (rose|fell|jumped|dropped|beat|missed)", "beats? (estimates|expectations|forecasts)", "miss(es|ed)? (estimates|expectations|forecasts)", "tops (estimates|expectations)", "eps", "net income", "same-store sales", "comparable sales", "resultados trimestrales", "beneficio", "quartalszahlen", "quartalsgewinn", "bénéfice", "chiffre d'affaires"],
    weakKeywords: ["results", "profit", "revenue", "sales"] },
  { type: "GUIDANCE", label: "Guidance", family: "corporate", marketWide: false, corporate: true, horizon: "days", factors: [], weight: 0.7,
    keywords: ["guidance", "outlook", "raises (its )?(full-year |annual )?(forecast|outlook|guidance)", "cuts (its )?(full-year |annual )?(forecast|outlook|guidance)", "lowers (its )?(forecast|outlook|guidance)", "profit warning", "warns on", "full-year forecast", "annual forecast", "previsiones", "prognose", "perspectivas", "prévisions"],
    weakKeywords: ["forecast", "expects"] },
  { type: "MERGER_ACQUISITION", label: "M&A", family: "corporate", marketWide: false, corporate: true, horizon: "weeks", factors: [], weight: 0.75,
    keywords: ["acquires?", "acquired", "acquisition", "to acquire", "merger", "merge", "merging", "takeover", "buyout", "to buy", "deal to buy", "agrees to buy", "bid for", "all-cash deal", "all-stock deal", "stake in", "divest\\w*", "spin-?off", "spins off", "adquisición", "adquiere", "fusión", "übernahme", "übernimmt", "fusion", "rachat", "acquisizione"] },
  { type: "CAPITAL_MARKETS", label: "Capital return & financing", family: "corporate", marketWide: false, corporate: true, horizon: "weeks", factors: [], weight: 0.5,
    keywords: ["buybacks?", "share repurchases?", "repurchase program", "dividend", "dividends", "stock split", "share offering", "stock offering", "secondary offering", "bond offering", "notes offering", "debt offering", "senior notes", "ipo", "initial public offering", "listing", "recompra", "dividendo", "aktienrückkauf", "dividende", "rachat d'actions"] },
  { type: "CAPEX_INVESTMENT", label: "Capex & investment", family: "corporate", marketWide: false, corporate: true, horizon: "quarters", factors: [], weight: 0.65,
    keywords: ["capital expenditures?", "capital spending", "capex", "invest(s|ing)? \\$?[0-9.,]+ ?(billion|bn|million|mln)", "\\$?[0-9.,]+ ?(billion|bn) investment", "new (plant|factory|fab|facility|data cent(er|re))", "build(s|ing)? (a )?(new )?(plant|factory|fab|data cent(er|re))", "expansion plan", "breaks ground", "inversión", "investition\\w*", "investissement"] },
  { type: "PRODUCT_TECHNOLOGY", label: "Product & technology", family: "corporate", marketWide: false, corporate: true, horizon: "months", factors: [], weight: 0.45,
    keywords: ["launch(es|ed)?", "unveil(s|ed)?", "introduc(es|ed)", "new (model|product|chip|phone|device|platform|service|drug)", "rolls? out", "rollout", "debuts?", "lanza", "lanzamiento", "presenta", "stellt vor", "dévoile", "lance"] },
  { type: "CONTRACT_PARTNERSHIP", label: "Contracts & partnerships", family: "corporate", marketWide: false, corporate: true, horizon: "months", factors: [], weight: 0.5,
    keywords: ["contract", "contracts", "wins (a )?\\$?[0-9]", "awarded", "partnership", "partners with", "teams up", "collaboration", "alliance", "supply (deal|agreement)", "multi-year (deal|agreement)", "material definitive agreement", "licensing deal", "order for", "orders for", "contrato", "acuerdo", "alianza", "vertrag", "auftrag", "partenariat", "contrat"],
    weakKeywords: ["deal", "agreement"] },
  { type: "MANAGEMENT_CHANGE", label: "Management change", family: "corporate", marketWide: false, corporate: true, horizon: "months", factors: [], weight: 0.45,
    keywords: ["ceo", "chief executive", "cfo", "chief financial officer", "steps? down", "resigns?", "resigned", "resignation", "appoints?", "appointed", "names new", "named (as )?(ceo|chief|president|chair)", "successor", "chairman", "board of directors", "departure of directors", "dimite", "nombra", "consejero delegado", "rücktritt", "vorstandschef", "démission", "nomme"] },
  { type: "WORKFORCE", label: "Workforce & restructuring", family: "corporate", marketWide: false, corporate: true, horizon: "months", factors: [], weight: 0.55,
    keywords: ["layoffs?", "lay off", "job cuts", "cut(s|ting)? [0-9,]+ jobs", "cuts jobs", "workforce reduction", "restructuring", "exit or disposal", "strike by", "workers strike", "walkout", "labor union", "union vote", "despidos", "ere", "stellenabbau", "entlassungen", "licenciements", "huelga", "streik", "grève"] },
  { type: "LEGAL", label: "Legal & investigations", family: "corporate", marketWide: false, corporate: true, horizon: "months", factors: [], weight: 0.6,
    keywords: ["lawsuit", "lawsuits", "sued", "sues", "court", "judge", "jury", "verdict", "settlement", "settles", "litigation", "probe", "investigation", "indicted", "indictment", "class action", "fined", "penalty", "subpoena", "guilty", "demanda", "juicio", "tribunal", "klage", "gericht", "procès", "amende"] },
  { type: "ANALYST_RATING", label: "Analyst ratings", family: "corporate", marketWide: false, corporate: true, horizon: "days", factors: [], weight: 0.35,
    keywords: ["upgrades?", "upgraded", "price target", "overweight", "underweight", "outperform", "underperform", "buy rating", "sell rating", "neutral rating", "initiates coverage", "analysts? (say|see|expect)"],
    weakKeywords: ["downgrades?", "downgraded", "analysts?"] },
  { type: "AI_DATA_CENTERS", label: "AI & data centers", family: "technology", marketWide: false, corporate: false, horizon: "quarters", factors: ["factor:ai_demand"], weight: 0.7,
    keywords: ["artificial intelligence", "\\bai\\b", "generative ai", "genai", "llms?", "large language models?", "chatbots?", "data cent(er|re)s?", "datacenters?", "hyperscalers?", "gpus?", "ai chips?", "ai infrastructure", "inteligencia artificial", "künstliche intelligenz", "intelligence artificielle", "centros? de datos", "rechenzent\\w*"] },
  { type: "SEMICONDUCTORS", label: "Semiconductors", family: "technology", marketWide: false, corporate: false, horizon: "quarters", factors: [], weight: 0.7,
    keywords: ["semiconductors?", "chipmakers?", "chip makers?", "chip(s)? (maker|makers|stocks|sales|exports|industry|design)", "foundry", "foundries", "wafers?", "fabs?", "lithography", "hbm", "memory chips?", "dram", "nand", "semiconductores?", "halbleiter\\w*", "semi-conducteurs?", "puces"],
    weakKeywords: ["chips?"] },
  { type: "CYBERSECURITY", label: "Cybersecurity", family: "technology", marketWide: false, corporate: false, horizon: "weeks", factors: [], weight: 0.6,
    keywords: ["cyber ?attacks?", "cyber-attacks?", "cybersecurity", "ransomware", "hackers?", "hacked", "hacking", "data breach", "breach", "malware", "cybersecurity incident", "outage", "ciberataque", "cyberangriff", "cyberattaque"] },
  { type: "HEALTHCARE_REGULATORY", label: "Healthcare & FDA", family: "technology", marketWide: false, corporate: false, horizon: "months", factors: [], weight: 0.6,
    keywords: ["fda", "food and drug administration", "approves?", "approval", "approved", "clinical trials?", "phase (1|2|3|i|ii|iii) (trial|study|data)", "trial (data|results)", "drug pricing", "medicare", "medicaid", "vaccines?", "recalls?", "ema", "cms", "aprobación", "zulassung", "autorisation"] },
  { type: "SUPPLY_CHAIN_LOGISTICS", label: "Supply chain & logistics", family: "risk", marketWide: false, corporate: false, horizon: "months", factors: ["factor:supply_chain_stress"], weight: 0.65,
    keywords: ["supply chains?", "supply-chain", "shortages?", "shipping", "freight", "containers?", "ports?", "port strike", "red sea", "suez", "panama canal", "logistics", "bottlenecks?", "rail strike", "trucking", "cadena de suministro", "lieferkett\\w*", "chaîne d'approvisionnement", "escasez"] },
  { type: "NATURAL_DISASTER_CLIMATE", label: "Disasters & climate", family: "risk", marketWide: false, corporate: false, horizon: "weeks", factors: [], weight: 0.6,
    keywords: ["hurricanes?", "typhoons?", "cyclones?", "earthquakes?", "wildfires?", "floods?", "flooding", "drought", "tornado(es)?", "heat ?waves?", "winter storm", "climate change", "emissions", "carbon", "huracán", "terremoto", "incendios?", "inundaciones", "erdbeben", "überschwemmung\\w*", "séisme", "inondations?"],
    weakKeywords: ["storm", "climate"] },
  { type: "MARKET_MOVE", label: "Market moves", family: "markets", marketWide: true, corporate: false, horizon: "days", factors: [], weight: 0.4,
    keywords: ["stock market", "stocks", "wall street", "s&p 500", "nasdaq", "dow jones", "the dow", "sell-?off", "rally", "rallies", "equities", "shares (rose|fell|jumped|slid|tumbled|surged)", "market (rally|selloff|sell-off|rout)", "bolsa", "börse", "bourse", "acciones", "aktien", "wall st"],
    weakKeywords: ["shares", "market", "markets", "index"] },
  { type: "OTHER", label: "Other", family: "markets", marketWide: false, corporate: false, horizon: "weeks", factors: [], weight: 0.2, keywords: [] },
];

export const EVENT_TYPE_DEF: ReadonlyMap<EventType, EventTypeDef> = new Map(EVENT_TYPE_DEFS.map((d) => [d.type, d]));

export function eventTypeDef(type: EventType): EventTypeDef {
  const def = EVENT_TYPE_DEF.get(type);
  if (!def) throw new Error(`Unknown event type ${type}`);
  return def;
}

export const FAMILY_LABELS: Record<EventFamily, string> = {
  macro: "Macro",
  policy: "Policy & regulation",
  geopolitics: "Geopolitics",
  commodities: "Commodities",
  corporate: "Companies",
  technology: "Technology",
  risk: "Risk & supply chain",
  markets: "Markets",
};

/** Ítems de un Form 8-K ⇒ tipo de evento (clasificación exacta, fuente primaria). */
export const SEC_8K_ITEM_TYPES: Readonly<Record<string, { type: EventType; label: string }>> = {
  "1.01": { type: "CONTRACT_PARTNERSHIP", label: "Entry into a material definitive agreement" },
  "1.02": { type: "CONTRACT_PARTNERSHIP", label: "Termination of a material definitive agreement" },
  "1.03": { type: "CREDIT", label: "Bankruptcy or receivership" },
  "1.05": { type: "CYBERSECURITY", label: "Material cybersecurity incident" },
  "2.01": { type: "MERGER_ACQUISITION", label: "Completion of acquisition or disposition of assets" },
  "2.02": { type: "EARNINGS", label: "Results of operations and financial condition" },
  "2.03": { type: "CAPITAL_MARKETS", label: "Creation of a direct financial obligation" },
  "2.04": { type: "CREDIT", label: "Triggering events that accelerate a financial obligation" },
  "2.05": { type: "WORKFORCE", label: "Costs associated with exit or disposal activities" },
  "2.06": { type: "EARNINGS", label: "Material impairments" },
  "3.01": { type: "CAPITAL_MARKETS", label: "Notice of delisting or failure to satisfy a listing rule" },
  "3.02": { type: "CAPITAL_MARKETS", label: "Unregistered sales of equity securities" },
  "4.01": { type: "MANAGEMENT_CHANGE", label: "Change in registrant's certifying accountant" },
  "4.02": { type: "LEGAL", label: "Non-reliance on previously issued financial statements" },
  "5.01": { type: "MERGER_ACQUISITION", label: "Changes in control of registrant" },
  "5.02": { type: "MANAGEMENT_CHANGE", label: "Departure/appointment of directors or officers" },
  "5.03": { type: "OTHER", label: "Amendments to articles or bylaws" },
  "5.07": { type: "OTHER", label: "Submission of matters to a vote of security holders" },
  "7.01": { type: "OTHER", label: "Regulation FD disclosure" },
  "8.01": { type: "OTHER", label: "Other events" },
};

/** Ítems de 8-K sin interés de mercado por sí solos (se descartan si no hay otros). */
export const SEC_8K_LOW_SIGNAL_ITEMS: ReadonlySet<string> = new Set(["5.03", "5.07", "9.01", "7.01", "8.01", "3.03", "5.05", "5.08"]);
