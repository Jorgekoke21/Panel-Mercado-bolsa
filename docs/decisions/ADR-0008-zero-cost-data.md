# ADR-0008 — Datos a coste 0 €: SEC EDGAR para fundamentales, Alpaca Basic para precios, EODHD opcional

- Estado: aceptada (Fase 2B.2, 2026-09-29)
- Contexto: el presupuesto operativo es 0 €/mes. La auditoría de coste (2B.1B) comparó EODHD, fuentes gratuitas y combinaciones.

## Decisión

1. **Fundamentales de EE. UU. → SEC EDGAR XBRL** (oficial, gratuita). Motor propio de normalización (`src/providers/sec`) con trazabilidad hasta concept + accession.
2. **Precios de EE. UU. → Alpaca Basic** (gratuito: SIP histórico desde 2016, 200 req/min, OHLCV sin ajustar + acciones corporativas). Mismo puerto que EODHD, así que los jobs de precios, acciones corporativas y factores no cambian.
3. **EODHD se conserva** como adaptador opcional (precios globales / fundamentales internacionales en F7).
4. **Todos los ratios e indicadores los calcula MarketRadar** (nunca ratios de proveedor como dato principal).
5. Se aceptan como MISSING: consenso de analistas, forward P/E, PEG, próximas fechas de resultados, fundamentales internacionales.

## Consecuencias

- Coste 0 €; más ingeniería (capa XBRL canónica) y mantenimiento de casos límite (documentados en `docs/sec-fundamentals.md`).
- Alpaca requiere una cuenta gratuita (claves en `.env.local`); sin claves, los precios reales no se sincronizan y las fichas siguen en DEMO para precios.
- Selección de proveedor por capacidad y bolsa (`selectAdapter`): EE. UU. → SEC + Alpaca; global → EODHD u otro en el futuro.
- Supabase Free (500 MB): ~200 MB de fundamentales (S&P 500, 10 años) + ~170 MB estimados de precios (7 años). La retención es configurable (`--since`, `PRICE_HISTORY_YEARS`).
