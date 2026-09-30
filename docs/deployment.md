# MarketRadar en producción

- Web: Vercel Hobby, proyecto `marketradar`, conectado a `main`.
- Datos: Supabase Free, proyecto `dbdgqzhfcvfoukyngsso`, región Irlanda.
- La base local mantiene su conexión en `.env.local`. La publicación usa una copia independiente.

## Variables de Vercel

`SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable) y `HEADLINE_TRANSLATION_MODE=cache-only`.
La web lee mediante RLS. No necesita claves de escritura, Alpaca ni Ollama.

## Actualizaciones

`.github/workflows/sync-market.yml` ejecuta el sincronizador cada hora, al minuto 23 UTC, y permite ejecución manual desde GitHub Actions.
Usa Alpaca Basic, SEC y las fuentes gratuitas de noticias. No recibe EODHD ni OpenAI y no activa servicios de pago.
Las credenciales están en los secretos `MARKETRADAR_*` del repositorio, nunca en código ni en Vercel.
GitHub puede retrasar las ejecuciones programadas y desactivarlas tras 60 días sin actividad del repositorio.

El mismo proceso traduce titulares pendientes con TranslateGemma 4B en un runner temporal. Reutiliza el modelo en caché y procesa hasta 24 titulares por idioma y ejecución.
Hasta que una traducción esté disponible, la web muestra el titular original. Un fallo de traducción conserva las noticias y las traducciones existentes.
La traducción local continúa usando Ollama con su configuración habitual.

## Límites

La copia inicial ocupa aproximadamente 294 MB de los 500 MB de Supabase Free. El histórico de mercado crecerá: al alcanzar el límite, Supabase puede impedir nuevas escrituras.
Vercel Hobby está destinado a proyectos personales no comerciales. Los runners estándar de GitHub son gratuitos para este repositorio público.
No se han añadido planes de pago ni un dominio de pago. La ingestión sigue sujeta a disponibilidad y límites de cada fuente.
