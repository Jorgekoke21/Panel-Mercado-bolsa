# Fundamentales oficiales: SEC EDGAR / XBRL

> Fuente gratuita y oficial para los fundamentales de EE. UU. Estado: S&P 500 completo (500/500 emisores).

## Qué se descarga

| API (data.sec.gov) | Uso | Coste |
|---|---|---|
| `submissions/CIK##########.json` (+ páginas `…-submissions-NNN.json`) | Perfil (SIC ⇒ plantilla sectorial, cierre fiscal), 10-K/10-Q, **8-K item 2.02** (publicación de resultados) | gratis |
| `api/xbrl/companyfacts/CIK##########.json` | Todos los hechos XBRL estándar (us-gaap, dei) | gratis |

Política de acceso justo: ≤ 10 peticiones/s y User-Agent declarado. MarketRadar usa 5 req/s, serializadas, con reintentos; `SEC_USER_AGENT` en `.env.local` ("Nombre contacto@dominio"). Las respuestas se guardan en `data/cache/sec` (fuera de git) y el job puede re-normalizar sin red (`--offline`).

```bash
npm run sync -- sec                     # 6 casos de validación (AAPL NVDA PLTR JPM BRK.B ORLY)
npm run sync -- sec --index sp500       # todo el S&P 500 (~1.000 peticiones, ~9 min la primera vez)
npm run sync -- sec --index sp500 --offline   # re-normalizar desde caché (0 peticiones, ~80 s)
npm run sync -- sec-report              # cobertura por partida → docs/data/sec-coverage.md
```

## Modelo

`financial_statement_values` (formato largo, una fila por emisor × partida × periodo × origen):

| `value_origin` | Significado | Trazabilidad |
|---|---|---|
| `reported` | Tal como figura en el filing | concept (`us-gaap:…`), accession, formulario, fecha, `restated` |
| `derived` | Aritmética sobre valores reportados del mismo emisor (Q4 = FY − 9M, trimestre = YTD − YTD previo, deuda = suma de componentes, pasivo = pasivo+patrimonio − patrimonio) | fórmula + accession de cada componente (`derivation`) |
| `calculated` | Fórmula de MarketRadar (FCF = OCF − capex; EPS = NI / acciones medias solo si el filing no lo reporta) | fórmula (`source_field`) |
| `provider` | Valor de un proveedor comercial (EODHD) | campo del proveedor |

`fundamental_coverage` explica por emisor y partida si está `available`, `not_applicable` (plantilla financiera), `discontinued` (deja de reportarse con concept estándar) o `missing`, con el motivo que muestra la UI.

`company_fundamental_snapshots` materializa por emisor las métricas sin precio (TTM, márgenes, ROE, ROIC, crecimiento) para los agregados de sector / industria / índice.

## Problemas XBRL y cómo se resuelven (`src/providers/sec/normalize.ts`)

| Problema | Solución | Ejemplo |
|---|---|---|
| Duplicados: cada filing repite periodos comparativos | Por (concept, periodo) se usa el filing más reciente; `restated = true` si otro filing publicó otro valor | — |
| Concepts distintos por empresa | Lista ordenada por partida (`concepts.ts`) | Revenue: NVDA `Revenues`, AAPL `RevenueFromContract…`, JPM `RevenuesNetOfInterestExpense` |
| Concepts que cambian con los años | Concept **principal** = primero con datos recientes anuales y trimestrales; los alternativos solo rellenan periodos **fuera** de su rango (nunca huecos intermedios) | AAPL `SalesRevenueNet` hasta 2018 |
| Magnitudes anual ≠ trimestral | El principal debe tener ambas (misma magnitud en FY y trimestres) | ADP: `Revenues` solo anual, `RevenueFromContract…` en ambos |
| Años 52/53 semanas, cierres no naturales | Calendario reconstruido desde los 10-K/10-Q; trimestres de 75–120 días (hasta 16 semanas) | Kroger 16/12/12/12, PepsiCo 12/12/12/16 |
| Mismo ejercicio con cierres distintos según filing | Cierres anuales a ≤ 7 días se agrupan; búsqueda de hechos con tolerancia ±3 días | Deere 2016-10-30 / 2016-10-31 |
| Periodos de 12 meses que NO son el ejercicio | Solo cuenta el periodo cuyo 10-K original se presentó 0–120 días después del cierre (10-Q: 0–90) | TE Connectivity, Altria |
| Etiqueta fiscal repetida | Etiquetas estrictamente crecientes | Kroger |
| 10-Q acumulados (YTD) | Trimestre = YTD − YTD anterior (mismo concept) | Flujos de caja de todas las empresas |
| Sin 10-Q del Q4 | Q4 = FY − 9M YTD (o FY − Q1 − Q2 − Q3) | Todas |
| EPS / acciones / dividendo por acción no son aditivos | Nunca se restan; Q4 queda `—` con motivo | Todas |
| Revenue trimestral derivado negativo | No se publica (etiquetado YTD incoherente) + aviso | 14 trimestres en 12 emisores |
| Bancos, aseguradoras, brokers (SIC 6000–6799) | Plantilla `financial`: gross profit, operating income, capex y deuda ⇒ NOT APPLICABLE; revenue y caja con concepts bancarios | JPM, BRK |
| Extensiones propias y hechos con dimensiones | companyfacts NO los publica ⇒ `discontinued` / `missing` con motivo | BRK: EPS por acción equivalente clase A; acciones por clase de BRK/PLTR |
| Unidades | Solo USD, USD/acción y acciones | — |
| Balance incoherente | Aviso si activo ≠ pasivo + patrimonio (+ minoritarios / patrimonio temporal) > 2 % bajo todas las lecturas válidas | 37 emisores, sobre todo periodos antiguos |

Validación cruzada independiente: los trimestres **derivados** de AAPL (Q4 revenue, OCF y capex desde YTD) coinciden al 0,000 % con los trimestres de EODHD. Las dos diferencias encontradas (caja 2026-03, deuda FY2025) eran errores de EODHD; los valores SEC cuadran con los componentes reportados por Apple.

## Resultados (S&P 500, 29-09-2026)

- 500/500 emisores, 0 errores, ~450.000 valores (≥ 2016), ~50.000 filings, 10.500 coberturas.
- Cobertura con datos recientes: revenue 493, beneficio neto 495, EPS diluido 486, OCF 498, activo y patrimonio 500 (ver `docs/data/sec-coverage.md`).
- TTM calculable en 495 emisores (489 anclados en un trimestre de 2026).
- Idempotente: repetir el job no cambia ningún conteo; la escritura es diferencial (un re-sync sin filings nuevos no reescribe valores).

## Limitaciones conocidas

- Sin consenso de analistas, sorpresas ni próximas fechas de resultados (no existen en fuentes oficiales gratuitas).
- EPS de emisores con extensiones propias (BRK) y acciones por clase (dimensiones) no están en companyfacts: harían falta los ficheros XBRL completos de cada filing.
- companyfacts va con retraso en algunos emisores (p. ej. Citigroup y Cardinal Health sin el último 10-Q): se muestra la fecha real del dato.
- Cambio de CIK tras reorganizaciones societarias (p. ej. XOM en el seed apunta a un CIK nuevo con poco historial).
- Las publicaciones de resultados (8-K 2.02) se limitan a ~3 años y a 12 páginas del índice por emisor (JPM presenta miles de folletos).
- La hora del 8-K es la de aceptación en EDGAR, no la del comunicado.
- Solo emisores que presentan 10-K/10-Q en US GAAP (los 20-F/40-F internacionales son anuales/semestrales y quedan para F7).
