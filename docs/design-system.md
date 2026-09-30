# Design system

> Identidad **provisional**: logo, acento, paleta y tipografía finales están por cerrar. La arquitectura permite cambiarlas sin tocar componentes.

## Dirección

Terminal de mercados oscura y densa: bordes de 1 px, radio de 4 px, sin sombras, sin gradientes ni glassmorphism, cifras tabulares y color reservado al significado.

## Tokens

Dos capas en `src/app/globals.css`:

1. **Identidad** (`:root { --mr-* }`): valores concretos. Cambiar la identidad = editar este bloque (o añadir `[data-theme="…"]`).
2. **Semánticos** (`@theme inline`): lo que usan los componentes vía Tailwind.

| Token (utilidad) | Uso | Nombre del brief |
|---|---|---|
| `bg-bg` | Fondo de la app | background |
| `bg-surface` / `bg-surface-raised` / `bg-surface-hover` | Paneles / elementos elevados / hover | surface / surfaceRaised |
| `border-border` / `border-border-strong` | Separadores / énfasis | border |
| `text-fg` / `text-fg-secondary` / `text-fg-muted` | Texto principal / secundario / terciario | textPrimary / textSecondary |
| `text-positive` / `text-negative` | Rendimiento | positive / negative |
| `text-warning` | Datos desactualizados | warning |
| `text-accent`, `bg-accent`, `bg-accent-muted` | Interacción, selección, foco (ámbar provisional) | accent |
| `text-demo`, `bg-demo-muted` | Datos simulados (DEMO) | — |
| `text-synthetic`, `bg-synthetic-muted` | Agregados/índices sintéticos de MarketRadar | — |
| `bg-heat-n3 … bg-heat-p3`, `bg-heat-0`, `bg-heat-none` | Escala del heatmap (7 tramos + sin dato) | — |
| `font-sans` / `font-mono` | Interfaz / cifras y tickers | — |

Ningún componente escribe colores literales. La escala del heatmap se asigna en `src/lib/color-scale.ts` (función pura con umbrales por periodo).

## Tipografía y densidad

- Interfaz: Inter (provisional), 13 px base; tablas de 12 px; etiquetas de 10–11 px en mayúsculas con tracking.
- Cifras y tickers: JetBrains Mono (provisional) con `tabular-nums`.
- Filas de tabla de 25 px, cabecera de panel de 28 px, rejilla de 8 px (gaps de 8 px).

## Accesibilidad

- El significado nunca depende solo del color: signo explícito (`+1.23%`, `−0.45%` con signo menos real), flechas ▲▼ y `aria-label` ("up +1.23% over 1 day").
- Las barras de breadth y rango son `role="meter"` con valores.
- Foco visible con el color de acento; navegación por teclado en el buscador (`/`, flechas, Enter, Esc).
- Paleta alternativa para daltonismo (azul/naranja) preparada como posible `[data-theme]`: solo requiere redefinir `--mr-positive`, `--mr-negative` y `--mr-heat-*`.

## Componentes

| Grupo | Componentes |
|---|---|
| `ui/` | Panel, Badge, Table (Table/THead/Th/Td/Tr), Skeleton, TabNav |
| `states/` | EmptyState, ErrorState, LoadingSkeleton, DataProvenanceBadge |
| `layout/` | AppShell, Sidebar, CompanySearch |
| `market/` | MetricCard, MarketTicker, PerformanceBadge, Sparkline, Heatmap, RankingTable, CompanyTable (DataTable), TickerCell (CompanyRow), CompanyCard, SectorCard, SectorRotationMatrix, BreadthPanel, PerformanceLadder, RangeBar, FinancialMetric, ChartCard, IndexBadge/IndexKindBadge/SyntheticBadge, CountryBadge, ClassificationBreadcrumb, TimeRangeSelector, NewsCard, ImpactBadge |
| `entity/` | EntityPage, EntityGrid, EntityHeader, PerformanceSection, ChartSection, BreadthSection, ComponentsSection, WorldContextSection, NewsSection, TabPlaceholder |

Galería navegable en `/dev/ui` (solo desarrollo).

## Reglas de marcado

- Todo panel con datos de mercado lleva `DataProvenanceBadge` (DEMO / Delayed / Stale).
- Todo agregado calculado por MarketRadar lleva `SyntheticBadge` con su metodología.
- Los índices muestran `IndexKindBadge` (Official index / Synthetic).
- Las funcionalidades futuras muestran "Coming in Phase X"; nunca contenido inventado.
