import "server-only";
import { cache } from "react";
import { MockMarketDataRepository } from "./mock/mock-market-data";
import { createServerSupabase } from "./supabase/server-client";
import { SupabaseFundamentalsRepository } from "./supabase/supabase-fundamentals-repository";
import { SupabaseGroupIndexRepository } from "./supabase/supabase-group-index-repository";
import { SupabaseNewsRepository } from "./supabase/supabase-news-repository";
import { RealFirstMarketDataRepository, SupabaseMarketDataRepository } from "./supabase/supabase-market-data-repository";
import { SupabasePriceHistoryRepository } from "./supabase/supabase-price-history-repository";
import { SupabaseReferenceRepository } from "./supabase/supabase-reference-repository";
import type { Repositories } from "@/services/market-rows";

/**
 * Composition root: único lugar que decide qué implementación usa cada repositorio.
 * `cache` crea una instancia por petición (memoización por request, sin estado global).
 *
 * Fase 2B.3: listas, heatmaps, rankings y agregados leen instantáneas REALES (Alpaca + indicadores de
 * MarketRadar); el mock solo se usa si la base no tiene ningún dato de precios (y entonces es DEMO
 * completo). Los benchmarks siguen en DEMO (sin fuente gratuita).
 */
export const getRepositories = cache(
  (): Repositories => {
    const db = createServerSupabase();
    return {
      reference: new SupabaseReferenceRepository(db),
      marketData: new RealFirstMarketDataRepository(new SupabaseMarketDataRepository(db), new MockMarketDataRepository()),
      priceHistory: new SupabasePriceHistoryRepository(db),
      fundamentals: new SupabaseFundamentalsRepository(db),
      groupIndices: new SupabaseGroupIndexRepository(db),
      news: new SupabaseNewsRepository(db),
    };
  },
);
