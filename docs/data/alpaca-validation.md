# Conciliación de ajustes: MarketRadar vs Alpaca

Generado: 2026-09-29T16:59:04.684Z · `npm run sync -- alpaca-validate`

MarketRadar calcula sus series ajustadas a partir de barras SIN ajustar + acciones corporativas (split: ratio; dividendos: método CRSP `1 − D / cierre previo`). Aquí se comparan con las series que ajusta la propia Alpaca (`adjustment=split` y `adjustment=all`), que solo se descargan para esta comprobación.

| Ticker | Sesiones | Split: máx. dif. | Split: sesiones > 0,01 % | Total return vs `all`: máx. dif. | Mediana dif. `all` | Splits | Dividendos |
|---|---|---|---|---|---|---|---|
| AAPL | 1945 | 0.0135 % | 34 | 0.0120 % | 0.0016 % | 1 | 43 |
| NVDA | 1945 | 0.0469 % | 512 | 0.1539 % | 0.1118 % | 2 | 42 |
| PLTR | 1505 | 0.0000 % | 0 | 0.0000 % | 0.0000 % | 0 | 0 |
| JPM | 1945 | 0.0000 % | 0 | 0.0075 % | 0.0019 % | 0 | 43 |
| BRK.B | 1945 | 0.0000 % | 0 | 0.0000 % | 0.0000 % | 0 | 0 |
| ORLY | 1945 | 0.0268 % | 322 | 0.0268 % | 0.0043 % | 1 | 0 |

Las diferencias de total return son esperables: Alpaca ajusta los dividendos con otro método (no documentado públicamente) y MarketRadar usa CRSP con el cierre SIN ajustar de la sesión anterior a la fecha ex. La serie por defecto de MarketRadar es price return (solo splits): coincide con la de Alpaca salvo el redondeo que Alpaca aplica a sus precios ajustados (3–4 cifras; p. ej. NVDA 136,22 / 40 = 3,4055 → 3,406). MarketRadar conserva la precisión completa.
