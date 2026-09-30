import { describe, expect, it } from "vitest";
import { ContextPack } from "./evidence";
import type { MoveExplanation } from "./explain-move";
import { toMovePanelData } from "./move-panel-data";

describe("toMovePanelData", () => {
  it("removes the non-serializable evidence pack and claims", () => {
    const move: MoveExplanation = {
      ticker: "NVDA",
      range: "1D",
      asOfDate: "2026-09-28",
      securityReturn: 0.01,
      components: { market: 0, sector: 0, industry: 0, idiosyncratic: 0.01 },
      driver: "company_specific",
      unusual: false,
      unusualReason: "",
      relativeVolume: null,
      verdict: "No unusual move",
      catalysts: [{ eventId: "event-1", title: "Original headline", relation: "Possibly related", reason: "Coincident timing", scope: "company", url: "https://example.org" }],
      claims: [],
      pack: new ContextPack(),
      caveat: "No causal claim.",
    };

    const panelData = toMovePanelData(move);

    expect(panelData).not.toHaveProperty("pack");
    expect(panelData).not.toHaveProperty("claims");
    expect(JSON.parse(JSON.stringify(panelData))).toEqual(panelData);
    expect(Object.getPrototypeOf(panelData)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(panelData.components)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(panelData.catalysts[0])).toBe(Object.prototype);
    expect(Object.keys(panelData).sort()).toEqual([
      "ticker", "range", "asOfDate", "securityReturn", "components", "driver", "unusual", "unusualReason", "relativeVolume", "verdict", "catalysts", "caveat",
    ].sort());
  });
});
