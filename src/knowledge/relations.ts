import type { Horizon, Mechanism, NodeKey, Relation, RelationEvidence } from "./types";

/**
 * Relaciones ESTÁTICAS curadas del grafo de impacto.
 *
 * Reglas de mantenimiento (ver docs/news-intelligence.md):
 *   * Pocas y explicables. Cada arista describe un mecanismo económico estándar o una relación que la
 *     propia empresa declara en un documento oficial. Nada de "noticia X ⇒ acción sube".
 *   * Las industrias se anclan a CÓDIGOS GICS; un test comprueba que todos los nodos existen en la
 *     ontología y que no hay duplicados.
 *   * `sign` expresa la dirección POTENCIAL cuando el origen SUBE. La dirección final de un impacto
 *     depende además del movimiento detectado en el evento (o queda como mixed/uncertain).
 *   * `confidence` es la confianza en que la relación existe y es material, no una probabilidad de
 *     movimiento de precio. Las relaciones sectoriales amplias tienen confianza moderada.
 *   * Cualquier cambio debe actualizar `REVIEWED_AT`.
 */
export const REVIEWED_AT = "2026-09-29";

const mech = (): RelationEvidence => ({ kind: "economic_mechanism" });

interface DrivesSpec {
  from: NodeKey;
  to: NodeKey;
  sign: 1 | -1 | 0;
  mechanism: Mechanism;
  strength: 1 | 2 | 3;
  horizon: Horizon;
  confidence: number;
  rationale: string;
  channel?: "SECOND_ORDER" | "MACRO";
}

function drives(spec: DrivesSpec): Relation {
  const channel = spec.channel ?? (spec.from.startsWith("factor:") ? "MACRO" : "SECOND_ORDER");
  return {
    id: `${spec.from}>${spec.to}`,
    from: spec.from,
    to: spec.to,
    type: "DRIVES",
    sign: spec.sign,
    mechanism: spec.mechanism,
    channel,
    strength: spec.strength,
    horizon: spec.horizon,
    confidence: spec.confidence,
    rationale: spec.rationale,
    evidence: mech(),
    origin: "STATIC",
    reviewedAt: REVIEWED_AT,
  };
}

function supplies(from: NodeKey, to: NodeKey, confidence: number, rationale: string, evidence: RelationEvidence, strength: 1 | 2 | 3 = 2): Relation {
  return { id: `${from}>${to}`, from, to, type: "SUPPLIES", sign: 1, channel: "SUPPLY_CHAIN", strength, horizon: "quarters", confidence, rationale, evidence, origin: "STATIC", reviewedAt: REVIEWED_AT };
}

function exposed(from: NodeKey, to: NodeKey, confidence: number, rationale: string, evidence: RelationEvidence, strength: 1 | 2 | 3 = 2): Relation {
  return { id: `${from}>${to}`, from, to, type: "EXPOSED_TO", sign: 0, channel: "SUPPLY_CHAIN", strength, horizon: "quarters", confidence, rationale, evidence, origin: "STATIC", reviewedAt: REVIEWED_AT };
}

function located(from: NodeKey, to: NodeKey): Relation {
  return { id: `${from}>${to}`, from, to, type: "LOCATED_IN", sign: 0, channel: "SUPPLY_CHAIN", strength: 2, horizon: "quarters", confidence: 0.95, rationale: "Headquarters and main operations.", evidence: { kind: "official_list", ref: "Company registration" }, origin: "STATIC", reviewedAt: REVIEWED_AT };
}

/** Relaciones que una empresa declara en su 10-K (identificadas por ticker; se resuelven a company:<uuid>). */
export interface CompanyRelationSpec {
  from: NodeKey | { ticker: string };
  to: NodeKey | { ticker: string };
  type: "SUPPLIES" | "EXPOSED_TO";
  confidence: number;
  rationale: string;
  evidence: RelationEvidence;
  strength?: 1 | 2 | 3;
}

const S = (code: string): NodeKey => `subIndustry:${code}`;
const I = (code: string): NodeKey => `industry:${code}`;
const SEC = (code: string): NodeKey => `sector:${code}`;
const C = (code: string): NodeKey => `commodity:${code}`;
const F = (code: string): NodeKey => `factor:${code}`;

