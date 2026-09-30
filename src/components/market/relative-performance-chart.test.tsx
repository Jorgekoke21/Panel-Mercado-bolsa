// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/i18n/provider";
import type { ComparisonLine } from "@/services/relative-performance";
import { RelativePerformanceChart } from "./relative-performance-chart";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "solid" },
  LineSeries: {},
  createChart: () => ({ addSeries: () => ({ setData: () => undefined }), timeScale: () => ({ fitContent: () => undefined }), remove: () => undefined }),
}));

const lines: ComparisonLine[] = [{
  id: "industry:one", label: "Semiconductors", detail: "industry",
  single: null, equal: null, cap: [{ time: "2026-09-25", value: 100 }, { time: "2026-09-28", value: 102 }],
  coverage: { equal: null, cap: [2, 2] },
}];

describe("RelativePerformanceChart", () => {
  it("uses the imported market detail function and renders Spanish classification labels", () => {
    render(<LocaleProvider initialLocale="es"><RelativePerformanceChart lines={lines} ariaLabel="Rendimiento relativo" /></LocaleProvider>);
    expect(screen.getByText("Semiconductores")).toBeInTheDocument();
    expect(screen.getByText(/industria · ponderado por capitalización/)).toBeInTheDocument();
  });

  it("renders the canonical English labels in EN", () => {
    render(<LocaleProvider initialLocale="en"><RelativePerformanceChart lines={lines} ariaLabel="Relative performance" /></LocaleProvider>);
    expect(screen.getByText("Semiconductors")).toBeInTheDocument();
    expect(screen.getByText(/industry · cap-weighted/)).toBeInTheDocument();
  });
});
