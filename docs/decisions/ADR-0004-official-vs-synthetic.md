# ADR-0004 — Índices oficiales frente a sintéticos

- Estado: aceptada (CAMBIO 6) · 2026-09-29

## Decisión
- `indices.kind` ∈ {`official`, `synthetic`}. Un check SQL impone que un índice oficial tenga `methodology = provider` y ningún ámbito, y que uno sintético sea `equal_weight` o `cap_weight`.
- Los índices sintéticos pueden tener ámbito sector / grupo / industria / sub-industria (arco exclusivo).
- En la UI: `IndexKindBadge` (Official index / Synthetic) y `SyntheticBadge` (Synthetic · Cap-wt / Equal-wt) en cada agregado calculado por MarketRadar.
- El agregado de componentes de un índice oficial nunca se presenta como el nivel oficial del índice.

## Consecuencias
- Las definiciones sintéticas se crean en Fase 2, cuando existan precios.
- La versión cap-weighted histórica necesita `shares_outstanding` histórico; si solo hay dato actual, el pasado queda sesgado y se documentará.
