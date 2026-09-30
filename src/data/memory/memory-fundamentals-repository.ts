import type { FilingRecord, FundamentalsRepository, IssuerFilingProfile } from "@/data/repositories/fundamentals-repository";
import type { FinancialStatementValue, LineItemCode, LineItemCoverage } from "@/domain/fundamentals";
import type { FundamentalSnapshot } from "@/lib/calculations/fundamental-snapshot";

/** Implementación en memoria (tests). Sin datos ⇒ las pestañas muestran "no fundamentals synced". */
export class MemoryFundamentalsRepository implements FundamentalsRepository {
  constructor(
    private readonly data: {
      profiles?: ReadonlyMap<string, IssuerFilingProfile>;
      values?: ReadonlyMap<string, FinancialStatementValue[]>;
      coverage?: ReadonlyMap<string, LineItemCoverage[]>;
      filings?: ReadonlyMap<string, FilingRecord[]>;
      dividends?: ReadonlyMap<string, number | null>;
      snapshots?: ReadonlyMap<string, FundamentalSnapshot>;
    } = {},
  ) {}

  async getIssuerProfile(companyId: string) {
    return this.data.profiles?.get(companyId) ?? null;
  }

  async getStatementValues(companyId: string) {
    return this.data.values?.get(companyId) ?? [];
  }

  async getLatestValue(companyId: string, _source: string, lineItem: LineItemCode, periodType: "annual" | "quarterly") {
    return (
      (this.data.values?.get(companyId) ?? [])
        .filter((v) => v.lineItem === lineItem && v.periodType === periodType && v.value !== null && (v.origin === "reported" || v.origin === "derived"))
        .sort((a, b) => b.fiscalPeriodEnd.localeCompare(a.fiscalPeriodEnd))[0] ?? null
    );
  }

  async getCoverage(companyId: string) {
    return this.data.coverage?.get(companyId) ?? [];
  }

  async getFilings(companyId: string) {
    return this.data.filings?.get(companyId) ?? [];
  }

  async listFundamentalSnapshots(companyIds: readonly string[]) {
    return new Map([...(this.data.snapshots ?? new Map<string, FundamentalSnapshot>())].filter(([id]) => companyIds.includes(id)));
  }

  async getCashDividendsPerShare(securityId: string) {
    const perShare = this.data.dividends?.get(securityId);
    return perShare === undefined || perShare === null ? null : { perShare, foreignExcluded: 0, specialExcluded: 0 };
  }
}
