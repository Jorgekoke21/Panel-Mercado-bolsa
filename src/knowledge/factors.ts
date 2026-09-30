/**
 * Factores de mercado (macro y temáticos). Son nodos del grafo de impacto: un evento mueve un factor
 * (p. ej. la Fed recorta tipos ⇒ interest_rates baja) y el factor se relaciona con sectores,
 * industrias y materias primas mediante relaciones curadas (src/knowledge/relations.ts).
 *
 * `aliases`: expresiones que indican que una noticia trata ese factor (sin distinguir mayúsculas).
 * `theme`: tema propio de MarketRadar asociado (tabla themes), si existe.
 */
export interface FactorDef {
  code: string;
  name: string;
  kind: "macro" | "thematic" | "risk";
  aliases: readonly string[];
  theme?: string;
  description: string;
}

export const FACTORS: readonly FactorDef[] = [
  { code: "usd", name: "US dollar", kind: "macro", description: "Trade-weighted strength of the US dollar.", aliases: ["dollar index", "DXY", "greenback", "US dollar", "U.S. dollar", "strong dollar", "weak dollar", "dollar strength", "dollar weakness", "dólar"] },
  { code: "interest_rates", name: "Interest rates", kind: "macro", description: "Policy rates and the general level of nominal rates.", aliases: ["interest rate", "interest rates", "rate cut", "rate cuts", "rate hike", "rate hikes", "policy rate", "federal funds", "fed funds", "borrowing costs", "monetary policy", "tipos de interés", "tasas de interés", "taux d'intérêt", "Leitzins", "Zinsen", "Zinssenkung", "Zinserhöhung"] },
  { code: "real_yields", name: "Real yields", kind: "macro", description: "Inflation-adjusted bond yields (TIPS).", aliases: ["real yields", "real yield", "real rates", "TIPS yields", "inflation-adjusted yields"] },
  { code: "bond_yields", name: "Government bond yields", kind: "macro", description: "Nominal government bond yields and the yield curve.", aliases: ["Treasury yields", "Treasury yield", "bond yields", "10-year yield", "10-year Treasury", "yield curve", "long-term yields", "gilt yields", "Bund yields", "JGB yields", "rendimiento de los bonos", "Renditen"] },
  { code: "inflation", name: "Inflation", kind: "macro", description: "Consumer and producer price inflation.", aliases: ["inflation", "CPI", "consumer prices", "consumer price index", "PCE", "core prices", "producer prices", "PPI", "price pressures", "inflación", "IPC", "Inflation", "Verbraucherpreise", "Teuerung"] },
  { code: "credit_spreads", name: "Credit spreads", kind: "macro", description: "Risk premium of corporate debt over government debt.", aliases: ["credit spreads", "credit spread", "high-yield", "junk bonds", "junk bond", "private credit", "credit markets", "defaults", "default rate", "leveraged loans"] },
  { code: "economic_growth", name: "Economic growth", kind: "macro", description: "Real activity: GDP, PMIs, industrial production.", aliases: ["GDP", "gross domestic product", "economic growth", "recession", "slowdown", "PMI", "industrial production", "economic activity", "PIB", "Rezession", "récession", "recesión"] },
  { code: "labor_market", name: "Labor market", kind: "macro", description: "Employment, payrolls and wage growth.", aliases: ["payrolls", "nonfarm payrolls", "jobs report", "unemployment rate", "jobless claims", "labor market", "labour market", "wage growth", "hiring", "empleo", "desempleo", "Arbeitsmarkt", "chômage"] },
  { code: "consumer_spending", name: "Consumer spending", kind: "macro", description: "Household consumption and retail demand.", aliases: ["consumer spending", "retail sales", "consumer demand", "consumer confidence", "consumer sentiment", "holiday sales", "shoppers", "consumo", "Konsum"] },
  { code: "housing", name: "Housing", kind: "macro", description: "Home sales, starts, prices and mortgage activity.", aliases: ["housing market", "home sales", "housing starts", "mortgage rates", "home prices", "homebuilders", "building permits", "vivienda", "Immobilienmarkt"] },
  { code: "energy_costs", name: "Energy costs", kind: "macro", description: "Cost of fuel and power for businesses and households.", aliases: ["energy costs", "energy prices", "fuel costs", "jet fuel", "diesel prices", "gasoline prices", "power prices", "electricity prices", "Energiepreise", "precios de la energía"] },
  { code: "ai_demand", name: "AI demand", kind: "thematic", theme: "ai", description: "Spending on AI models, accelerators and AI services.", aliases: ["artificial intelligence", "AI", "generative AI", "GenAI", "AI chips", "AI spending", "AI demand", "AI boom", "AI models", "large language model", "LLM", "AI infrastructure", "inteligencia artificial", "künstliche Intelligenz", "intelligence artificielle"] },
  { code: "data_centers", name: "Data centers", kind: "thematic", theme: "data-centers", description: "Construction and operation of data-center capacity.", aliases: ["data center", "data centers", "data centre", "data centres", "datacenter", "datacenters", "hyperscaler", "hyperscalers", "centro de datos", "centros de datos", "Rechenzentrum", "Rechenzentren"] },
  { code: "electricity_demand", name: "Electricity demand", kind: "thematic", description: "Power consumption and grid capacity needs.", aliases: ["electricity demand", "power demand", "power grid", "grid capacity", "power consumption", "power supply", "nuclear power", "power plants", "demanda eléctrica", "Strombedarf"] },
  { code: "china_demand", name: "China demand", kind: "macro", description: "Chinese final demand for goods, commodities and services.", aliases: ["China demand", "Chinese demand", "China's economy", "Chinese economy", "China stimulus", "Chinese consumers", "China sales"] },
  { code: "trade_barriers", name: "Trade barriers", kind: "macro", description: "Tariffs, duties and trade restrictions.", aliases: ["tariff", "tariffs", "import duties", "trade war", "trade barriers", "customs duties", "aranceles", "arancel", "Zölle", "Zoll", "droits de douane"] },
  { code: "export_controls", name: "Export controls", kind: "macro", description: "Restrictions on exports of strategic technology.", aliases: ["export controls", "export control", "export restrictions", "export curbs", "export ban", "chip curbs", "Entity List", "controles de exportación", "Exportkontrollen"] },
  { code: "supply_chain_stress", name: "Supply-chain stress", kind: "risk", description: "Shortages, bottlenecks and disruptions in supply chains.", aliases: ["supply chain", "supply chains", "supply-chain", "shortage", "shortages", "bottleneck", "bottlenecks", "disruption", "disruptions", "cadena de suministro", "Lieferkette", "Lieferketten"] },
  { code: "shipping_costs", name: "Shipping costs", kind: "risk", description: "Freight rates and route disruptions.", aliases: ["shipping", "freight rates", "container rates", "shipping costs", "Red Sea", "Suez Canal", "Panama Canal", "Strait of Hormuz", "tankers", "fletes"] },
  { code: "geopolitical_risk", name: "Geopolitical risk", kind: "risk", description: "Wars, military tensions and sanctions risk.", aliases: ["geopolitical", "geopolitics", "war", "invasion", "military", "missile", "missiles", "airstrike", "airstrikes", "ceasefire", "conflict", "tensions", "guerra", "Krieg", "guerre", "conflicto"] },
  { code: "defense_spending", name: "Defense spending", kind: "thematic", theme: "defense-technology", description: "Government military procurement budgets.", aliases: ["defense spending", "defence spending", "defense budget", "defence budget", "military spending", "Pentagon", "NATO spending", "rearmament", "gasto en defensa", "Verteidigungsausgaben"] },
];

export const FACTOR_BY_CODE: ReadonlyMap<string, FactorDef> = new Map(FACTORS.map((f) => [f.code, f]));
