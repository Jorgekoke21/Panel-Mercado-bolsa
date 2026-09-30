# ADR-0010 — Acciones por clase (portadas XBRL), sync automático por calendario e índices sintéticos

- Estado: aceptada (Fase 2B.4, 2026-09-29)
- Contexto: tras ADR-0009 quedaban 60 securities sin capitalización verificada (sobre todo emisores multiclase), la actualización era manual y sectores/industrias no tenían histórico. Presupuesto: 0 €/mes; Supabase Free (500 MB).

## 1. Capitalización por clase desde la portada XBRL

**Problema.** companyfacts (SEC) no publica hechos dimensionales; en emisores con varias clases, `dei:EntityCommonStockSharesOutstanding` solo existe por clase (`us-gaap:StatementClassOfStockAxis`).

**Decisión.** Leer la instancia XBRL del último 10-Q/10-K (EDGAR Archives, requiere `SEC_USER_AGENT`) y, por security:

1. **Clase**: `dei:TradingSymbol` con miembro de clase (GOOGL → Class A, GOOG → Class C, BF.B → Nonvoting); si el símbolo no lleva dimensión, la clase que nombra su `dei:Security12bTitle` ("Class A Common Stock"); si el emisor tiene una única cifra sin dimensión, esa. Si no es inequívoco ⇒ `unresolved`.
2. **Comprobación independiente** con las medias ponderadas del BPA del MISMO filing (±15 %): (a) media de la misma clase; (b) suma de las clases ordinarias vs media total; (c) solo la clase cotizada vs media total (estructuras Up-C). Nada de nombres de empresa, tablas fijas ni ratios de conversión.
3. Capitalización de la security = precio de su clase × acciones de su clase. Las clases no cotizadas (Alphabet B, Meta B) no se asignan a ninguna security ⇒ sin doble conteo y coherente con cómo un índice pondera cada línea cotizada.

Resultado: 52 de 60 verificadas. Siguen UNVERIFIED (con motivo): BRK.B y ARES (BPA solo en "equivalentes de clase"), HONA (spin-off sin BPA aún), DVN y PCG (diferencia real del 17 %), MCD y WAT (medias del BPA mal escaladas por la propia empresa: en millones / miles), IBKR (título "Common Stock" con clases A y B: clase ambigua).

Cobertura: 495/503 securities; 98,4 % de la capitalización estimada del índice.

## 2. Sync automático sin hora fija

- `npm run sync -- auto` decide con `planAutoSync` (función pura, testeada): hay trabajo si existe una sesión **definitiva** (cierre oficial + 4 h 20 min según `market_sessions`, medias sesiones incluidas) posterior a la última materializada, si los índices van por detrás, o si la SEC tiene más de 7 días (en ese caso: fundamentales + acciones por clase y después precios).
- Programador: Windows Task Scheduler cada hora (`scripts/scheduler/register-windows-task.ps1`), `StartWhenAvailable` (si el PC estaba apagado, se ejecuta al volver). Con el stack actual (Supabase local en Docker) el sync debe correr en la misma máquina; si la base pasa a Supabase Cloud, el mismo comando puede ejecutarse desde otro programador gratuito sin cambios.
- Bloqueo con caducidad (`sync_leases`), incremental, idempotente, reanudable (cursor por serie) y observable (`sync_runs`, `data/logs/sync-auto.log`, `npm run sync -- status`). Fines de semana y festivos: ninguna llamada a proveedores. Series rezagadas: reintento como mucho cada 6 h.

## 3. Índices sintéticos de sector / industria / constituyentes

- Equal weight (rebalanceo diario) y cap weight (capitalización del cierre anterior, solo miembros con capitalización verificada; acciones históricas de portada re-expresadas por splits). Price return, cierres ajustados por splits, base 100. Constituyentes ACTUALES (sesgo de supervivencia, documentado en la UI). Rendimientos diarios con forma de split no registrado se excluyen.
- Se calculan en la misma pasada del análisis (sin lecturas extra) y se guardan como `real[]` por (grupo, método) alineado con `market_sessions`: 463 series, ~4 MB.
- **Los rendimientos de grupo de cualquier periodo salen de estos índices** (dashboard, sectores, industrias, índice, contexto de la ficha). Las medias anteriores ponderaban periodos pasados con la capitalización actual (sesgo de anticipación: IT 1Y +91 % frente a +31 %).

## 4. Almacenamiento

- `source_field` ya no duplica la fórmula de los valores derivados; índice sin uso eliminado (−13 MB).
- Retención continua de precios (7 años): la poda anual mantiene `daily_bars` en ~90 MB.
- `sync_runs` se conserva 180 días; el calendario solo se refresca cuando le faltan días.
- Crecimiento esperado ≈ 17 MB/año (fundamentales SEC ~15 MB, filings ~2 MB); precios estables.

## Consecuencias

- Sin coste. Las instancias XBRL se descargan una vez por filing (caché del resultado por accession).
- Los índices sintéticos no son índices oficiales y la UI lo declara en cada panel.
- La actualización automática depende de que el PC y Docker estén encendidos (limitación del stack local, no del coste).
