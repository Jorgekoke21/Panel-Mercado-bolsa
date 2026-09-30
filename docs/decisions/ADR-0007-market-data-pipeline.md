# ADR-0007 — Pipeline de market data: EODHD tras puertos por capacidad, precios sin ajustar como fuente de verdad

- Estado: aceptada (Fase 2B.1, 2026-09-29)
- Contexto: auditoría 2A. EODHD (EOD All World + Fundamentals, licencia personal) es el proveedor inicial, sin acoplar MarketRadar a él.

## Decisión

1. **Puertos por capacidad** (`ProfileSource`, `PriceHistorySource`, `CorporateActionSource`, `FundamentalsSource`, `EarningsSource`, `ValuationSource`, `QuoteSource`) en lugar de un `FinancialDataProvider` monolítico. Un `ProviderAdapter` declara capacidades, bolsas cubiertas, coste y datasets. La selección es por capacidad + bolsa.
2. **Dominio canónico**: los adaptadores traducen al dominio (`DailyBar`, `CorporateAction`, partidas canónicas, `EarningsEvent`, `ValuationValue`). Ningún tipo del JSON del proveedor sale del adaptador.
3. **`security_identifiers`** es la única fuente de símbolos por proveedor; las reglas solo proponen y el perfil del proveedor verifica (CIK).
4. **Precios**: OHLC sin ajustar + acciones corporativas; ajustes calculados por MarketRadar (`adjustment_factors`). El ajustado del proveedor solo valida.
5. **Price return por defecto**; total return disponible en el motor.
6. **Fundamentales en formato largo** sobre un catálogo propio (`canonical_line_items`); TTM derivado, no almacenado.
7. **Valoración** con `value_origin` (`provider` / `calculated`).
8. **Errores tipados** (`rate_limited`, `not_found`, `auth`, `transient`, `invalid_response`); nunca se convierten en 0/[]/null.
9. Sin `quotes_latest` en 2B (solo EOD).

## Consecuencias

- Cambiar o añadir proveedor = nuevo adaptador + filas en `security_identifiers`; la UI no cambia.
- EODHD entrega volumen ajustado por splits: un split nuevo obliga a recargar el histórico de ese valor (automatizado vía `sync_cursors.full_refresh_required`).
- EODHD no publica EPS por periodo en los estados financieros: `eps_basic`/`eps_diluted` quedan MISSING hasta decidir fuente o cálculo propio.
