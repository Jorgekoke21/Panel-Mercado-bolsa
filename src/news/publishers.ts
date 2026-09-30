import type { SourceTier } from "@/domain/news";

/**
 * Calidad de editores por dominio registrable. Es la base del componente `sourceQuality` de la
 * confianza. Lista corta y revisable: todo lo que no aparece es tier 4 (desconocido), nunca se asume
 * calidad.
 *
 *   tier 1 — fuentes primarias oficiales (asignado por el adaptador, no por dominio: fed, sec…)
 *   tier 2 — agencias y medios financieros de referencia
 *   tier 3 — medios generalistas o sectoriales establecidos
 */
const TIER_2 = [
  "reuters.com", "apnews.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "marketwatch.com", "barrons.com", "economist.com",
  "nytimes.com", "washingtonpost.com", "afp.com", "nikkei.com", "asia.nikkei.com", "handelsblatt.com", "lesechos.fr", "expansion.com",
  "cincodias.elpais.com", "elpais.com", "scmp.com", "bbc.co.uk", "bbc.com", "theguardian.com", "axios.com", "politico.com", "semafor.com",
  "fortune.com", "forbes.com", "businessinsider.com", "finance.yahoo.com", "yahoo.com", "investing.com", "morningstar.com", "spglobal.com",
  "ft.lk", "lemonde.fr", "faz.net", "sueddeutsche.de", "spiegel.de", "zeit.de", "corriere.it", "ilsole24ore.com", "caixinglobal.com",
  "japantimes.co.jp", "kyodonews.net", "yna.co.kr", "koreaherald.com", "straitstimes.com", "theedgemarkets.com", "globeandmail.com", "abc.net.au",
  "afr.com", "livemint.com", "economictimes.indiatimes.com", "moneycontrol.com", "aljazeera.com", "dw.com", "france24.com", "euronews.com",
];

const TIER_3 = [
  "cnn.com", "foxbusiness.com", "foxnews.com", "nbcnews.com", "cbsnews.com", "abcnews.go.com", "usatoday.com", "latimes.com", "npr.org",
  "thehill.com", "techcrunch.com", "theverge.com", "wired.com", "arstechnica.com", "tomshardware.com", "anandtech.com", "eetimes.com",
  "fiercebiotech.com", "fiercepharma.com", "statnews.com", "biopharmadive.com", "utilitydive.com", "datacenterdynamics.com", "oilprice.com",
  "rigzone.com", "mining.com", "kitco.com", "freightwaves.com", "supplychaindive.com", "retaildive.com", "americanbanker.com", "pionline.com",
  "fool.com", "seekingalpha.com", "benzinga.com", "thestreet.com", "zacks.com", "investopedia.com", "kiplinger.com", "insidermonkey.com",
  "independent.co.uk", "telegraph.co.uk", "thetimes.co.uk", "cityam.com", "irishtimes.com", "cbc.ca", "financialpost.com", "channelnewsasia.com",
  "timesofindia.indiatimes.com", "hindustantimes.com", "thehindu.com", "business-standard.com", "koreatimes.co.kr", "taipeitimes.com",
  "focustaiwan.tw", "digitimes.com", "globaltimes.cn", "chinadaily.com.cn", "xinhuanet.com", "tass.com", "rt.com", "arabnews.com", "gulfnews.com",
  "thenationalnews.com", "timesofisrael.com", "haaretz.com", "jpost.com", "infobae.com", "clarin.com", "eleconomista.es", "elmundo.es",
  "abc.es", "lavanguardia.com", "elconfidencial.com", "lefigaro.fr", "latribune.fr", "boursorama.com", "welt.de", "tagesschau.de", "n-tv.de",
  "finanzen.net", "boerse.de", "repubblica.it", "milanofinanza.it", "valor.globo.com", "globo.com", "folha.uol.com.br", "estadao.com.br",
  "prnewswire.com", "businesswire.com", "globenewswire.com", "accessnewswire.com",
];

/**
 * Editores que son NOTAS DE PRENSA pagadas (distribución de comunicados): útiles como fuente primaria
 * de la empresa emisora, pero no corroboran de forma independiente.
 */
export const PRESS_RELEASE_WIRES = new Set(["prnewswire.com", "businesswire.com", "globenewswire.com", "accessnewswire.com", "newsfilecorp.com", "einpresswire.com"]);

/** Nombres de agencias que republican otros medios (AP, Reuters en medios locales). */
export const WIRE_SERVICES = new Set(["apnews.com", "reuters.com", "afp.com"]);

const TIERS = new Map<string, SourceTier>();
for (const d of TIER_2) TIERS.set(d, 2);
for (const d of TIER_3) TIERS.set(d, 3);

/** Tier por host completo (finance.yahoo.com, economictimes.indiatimes.com) o, si no, por dominio registrable. */
export function publisherTier(host: string, registrable: string = host): SourceTier {
  const h = host.toLowerCase().replace(/^www\d?\./, "");
  return TIERS.get(h) ?? TIERS.get(registrable) ?? 4;
}

/** Peso de calidad por tier (componente sourceQuality). */
export const TIER_QUALITY: Record<SourceTier, number> = { 1: 1, 2: 0.85, 3: 0.65, 4: 0.4 };

export const TIER_LABELS: Record<SourceTier, string> = {
  1: "Official primary source",
  2: "Major financial / wire media",
  3: "Established media",
  4: "Unrated source",
};
