# MarketRadar

Terminal personal de inteligencia de mercados. **No** es un broker ni ejecuta operaciones.

> Estado: **Fase 2B.4 — S&P 500 con datos reales, actualización automática e índices sintéticos, a coste 0 €.** Fundamentales oficiales de la SEC (EDGAR XBRL) para los 500 emisores y precios diarios reales de Alpaca Basic (SIP, gratuito) para las 503 securities. Dashboard, heatmaps, rankings, breadth, sectores, industrias y fichas usan datos REALES; indicadores, rendimientos y agregados los calcula MarketRadar. Siguen en **DEMO** (marcados) los benchmarks de la cinta superior (índices, VIX, DXY, materias primas, tipos), sin fuente gratuita; siguen **MISSING** consenso, forward P/E, PEG, noticias e IA.

## Requisitos

- Node.js ≥ 20.9 (probado con 22)
- Docker Desktop (para Supabase local)

## Puesta en marcha

```bash
npm install
npm run db:start          # arranca Supabase local (la primera vez descarga imágenes Docker)
npm run db:reset          # aplica migraciones + seed del S&P 500
cp .env.example .env.local
npx supabase status       # copia API URL y anon key en .env.local
npm run dev               # http://localhost:3000
```

Los titulares dinámicos se traducen en el servidor con TranslateGemma 4B a través de Ollama, sin API de pago. El artículo original permanece en `news_articles`; `news_headline_translations` guarda solo el título de presentación en otro idioma. La primera traducción puede tardar; las siguientes vistas reutilizan la caché. Si el traductor no responde, se muestra el titular original con una marca de idioma sin impedir que se cargue World Pulse.

```bash
ollama pull translategemma:4b
ollama serve
npx supabase migration up --local  # en una base ya existente; no borra los datos
```

Ollama escucha en `127.0.0.1:11434`. La primera petición carga el modelo en memoria; las siguientes se benefician de `keep_alive`. La aplicación requiere `SUPABASE_SERVICE_ROLE_KEY` únicamente en el servidor para escribir la caché; la interfaz no recibe esa clave. Cambia `HEADLINE_TRANSLATION_MODEL` al actualizar el modelo para invalidar traducciones anteriores. La interfaz del proveedor admite otros traductores sin modificar el News Engine. LibreTranslate y Argos siguen disponibles como alternativa más ligera mediante `docker compose -f compose.translation.yaml up -d` y las variables de `.env.example`.

Datos reales (requiere `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`):

```bash
npm run sync -- sec --index sp500      # fundamentales SEC del S&P 500 (gratis, ~9 min la primera vez)
npm run sync -- alpaca --index sp500   # precios EE. UU. (gratis; claves de Alpaca Basic). ~5 min la 1.ª vez, ~2,5 min diario
npm run sync -- sec-report             # cobertura → docs/data/sec-coverage.md
npm run sync -- alpaca-report          # calidad de precios PASS/WARNING/MISSING/FAIL → docs/data/price-coverage.md
npm run sync -- alpaca-validate        # concilia ajustes con Alpaca → docs/data/alpaca-validation.md
npm run sync -- sec-classes            # acciones por clase (portadas XBRL; requiere SEC_USER_AGENT)
npm run sync -- status                 # frescura de los datos
```

Actualización automática (0 €): una tarea del Programador de tareas de Windows ejecuta `npm run sync -- auto` cada hora; el comando decide según el calendario de mercado (ver docs/market-data.md). Requiere Docker/Supabase local encendidos.

```bash
powershell -ExecutionPolicy Bypass -File scripts/scheduler/register-windows-task.ps1
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run test` | Vitest (funciones puras, seed, servicios, componentes) |
| `npm run seed:fetch` | Descarga una nueva instantánea de las fuentes del seed (`-- --pinned` para las revisiones fijadas) |
| `npm run seed:build` | Valida y genera `supabase/seed.sql` |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local |
| `npm run db:types` | Regenera `src/data/supabase/database.types.ts` |
| `npm run sync -- pilot` (· `validate` · `idempotency` · `usage`) | Sincronización con EODHD (solo servidor/local) — ver [market data](docs/market-data.md) |

## Documentación

- [Arquitectura](docs/architecture.md)
- [Modelo de datos](docs/data-model.md) (incluye las tablas previstas para las Fases 2–6)
- [Seed del S&P 500](docs/seed.md)
- [Market data (proveedores, sync, ajustes)](docs/market-data.md)
- [Fundamentales SEC EDGAR / XBRL](docs/sec-fundamentals.md)
- [Design system](docs/design-system.md)
- [Decisiones (ADR)](docs/decisions/)

## Roadmap

1. Foundation + S&P 500 universe
2. **Market data** (proveedor, OHLCV, fundamentales, indicadores) ← actual: 2B.1 piloto
3. Market terminal (heatmap real, rankings, screener, gráficos, comparador)
4. News engine
5. AI intelligence (World Pulse, Impact Map, Ask MarketRadar)
6. Personal intelligence (watchlists, notas, alertas)
7. Global expansion (~1.000 empresas)
