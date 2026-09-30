# ADR-0009 — Precios reales del S&P 500 con Alpaca Basic: series compactas, instantáneas materializadas y calidad por serie

- Estado: aceptada (Fase 2B.3, 2026-09-29)
- Contexto: con las claves reales de Alpaca Basic hay que pasar de precios DEMO a precios REALES para las 503 securities del S&P 500, a 0 €/mes y dentro de Supabase Free (500 MB), sin mezclar datos simulados con reales.

## Hechos verificados con la cuenta real (2026-09-29)

| Aspecto | Resultado |
|---|---|
| Autenticación | Cuenta paper `ACTIVE`; Market Data y Trading API responden con las claves |
| Feed | **SIP** (consolidado de todas las bolsas) con 15 min de retraso. Pedir SIP reciente (`end` < ahora − 15 min) ⇒ 403 `subscription does not permit querying recent SIP data`. IEX sí sirve lo reciente, pero solo cubre una fracción pequeña del volumen: no se usa |
| Histórico | Desde 2016-01-04 (AAPL, NVDA, JPM, BRK.B, ORLY); PLTR desde su salida a bolsa (2020-09-30) |
| Última sesión | La barra del día aparece durante la sesión (parcial) ⇒ solo se aceptan sesiones **cerradas** |
| Barras | `adjustment=raw` ⇒ OHLC sin ajustar (AAPL 28-ago-2020 = 499.23, cierre oficial). `t` = medianoche de Nueva York |
| Volumen | Consolidado incluida la sesión extendida: ~5 % mayor que el volumen oficial de sesión (mediana; nunca menor) |
| Calidad vs EODHD (AAPL, 1.945 sesiones) | Mismas sesiones; cierre idéntico en el 98,3 % (p99 0,016 %); 5 días > 0,1 % |
| Ajustes | MarketRadar = Alpaca `adjustment=split` salvo el redondeo de Alpaca: máx. 0,05 % |
| Dividendos | `rate` sin ajustar (AAPL 0,82 antes del split de 2020). Duplicados exactos y pagos combinados el mismo día (COP, F, CME). Emisores extranjeros: importe a veces NETO de retención (NXPI 0,8619 = 1,014 × 85 %) |
| Splits | Correctos en AAPL/NVDA/ORLY. Anomalías: HON "reverse split 1:2" el día de un spin-off con el precio −1,9 %; EXE sin el reverse split 1:200 de 2020 |
| Multiclase | BRK.B se consulta tal cual (`BRK.B`); GOOGL/GOOG, FOXA/FOX, NWSA/NWS son activos distintos |
| Cuota | 200 peticiones/min; varios símbolos por petición (barras y acciones corporativas) |

## Decisión

1. **Alpaca SIP es la fuente de precios de EE. UU.** (`feed=sip`, `adjustment=raw`), siempre con `end ≤ ahora − 16 min` y solo sesiones definitivas: la barra de una sesión se acepta 4 h 20 min después del cierre oficial (sesión extendida + retraso), según el calendario de Alpaca (`market_sessions`, con medias sesiones).
2. **Almacenamiento compacto**: `price_series` (una serie por security, una sola fuente, con procedencia y calidad) + `daily_bars` (serie int + fecha + OHLCV). Medido: 99 B/barra frente a ~210 B del esquema anterior. Retención: desde el 1-ene de (año − 7) ⇒ 5Y + ~2,7 años de calentamiento, EMA 200 exacta en toda la ventana 5Y.
3. **Instantáneas materializadas por security** (`security_market_snapshots`, 503 filas) recalculadas en cada sync: rendimientos, SMA/EMA, RSI, MACD, ATR, volumen relativo, 52W y market cap. Los agregados de sector/industria/índice NO se materializan: se calculan en memoria sobre esas 503 filas (una consulta).
4. **Calidad por serie** (PASS / WARNING / MISSING / FAIL, con motivos): huecos frente al calendario, desfase, saltos con forma de split sin split registrado, splits contradichos por los precios (no se aplican), cotización suspendida, barras de relleno previas a la cotización (se descartan), eventos no soportados (spin-offs, dividendos en acciones). Los precios sin ajustar son la fuente de verdad.
5. **Identidad sin CIK**: catálogo de activos de Alpaca (1 petición para todo el universo): activo, bolsa de EE. UU. (un cambio de bolsa se acepta con aviso: el símbolo de la cinta consolidada es único) y nombre compatible con el del seed o el registrado en la SEC (tokens, iniciales, nombre sin espacios).
6. **Heatmap**: tamaño = **capitalización VERIFICADA de la security** (precio × acciones de portada SEC, ajustadas por splits, coherentes ±15 % con las acciones medias ponderadas diluidas o básicas del último trimestre). Las securities sin capitalización verificable (multiclase, acciones desfasadas, sin referencia) no se dibujan y se listan con su motivo. No se usa otra métrica de tamaño.
7. **Agregados sintéticos**: breadth y medias equiponderadas cuentan compañías (cotización principal); la media ponderada usa la capitalización verificada de cada security. Se etiquetan como agregación de MarketRadar, nunca como datos oficiales de índice.
8. **REAL / PARTIAL / DEMO por panel**: si existe algún dato real, el panel es REAL o PARTIAL (cobertura n/N) y las securities sin dato aparecen vacías; DEMO completo solo si no hay ningún dato real. Los benchmarks siguen DEMO (sin fuente gratuita).

## Consecuencias

- Coste 0 €. Carga inicial ~5 min (119 peticiones); actualización diaria ~2,5 min (21 peticiones), dominada por el recálculo de instantáneas.
- Base de datos ≈ 311 MB tras la carga (fundamentales ~200 MB + precios 90 MB); crecimiento ≈ 12,5 MB/año.
- El volumen no coincide con el oficial de sesión (incluye extendida); el volumen relativo es coherente porque todo sale de la misma fuente.
- 45 securities (emisores con varias clases: META, V, MA, GOOGL/GOOG, BRK.B, NKE…) no tienen capitalización verificada: el companyfacts de la SEC publica sus acciones por clase solo como dato dimensional. Leerlas de la portada XBRL requiere `SEC_USER_AGENT` con contacto (www.sec.gov/Archives lo exige).
- Dividend yield: UNVERIFIED para emisores extranjeros cuyo dividendo puede venir neto de retención (≈ 30 compañías).
- Licencia Alpaca Basic: uso personal; no redistribuir ni mostrar públicamente sin revisar sus términos.