export const STATIC_RELATIONS: readonly Relation[] = [
  // --- Petróleo ---------------------------------------------------------------------------------
  drives({ from: C("crude_oil"), to: S("10102020"), sign: 1, mechanism: "revenue", strength: 3, horizon: "weeks", confidence: 0.85, rationale: "Higher oil prices raise realized prices and cash flow of exploration & production companies." }),
  drives({ from: C("crude_oil"), to: S("10102010"), sign: 1, mechanism: "revenue", strength: 2, horizon: "weeks", confidence: 0.8, rationale: "Integrated majors' upstream earnings rise with oil prices (partly offset downstream)." }),
  drives({ from: C("crude_oil"), to: S("10101020"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.7, rationale: "Sustained higher oil prices tend to lift producers' drilling and services budgets." }),
  drives({ from: C("crude_oil"), to: S("10102030"), sign: 0, mechanism: "input_cost", strength: 1, horizon: "weeks", confidence: 0.6, rationale: "Refiners buy crude but sell products: margins depend on the crack spread, not the oil level." }),
  drives({ from: C("crude_oil"), to: S("20302010"), sign: -1, mechanism: "input_cost", strength: 3, horizon: "weeks", confidence: 0.85, rationale: "Jet fuel is one of airlines' largest operating costs." }),
  drives({ from: C("crude_oil"), to: S("20301010"), sign: -1, mechanism: "input_cost", strength: 2, horizon: "weeks", confidence: 0.7, rationale: "Fuel is a major cost for air freight and logistics (partly passed through via surcharges)." }),
  drives({ from: C("crude_oil"), to: S("20304030"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "weeks", confidence: 0.6, rationale: "Diesel costs weigh on trucking margins (fuel surcharges lag)." }),
  drives({ from: C("crude_oil"), to: S("25301020"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "weeks", confidence: 0.6, rationale: "Fuel is a significant cost for cruise lines." }),
  drives({ from: C("crude_oil"), to: S("15101010"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.55, rationale: "Oil-derived feedstocks are an input for commodity chemicals." }),
  drives({ from: C("crude_oil"), to: F("inflation"), sign: 1, mechanism: "input_cost", strength: 2, horizon: "months", confidence: 0.8, rationale: "Energy is a direct component of consumer price indices.", channel: "MACRO" }),
  drives({ from: C("crude_oil"), to: F("energy_costs"), sign: 1, mechanism: "input_cost", strength: 3, horizon: "weeks", confidence: 0.85, rationale: "Oil sets the price of transport fuels.", channel: "MACRO" }),
  drives({ from: C("crude_oil"), to: F("consumer_spending"), sign: -1, mechanism: "demand", strength: 1, horizon: "months", confidence: 0.6, rationale: "Higher fuel bills reduce households' discretionary income.", channel: "MACRO" }),
  // --- Gas natural --------------------------------------------------------------------------------
  drives({ from: C("natural_gas"), to: S("10102020"), sign: 1, mechanism: "revenue", strength: 2, horizon: "weeks", confidence: 0.75, rationale: "Gas-weighted producers' revenue rises with gas prices." }),
  drives({ from: C("natural_gas"), to: S("15101030"), sign: -1, mechanism: "input_cost", strength: 2, horizon: "weeks", confidence: 0.75, rationale: "Natural gas is the main feedstock for nitrogen fertilizers (ammonia)." }),
  drives({ from: C("natural_gas"), to: S("55105010"), sign: 1, mechanism: "revenue", strength: 2, horizon: "weeks", confidence: 0.6, rationale: "Gas often sets marginal power prices, lifting realized prices of power producers with non-gas generation." }),
  drives({ from: C("natural_gas"), to: S("55101010"), sign: 0, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.5, rationale: "Regulated utilities usually pass fuel costs through; effect is mixed (affordability, regulatory lag)." }),
  drives({ from: C("natural_gas"), to: F("energy_costs"), sign: 1, mechanism: "input_cost", strength: 2, horizon: "weeks", confidence: 0.8, rationale: "Gas prices feed power and heating costs.", channel: "MACRO" }),
  // --- Metales ------------------------------------------------------------------------------------
  drives({ from: C("gold"), to: S("15104030"), sign: 1, mechanism: "revenue", strength: 3, horizon: "weeks", confidence: 0.85, rationale: "Gold miners' revenue and margins are levered to the gold price." }),
  drives({ from: C("silver"), to: S("15104030"), sign: 1, mechanism: "revenue", strength: 1, horizon: "weeks", confidence: 0.5, rationale: "Silver is a by-product revenue stream for some gold miners." }),
  drives({ from: C("copper"), to: S("15104025"), sign: 1, mechanism: "revenue", strength: 3, horizon: "weeks", confidence: 0.85, rationale: "Copper miners' revenue is levered to the copper price." }),
  drives({ from: C("copper"), to: S("20104010"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.55, rationale: "Copper is a raw material for electrical components (partly hedged or passed through)." }),
  drives({ from: C("copper"), to: S("20104020"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.5, rationale: "Copper is a raw material for heavy electrical equipment." }),
  drives({ from: C("aluminum"), to: S("15103010"), sign: -1, mechanism: "input_cost", strength: 2, horizon: "months", confidence: 0.6, rationale: "Aluminum is the main input for metal beverage cans (largely passed through)." }),
  drives({ from: C("aluminum"), to: S("25102010"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.5, rationale: "Aluminum is a vehicle input cost." }),
  drives({ from: C("lithium"), to: S("15101050"), sign: 1, mechanism: "revenue", strength: 2, horizon: "months", confidence: 0.6, rationale: "Lithium producers within specialty chemicals (e.g. Albemarle) earn more when lithium prices rise." }),
  drives({ from: C("lithium"), to: S("25102010"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "Lithium is a battery input cost for electric vehicles." }),
  drives({ from: C("nickel"), to: S("25102010"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "quarters", confidence: 0.45, rationale: "Nickel is a battery cathode input for some electric vehicles." }),
  drives({ from: C("iron_ore"), to: S("15104050"), sign: 0, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.45, rationale: "US steelmakers mostly use scrap in electric-arc furnaces; iron ore's effect is indirect (global steel prices)." }),
  drives({ from: C("uranium"), to: S("55105010"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "quarters", confidence: 0.45, rationale: "Uranium fuel is a (small, long-contracted) cost for nuclear power operators." }),
  drives({ from: C("grains"), to: S("15101030"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.65, rationale: "Higher crop prices raise farm income and fertilizer demand." }),
  drives({ from: C("grains"), to: S("20106015"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.6, rationale: "Farm income drives demand for agricultural machinery." }),
  drives({ from: C("grains"), to: S("30202030"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.55, rationale: "Grains are an input cost for packaged food producers." }),
  // --- Factores macro -----------------------------------------------------------------------------
  drives({ from: F("real_yields"), to: C("gold"), sign: -1, mechanism: "valuation", strength: 2, horizon: "months", confidence: 0.7, rationale: "Gold pays no yield: higher real yields raise the opportunity cost of holding it." }),
  drives({ from: F("usd"), to: C("gold"), sign: -1, mechanism: "fx_translation", strength: 2, horizon: "weeks", confidence: 0.65, rationale: "Gold is priced in dollars; a stronger dollar makes it dearer for non-US buyers." }),
  drives({ from: F("geopolitical_risk"), to: C("gold"), sign: 1, mechanism: "safe_haven", strength: 2, horizon: "weeks", confidence: 0.65, rationale: "Gold is a traditional safe-haven asset in periods of geopolitical stress." }),
  drives({ from: F("inflation"), to: C("gold"), sign: 1, mechanism: "valuation", strength: 1, horizon: "months", confidence: 0.5, rationale: "Gold is often held as an inflation hedge (relationship is unstable)." }),
  drives({ from: F("geopolitical_risk"), to: C("crude_oil"), sign: 1, mechanism: "risk_premium", strength: 2, horizon: "weeks", confidence: 0.6, rationale: "Conflicts near producing regions or shipping lanes add a supply-risk premium to oil." }),
  drives({ from: F("geopolitical_risk"), to: S("20101010"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.6, rationale: "Military tensions tend to raise defense procurement budgets." }),
  drives({ from: F("geopolitical_risk"), to: F("shipping_costs"), sign: 1, mechanism: "supply_constraint", strength: 1, horizon: "weeks", confidence: 0.5, rationale: "Conflicts can close or reroute shipping lanes." }),
  drives({ from: F("defense_spending"), to: S("20101010"), sign: 1, mechanism: "demand", strength: 3, horizon: "quarters", confidence: 0.8, rationale: "Defense budgets are the main revenue source of defense contractors." }),
  drives({ from: F("interest_rates"), to: S("25201030"), sign: -1, mechanism: "demand", strength: 3, horizon: "months", confidence: 0.75, rationale: "Higher rates raise mortgage costs and reduce home affordability." }),
  drives({ from: F("interest_rates"), to: SEC("60"), sign: -1, mechanism: "financing_cost", strength: 2, horizon: "months", confidence: 0.7, rationale: "REITs are capital-intensive and valued partly like bonds; higher rates raise funding costs and discount rates." }),
  drives({ from: F("interest_rates"), to: SEC("55"), sign: -1, mechanism: "financing_cost", strength: 2, horizon: "months", confidence: 0.65, rationale: "Utilities are leveraged and trade as bond proxies." }),
  drives({ from: F("interest_rates"), to: S("40101010"), sign: 1, mechanism: "revenue", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "Higher rates can widen net interest margins, offset by deposit costs and credit risk." }),
  drives({ from: F("interest_rates"), to: S("40101015"), sign: 0, mechanism: "financing_cost", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "Regional banks gain on asset yields but face deposit competition and real-estate credit risk." }),
  drives({ from: F("interest_rates"), to: S("40301020"), sign: 1, mechanism: "revenue", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "Life insurers earn more on reinvested premiums when rates are higher." }),
  drives({ from: F("interest_rates"), to: S("40202010"), sign: -1, mechanism: "financing_cost", strength: 1, horizon: "months", confidence: 0.5, rationale: "Consumer lenders' funding costs and credit losses rise with rates." }),
  drives({ from: F("interest_rates"), to: I("451030"), sign: -1, mechanism: "valuation", strength: 1, horizon: "months", confidence: 0.45, rationale: "Long-duration growth equities (software) are sensitive to discount rates." }),
  drives({ from: F("interest_rates"), to: F("usd"), sign: 1, mechanism: "valuation", strength: 1, horizon: "weeks", confidence: 0.55, rationale: "Relatively higher US rates tend to attract capital into the dollar." }),
  drives({ from: F("interest_rates"), to: F("housing"), sign: -1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.7, rationale: "Mortgage rates follow the general level of rates." }),
  drives({ from: F("interest_rates"), to: F("bond_yields"), sign: 1, mechanism: "valuation", strength: 2, horizon: "weeks", confidence: 0.65, rationale: "Policy-rate expectations anchor the short and middle part of the yield curve." }),
  drives({ from: F("bond_yields"), to: SEC("60"), sign: -1, mechanism: "valuation", strength: 2, horizon: "months", confidence: 0.6, rationale: "Higher long-term yields raise cap rates and REIT funding costs." }),
  drives({ from: F("bond_yields"), to: F("housing"), sign: -1, mechanism: "financing_cost", strength: 2, horizon: "months", confidence: 0.65, rationale: "Mortgage rates track long-term government yields." }),
  drives({ from: F("inflation"), to: F("interest_rates"), sign: 1, mechanism: "policy_reaction", strength: 2, horizon: "months", confidence: 0.7, rationale: "Central banks typically respond to higher inflation with tighter policy." }),
  drives({ from: F("inflation"), to: F("consumer_spending"), sign: -1, mechanism: "demand", strength: 1, horizon: "months", confidence: 0.5, rationale: "Inflation erodes real household income." }),
  drives({ from: F("labor_market"), to: F("consumer_spending"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.65, rationale: "Employment and wages fund household consumption." }),
  drives({ from: F("labor_market"), to: F("interest_rates"), sign: 1, mechanism: "policy_reaction", strength: 1, horizon: "months", confidence: 0.55, rationale: "A strong labor market reduces the case for rate cuts." }),
  drives({ from: F("labor_market"), to: S("20202010"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.6, rationale: "Hiring activity drives staffing and payroll services demand." }),
  drives({ from: F("consumer_spending"), to: SEC("25"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.7, rationale: "Consumer discretionary revenue depends on household spending." }),
  drives({ from: F("consumer_spending"), to: S("25503030"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.65, rationale: "Broadline retailers' sales track consumer spending." }),
  drives({ from: F("consumer_spending"), to: S("40201060"), sign: 1, mechanism: "revenue", strength: 2, horizon: "months", confidence: 0.65, rationale: "Payment networks earn fees on purchase volume." }),
  drives({ from: F("consumer_spending"), to: S("25301040"), sign: 1, mechanism: "demand", strength: 1, horizon: "months", confidence: 0.55, rationale: "Restaurant traffic depends on discretionary spending." }),
  drives({ from: F("housing"), to: S("25201030"), sign: 1, mechanism: "demand", strength: 3, horizon: "months", confidence: 0.8, rationale: "Homebuilders' orders track housing demand." }),
  drives({ from: F("housing"), to: S("25504030"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.65, rationale: "Home-improvement spending rises with housing turnover." }),
  drives({ from: F("housing"), to: S("20102010"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.6, rationale: "Building products demand follows construction activity." }),
  drives({ from: F("economic_growth"), to: SEC("20"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.55, rationale: "Industrial demand is cyclical." }),
  drives({ from: F("economic_growth"), to: C("copper"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.6, rationale: "Copper demand is tied to construction, manufacturing and grids." }),
  drives({ from: F("economic_growth"), to: C("crude_oil"), sign: 1, mechanism: "demand", strength: 1, horizon: "months", confidence: 0.55, rationale: "Oil demand rises with economic activity." }),
  drives({ from: F("economic_growth"), to: F("credit_spreads"), sign: -1, mechanism: "risk_premium", strength: 1, horizon: "months", confidence: 0.55, rationale: "Stronger growth lowers expected defaults." }),
  drives({ from: F("credit_spreads"), to: S("40202010"), sign: -1, mechanism: "financing_cost", strength: 2, horizon: "months", confidence: 0.6, rationale: "Wider spreads raise consumer lenders' funding costs and signal credit stress." }),
  drives({ from: F("credit_spreads"), to: S("40203020"), sign: -1, mechanism: "demand", strength: 1, horizon: "months", confidence: 0.5, rationale: "Credit stress reduces underwriting and deal activity." }),
  drives({ from: F("credit_spreads"), to: S("40203010"), sign: 0, mechanism: "revenue", strength: 1, horizon: "months", confidence: 0.45, rationale: "Alternative asset managers with private-credit books face mixed effects (marks vs. new lending opportunities)." }),
  drives({ from: F("usd"), to: SEC("45"), sign: -1, mechanism: "fx_translation", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "US technology companies earn a large share of revenue abroad; a stronger dollar lowers translated revenue." }),
  drives({ from: F("usd"), to: SEC("15"), sign: -1, mechanism: "fx_translation", strength: 1, horizon: "quarters", confidence: 0.45, rationale: "Dollar strength weighs on dollar-denominated commodity prices and foreign sales." }),
  drives({ from: F("usd"), to: C("crude_oil"), sign: -1, mechanism: "fx_translation", strength: 1, horizon: "weeks", confidence: 0.45, rationale: "Oil is priced in dollars (relationship is unstable)." }),
  drives({ from: F("energy_costs"), to: SEC("15"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.5, rationale: "Materials production is energy-intensive." }),
  drives({ from: F("china_demand"), to: C("copper"), sign: 1, mechanism: "demand", strength: 2, horizon: "months", confidence: 0.7, rationale: "China consumes roughly half of the world's refined copper." }),
  drives({ from: F("china_demand"), to: C("iron_ore"), sign: 1, mechanism: "demand", strength: 3, horizon: "months", confidence: 0.75, rationale: "Chinese steel production dominates seaborne iron-ore demand." }),
  drives({ from: F("china_demand"), to: C("crude_oil"), sign: 1, mechanism: "demand", strength: 1, horizon: "months", confidence: 0.6, rationale: "China is the largest crude importer." }),
  drives({ from: F("china_demand"), to: S("45301020"), sign: 1, mechanism: "revenue", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "China is a large end market for US semiconductor companies." }),
  drives({ from: F("china_demand"), to: S("25203010"), sign: 1, mechanism: "revenue", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "Chinese consumers are a key market for luxury and apparel brands." }),
  drives({ from: F("china_demand"), to: S("20106010"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.45, rationale: "Construction and mining machinery demand is sensitive to Chinese activity." }),
  drives({ from: F("trade_barriers"), to: F("inflation"), sign: 1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.6, rationale: "Tariffs raise the price of imported goods." }),
  drives({ from: F("trade_barriers"), to: S("25504010"), sign: -1, mechanism: "input_cost", strength: 2, horizon: "months", confidence: 0.6, rationale: "Apparel retailers source most goods from abroad." }),
  drives({ from: F("trade_barriers"), to: S("25102010"), sign: -1, mechanism: "input_cost", strength: 2, horizon: "months", confidence: 0.6, rationale: "Automakers rely on cross-border parts and vehicle trade." }),
  drives({ from: F("trade_barriers"), to: S("45202030"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.55, rationale: "Hardware makers import components and finished devices." }),
  drives({ from: F("trade_barriers"), to: S("30101040"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.5, rationale: "General merchandise retailers import a large share of goods." }),
  drives({ from: F("trade_barriers"), to: S("15104050"), sign: 1, mechanism: "trade_access", strength: 2, horizon: "months", confidence: 0.6, rationale: "Import tariffs protect domestic steel producers' prices." }),
  drives({ from: F("trade_barriers"), to: F("supply_chain_stress"), sign: 1, mechanism: "supply_constraint", strength: 1, horizon: "months", confidence: 0.5, rationale: "Tariffs force sourcing changes." }),
  drives({ from: F("export_controls"), to: S("45301020"), sign: -1, mechanism: "trade_access", strength: 3, horizon: "quarters", confidence: 0.7, rationale: "Restrictions on selling advanced chips abroad reduce addressable revenue." }),
  drives({ from: F("export_controls"), to: S("45301010"), sign: -1, mechanism: "trade_access", strength: 3, horizon: "quarters", confidence: 0.7, rationale: "Chip-equipment makers have significant sales to Chinese fabs." }),
  drives({ from: F("supply_chain_stress"), to: S("25102010"), sign: -1, mechanism: "supply_constraint", strength: 2, horizon: "months", confidence: 0.6, rationale: "Automakers depend on just-in-time parts supply." }),
  drives({ from: F("supply_chain_stress"), to: S("45202030"), sign: -1, mechanism: "supply_constraint", strength: 1, horizon: "months", confidence: 0.5, rationale: "Hardware makers depend on Asian component supply." }),
  drives({ from: F("supply_chain_stress"), to: F("inflation"), sign: 1, mechanism: "supply_constraint", strength: 1, horizon: "months", confidence: 0.55, rationale: "Shortages push up goods prices." }),
  drives({ from: F("shipping_costs"), to: S("25503030"), sign: -1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.5, rationale: "Importing retailers pay ocean freight." }),
  drives({ from: F("shipping_costs"), to: F("inflation"), sign: 1, mechanism: "input_cost", strength: 1, horizon: "months", confidence: 0.45, rationale: "Freight costs feed goods prices." }),
  // --- IA, centros de datos y electricidad -----------------------------------------------------------
  drives({ from: F("ai_demand"), to: S("45301020"), sign: 1, mechanism: "demand", strength: 3, horizon: "quarters", confidence: 0.8, rationale: "AI training and inference run on accelerators, networking chips and memory." }),
  drives({ from: F("ai_demand"), to: S("45301010"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.7, rationale: "Advanced AI chips require leading-edge fab capacity and equipment." }),
  drives({ from: F("ai_demand"), to: S("45202030"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.65, rationale: "AI servers and storage are built by hardware makers." }),
  drives({ from: F("ai_demand"), to: S("45201020"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.65, rationale: "AI clusters need high-speed networking equipment." }),
  drives({ from: F("ai_demand"), to: S("45203015"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.55, rationale: "Connectors, optical fiber and components go into AI servers." }),
  drives({ from: F("ai_demand"), to: F("data_centers"), sign: 1, mechanism: "demand", strength: 3, horizon: "quarters", confidence: 0.8, rationale: "AI workloads require new data-center capacity.", channel: "MACRO" }),
  drives({ from: F("data_centers"), to: F("electricity_demand"), sign: 1, mechanism: "demand", strength: 3, horizon: "quarters", confidence: 0.75, rationale: "Data centers are among the fastest-growing sources of power demand.", channel: "MACRO" }),
  drives({ from: F("data_centers"), to: S("60108050"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.7, rationale: "Data-center REITs lease capacity to cloud and AI tenants." }),
  drives({ from: F("data_centers"), to: S("20104010"), sign: 1, mechanism: "demand", strength: 3, horizon: "quarters", confidence: 0.7, rationale: "Power distribution, cooling and electrical gear are core data-center inputs." }),
  drives({ from: F("data_centers"), to: S("20104020"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.6, rationale: "Grid and on-site generation equipment is needed to power new capacity." }),
  drives({ from: F("data_centers"), to: S("20103010"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.6, rationale: "Engineering contractors build data centers and grid connections." }),
  drives({ from: F("data_centers"), to: C("copper"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "Data centers and their grid connections use significant copper." }),
  drives({ from: F("electricity_demand"), to: S("55101010"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.65, rationale: "Load growth expands utilities' rate base and sales." }),
  drives({ from: F("electricity_demand"), to: S("55105010"), sign: 1, mechanism: "revenue", strength: 3, horizon: "quarters", confidence: 0.7, rationale: "Independent power producers benefit from tighter power markets and long-term supply contracts." }),
  drives({ from: F("electricity_demand"), to: S("55103010"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.55, rationale: "Load growth supports multi-utilities' investment plans." }),
  drives({ from: F("electricity_demand"), to: S("20104020"), sign: 1, mechanism: "demand", strength: 2, horizon: "quarters", confidence: 0.6, rationale: "Turbines and grid equipment are needed for new generation." }),
  drives({ from: F("electricity_demand"), to: C("natural_gas"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.55, rationale: "Gas-fired plants supply much of incremental US power." }),
  drives({ from: F("electricity_demand"), to: C("uranium"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "Nuclear restarts and extensions raise uranium demand." }),
  drives({ from: F("electricity_demand"), to: C("copper"), sign: 1, mechanism: "demand", strength: 1, horizon: "quarters", confidence: 0.5, rationale: "Grid expansion is copper-intensive." }),
  // --- Cadena de suministro de semiconductores (declarada en documentos oficiales) ---------------------
  supplies("external:asml", "external:tsmc", 0.9, "ASML supplies lithography systems to TSMC, one of its largest customers.", { kind: "company_filing", ref: "ASML annual report (customer concentration)" }),
  supplies("external:asml", S("45301020"), 0.75, "EUV/DUV lithography is required for leading-edge chip production.", { kind: "company_filing", ref: "ASML annual report" }, 1),
  supplies("external:tsmc", S("45301020"), 0.8, "TSMC manufactures chips for many fabless semiconductor companies.", { kind: "company_filing", ref: "TSMC annual report" }),
  exposed(S("45301020"), "country:TW", 0.75, "Leading-edge foundry capacity is concentrated in Taiwan.", { kind: "economic_mechanism" }),
  exposed(S("45301010"), "country:CN", 0.65, "China is a large buyer of semiconductor equipment.", { kind: "economic_mechanism" }),
  exposed(S("45202030"), "country:CN", 0.6, "Assembly of consumer hardware is concentrated in China.", { kind: "economic_mechanism" }, 1),
  located("external:tsmc", "country:TW"),
  located("external:asml", "country:NL"),
  located("external:samsung", "country:KR"),
  located("external:sk_hynix", "country:KR"),
  located("external:foxconn", "country:TW"),
  located("external:aramco", "country:SA"),
  drives({ from: "external:aramco", to: C("crude_oil"), sign: 0, mechanism: "supply_constraint", strength: 1, horizon: "weeks", confidence: 0.6, rationale: "Aramco's production and pricing decisions affect global crude supply." }),
];

/**
 * Relaciones empresa ↔ empresa/país declaradas por las propias empresas (10-K). Se resuelven a
 * company:<uuid> al cargar el grafo (ticker → emisor). Lista corta y verificable.
 */
export const COMPANY_RELATIONS: readonly CompanyRelationSpec[] = [
  { from: "external:tsmc", to: { ticker: "NVDA" }, type: "SUPPLIES", confidence: 0.9, rationale: "NVIDIA uses foundries such as TSMC to manufacture its GPUs.", evidence: { kind: "company_filing", ref: "NVIDIA Form 10-K, Item 1 (Manufacturing)" }, strength: 3 },
  { from: "external:samsung", to: { ticker: "NVDA" }, type: "SUPPLIES", confidence: 0.7, rationale: "NVIDIA names Samsung among its foundry and memory suppliers.", evidence: { kind: "company_filing", ref: "NVIDIA Form 10-K, Item 1 (Manufacturing)" }, strength: 1 },
  { from: "external:tsmc", to: { ticker: "AMD" }, type: "SUPPLIES", confidence: 0.9, rationale: "AMD relies on TSMC for its leading-edge CPUs and GPUs.", evidence: { kind: "company_filing", ref: "AMD Form 10-K, Item 1 (Manufacturing)" }, strength: 3 },
  { from: "external:tsmc", to: { ticker: "AVGO" }, type: "SUPPLIES", confidence: 0.85, rationale: "Broadcom relies on TSMC for the majority of its wafers.", evidence: { kind: "company_filing", ref: "Broadcom Form 10-K, Item 1A (Risk factors)" }, strength: 3 },
  { from: "external:tsmc", to: { ticker: "QCOM" }, type: "SUPPLIES", confidence: 0.8, rationale: "Qualcomm relies on foundries including TSMC and Samsung.", evidence: { kind: "company_filing", ref: "Qualcomm Form 10-K, Item 1A (Risk factors)" }, strength: 2 },
  { from: "external:foxconn", to: { ticker: "AAPL" }, type: "SUPPLIES", confidence: 0.85, rationale: "Hon Hai (Foxconn) is on Apple's published supplier list and assembles Apple devices.", evidence: { kind: "official_list", ref: "Apple Supplier List" }, strength: 2 },
  { from: { ticker: "AAPL" }, to: "country:CN", type: "EXPOSED_TO", confidence: 0.85, rationale: "Apple states that substantially all manufacturing is performed by outsourcing partners located primarily in China and other Asian countries.", evidence: { kind: "company_filing", ref: "Apple Form 10-K, Item 1A (Risk factors)" }, strength: 3 },
  { from: { ticker: "NVDA" }, to: "country:CN", type: "EXPOSED_TO", confidence: 0.85, rationale: "NVIDIA discloses that US export controls restrict sales of its data-center products to China.", evidence: { kind: "company_filing", ref: "NVIDIA Form 10-K, Item 1A (Risk factors)" }, strength: 3 },
  { from: { ticker: "NVDA" }, to: "country:TW", type: "EXPOSED_TO", confidence: 0.8, rationale: "NVIDIA's manufacturing partners are concentrated in Taiwan.", evidence: { kind: "company_filing", ref: "NVIDIA Form 10-K, Item 1A (Risk factors)" }, strength: 2 },
  { from: { ticker: "AMD" }, to: "country:TW", type: "EXPOSED_TO", confidence: 0.8, rationale: "AMD's leading-edge manufacturing depends on TSMC in Taiwan.", evidence: { kind: "company_filing", ref: "AMD Form 10-K, Item 1A (Risk factors)" }, strength: 2 },
  { from: "external:asml", to: { ticker: "INTC" }, type: "SUPPLIES", confidence: 0.8, rationale: "Intel is one of ASML's largest lithography customers.", evidence: { kind: "company_filing", ref: "ASML annual report (customer concentration)" }, strength: 2 },
  { from: "external:sk_hynix", to: { ticker: "NVDA" }, type: "SUPPLIES", confidence: 0.55, rationale: "High-bandwidth memory used in NVIDIA accelerators is supplied by memory makers including SK Hynix (industry reporting; not named in the 10-K).", evidence: { kind: "economic_mechanism", ref: "Industry reporting — lower confidence" }, strength: 2 },
];
