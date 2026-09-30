import type { MoveExplanation } from "./explain-move";

/** Exact, serializable contract consumed by the client rendered move panel. */
export type MovePanelData = Pick<MoveExplanation,
  "ticker" | "range" | "asOfDate" | "securityReturn" | "driver" | "unusual" | "unusualReason" | "relativeVolume" | "verdict" | "caveat"
> & {
  components: MoveExplanation["components"];
  catalysts: MoveExplanation["catalysts"];
};

/** Build a DTO field by field. ContextPack stays on the server for grounding and claims. */
export function toMovePanelData(move: MoveExplanation): MovePanelData {
  return {
    ticker: move.ticker,
    range: move.range,
    asOfDate: move.asOfDate,
    securityReturn: move.securityReturn,
    components: { ...move.components },
    driver: move.driver,
    unusual: move.unusual,
    unusualReason: move.unusualReason,
    relativeVolume: move.relativeVolume,
    verdict: move.verdict,
    catalysts: move.catalysts.map((item) => ({
      eventId: item.eventId,
      title: item.title,
      relation: item.relation,
      reason: item.reason,
      scope: item.scope,
      ...(item.filing === undefined ? {} : { filing: item.filing }),
      ...(item.url === undefined ? {} : { url: item.url }),
    })),
    caveat: move.caveat,
  };
}
