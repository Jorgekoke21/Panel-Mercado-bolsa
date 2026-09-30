import { notFound } from "next/navigation";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { DataProvenanceBadge } from "@/components/states/data-provenance-badge";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { BreadthPanel } from "@/components/market/breadth-panel";
import { ChartCard } from "@/components/market/chart-card";
import { CountryBadge } from "@/components/market/country-badge";
import { FinancialMetric } from "@/components/market/financial-metric";
import { ImpactBadge } from "@/components/market/impact-badge";
import { IndexKindBadge, SyntheticBadge } from "@/components/market/index-badge";
import { MetricCard } from "@/components/market/metric-card";
import { NewsCard } from "@/components/market/news-card";
import { PerformanceBadge } from "@/components/market/performance-badge";
import { RangeBar } from "@/components/market/range-bar";
import { Sparkline } from "@/components/market/sparkline";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { mockProvenance } from "@/data/mock/mock-market-data";
import { computeBreadth } from "@/lib/calculations/breadth";
import { HEAT_BUCKET_CLASSES } from "@/lib/color-scale";
import { buttonClass, segmentGroupClass, segmentItemClass, tabItemClass, tabListClass } from "@/components/ui/styles";

/**
 * Galería del design system (solo desarrollo). Todo el contenido es ilustrativo y está
 * marcado como tal: no son datos ni noticias reales.
 */
export default function UiGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const demo = mockProvenance();
  const delayed = { source: "example", sourceLabel: "Example provider", asOf: new Date().toISOString(), isDelayed: true, isDemo: false };
  const stale = { ...delayed, asOf: "2020-01-01T00:00:00Z" };
  const variants: BadgeVariant[] = ["neutral", "outline", "accent", "positive", "negative", "warning", "demo", "synthetic", "official", "inferred", "ai", "info", "news"];
  const breadth = computeBreadth(
    Array.from({ length: 20 }, (_, i) => ({
      return: (i % 5) - 2,
      price: 100,
      ema20: 90 + i,
      ema50: 95 + i,
      ema200: 80 + i,
      rsi14: 30 + i * 2,
      isNew52wHigh: i === 3,
      isNew52wLow: false,
    })),
  );

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-4">
      <Panel title="Financial Brutalism" subtitle="botones · segmentados · pestañas · tonos de sección · superficie de datos" tone="market">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["primary", "secondary", "ghost", "ai", "positive", "danger"] as const).map((v) => (
              <button key={v} type="button" className={buttonClass(v)}>
                {v}
              </button>
            ))}
          </div>
          <div className={segmentGroupClass}>
            {["1D", "1W", "1M", "YTD", "1Y"].map((r) => (
              <button key={r} type="button" aria-pressed={r === "1D"} className={segmentItemClass(r === "1D")}>
                {r}
              </button>
            ))}
          </div>
          <div className={tabListClass}>
            {["Resumen", "Finanzas", "Técnico", "Noticias"].map((t, i) => (
              <span key={t} className={tabItemClass(i === 0)}>
                {t}
              </span>
            ))}
            <span className={tabItemClass(true, "ai")}>IA</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {(["market", "technical", "news", "ai", "positive", "warning"] as const).map((t) => (
              <MetricCard key={t} tone={t} label={t} value="—" footnote="tono de sección" />
            ))}
          </div>
          <div className="mr-data flex flex-wrap items-center gap-2 rounded-ctl border-2 border-border-brand bg-bg p-3">
            <span className="text-[12px] text-fg-secondary">.mr-data</span>
            <Badge variant="positive">real</Badge>
            <Badge variant="info">calculado</Badge>
            <Badge variant="synthetic">sintético</Badge>
            <Badge variant="ai">IA</Badge>
            <span className="num text-positive">+1,68 %</span>
            <span className="num text-negative">−0,78 %</span>
          </div>
        </div>
      </Panel>
      <Panel title="UI gallery" subtitle="Development only · illustrative content" actions={<Badge variant="demo">Samples</Badge>}>
        <div className="flex flex-wrap gap-1 p-2.5">
          {variants.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
          <IndexKindBadge kind="official" />
          <IndexKindBadge kind="synthetic" />
          <SyntheticBadge methodology="equal_weight" />
          <CountryBadge code="US" name="United States" />
          <ImpactBadge direction="potential_positive" />
          <ImpactBadge direction="potential_negative" />
          <ImpactBadge direction="mixed_uncertain" />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Panel title="Provenance">
          <div className="flex gap-1 p-2.5">
            <DataProvenanceBadge provenance={demo} />
            <DataProvenanceBadge provenance={delayed} />
            <DataProvenanceBadge provenance={stale} />
          </div>
        </Panel>
        <Panel title="Performance">
          <div className="flex flex-wrap items-center gap-3 p-2.5">
            <PerformanceBadge value={0.0231} arrow />
            <PerformanceBadge value={-0.0104} arrow />
            <PerformanceBadge value={0} />
            <PerformanceBadge value={null} />
            <PerformanceBadge value={0.051} variant="pill" arrow />
            <Sparkline values={[1, 3, 2, 4, 5, 4, 6]} />
            <Sparkline values={[6, 5, 6, 3, 2, 3, 1]} />
          </div>
        </Panel>
        <Panel title="Heat scale">
          <div className="flex p-2.5">
            {([-3, -2, -1, 0, 1, 2, 3] as const).map((b) => (
              <div key={b} className={`flex h-8 flex-1 items-center justify-center font-mono text-2xs ${HEAT_BUCKET_CLASSES[b]}`}>
                {b}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <MetricCard label="Metric card" value="1,234.56" change={<PerformanceBadge value={0.012} />} footnote="Illustrative" aside={<Sparkline values={[2, 3, 2, 5]} />} />
        <Panel title="Range bar">
          <div className="p-2.5">
            <RangeBar low={80} high={120} current={110} currency="USD" />
          </div>
        </Panel>
        <Panel title="Financial metric">
          <dl className="px-2.5 py-1">
            <FinancialMetric label="Example ratio" value="12.3×" definition="Definition tooltip — basis for Learning Mode." />
            <FinancialMetric label="Missing value" value="—" />
          </dl>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <BreadthPanel breadth={breadth} range="1D" provenance={demo} title="Breadth (sample)" />
        <ChartCard title="Chart card (placeholder)" seriesType="candlestick" comparisons={["vs industry", "vs sector"]} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Panel title="News card (sample)" actions={<Badge variant="demo">Not real news</Badge>}>
          <NewsCard
            title="Sample headline used to preview the NewsCard layout"
            summary="Placeholder summary text. News ingestion starts in Phase 4."
            source="Sample source"
            url="https://example.com"
            publishedAt={new Date().toISOString()}
            impact="mixed_uncertain"
          />
        </Panel>
        <Panel title="Empty / error">
          <EmptyState compact phase="4/5" title="Empty state" description="Description text." />
          <div className="p-2">
            <ErrorState title="Error state" description="Error description." />
          </div>
        </Panel>
        <Panel title="Loading">
          <LoadingSkeleton panels={2} />
        </Panel>
      </div>
    </div>
  );
}
