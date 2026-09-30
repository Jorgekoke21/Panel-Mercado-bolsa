import "server-only";
import { DataAccessError } from "@/data/errors";
import type { GroupIndexMethod, GroupIndexRef, GroupIndexRepository, GroupIndexSeries, GroupKind } from "@/data/repositories/group-index-repository";
import type { MarketRadarSupabase } from "./server-client";

const PAGE = 1000;

function fail(operation: string, error: { message: string }): never {
  throw new DataAccessError(`Database query failed (${operation})`, operation, { cause: error });
}

/** Lee `group_index_series` y reconstruye las fechas a partir del calendario de sesiones. */
export class SupabaseGroupIndexRepository implements GroupIndexRepository {
  private sessions: Promise<string[]> | null = null;

  constructor(private readonly db: MarketRadarSupabase) {}

  private loadSessions(mic: string, from: string): Promise<string[]> {
    this.sessions ??= (async () => {
      const out: string[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await this.db
          .from("market_sessions")
          .select("session_date")
          .eq("exchange_mic", mic)
          .gte("session_date", from)
          .order("session_date")
          .range(offset, offset + PAGE - 1);
        if (error) fail("groupIndex.sessions", error);
        out.push(...data.map((r) => r.session_date));
        if (data.length < PAGE) break;
      }
      return out;
    })();
    return this.sessions;
  }

  async getSeries(refs: readonly GroupIndexRef[]): Promise<GroupIndexSeries[]> {
    if (refs.length === 0) return [];
    const { data, error } = await this.db
      .from("group_index_series")
      .select("*")
      .in("group_key", [...new Set(refs.map((r) => r.key))]);
    if (error) fail("groupIndex.series", error);
    const wanted = new Set(refs.map((r) => `${r.kind}:${r.key}`));
    const rows = data.filter((r) => wanted.has(`${r.group_kind}:${r.group_key}`));
    if (rows.length === 0) return [];
    const earliest = rows.reduce((min, r) => (r.start_date < min ? r.start_date : min), rows[0]?.start_date as string);
    const sessions = await this.loadSessions(rows[0]?.exchange_mic as string, earliest);
    const position = new Map(sessions.map((d, i) => [d, i]));
    return rows.map((r) => {
      const start = position.get(r.start_date) ?? 0;
      const points = r.levels.flatMap((value, i) => {
        const time = sessions[start + i];
        return time ? [{ time, value: Number(value) }] : [];
      });
      return {
        kind: r.group_kind as GroupKind,
        key: r.group_key,
        method: r.method as GroupIndexMethod,
        points,
        membersTotal: r.members_total,
        membersLast: r.members_last,
        computedAt: r.computed_at,
      };
    });
  }
}
