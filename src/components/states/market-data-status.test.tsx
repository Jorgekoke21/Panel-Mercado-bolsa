// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { DataProvenanceBadge } from "./data-provenance-badge";
import { dataStatus } from "@/domain/provenance";
import { MarketDataStatus } from "./market-data-status";

const EODHD = {
  source: "eodhd",
  sourceLabel: "EODHD",
  asOf: "2026-09-25",
  isDelayed: true,
  isDemo: false,
  frequency: "eod" as const,
  dataset: "eodhd-eod-prices",
  ingestedAt: "2026-09-28T06:00:00Z",
};

describe("market data provenance", () => {
  it("states source, as-of date and EOD for real data", () => {
    render(<MarketDataStatus provenance={EODHD} now={new Date("2026-09-28T12:00:00Z")} />);
    const line = screen.getByText(/Datos de mercado:/).closest("p");
    expect(line?.textContent).toContain("Datos de mercado: EODHD");
    expect(line?.textContent).toContain("25/09/2026");
    expect(line?.textContent).toContain("EOD");
    expect(line?.getAttribute("title")).toContain("eodhd-eod-prices");
  });

  it("does not flag a Friday close as stale on Monday, but does after 4 days", () => {
    const { rerender } = render(<DataProvenanceBadge provenance={EODHD} now={new Date("2026-09-28T12:00:00Z")} />);
    expect(screen.getByText("Real · EOD 25/09/2026")).toBeInTheDocument();
    rerender(<DataProvenanceBadge provenance={EODHD} now={new Date("2026-10-01T12:00:00Z")} />);
    expect(screen.getByText("Desactualizado")).toBeInTheDocument();
  });

  it("labels a set with missing members as PARTIAL (never filled with simulated values)", () => {
    const partial = { ...EODHD, coverage: { covered: 497, total: 503 } };
    expect(dataStatus(partial)).toBe("PARTIAL");
    expect(dataStatus(EODHD)).toBe("REAL");
    expect(dataStatus({ ...EODHD, isDemo: true })).toBe("DEMO");
    render(<DataProvenanceBadge provenance={partial} now={new Date("2026-09-28T12:00:00Z")} />);
    expect(screen.getByText("Parcial · 497/503")).toBeInTheDocument();
    render(<MarketDataStatus provenance={partial} now={new Date("2026-09-28T12:00:00Z")} />);
    expect(screen.getByText(/Parcial: 497\/503/)).toBeInTheDocument();
  });

  it("labels simulated data as demo", () => {
    render(<MarketDataStatus provenance={{ source: "mock", sourceLabel: "Simulated", asOf: "2026-09-28T00:00:00Z", isDelayed: false, isDemo: true }} />);
    expect(screen.getByText(/Datos de mercado: Datos de demostración/)).toBeInTheDocument();
  });
});
