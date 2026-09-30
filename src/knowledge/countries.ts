/**
 * Países (ISO 3166-1 alfa-2) y regiones que el motor de noticias sabe reconocer.
 *
 * No sustituye a la tabla `countries` (que solo contiene los países del universo): es la ontología
 * geográfica para relacionar noticias. Los alias incluyen nombre, gentilicio, capital (metonimia
 * habitual en prensa: "Beijing says…") y formas en es/fr/de/it/pt cuando difieren.
 *
 * `weakAliases`: alias que también se usan con otros sentidos (capital como ciudad, "American" en
 * nombres propios). Se aceptan con menor confianza.
 */
export interface CountryDef {
  code: string;
  name: string;
  region: "north_america" | "latin_america" | "europe" | "middle_east" | "africa" | "asia_pacific" | "supranational";
  aliases: readonly string[];
  weakAliases?: readonly string[];
}

export const COUNTRIES: readonly CountryDef[] = [
  { code: "US", name: "United States", region: "north_america", aliases: ["United States", "U.S.", "US", "USA", "U.S.A.", "Estados Unidos", "EEUU", "EE.UU.", "États-Unis", "Etats-Unis", "Vereinigte Staaten", "Stati Uniti", "EUA"], weakAliases: ["America", "American", "Americans", "Washington", "White House"] },
  { code: "CA", name: "Canada", region: "north_america", aliases: ["Canada", "Canadian", "Canadá", "Kanada"], weakAliases: ["Ottawa"] },
  { code: "MX", name: "Mexico", region: "latin_america", aliases: ["Mexico", "Mexican", "México", "Mexique", "Mexiko"] },
  { code: "BR", name: "Brazil", region: "latin_america", aliases: ["Brazil", "Brazilian", "Brasil", "Brésil", "Brasilien"], weakAliases: ["Brasilia"] },
  { code: "AR", name: "Argentina", region: "latin_america", aliases: ["Argentina", "Argentine", "Argentinian", "Argentinien"] },
  { code: "CL", name: "Chile", region: "latin_america", aliases: ["Chile", "Chilean", "Chili"] },
  { code: "PE", name: "Peru", region: "latin_america", aliases: ["Peru", "Peruvian", "Perú", "Pérou"] },
  { code: "VE", name: "Venezuela", region: "latin_america", aliases: ["Venezuela", "Venezuelan"], weakAliases: ["Caracas"] },
  { code: "PA", name: "Panama", region: "latin_america", aliases: ["Panama Canal", "Panamá", "Panama"] },
  { code: "GB", name: "United Kingdom", region: "europe", aliases: ["United Kingdom", "U.K.", "UK", "Britain", "British", "Reino Unido", "Royaume-Uni", "Großbritannien", "Regno Unito"], weakAliases: ["London"] },
  { code: "IE", name: "Ireland", region: "europe", aliases: ["Ireland", "Irish", "Irlanda", "Irlande", "Irland"] },
  { code: "DE", name: "Germany", region: "europe", aliases: ["Germany", "German", "Alemania", "Allemagne", "Deutschland", "Germania", "Alemanha"], weakAliases: ["Berlin"] },
  { code: "FR", name: "France", region: "europe", aliases: ["France", "French", "Francia", "Frankreich", "França"], weakAliases: ["Paris"] },
  { code: "IT", name: "Italy", region: "europe", aliases: ["Italy", "Italian", "Italia", "Italie", "Italien"], weakAliases: ["Rome"] },
  { code: "ES", name: "Spain", region: "europe", aliases: ["Spain", "Spanish", "España", "Espagne", "Spanien", "Spagna"], weakAliases: ["Madrid"] },
  { code: "NL", name: "Netherlands", region: "europe", aliases: ["Netherlands", "Dutch", "Países Bajos", "Pays-Bas", "Niederlande", "Holland"] },
  { code: "CH", name: "Switzerland", region: "europe", aliases: ["Switzerland", "Swiss", "Suiza", "Suisse", "Schweiz", "Svizzera"] },
  { code: "NO", name: "Norway", region: "europe", aliases: ["Norway", "Norwegian", "Noruega", "Norvège", "Norwegen"] },
  { code: "PL", name: "Poland", region: "europe", aliases: ["Poland", "Polish", "Polonia", "Pologne", "Polen"] },
  { code: "UA", name: "Ukraine", region: "europe", aliases: ["Ukraine", "Ukrainian", "Ucrania", "Ukrainie"], weakAliases: ["Kyiv", "Kiev"] },
  { code: "RU", name: "Russia", region: "europe", aliases: ["Russia", "Russian", "Rusia", "Russie", "Russland", "Kremlin"], weakAliases: ["Moscow", "Moscú"] },
  { code: "TR", name: "Turkey", region: "europe", aliases: ["Turkey", "Türkiye", "Turkish", "Turquía", "Turquie", "Türkei"], weakAliases: ["Ankara"] },
  { code: "EU", name: "European Union", region: "supranational", aliases: ["European Union", "EU", "E.U.", "Eurozone", "euro zone", "euro area", "Unión Europea", "UE", "Union européenne", "Europäische Union", "Brussels", "European Commission"] },
  { code: "IL", name: "Israel", region: "middle_east", aliases: ["Israel", "Israeli", "Israelí", "Israélien"], weakAliases: ["Tel Aviv", "Jerusalem"] },
  { code: "PS", name: "Palestinian Territories", region: "middle_east", aliases: ["Gaza", "West Bank", "Palestinian", "Hamas"] },
  { code: "IR", name: "Iran", region: "middle_east", aliases: ["Iran", "Iranian", "Irán", "Tehran", "Teherán", "Strait of Hormuz", "Hormuz"] },
  { code: "IQ", name: "Iraq", region: "middle_east", aliases: ["Iraq", "Iraqi", "Irak"], weakAliases: ["Baghdad"] },
  { code: "SA", name: "Saudi Arabia", region: "middle_east", aliases: ["Saudi Arabia", "Saudi", "Saudis", "Arabia Saudí", "Arabia Saudita", "Arabie saoudite", "Saudi-Arabien", "Riyadh"] },
  { code: "AE", name: "United Arab Emirates", region: "middle_east", aliases: ["United Arab Emirates", "UAE", "Emirati", "Abu Dhabi", "Dubai"] },
  { code: "QA", name: "Qatar", region: "middle_east", aliases: ["Qatar", "Qatari", "Catar"], weakAliases: ["Doha"] },
  { code: "YE", name: "Yemen", region: "middle_east", aliases: ["Yemen", "Houthi", "Houthis", "Red Sea"] },
  { code: "SY", name: "Syria", region: "middle_east", aliases: ["Syria", "Syrian", "Siria"] },
  { code: "LB", name: "Lebanon", region: "middle_east", aliases: ["Lebanon", "Hezbollah", "Líbano"] },
  { code: "EG", name: "Egypt", region: "africa", aliases: ["Egypt", "Egyptian", "Egipto", "Suez Canal", "Suez"] },
  { code: "ZA", name: "South Africa", region: "africa", aliases: ["South Africa", "South African", "Sudáfrica", "Afrique du Sud"] },
  { code: "NG", name: "Nigeria", region: "africa", aliases: ["Nigeria", "Nigerian"] },
  { code: "CD", name: "DR Congo", region: "africa", aliases: ["Democratic Republic of Congo", "DR Congo", "DRC", "Congo"] },
  { code: "CN", name: "China", region: "asia_pacific", aliases: ["China", "Chinese", "PRC", "Chine", "Cina", "Beijing", "Pekín", "Peking", "Chinesische", "Chinas"] },
  { code: "HK", name: "Hong Kong", region: "asia_pacific", aliases: ["Hong Kong"] },
  { code: "TW", name: "Taiwan", region: "asia_pacific", aliases: ["Taiwan", "Taiwanese", "Taiwán", "Taïwan", "Taipei", "Taiwan Strait"] },
  { code: "JP", name: "Japan", region: "asia_pacific", aliases: ["Japan", "Japanese", "Japón", "Japon", "Giappone", "Japão"], weakAliases: ["Tokyo", "Tokio"] },
  { code: "KR", name: "South Korea", region: "asia_pacific", aliases: ["South Korea", "South Korean", "Corea del Sur", "Corée du Sud", "Südkorea"], weakAliases: ["Seoul", "Korea", "Korean"] },
  { code: "KP", name: "North Korea", region: "asia_pacific", aliases: ["North Korea", "North Korean", "Pyongyang", "Corea del Norte", "Nordkorea"] },
  { code: "IN", name: "India", region: "asia_pacific", aliases: ["India", "Indian", "Inde", "Indien"], weakAliases: ["New Delhi"] },
  { code: "ID", name: "Indonesia", region: "asia_pacific", aliases: ["Indonesia", "Indonesian", "Indonésie", "Indonesien"], weakAliases: ["Jakarta"] },
  { code: "VN", name: "Vietnam", region: "asia_pacific", aliases: ["Vietnam", "Vietnamese", "Viet Nam"] },
  { code: "MY", name: "Malaysia", region: "asia_pacific", aliases: ["Malaysia", "Malaysian", "Malasia"] },
  { code: "SG", name: "Singapore", region: "asia_pacific", aliases: ["Singapore", "Singaporean", "Singapur"] },
  { code: "PH", name: "Philippines", region: "asia_pacific", aliases: ["Philippines", "Philippine", "Filipinas"] },
  { code: "AU", name: "Australia", region: "asia_pacific", aliases: ["Australia", "Australian", "Australie", "Australien"], weakAliases: ["Canberra"] },
  { code: "KZ", name: "Kazakhstan", region: "asia_pacific", aliases: ["Kazakhstan", "Kazakh", "Kazajistán"] },
];

export const COUNTRY_BY_CODE: ReadonlyMap<string, CountryDef> = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryName(code: string): string {
  return COUNTRY_BY_CODE.get(code)?.name ?? code;
}
