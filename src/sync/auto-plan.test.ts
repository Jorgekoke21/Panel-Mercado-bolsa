import { describe, expect, it } from "vitest";
import { newYorkTimeToUtc } from "@/domain/market-calendar";
import { planAutoSync, type AutoSyncState } from "./auto-plan";

// Calendario real de la semana de Thanksgiving 2024: jueves 28 festivo, viernes 29 media sesión (13:00).
const session = (date: string, close = "16:00") => ({ date, opensAt: newYorkTimeToUtc(date, "09:30"), closesAt: newYorkTimeToUtc(date, close) });
const SESSIONS = [session("2024-11-25"), session("2024-11-26"), session("2024-11-27"), session("2024-11-29", "13:00"), session("2024-12-02")];

const state = (now: string, overrides: Partial<AutoSyncState> = {}): AutoSyncState => ({
  now: new Date(now),
  sessions: SESSIONS,
  snapshotsAsOf: "2024-11-26",
  laggingSecurities: 0,
  groupIndicesAsOf: "2024-11-26",
  lastSecSuccessAt: "2024-11-25T10:00:00Z",
  lastPriceRunAt: "2024-11-27T02:00:00Z",
  ...overrides,
});

describe("calendar-aware automatic sync plan", () => {
  it("does nothing while the day's bar is not final (session + extended hours + feed delay)", () => {
    // Miércoles 27, 19:00 ET: cierre 16:00, definitiva a las 20:20 ET.
    const plan = planAutoSync(state("2024-11-28T00:00:00Z"));
    expect(plan).toMatchObject({ prices: false, sec: false, targetSession: "2024-11-26" });
    expect(plan.nextFinalAt).toBe("2024-11-28T01:20:00.000Z");
  });

  it("runs once the session is final, then is a no-op until the next session", () => {
    expect(planAutoSync(state("2024-11-28T01:30:00Z"))).toMatchObject({ prices: true, targetSession: "2024-11-27" });
    const done = { snapshotsAsOf: "2024-11-27", groupIndicesAsOf: "2024-11-27" };
    // Jueves de Thanksgiving (festivo): no hay sesión nueva ⇒ ninguna llamada.
    expect(planAutoSync(state("2024-11-28T20:00:00Z", done))).toMatchObject({ prices: false, targetSession: "2024-11-27" });
  });

  it("handles the half session: final at 17:20 ET (13:00 close + 4 h 20 min)", () => {
    const done = { snapshotsAsOf: "2024-11-27", groupIndicesAsOf: "2024-11-27" };
    expect(planAutoSync(state("2024-11-29T22:10:00Z", done)).prices).toBe(false); // 17:10 ET
    expect(planAutoSync(state("2024-11-29T22:25:00Z", done))).toMatchObject({ prices: true, targetSession: "2024-11-29" });
  });

  it("weekends: no new session, no provider calls", () => {
    const done = { snapshotsAsOf: "2024-11-29", groupIndicesAsOf: "2024-11-29" };
    expect(planAutoSync(state("2024-11-30T15:00:00Z", done)).prices).toBe(false);
    expect(planAutoSync(state("2024-12-01T23:00:00Z", done)).prices).toBe(false);
  });

  it("rebuilds synthetic indices if they lag, and retries lagging securities at most every 6 hours", () => {
    const base = { snapshotsAsOf: "2024-11-27", groupIndicesAsOf: "2024-11-26" };
    expect(planAutoSync(state("2024-11-28T02:00:00Z", base)).prices).toBe(true);
    const lagging = { snapshotsAsOf: "2024-11-27", groupIndicesAsOf: "2024-11-27", laggingSecurities: 2 };
    expect(planAutoSync(state("2024-11-28T03:00:00Z", { ...lagging, lastPriceRunAt: "2024-11-28T02:00:00Z" })).prices).toBe(false);
    expect(planAutoSync(state("2024-11-28T09:00:00Z", { ...lagging, lastPriceRunAt: "2024-11-28T02:00:00Z" })).prices).toBe(true);
  });

  it("refreshes SEC data weekly and then recomputes snapshots (market caps depend on shares)", () => {
    const done = { snapshotsAsOf: "2024-11-27", groupIndicesAsOf: "2024-11-27", lastSecSuccessAt: "2024-11-18T10:00:00Z" };
    const plan = planAutoSync(state("2024-11-28T20:00:00Z", done));
    expect(plan).toMatchObject({ sec: true, prices: true });
    expect(plan.reasons.join(" ")).toMatch(/older than 7 days/);
  });
});
