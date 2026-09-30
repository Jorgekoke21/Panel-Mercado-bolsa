# ADR-0002 — Providers para fuentes externas, repositories para la UI

- Estado: aceptada · 2026-09-29

## Decisión
- `FinancialDataProvider` (`src/providers`) abstrae proveedores externos (sustituido en 2B.1 por puertos por capacidad + `ProviderAdapter`, ver ADR-0007). Solo lo usan los jobs de sincronización del servidor, que persisten en la base de datos.
- La UI y los servicios leen exclusivamente de repositorios (`ReferenceRepository`, `MarketDataRepository`).
- `src/data/registry.ts` es el único punto que elige implementaciones (composition root, una instancia por petición).

## Consecuencias
- Cambiar FMP por otro proveedor no toca la UI.
- La Fase 1 funciona con `MockMarketDataRepository` y la Fase 2 lo sustituye por una implementación sobre tablas sincronizadas.
- Nunca hay llamadas a APIs externas desde el navegador ni peticiones por empresa desde el cliente.
