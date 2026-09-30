import type { SecurityMarketSnapshot } from "@/domain/market-data";
import type { SecuritySummary } from "@/domain/reference";
import type { TimeRange } from "@/domain/time-range";
import { buildRelationGraph, type RelationGraph } from "@/knowledge/graph";
import type { NodeKey } from "@/knowledge/types";
import { parseNodeKey } from "@/knowledge/types";
import { buildUniverse, type Universe, type UniverseCompany } from "@/knowledge/universe";
import { periodReturns } from "@/lib/calculations/period-returns";
import { companyPath, indexPath, industryPath, sectorPath, subIndustryPath } from "@/lib/routes";
import type { Repositories } from "./market-rows";

/**
 * Contexto compartido por los servicios de noticias e inteligencia en una petición: universo, grafo,
 * etiquetas/enlaces de nodos y datos de mercado REALES de las entidades (instantáneas e índices sintéticos).
 */
export interface NewsWebContext {
  universe: Universe;
  graph: RelationGraph;
  securities: SecuritySummary[];
  /** subIndustryCode ⇒ industryCode. */
  parentIndustry: Map<string, string>;
  label(node: string): string;
  href(node: string): string | null;
  /** Instantáneas (1D, volumen relativo…) de la cotización principal de cada emisor. */
  snapshots(companyIds: readonly string[]): Promise<Map<string, SecurityMarketSnapshot>>;
  /** Rendimientos de los índices sintéticos de MarketRadar para nodos sector/industria/sub-industria/índice. */
  groupReturns(nodes: readonly NodeKey[], ranges: readonly TimeRange[]): Promise<Map<NodeKey, Partial<Record<TimeRange, number | null>>>>;
}

const memo = new WeakMap<Repositories, Promise<NewsWebContext>>();

export function getNewsWebContext(repos: Repositories): Promise<NewsWebContext> {
  let p = memo.get(repos);
  if (!p) {
    p = buildContext(repos);
    memo.set(repos, p);
  }
  return p;
}

async function buildContext(repos: Repositories): Promise<NewsWebContext> {
  const securities = await repos.reference.listSecurities();
  const universe = buildUniverse(securities);
  const graph = buildRelationGraph(universe);
  const parentIndustry = new Map<string, string>();
  for (const c of universe.companies) if (c.subIndustryCode && c.industryCode) parentIndustry.set(c.subIndustryCode, c.industryCode);
  const byId = new Map(securities.map((s) => [s.securityId, s]));
  const snapshotCache = new Map<string, SecurityMarketSnapshot | null>();

  const primarySecurity = (c: UniverseCompany) => byId.get(c.securityIds[c.primaryTicker] ?? "");

  return {
    universe,
    graph,
    securities,
    parentIndustry,
    label: (node) => graph.label(node as NodeKey),
    href(node) {
      const parsed = parseNodeKey(node);
      if (!parsed) return null;
      switch (parsed.kind) {
        case "company": {
          const c = universe.byCompanyId.get(parsed.key);
          return c ? companyPath(c.primaryTicker) : null;
        }
        case "security": {
          const s = universe.bySecurityId.get(parsed.key);
          return s ? companyPath(s.ticker) : null;
        }
        case "sector": {
          const s = universe.sectors.get(parsed.key);
          return s ? sectorPath(s.slug) : null;
        }
        case "industry": {
          const i = universe.industries.get(parsed.key);
          return i ? industryPath(i.slug) : null;
        }
        case "subIndustry": {
          const sub = universe.subIndustries.get(parsed.key);
          const ind = universe.industries.get(parentIndustry.get(parsed.key) ?? "");
          return sub && ind ? subIndustryPath(ind.slug, sub.slug) : null;
        }
        case "index":
          return indexPath(parsed.key);
        default:
          return `/news?node=${encodeURIComponent(node)}`;
      }
    },
    async snapshots(companyIds) {
      const missing = companyIds.filter((id) => !snapshotCache.has(id));
      if (missing.length) {
        const secs = missing.map((id) => universe.byCompanyId.get(id)).filter((c): c is UniverseCompany => !!c).map(primarySecurity).filter((s): s is SecuritySummary => !!s);
        const { data, provenance } = await repos.marketData.getSnapshots(secs.map((s) => ({ securityId: s.securityId, ticker: s.ticker, currency: s.currency })));
        for (const s of secs) snapshotCache.set(s.companyId, provenance.isDemo ? null : (data.get(s.securityId) ?? null));
        for (const id of missing) if (!snapshotCache.has(id)) snapshotCache.set(id, null);
      }
      const out = new Map<string, SecurityMarketSnapshot>();
      for (const id of companyIds) {
        const s = snapshotCache.get(id);
        if (s) out.set(id, s);
      }
      return out;
    },
    async groupReturns(nodes, ranges) {
      const refs: { node: NodeKey; kind: "sector" | "industry" | "sub_industry" | "index"; key: string }[] = [];
      for (const node of nodes) {
        const p = parseNodeKey(node);
        if (!p) continue;
        if (p.kind === "sector") {
          const s = universe.sectors.get(p.key);
          if (s) refs.push({ node, kind: "sector", key: s.id });
        } else if (p.kind === "industry") {
          const s = universe.industries.get(p.key);
          if (s) refs.push({ node, kind: "industry", key: s.id });
        } else if (p.kind === "subIndustry") {
          const s = universe.subIndustries.get(p.key);
          if (s) refs.push({ node, kind: "sub_industry", key: s.id });
        } else if (p.kind === "index") refs.push({ node, kind: "index", key: p.key });
      }
      const out = new Map<NodeKey, Partial<Record<TimeRange, number | null>>>();
      if (refs.length === 0) return out;
      const series = await repos.groupIndices.getSeries(refs.map((r) => ({ kind: r.kind, key: r.key })));
      for (const r of refs) {
        const s = series.find((x) => x.kind === r.kind && x.key === r.key && x.method === "cap_weight");
        if (!s || s.points.length < 2) continue;
        out.set(r.node, periodReturns(s.points.map((p) => ({ date: p.time, close: p.value })), ranges));
      }
      return out;
    },
  };
}
