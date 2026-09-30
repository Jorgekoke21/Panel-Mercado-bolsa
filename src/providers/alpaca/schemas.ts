import { z } from "zod";

/**
 * Respuestas CRUDAS de Alpaca Market Data v2 / v1 y Trading API (solo lo que usamos).
 * https://docs.alpaca.markets/reference/stockbars · /reference/corporateactions-1
 */
export const barSchema = z.object({
  t: z.string(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
  n: z.number().optional(),
  vw: z.number().optional(),
});
export type AlpacaBar = z.infer<typeof barSchema>;

export const barsResponseSchema = z.object({
  bars: z.record(z.string(), z.array(barSchema)).nullable(),
  next_page_token: z.string().nullable().optional(),
  currency: z.string().optional(),
});

const splitSchema = z.object({
  symbol: z.string(),
  ex_date: z.string(),
  new_rate: z.number(),
  old_rate: z.number(),
  process_date: z.string().optional(),
  record_date: z.string().nullable().optional(),
  payable_date: z.string().nullable().optional(),
});

const cashDividendSchema = z.object({
  symbol: z.string(),
  ex_date: z.string(),
  rate: z.number(),
  special: z.boolean().optional(),
  foreign: z.boolean().optional(),
  record_date: z.string().nullable().optional(),
  payable_date: z.string().nullable().optional(),
  process_date: z.string().optional(),
});
export type AlpacaCashDividend = z.infer<typeof cashDividendSchema>;
export type AlpacaSplit = z.infer<typeof splitSchema>;

export const corporateActionsResponseSchema = z.object({
  corporate_actions: z
    .object({
      forward_splits: z.array(splitSchema).optional(),
      reverse_splits: z.array(splitSchema).optional(),
      cash_dividends: z.array(cashDividendSchema).optional(),
      // Otros tipos (spin-offs, stock dividends, fusiones…): se conservan para no ocultarlos.
      stock_dividends: z.array(z.object({ symbol: z.string(), ex_date: z.string() }).loose()).optional(),
      spin_offs: z.array(z.object({ source_symbol: z.string().optional(), ex_date: z.string() }).loose()).optional(),
    })
    .loose(),
  next_page_token: z.string().nullable().optional(),
});
export type AlpacaCorporateActions = z.infer<typeof corporateActionsResponseSchema>["corporate_actions"];

export const calendarDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});
export const calendarResponseSchema = z.array(calendarDaySchema);

export const assetSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string(),
  status: z.string(),
  tradable: z.boolean().optional(),
  class: z.string().optional(),
});
export type AlpacaAsset = z.infer<typeof assetSchema>;
export const assetListSchema = z.array(assetSchema);
