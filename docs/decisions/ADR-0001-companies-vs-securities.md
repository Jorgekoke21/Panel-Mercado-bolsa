# ADR-0001 — Separar emisores (`companies`) de valores cotizados (`securities`)

- Estado: aceptada (D4) · 2026-09-29

## Contexto
El ticker identifica un valor cotizado, no una empresa. El S&P 500 tiene 503 valores de 500 empresas (GOOGL/GOOG, FOXA/FOX, NWSA/NWS). En la expansión global una empresa podrá cotizar en varias bolsas o tener ADR.

## Decisión
- `companies` guarda el emisor (identidad, clasificación, sede, CIK/LEI).
- `securities` guarda cada cotización: `ticker`, `exchange_id`, `currency`, `share_class`, `isin`, `is_primary`.
- `index_constituents` y todos los datos de mercado futuros (`daily_prices`, `technical_metrics`…) usan `security_id`.
- `/company/[ticker]` resuelve el valor por ticker canónico (el principal si hubiera varios).

## Consecuencias
- Con varias bolsas, un ticker puede repetirse: habrá que desambiguar la URL (p. ej. `/company/XETR:SAP`). La restricción es `unique(exchange_id, ticker)`.
- Los símbolos por proveedor irán en `security_identifiers` (Fase 2).
