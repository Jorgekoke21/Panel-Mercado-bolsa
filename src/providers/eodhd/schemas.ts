import { z } from "zod";

/**
 * Esquemas de las respuestas CRUDAS de EODHD (solo los campos que usamos).
 * Viven dentro del adaptador: ningún tipo de aquí sale de `src/providers/eodhd`.
 *
 * Particularidades verificadas contra la API (2026-09-29):
 *   * /eod: `close` sin ajustar, `adjusted_close` ajustado por splits y dividendos, `volume`
 *     ajustado por splits.
 *   * /div: `unadjustedValue` = importe pagado; `value` = importe ajustado por splits.
 *   * /fundamentals: los importes de los estados financieros llegan como string decimal.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** number | "123.45" | null → se valida después con `toNumber`. */
export const looseNumber = z.union([z.number(), z.string(), z.null()]).optional();

export const eodBarSchema = z.object({
  date: isoDate,
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
  adjusted_close: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
});
export const eodResponseSchema = z.array(eodBarSchema);
export type EodBarRaw = z.infer<typeof eodBarSchema>;

export const splitSchema = z.object({ date: isoDate, split: z.string() });
export const splitsResponseSchema = z.array(splitSchema);
export type SplitRaw = z.infer<typeof splitSchema>;

export const dividendSchema = z.object({
  date: isoDate,
  declarationDate: isoDate.nullable().optional(),
  recordDate: isoDate.nullable().optional(),
  paymentDate: isoDate.nullable().optional(),
  period: z.string().nullable().optional(),
  value: looseNumber,
  unadjustedValue: looseNumber,
  currency: z.string().nullable().optional(),
});
export const dividendsResponseSchema = z.array(dividendSchema);
export type DividendRaw = z.infer<typeof dividendSchema>;

/** Registro indexado por clave ("0", "1"… o fechas). EODHD usa objetos en lugar de arrays. */
const record = <T extends z.ZodType>(item: T) => z.record(z.string(), item);

const statementPeriodSchema = z.looseObject({
  date: isoDate,
  filing_date: isoDate.nullable().optional(),
  currency_symbol: z.string().nullable().optional(),
});
export type StatementPeriodRaw = z.infer<typeof statementPeriodSchema> & Record<string, unknown>;

const statementSchema = z
  .object({
    currency_symbol: z.string().nullable().optional(),
    quarterly: record(statementPeriodSchema).optional(),
    yearly: record(statementPeriodSchema).optional(),
  })
  .optional();

export const fundamentalsSchema = z.object({
  General: z.looseObject({
    Code: z.string(),
    Name: z.string().nullable().optional(),
    Exchange: z.string().nullable().optional(),
    CurrencyCode: z.string().nullable().optional(),
    CountryISO: z.string().nullable().optional(),
    ISIN: z.string().nullable().optional(),
    CIK: z.string().nullable().optional(),
    LEI: z.string().nullable().optional(),
    CUSIP: z.string().nullable().optional(),
    OpenFigi: z.string().nullable().optional(),
    WebURL: z.string().nullable().optional(),
    Description: z.string().nullable().optional(),
    FullTimeEmployees: looseNumber,
    LogoURL: z.string().nullable().optional(),
    IPODate: z.string().nullable().optional(),
    FiscalYearEnd: z.string().nullable().optional(),
    IsDelisted: z.boolean().nullable().optional(),
    UpdatedAt: z.string().nullable().optional(),
  }),
  Highlights: z.record(z.string(), z.unknown()).nullable().optional(),
  Valuation: z.record(z.string(), z.unknown()).nullable().optional(),
  SharesStats: z.record(z.string(), z.unknown()).nullable().optional(),
  outstandingShares: z
    .object({
      quarterly: record(z.looseObject({ dateFormatted: isoDate.nullable().optional(), shares: looseNumber })).optional(),
    })
    .loose()
    .nullable()
    .optional(),
  Earnings: z
    .object({
      History: record(
        z.looseObject({
          reportDate: isoDate.nullable().optional(),
          date: isoDate,
          beforeAfterMarket: z.string().nullable().optional(),
          currency: z.string().nullable().optional(),
          epsActual: looseNumber,
          epsEstimate: looseNumber,
          epsDifference: looseNumber,
          surprisePercent: looseNumber,
        }),
      ).optional(),
      Trend: record(
        z.looseObject({
          date: isoDate,
          period: z.string().nullable().optional(),
          earningsEstimateAvg: looseNumber,
          earningsEstimateLow: looseNumber,
          earningsEstimateHigh: looseNumber,
          earningsEstimateYearAgoEps: looseNumber,
          earningsEstimateNumberOfAnalysts: looseNumber,
          revenueEstimateAvg: looseNumber,
          revenueEstimateLow: looseNumber,
          revenueEstimateHigh: looseNumber,
          revenueEstimateNumberOfAnalysts: looseNumber,
        }),
      ).optional(),
    })
    .loose()
    .nullable()
    .optional(),
  Financials: z
    .object({
      Income_Statement: statementSchema,
      Balance_Sheet: statementSchema,
      Cash_Flow: statementSchema,
    })
    .loose()
    .nullable()
    .optional(),
});
export type FundamentalsRaw = z.infer<typeof fundamentalsSchema>;

/** /user: solo campos del plan (el endpoint también devuelve nombre y email, que no se leen). */
export const userSchema = z.object({
  apiRequests: z.number(),
  dailyRateLimit: z.number().nullable().optional(),
  apiRequestsDate: z.string().nullable().optional(),
  subscriptionType: z.string().nullable().optional(),
  extraLimit: z.number().nullable().optional(),
});
