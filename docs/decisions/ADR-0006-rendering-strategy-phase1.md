# ADR-0006 — Renderizado dinámico en Fase 1

- Estado: aceptada provisionalmente · 2026-09-29

## Decisión
- `dynamic = "force-dynamic"` en el layout raíz (modelo de caché clásico, sin `cacheComponents`).
- Next.js 16 (App Router, Turbopack) con `params`/`searchParams` asíncronos y los helpers `PageProps`/`LayoutProps` generados por `next typegen`.

## Motivo
Los datos viven en Supabase local; `next build` no debe depender de la base. Los datos mock cambian de forma determinista y no hay nada que cachear con criterio todavía.

## Revisar en Fase 2
Adoptar Cache Components (`use cache`, `cacheTag`) con revalidación disparada por los jobs de sincronización.
