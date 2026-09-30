// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { PerformanceBadge } from "./performance-badge";

describe("PerformanceBadge", () => {
  it("shows an explicit sign and an accessible description for gains", () => {
    render(<PerformanceBadge value={0.0123} label="1 day" arrow />);
    const badge = screen.getByLabelText(/sube \+1,23.*en 1 day/);
    expect(badge).toHaveTextContent("+1,23 %");
    expect(badge).toHaveTextContent("▲");
    expect(badge.className).toContain("text-positive");
  });

  it("uses a true minus sign and down semantics for losses", () => {
    render(<PerformanceBadge value={-0.05} />);
    const badge = screen.getByLabelText(/baja -5,00/);
    expect(badge).toHaveTextContent("−5,00 %");
    expect(badge.className).toContain("text-negative");
  });

  it("renders a neutral placeholder when there is no data", () => {
    render(<PerformanceBadge value={null} label="1 year" />);
    expect(screen.getByLabelText("sin datos para 1 year")).toHaveTextContent("—");
  });
});
