# Design system

La guía completa está en **[docs/design/MARKETRADAR_VISUAL_SYSTEM.md](design/MARKETRADAR_VISUAL_SYSTEM.md)** (Financial Brutalism: el lenguaje compartido con Academia Trading y Bots Trading).

Resumen operativo:

- **Tokens**: `src/app/globals.css`. `:root` = shell claro de papel; `.mr-data` = superficie navy para gráficos y heatmaps (redefine los mismos tokens); `@theme inline` = utilidades de Tailwind.
- **Recetas**: `src/components/ui/styles.ts` (`buttonClass`, `segmentItemClass`, `tabItemClass`, `inputClass`, `chipLinkClass`, `SECTION_STRIPE`).
- **Primitivas**: `Panel` (`tone`, `surface="data"`), `MetricCard` (`tone`), `Badge`, `TabNav` (`tone: "ai"`), `Table`.
- **Tipografía**: Inter (interfaz y cifras tabulares), Bricolage Grotesque (títulos), Luckiest Guy (solo wordmark).
- **Iconos**: `lucide-react`.
- **Galería**: `/dev/ui` (solo desarrollo).

## Reglas de marcado (sin cambios)

- Todo panel con datos de mercado lleva `DataProvenanceBadge` (DEMO / Delayed / Stale).
- Todo agregado calculado por MarketRadar lleva `SyntheticBadge` con su metodología.
- Los índices muestran `IndexKindBadge` (Official index / Synthetic).
- Las funcionalidades futuras muestran "Coming in Phase X"; nunca contenido inventado.
- El significado nunca depende solo del color: signo, flecha y `aria-label`.
