"use client";

import Link from "next/link";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import type { Claim, EvidenceItem } from "@/intelligence/evidence";
import type { MoveExplanation } from "@/intelligence/explain-move";
import type { MovePanelData } from "@/intelligence/move-panel-data";
import { cn } from "@/lib/cn";
import { eventPath } from "@/lib/event-routes";
import { ClaimKindBadge } from "./primitives";
import { useI18n } from "@/i18n/provider";
import { formatDate, formatNumber } from "@/lib/format";

const DRIVER_TEXT: Record<MoveExplanation["driver"], string> = {
  company_specific: "Company-specific",
  industry_wide: "Industry-wide",
  sector_wide: "Sector-wide",
  market_wide: "Market-wide",
  mixed: "Mixed drivers",
  no_unusual_move: "No unusual move",
  insufficient_data: "Insufficient data",
};

const VERDICT_VARIANT = { "Likely related": "accent", "Possibly related": "neutral", "No clear news catalyst found": "outline", "No unusual move": "outline" } as const;

/** Descomposición del movimiento (mercado / sector / industria / propio) + catalizadores, sin afirmar causalidad. */
export function MovePanel({ move, title }: { move: MovePanelData; title?: string }) {
  const { locale, messages } = useI18n();
  const driverLabels: Record<MoveExplanation["driver"], string> = locale === "es" ? {
    company_specific: "Específico de la empresa", industry_wide: "De toda la industria", sector_wide: "De todo el sector", market_wide: "De todo el mercado", mixed: "Factores mixtos", no_unusual_move: "Sin movimiento inusual", insufficient_data: "Datos insuficientes",
  } : DRIVER_TEXT;
  const verdict = locale === "es" ? ({ "Likely related": "Probablemente relacionado", "Possibly related": "Posiblemente relacionado", "No clear news catalyst found": "No se encontró un catalizador claro", "No unusual move": "Sin movimiento inusual" } as Record<string, string>)[move.verdict] ?? move.verdict : move.verdict;
  const rows: { label: string; value: number | null; hint: string }[] = [
    { label: messages.technical.market, value: move.components.market, hint: locale === "es" ? "Componentes del S&P 500 (sintético)" : "S&P 500 constituents (synthetic)" },
    { label: locale === "es" ? "Exceso frente al sector" : "Sector excess", value: move.components.sector, hint: locale === "es" ? "sector − mercado" : "sector − market" },
    { label: locale === "es" ? "Exceso frente a la industria" : "Industry excess", value: move.components.industry, hint: locale === "es" ? "industria − sector" : "industry − sector" },
    { label: messages.technical.companySpecific, value: move.components.idiosyncratic, hint: locale === "es" ? "acción − industria" : "stock − industry" },
  ];
  const max = Math.max(0.005, ...rows.map((r) => Math.abs(r.value ?? 0)), Math.abs(move.securityReturn ?? 0));
  return (
    <Panel
      title={title ?? `${locale === "es" ? "Explicación del movimiento" : "Explain move"} · ${move.range}`}
      subtitle={`${locale === "es" ? "sesión" : "session"} ${formatDate(move.asOfDate, locale)}`}
      actions={
        <>
          <Badge variant="positive">{messages.common.realData}</Badge>
          <Badge variant={VERDICT_VARIANT[move.verdict]}>{verdict}</Badge>
        </>
      }
    >
      <div className="flex flex-wrap items-baseline gap-2 px-2.5 pt-2 text-2xs">
        <span className="font-mono text-fg">{move.ticker}</span>
        <PerformanceBadge value={move.securityReturn} variant="pill" arrow />
        <span className="text-fg-muted">·</span>
        <span className="font-semibold text-fg-secondary">{driverLabels[move.driver]}</span>
        {move.relativeVolume !== null && <span className={cn("text-fg-muted", move.relativeVolume >= 2 && "text-warning")}>{messages.market.relativeVolume} {formatNumber(move.relativeVolume, 1, locale)}×</span>}
      </div>
      <p className="px-2.5 pt-0.5 text-[10px] text-fg-muted">{move.unusual ? (locale === "es" ? "Movimiento inusual frente al rango diario habitual (ATR 14)." : "Unusual move compared with the typical daily range (ATR 14).") : (locale === "es" ? "El movimiento está dentro de su rango habitual." : "The move is within its normal range.")}</p>
      <ul className="flex flex-col gap-1 px-2.5 py-2" aria-label={messages.intelligence.additiveDecomposition}>
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-2xs" title={r.hint}>
            <span className="text-fg-secondary">{r.label}</span>
            <span className="relative h-2 rounded-[2px] bg-surface-hover">
              <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
              {r.value !== null && (
                <span
                  className={cn("absolute inset-y-0", r.value >= 0 ? "left-1/2 bg-positive/70" : "right-1/2 bg-negative/70")}
                  style={{ width: `${Math.min(50, (Math.abs(r.value) / max) * 50)}%` }}
                />
              )}
            </span>
            <PerformanceBadge value={r.value} />
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-2.5 py-2">
        <h3 className="pb-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{messages.intelligence.catalysts}</h3>
        {move.catalysts.length === 0 ? (
          <p className="text-2xs text-fg-secondary">{move.unusual ? (locale === "es" ? "No se encontró un catalizador claro en las fuentes de MarketRadar." : "No clear news catalyst found in MarketRadar's sources.") : (locale === "es" ? "No se buscaron catalizadores: el movimiento está dentro del rango habitual." : "Not searched: the move is within its normal range.")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {move.catalysts.map((c) => (
              <li key={c.eventId} className="flex flex-wrap items-center gap-1.5 text-2xs">
                <Badge variant={c.relation === "Likely related" ? "accent" : "neutral"}>{locale === "es" ? (c.relation === "Likely related" ? "Probablemente relacionado" : "Posiblemente relacionado") : c.relation}</Badge>
                {c.filing ? <span className="text-fg-secondary">{c.title}</span> : <Link href={eventPath(c.eventId)} className="text-fg-secondary hover:text-accent">{c.title}</Link>}
                <span className="text-[10px] text-fg-muted">{locale === "es" ? `Evento ${c.scope === "company" ? "de empresa" : c.scope === "industry" ? "de industria" : c.scope === "sector" ? "de sector" : "de mercado"} dentro del periodo analizado.` : c.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-fg-muted">{locale === "es" ? "La coincidencia temporal y de dirección no demuestra causalidad. Las líneas de sector, industria y mercado son índices sintéticos de MarketRadar, no niveles oficiales." : move.caveat}</p>
    </Panel>
  );
}

/** Afirmaciones con su tipo (hecho, fuente, dato real, inferencia, IA, desconocido) y evidencia citada. */
export function ClaimsList({ claims, evidence }: { claims: Claim[]; evidence?: EvidenceItem[] }) {
  const { locale, messages } = useI18n();
  const byId = new Map((evidence ?? []).map((e) => [e.id, e]));
  const sourceLabel = (source: string) => locale === "es" ? ({
    "MarketRadar synthetic index": "Índice sintético de MarketRadar",
    "MarketRadar relationship graph": "Grafo de relaciones de MarketRadar",
    "official source": "Fuente oficial",
    "news reports": "Medios de comunicación",
    "MarketRadar screen": "Filtro de MarketRadar",
    "MarketRadar entity resolution": "Resolución de entidades de MarketRadar",
  } as Record<string, string>)[source] ?? source : source;
  if (claims.length === 0) return <p className="px-2.5 py-2 text-2xs text-fg-muted">{messages.intelligence.noClaims}</p>;
  return (
    <ul className="flex flex-col gap-1 px-2.5 py-2">
      {claims.map((c, i) => (
        <li key={`${i}-${c.text}`} className="flex items-start gap-1.5 text-2xs">
          <ClaimKindBadge kind={c.kind} />
          <span className="text-fg-secondary">{c.text}</span>
          {c.sourceLanguage && <span className="shrink-0 rounded-[2px] border border-border px-1 text-[9px] text-fg-muted" title={`${messages.news.originalLanguage}: ${c.sourceLanguage.toUpperCase()}`}>{c.sourceLanguage.toUpperCase()}</span>}
          {c.evidenceIds.length > 0 && (
            <span className="ml-auto shrink-0 cursor-help font-mono text-[9px] text-fg-muted" title={c.evidenceIds.map((id) => {
              const item = byId.get(id);
              const originalLanguage = item?.sourceLanguage ? ` · ${messages.news.originalLanguage}: ${item.sourceLanguage.toUpperCase()}` : "";
              return `${id}: ${item?.text ?? ""} (${sourceLabel(item?.source ?? "")}${originalLanguage})`;
            }).join("\n")}>
              [{c.evidenceIds.length} {locale === "es" ? "evid." : "ev."}]
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
