# Fase 2B.1 — Informe de cobertura del piloto

Generado: 2026-09-29T01:49:27.799Z · Proveedor: EODHD · Fuente: base de datos local (datos sincronizados).

Regenerar: `npm run sync -- validate`. PASS / MISSING (el proveedor no lo da) / WARNING / FAIL (fallo del pipeline).

## Matriz

| Check | AAPL |
|---|---|
| Identifier | PASS |
| CIK verification | PASS |
| Price history | PASS |
| Latest EOD | PASS |
| Splits | PASS |
| Dividends | PASS |
| Shares | PASS |
| Market cap | PASS |
| Fundamentals | WARNING |
| Earnings | PASS |
| Valuation | PASS |
| Adjusted series | PASS |
| UI real data | PASS |

## Detalle de la matriz

| Check | AAPL |
|---|---|
| Identifier | PASS: AAPL.US |
| CIK verification | PASS: CIK matches provider profile |
| Price history | PASS: 1945 bars since 2019-01-02 |
| Latest EOD | PASS: 2026-09-28 |
| Splits | PASS: 5 reported |
| Dividends | PASS: 92 cash dividends |
| Shares | PASS: current 2026-09-27 · period 2026-06-30 |
| Market cap | PASS: consistent_with_provider_market_cap |
| Fundamentals | WARNING: 12/13 provider items · 0 FCF divergences |
| Earnings | PASS: 132 events |
| Valuation | PASS: 10 provider metrics |
| Adjusted series | PASS: max deviation 0.000% |
| UI real data | PASS: company page reads synced EOD data |

## Fundamentales del proveedor por partida (trimestres / años)

| Check | AAPL |
|---|---|
| `revenue` | 164 / 41 |
| `gross_profit` | 164 / 41 |
| `operating_income` | 164 / 41 |
| `net_income` | 164 / 41 |
| `net_income_to_common` | **MISSING** |
| `weighted_average_shares_basic` | **MISSING** |
| `weighted_average_shares_diluted` | **MISSING** |
| `eps_basic` | **MISSING** |
| `eps_diluted` | **MISSING** |
| `operating_cash_flow` | 147 / 37 |
| `capital_expenditure` | 147 / 37 |
| `free_cash_flow` | 147 / 37 |
| `cash_and_equivalents` | 152 / 41 |
| `total_assets` | 152 / 41 |
| `total_debt` | 112 / 29 |
| `total_equity` | 152 / 41 |
| `shares_outstanding` | 164 / 41 |

## EPS

| Check | AAPL |
|---|---|
| GAAP EPS calculated (periods with value) | 0 |
| GAAP EPS calculated = NULL (reason × periods) | — |
| Provider earnings EPS (EODHD, basis unspecified) | 131 |

## FCF (proveedor vs calculado = OCF − capex)

| Check | AAPL |
|---|---|
| Provider FCF periods | 184 |
| Calculated FCF periods | 0 |
| Material divergences (> 1%) | 0 |

## Market cap

| Check | AAPL |
|---|---|
| Status | VERIFIED |
| Reason | consistent_with_provider_market_cap |
| Calculated (price × shares) | 4.9387e+12 |
| Provider market cap | 4.9776e+12 |
| Deviation | 0.78% |

## Valoración (valores del proveedor)

| Check | AAPL |
|---|---|
| `market_cap` | ✓ 2026-09-27 |
| `enterprise_value` | ✓ 2026-09-27 |
| `pe_ttm` | ✓ 2026-09-27 |
| `pe_forward` | ✓ 2026-09-27 |
| `peg` | ✓ 2026-09-27 |
| `ps_ttm` | ✓ 2026-09-27 |
| `pb_mrq` | ✓ 2026-09-27 |
| `ev_revenue` | ✓ 2026-09-27 |
| `ev_ebitda` | ✓ 2026-09-27 |
| `dividend_yield` | ✓ 2026-09-27 |

## Earnings

| Check | AAPL |
|---|---|
| Events | 132 |
| Last reported / next | 2026-07-30 / 2026-10-29 |
| With surprise (actual & estimate) | 118/132 |
| With before/after market | 109/132 |
| Consensus estimates | 40 |

## Series ajustadas (total return vs adjusted_close del proveedor)

| Check | AAPL |
|---|---|
| Compared sessions | 1945 |
| Max deviation (date) | 0.00% (2019-01-24) |

## Acciones corporativas no soportadas

Ninguna.

