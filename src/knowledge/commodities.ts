/**
 * Materias primas: ontología conceptual (Fase 4). MarketRadar todavía NO tiene precios de materias
 * primas (sin fuente gratuita con licencia adecuada): estas definiciones sirven para relacionar
 * noticias, eventos y sectores, nunca para mostrar cotizaciones.
 *
 * `aliases` se buscan sin distinguir mayúsculas (son nombres comunes), con límites de palabra.
 * `contextRequired`: alias ambiguos que solo cuentan si aparece también una palabra de mercado
 * (p. ej. "gold medal" no es oro como materia prima).
 */
export interface CommodityDef {
  code: string;
  name: string;
  group: "energy" | "precious_metals" | "base_metals" | "battery_metals" | "nuclear" | "agriculture";
  unit: string;
  aliases: readonly string[];
  contextRequired?: readonly string[];
}

export const COMMODITY_CONTEXT = /\b(price|prices|prices?\s+of|futures|ounce|barrel|bbl|tonne|ton|output|production|supply|demand|mine|mining|miners?|producers?|exports?|imports?|market|rally|record|traders|investors|bullion|spot|precio|precios|cours|preis|preise|onza|barril)\b|\$\s?\d/i;

export const COMMODITIES: readonly CommodityDef[] = [
  { code: "crude_oil", name: "Crude oil", group: "energy", unit: "USD/bbl", aliases: ["crude oil", "crude", "oil price", "oil prices", "Brent", "WTI", "OPEC", "OPEC+", "oil output", "oil supply", "oil demand", "oil exports", "barrel", "petróleo", "crudo", "pétrole", "Erdöl", "Ölpreis", "Ölpreise", "petrolio", "oil"], contextRequired: ["oil", "barrel"] },
  { code: "natural_gas", name: "Natural gas", group: "energy", unit: "USD/MMBtu", aliases: ["natural gas", "LNG", "liquefied natural gas", "Henry Hub", "TTF", "gas prices", "gas natural", "gaz naturel", "Erdgas", "Gaspreis"] },
  { code: "coal", name: "Coal", group: "energy", unit: "USD/t", aliases: ["coal", "thermal coal", "carbón", "charbon", "Kohle"], contextRequired: ["coal"] },
  { code: "gold", name: "Gold", group: "precious_metals", unit: "USD/oz", aliases: ["gold", "bullion", "oro", "or jaune"], contextRequired: ["gold"] },
  { code: "silver", name: "Silver", group: "precious_metals", unit: "USD/oz", aliases: ["silver", "plata", "Silber", "argento"], contextRequired: ["silver", "plata", "argento"] },
  { code: "copper", name: "Copper", group: "base_metals", unit: "USD/t", aliases: ["copper", "cobre", "cuivre", "Kupfer", "rame"] },
  { code: "aluminum", name: "Aluminum", group: "base_metals", unit: "USD/t", aliases: ["aluminum", "aluminium", "aluminio", "Aluminium"] },
  { code: "iron_ore", name: "Iron ore", group: "base_metals", unit: "USD/t", aliases: ["iron ore", "mineral de hierro", "minerai de fer", "Eisenerz"] },
  { code: "nickel", name: "Nickel", group: "battery_metals", unit: "USD/t", aliases: ["nickel", "níquel", "Nickel"] },
  { code: "lithium", name: "Lithium", group: "battery_metals", unit: "USD/t", aliases: ["lithium", "litio", "Lithium"] },
  { code: "uranium", name: "Uranium", group: "nuclear", unit: "USD/lb", aliases: ["uranium", "uranio", "Uran", "yellowcake"] },
  { code: "grains", name: "Grains (wheat, corn, soybeans)", group: "agriculture", unit: "USD/bu", aliases: ["wheat", "corn", "soybean", "soybeans", "grain", "grains", "trigo", "maíz", "soja", "blé", "Weizen", "Mais"], contextRequired: ["corn", "grain", "grains", "soja", "Mais"] },
];

export const COMMODITY_BY_CODE: ReadonlyMap<string, CommodityDef> = new Map(COMMODITIES.map((c) => [c.code, c]));
