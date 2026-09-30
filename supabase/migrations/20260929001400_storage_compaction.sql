-- MarketRadar · Fase 2B.4 · 0014 — compactación sin pérdida de procedencia.
--
--   * financial_statement_values.source_field repetía, en los valores DERIVADOS (Q4 = FY − 9M, YTD
--     desacumulado…), la fórmula completa que ya guarda `derivation` (~140 B × ~77k filas ≈ 11 MB).
--     Ahora guarda solo el concepto XBRL, igual que los valores reportados; la fórmula sigue en
--     `derivation` y el accession en `accession_number`.
--   * financial_statement_values_line_item_idx: 0 lecturas (las consultas filtran por emisor y usan la
--     clave primaria). Se elimina (~3 MB).
-- Tras aplicarla conviene `vacuum full financial_statement_values` para devolver el espacio.

update public.financial_statement_values
set source_field = split_part(derivation, ':', 1)
where derivation is not null
  and source_field = derivation;

drop index if exists public.financial_statement_values_line_item_idx;
