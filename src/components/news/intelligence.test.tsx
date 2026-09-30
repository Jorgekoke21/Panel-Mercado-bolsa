// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/i18n/provider";
import type { MoveExplanation } from "@/intelligence/explain-move";
import { ContextPack } from "@/intelligence/evidence";
import { toMovePanelData } from "@/intelligence/move-panel-data";
import { MovePanel } from "./intelligence";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const move: MoveExplanation = {
  ticker: "NVDA", range: "1D", asOfDate: "2026-09-28", securityReturn: 0.02,
  components: { market: 0.01, sector: 0, industry: 0, idiosyncratic: 0.01 },
  driver: "company_specific", unusual: false, unusualReason: "", relativeVolume: null,
  verdict: "No unusual move", catalysts: [], claims: [], pack: new ContextPack(), caveat: "No causal claim.",
};

describe("MovePanel server to client contract", () => {
  it("renders the explicit DTO in Spanish", () => {
    render(<LocaleProvider initialLocale="es"><MovePanel move={toMovePanelData(move)} /></LocaleProvider>);
    expect(screen.getByText("Explicación del movimiento · 1D")).toBeInTheDocument();
    expect(screen.getAllByText("Específico de la empresa")).toHaveLength(2);
  });

  it("renders the same DTO in English", () => {
    render(<LocaleProvider initialLocale="en"><MovePanel move={toMovePanelData(move)} /></LocaleProvider>);
    expect(screen.getByText("Explain move · 1D")).toBeInTheDocument();
    expect(screen.getByText("Company-specific")).toBeInTheDocument();
  });
});
